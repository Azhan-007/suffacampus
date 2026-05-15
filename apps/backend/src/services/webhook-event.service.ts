import crypto from "crypto";
import { prisma } from "../lib/prisma";
import { processProviderPayment, type ProviderPaymentData } from "./payment.service";
import { writeAuditLog } from "./audit.service";
import { logWebhookFailure } from "./webhook-failure.service";
import { activatePaid } from "./tenant-lifecycle.service";
import { createCreditNote, createImmutableInvoice } from "./invoice.service";
import { createLogger } from "../utils/logger";

const log = createLogger("webhook-event");

type WebhookProvider = "razorpay" | "stripe";

interface RazorpayWebhookPayload {
  event: string;
  payload: {
    payment?: {
      entity: {
        id: string;
        order_id: string;
        amount: number;
        currency: string;
        status: string;
        method?: string;
        notes: Record<string, string>;
        error_code?: string;
        error_description?: string;
        error_reason?: string;
      };
    };
    refund?: {
      entity: {
        id: string;
        payment_id: string;
        amount: number;
        currency: string;
        notes: Record<string, string>;
      };
    };
  };
}

interface StripeWebhookPayload {
  id?: string;
  type?: string;
  created?: number;
  data?: {
    object?: Record<string, unknown>;
  };
}

export interface PersistWebhookEventOptions {
  provider: WebhookProvider;
  eventType: string;
  providerEventId?: string;
  rawBody: Buffer;
  providerPaymentId?: string | null;
  providerOrderId?: string | null;
  schoolId?: string | null;
}

export type PersistWebhookEventResult = {
  event: {
    id: string;
    eventId: string;
    status: string;
    processedAt: Date | null;
  };
  duplicate: boolean;
  replayed: boolean;
};

export type ProcessWebhookEventResult = {
  success: boolean;
  skipped?: boolean;
  error?: string;
};

function isPrismaUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "P2002"
  );
}

function computePayloadHash(rawBody: Buffer): string {
  return crypto.createHash("sha256").update(rawBody).digest("hex");
}

function normalizeEventId(providerEventId: string | undefined, payloadHash: string): string {
  const trimmed = providerEventId?.trim();
  if (trimmed) return trimmed;
  return `hash:${payloadHash}`;
}

function normalizeRawPayload(rawBody: Buffer): string {
  return rawBody.toString("utf-8");
}

async function markEventFailed(eventId: string, error: unknown): Promise<void> {
  const message = error instanceof Error ? error.message : String(error);
  await prisma.webhookEvent.update({
    where: { id: eventId },
    data: { status: "FAILED", failureReason: message },
  });
}

export async function persistWebhookEvent(
  options: PersistWebhookEventOptions
): Promise<PersistWebhookEventResult> {
  const payloadHash = computePayloadHash(options.rawBody);
  const eventId = normalizeEventId(options.providerEventId, payloadHash);

  if (!options.providerEventId) {
    const replayCandidate = await prisma.webhookEvent.findFirst({
      where: {
        provider: options.provider,
        payloadHash,
      },
      select: { id: true, eventId: true, status: true, processedAt: true },
    });

    if (replayCandidate) {
      return {
        event: replayCandidate,
        duplicate: true,
        replayed: true,
      };
    }
  } else {
    const existing = await prisma.webhookEvent.findUnique({
      where: { eventId },
      select: { id: true, eventId: true, status: true, processedAt: true },
    });

    if (existing) {
      return {
        event: existing,
        duplicate: true,
        replayed: false,
      };
    }
  }

  try {
    const created = await prisma.webhookEvent.create({
      data: {
        eventId,
        provider: options.provider,
        eventType: options.eventType,
        providerPaymentId: options.providerPaymentId ?? null,
        providerOrderId: options.providerOrderId ?? null,
        schoolId: options.schoolId ?? null,
        rawPayload: normalizeRawPayload(options.rawBody),
        payloadHash,
        status: "VERIFIED",
      },
      select: { id: true, eventId: true, status: true, processedAt: true },
    });

    return { event: created, duplicate: false, replayed: false };
  } catch (err) {
    if (!isPrismaUniqueViolation(err)) {
      throw err;
    }

    const existing = await prisma.webhookEvent.findUnique({
      where: { eventId },
      select: { id: true, eventId: true, status: true, processedAt: true },
    });

    if (!existing) {
      throw err;
    }

    return { event: existing, duplicate: true, replayed: false };
  }
}

export async function processWebhookEventById(
  webhookEventId: string
): Promise<ProcessWebhookEventResult> {
  const record = await prisma.webhookEvent.findUnique({
    where: { id: webhookEventId },
  });

  if (!record) {
    return { success: false, error: "Webhook event record not found" };
  }

  if (record.status === "PROCESSED" || record.status === "DEAD_LETTER") {
    return { success: true, skipped: true };
  }

  const eventType = record.eventType ?? "unknown";
  const rawPayload = record.rawPayload ?? "{}";

  const now = new Date();
  const updateResult = await prisma.webhookEvent.updateMany({
    where: {
      id: record.id,
      status: { in: ["RECEIVED", "VERIFIED", "FAILED"] },
    },
    data: {
      status: "PROCESSING",
      processingAttempts: { increment: 1 },
      lastAttemptAt: now,
      failureReason: null,
    },
  });

  if (updateResult.count === 0) {
    return { success: true, skipped: true };
  }

  let payload: RazorpayWebhookPayload | StripeWebhookPayload;
  try {
    payload = JSON.parse(rawPayload) as RazorpayWebhookPayload | StripeWebhookPayload;
  } catch (err) {
    await markEventFailed(record.id, "rawPayload is not valid JSON");
    return { success: false, error: "rawPayload is not valid JSON" };
  }

  try {
    if (record.provider === "razorpay") {
      await processRazorpayWebhookEvent(payload as RazorpayWebhookPayload, record.id);
    } else if (record.provider === "stripe") {
      await processStripeWebhookEvent(payload as StripeWebhookPayload);
    } else {
      log.warn({ provider: record.provider, eventId: record.eventId }, "Unknown webhook provider");
    }

    await prisma.webhookEvent.update({
      where: { id: record.id },
      data: { status: "PROCESSED", processedAt: new Date(), failureReason: null },
    });

    return { success: true };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);

    await markEventFailed(record.id, errorMessage);

    if (record.processingAttempts === 0) {
      await logWebhookFailure({
        eventType,
        razorpayEventId: record.provider === "razorpay" ? record.eventId : null,
        schoolId: record.schoolId ?? null,
        rawPayload,
        error: err,
      });
    }

    throw err;
  }
}

async function processRazorpayWebhookEvent(
  event: RazorpayWebhookPayload,
  webhookEventId: string
): Promise<void> {
  switch (event.event) {
    case "payment.captured": {
      const payment = event.payload.payment?.entity;
      if (!payment) {
        throw new Error("payment.captured payload missing payment entity");
      }

      const paymentData: ProviderPaymentData = {
        status: payment.status,
        amount: payment.amount,
        currency: payment.currency,
        method: payment.method,
        notes: payment.notes,
      };

      await processProviderPayment(payment.id, payment.order_id ?? null, {
        source: "webhook",
        paymentData,
      });
      break;
    }

    case "payment.failed": {
      const payment = event.payload.payment?.entity;
      const schoolId = payment?.notes?.schoolId;

      if (schoolId) {
        await prisma.school.updateMany({
          where: { id: schoolId },
          data: { paymentFailureCount: { increment: 1 } },
        });

        await writeAuditLog("PAYMENT_FAILED", "system", schoolId, {
          razorpayPaymentId: payment?.id,
          errorCode: payment?.error_code,
          errorDescription: payment?.error_description,
          errorReason: payment?.error_reason,
        });
      }

      log.warn(
        {
          paymentId: payment?.id,
          schoolId,
          error: payment?.error_description,
          webhookEventId,
        },
        "Razorpay payment failed"
      );
      break;
    }

    case "refund.created": {
      const refund = event.payload.refund?.entity;
      const schoolId = refund?.notes?.schoolId;

      if (schoolId && refund) {
        await writeAuditLog("REFUND_CREATED", "system", schoolId, {
          refundId: refund.id,
          paymentId: refund.payment_id,
          amount: refund.amount,
          currency: refund.currency,
        });

        await createCreditNote({
          schoolId,
          plan: "refund",
          amount: Number(refund.amount),
          currency: refund.currency,
          description: `Refund for payment ${refund.payment_id}`,
        });

        await prisma.legacyPayment.updateMany({
          where: {
            schoolId,
            OR: [{ gatewayId: refund.payment_id }, { id: refund.payment_id }],
          },
          data: {
            status: "refunded",
            refundedAmount: refund.amount,
          },
        });
      }

      log.info(
        { refundId: refund?.id, paymentId: refund?.payment_id },
        "Razorpay refund created processed"
      );
      break;
    }

    default:
      log.info({ event: event.event }, "Razorpay webhook event ignored");
  }
}

async function processStripeWebhookEvent(event: StripeWebhookPayload): Promise<void> {
  const eventType = event.type ?? "unknown";

  switch (eventType) {
    case "charge.succeeded": {
      const charge = event.data?.object ?? {};
      const metadata = (charge.metadata ?? {}) as Record<string, string>;

      if (!metadata.schoolId) {
        return;
      }

      const plan = metadata.plan ?? "basic";
      const durationDays = 30;
      const now = new Date();
      const periodEnd = new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000);
      const chargeId = String(charge.id ?? "");
      const chargeAmount = Number(charge.amount ?? 0);
      const chargeCurrency = String(charge.currency ?? "INR").toUpperCase();

      await prisma.$transaction(async (tx) => {
        const existingInvoice = await tx.invoice.findFirst({
          where: { razorpayPaymentId: chargeId },
          select: { id: true },
        });
        if (existingInvoice) return;

        await activatePaid({
          schoolId: metadata.schoolId,
          plan,
          periodStart: now,
          periodEnd,
          paymentId: chargeId,
          performedBy: "system",
          reason: "stripe_charge_succeeded",
          source: "stripe_webhook",
          useTransaction: tx,
        });

        await tx.legacyPayment.create({
          data: {
            schoolId: metadata.schoolId,
            amount: chargeAmount,
            currency: chargeCurrency,
            status: "completed",
            gatewayId: chargeId,
            verifiedAt: now,
            description: `Stripe subscription payment for ${plan}`,
            paymentMethodDetails: {
              source: "stripe",
              plan,
              chargeId,
            },
          },
        });

        await createImmutableInvoice(tx, {
          schoolId: metadata.schoolId,
          plan,
          amount: chargeAmount,
          currency: chargeCurrency,
          status: "paid",
          razorpayPaymentId: chargeId,
          periodStart: now,
          periodEnd,
          paidAt: now,
          finalizedAt: now,
        });
      });

      await writeAuditLog("STRIPE_CHARGE_SUCCEEDED", "system", metadata.schoolId, {
        chargeId,
        amount: chargeAmount / 100,
        currency: chargeCurrency,
        plan,
      });
      break;
    }

    case "charge.failed": {
      const charge = event.data?.object ?? {};
      const metadata = (charge.metadata ?? {}) as Record<string, string>;

      if (metadata.schoolId) {
        await prisma.school.updateMany({
          where: { id: metadata.schoolId },
          data: { paymentFailureCount: { increment: 1 } },
        });

        await writeAuditLog("PAYMENT_FAILED", "system", metadata.schoolId, {
          stripeChargeId: charge.id,
          failureCode: charge.failure_code,
          failureMessage: charge.failure_message,
        });
      }
      break;
    }

    case "charge.refunded": {
      const charge = event.data?.object ?? {};
      const metadata = (charge.metadata ?? {}) as Record<string, string>;

      if (metadata.schoolId) {
        const refundedInvoice = await prisma.invoice.findFirst({
          where: {
            schoolId: metadata.schoolId,
            razorpayPaymentId: String(charge.id ?? ""),
          },
          select: {
            plan: true,
            periodStart: true,
            periodEnd: true,
          },
        });

        await writeAuditLog("REFUND_CREATED", "system", metadata.schoolId, {
          chargeId: charge.id,
          amount: Number(charge.amount_refunded ?? 0) / 100,
          currency: String(charge.currency ?? "").toUpperCase(),
        });

        if (refundedInvoice) {
          await createImmutableInvoice(prisma, {
            schoolId: metadata.schoolId,
            plan: refundedInvoice.plan,
            amount: -Number(charge.amount_refunded ?? 0),
            currency: String(charge.currency ?? "").toUpperCase(),
            status: "credit",
            razorpayPaymentId: String(charge.id ?? ""),
            periodStart: refundedInvoice.periodStart ?? null,
            periodEnd: refundedInvoice.periodEnd ?? null,
            description: `Refund credit note for ${charge.id ?? "payment"}`,
            finalizedAt: new Date(),
          });
        }
      }
      break;
    }

    default:
      log.debug({ type: eventType }, "Stripe webhook event ignored");
  }
}
