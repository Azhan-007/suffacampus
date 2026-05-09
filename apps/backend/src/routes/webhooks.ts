import type { FastifyInstance } from "fastify";
import {
  verifyWebhookSignature,
  handlePaymentCaptured,
  type PaymentCapturedPayload,
  verifyStripeWebhookSignature,
} from "../services/payment.service";

import { writeAuditLog } from "../services/audit.service";
import { logWebhookFailure } from "../services/webhook-failure.service";
import { enqueueWebhookRetry } from "../services/webhook-retry-queue.service";
import { prisma } from "../lib/prisma";

interface RazorpayWebhookPayload {
  created_at?: number | string;
  event: string;
  payload: {
    payment?: {
      entity: {
        id: string;
        order_id: string;
        amount: number;
        currency: string;
        status: string;
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

const RAZORPAY_WEBHOOK_MAX_AGE_MS = 5 * 60 * 1000;

function getRawBody(body: unknown): Buffer {
  if (body instanceof Buffer) return body;
  if (typeof body === "string") return Buffer.from(body);
  return Buffer.from(JSON.stringify(body ?? {}));
}

function normalizeUnixTimestampMs(value: unknown): number | null {
  let raw: string | number | undefined;

  if (Array.isArray(value)) {
    raw = value[0];
  } else if (typeof value === "string" || typeof value === "number") {
    raw = value;
  }

  if (raw === undefined) {
    return null;
  }

  const parsed =
    typeof raw === "number" ? raw : Number.parseInt(raw.trim(), 10);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  // Razorpay commonly sends UNIX seconds in webhook payloads.
  return parsed < 1_000_000_000_000 ? parsed * 1000 : parsed;
}

async function queueWebhookRetry(
  server: FastifyInstance,
  eventType: string,
  rawBody: Buffer,
  error: unknown,
  schoolId?: string | null,
  eventId?: string | null
): Promise<string | null> {
  const failureId = await logWebhookFailure({
    eventType,
    razorpayEventId: eventId ?? null,
    schoolId: schoolId ?? null,
    rawPayload: rawBody.toString("utf-8"),
    error,
  });

  if (!failureId) {
    return null;
  }

  const queued = await enqueueWebhookRetry(failureId, {
    delayMs: 60_000,
    requestedBy: "system:webhook",
    allowInlineFallback: false,
  });

  if (queued.queued) {
    server.log.info(
      { failureId, jobId: queued.jobId },
      "Webhook retry queued"
    );
  } else {
    const queueError = queued.result.success
      ? "Retry executed immediately"
      : queued.result.error;
    server.log.warn(
      { failureId, error: queueError },
      "Webhook retry not queued"
    );
  }

  return failureId;
}

export default async function webhookRoutes(server: FastifyInstance) {
  server.addContentTypeParser(
    "application/json",
    { parseAs: "buffer" },
    (_req, body, done) => {
      done(null, body);
    }
  );

  // POST /webhooks/razorpay
  server.post("/webhooks/razorpay", async (request, reply) => {
    const rawBody = getRawBody(request.body);
    const signature = request.headers["x-razorpay-signature"];
    const eventIdHeader = request.headers["x-razorpay-event-id"];
    const razorpayEventId =
      typeof eventIdHeader === "string" ? eventIdHeader : undefined;

    if (!signature || typeof signature !== "string") {
      request.log.warn("Razorpay webhook: missing x-razorpay-signature header");
      return reply
        .status(400)
        .send({ success: false, message: "Missing signature header" });
    }

    let isValid: boolean;
    try {
      isValid = verifyWebhookSignature(rawBody, signature);
    } catch (err) {
      request.log.error(
        { err },
        "Razorpay webhook: signature verification error"
      );
      return reply
        .status(500)
        .send({ success: false, message: "Internal server error" });
    }

    if (!isValid) {
      request.log.warn("Razorpay webhook: invalid signature");
      return reply
        .status(400)
        .send({ success: false, message: "Invalid signature" });
    }

    let event: RazorpayWebhookPayload;
    try {
      event = JSON.parse(rawBody.toString("utf-8")) as RazorpayWebhookPayload;
    } catch {
      return reply
        .status(400)
        .send({ success: false, message: "Malformed JSON body" });
    }

    const eventTimestampMs = normalizeUnixTimestampMs(event.created_at);
    if (!eventTimestampMs) {
      request.log.warn(
        { event: event.event, eventId: razorpayEventId },
        "Razorpay webhook rejected: missing or invalid created_at timestamp"
      );
      return reply
        .status(400)
        .send({ success: false, message: "Missing or invalid webhook timestamp" });
    }

    if (eventTimestampMs < Date.now() - RAZORPAY_WEBHOOK_MAX_AGE_MS) {
      request.log.warn(
        {
          event: event.event,
          eventId: razorpayEventId,
          eventTimestampMs,
        },
        "Razorpay webhook rejected: stale timestamp"
      );
      return reply
        .status(400)
        .send({ success: false, message: "Webhook too old" });
    }

    request.log.info(
      { event: event.event, eventId: razorpayEventId },
      "Razorpay webhook received"
    );

    // ── Idempotency guard ──────────────────────────────────────
    // Razorpay may retry delivery; deduplicate by event ID.
    if (razorpayEventId) {
      const alreadyProcessed = await prisma.webhookEvent.findUnique({
        where: { eventId: razorpayEventId },
        select: { id: true },
      });
      if (alreadyProcessed) {
        request.log.info(
          { eventId: razorpayEventId },
          "Razorpay webhook duplicate — skipped"
        );
        return reply
          .status(200)
          .send({ success: true, message: "Already processed" });
      }
    }

    try {
      switch (event.event) {
        case "payment.captured": {
          const processed = await handlePaymentCaptured(
            event as PaymentCapturedPayload,
            { source: "webhook" }
          );

          if (processed) {
            request.log.info(
              {
                event: event.event,
                paymentId: event.payload.payment?.entity.id,
                orderId: event.payload.payment?.entity.order_id,
              },
              "Razorpay payment captured processed"
            );
          } else {
            request.log.info(
              { paymentId: event.payload.payment?.entity.id },
              "Razorpay payment captured skipped (duplicate)"
            );
          }
          break;
        }

        case "payment.failed": {
          const payment = event.payload.payment?.entity;
          const schoolId = payment?.notes?.schoolId;

          if (schoolId && razorpayEventId) {
            // Atomic: dedup + increment in one transaction to prevent
            // double-counting on webhook retries
            await prisma.$transaction(async (tx) => {
              const existing = await tx.webhookEvent.findUnique({
                where: { eventId: razorpayEventId },
                select: { id: true },
              });
              if (existing) return; // already processed

              await tx.webhookEvent.create({
                data: { eventId: razorpayEventId, provider: "razorpay" },
              });

              await tx.school.updateMany({
                where: { id: schoolId },
                data: {
                  paymentFailureCount: { increment: 1 },
                },
              });
            });

            await writeAuditLog("PAYMENT_FAILED", "system", schoolId, {
              razorpayPaymentId: payment?.id,
              errorCode: payment?.error_code,
              errorDescription: payment?.error_description,
              errorReason: payment?.error_reason,
            });
          } else if (schoolId) {
            // No event ID — fallback to non-transactional (rare edge case)
            await prisma.school.updateMany({
              where: { id: schoolId },
              data: {
                paymentFailureCount: { increment: 1 },
              },
            });

            await writeAuditLog("PAYMENT_FAILED", "system", schoolId, {
              razorpayPaymentId: payment?.id,
              errorCode: payment?.error_code,
              errorDescription: payment?.error_description,
              errorReason: payment?.error_reason,
            });
          }

          request.log.warn(
            {
              paymentId: payment?.id,
              schoolId,
              error: payment?.error_description,
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

            await prisma.invoice.updateMany({
              where: {
                schoolId,
                razorpayPaymentId: refund.payment_id,
              },
              data: {
                status: "refunded",
              },
            });

            await prisma.legacyPayment.updateMany({
              where: {
                schoolId,
                OR: [
                  { gatewayId: refund.payment_id },
                  { id: refund.payment_id },
                ],
              },
              data: {
                status: "refunded",
                refundedAmount: refund.amount,
              },
            });
          }

          request.log.info(
            { refundId: refund?.id, paymentId: refund?.payment_id },
            "Razorpay refund created processed"
          );
          break;
        }

        default:
          request.log.info(
            { event: event.event },
            "Razorpay webhook event ignored"
          );
      }

      // Record successful processing for dedup
      if (razorpayEventId) {
        try {
          await prisma.webhookEvent.create({
            data: {
              eventId: razorpayEventId,
              provider: "razorpay",
            },
          });
        } catch (dedupErr) {
          // Unique constraint race — another instance already recorded it.
          request.log.debug(
            { eventId: razorpayEventId, err: dedupErr },
            "Webhook dedup record race (harmless)"
          );
        }
      }
    } catch (err) {
      request.log.error(
        { err, event: event.event },
        "Razorpay webhook handler failed"
      );

      const failureId = await queueWebhookRetry(
        server,
        event.event,
        rawBody,
        err,
        event.payload?.payment?.entity?.notes?.schoolId,
        razorpayEventId ?? event.payload?.payment?.entity?.id
      );

      return reply
        .status(200)
        .send({ success: false, message: "Handler error — logged", failureId });
    }

    return reply.status(200).send({ success: true });
  });

  // POST /webhooks/stripe
  server.post("/webhooks/stripe", async (request, reply) => {
    const rawBody = getRawBody(request.body);
    const signature = request.headers["stripe-signature"];

    if (!signature || typeof signature !== "string") {
      request.log.warn("Stripe webhook: missing stripe-signature header");
      return reply
        .status(400)
        .send({ success: false, message: "Missing signature header" });
    }

    let isValid: boolean;
    try {
      isValid = verifyStripeWebhookSignature(rawBody, signature);
    } catch (err) {
      request.log.error({ err }, "Stripe webhook: signature verification error");
      return reply
        .status(400)
        .send({ success: false, message: "Signature verification failed" });
    }

    if (!isValid) {
      request.log.warn("Stripe webhook: invalid signature");
      return reply
        .status(400)
        .send({ success: false, message: "Invalid signature" });
    }

    let event: StripeWebhookPayload;
    try {
      event = JSON.parse(rawBody.toString("utf-8")) as StripeWebhookPayload;
    } catch {
      return reply
        .status(400)
        .send({ success: false, message: "Malformed JSON body" });
    }

    const eventType = event.type ?? "unknown";
    const stripeEventId = typeof event.id === "string" ? event.id : undefined;
    request.log.info({ type: eventType, eventId: stripeEventId }, "Stripe webhook received");

    // Timestamp validation — reject stale events (same 5-min window as Razorpay)
    if (typeof event.created === "number" && event.created > 0) {
      const eventMs = event.created < 1_000_000_000_000 ? event.created * 1000 : event.created;
      if (eventMs < Date.now() - RAZORPAY_WEBHOOK_MAX_AGE_MS) {
        request.log.warn(
          { type: eventType, eventId: stripeEventId, created: event.created },
          "Stripe webhook rejected: stale timestamp"
        );
        return reply
          .status(400)
          .send({ success: false, message: "Webhook too old" });
      }
    }

    // Idempotency guard
    if (stripeEventId) {
      const alreadyProcessed = await prisma.webhookEvent.findUnique({
        where: { eventId: stripeEventId },
        select: { id: true },
      });
      if (alreadyProcessed) {
        request.log.info(
          { eventId: stripeEventId },
          "Stripe webhook duplicate — skipped"
        );
        return reply
          .status(200)
          .send({ success: true, message: "Already processed" });
      }
    }

    try {
      switch (eventType) {
        case "charge.succeeded": {
          const charge = event.data?.object ?? {};
          const metadata = (charge.metadata ?? {}) as Record<string, string>;

          if (metadata.schoolId) {
            const plan = metadata.plan ?? "basic";
            const durationDays = 30;
            const now = new Date();
            const periodEnd = new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000);
            const chargeId = String(charge.id ?? "");
            const chargeAmount = Number(charge.amount ?? 0);
            const chargeCurrency = String(charge.currency ?? "INR").toUpperCase();

            // Atomic: subscription update + payment record + invoice
            // Mirrors the Razorpay handlePaymentCaptured transaction pattern
            await prisma.$transaction(async (tx) => {
              // Idempotency: check if invoice already exists for this charge
              const existingInvoice = await tx.invoice.findFirst({
                where: { razorpayPaymentId: chargeId },
                select: { id: true },
              });
              if (existingInvoice) return;

              await tx.school.update({
                where: { id: metadata.schoolId },
                data: {
                  subscriptionPlan: plan as any,
                  subscriptionStatus: "active",
                  currentPeriodStart: now,
                  currentPeriodEnd: periodEnd,
                  paymentFailureCount: 0,
                  lastPaymentId: chargeId,
                },
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

              await tx.invoice.create({
                data: {
                  schoolId: metadata.schoolId,
                  plan,
                  razorpayPaymentId: chargeId, // reuse field for Stripe charge ID
                  amount: chargeAmount,
                  currency: chargeCurrency,
                  status: "paid",
                  periodStart: now,
                  periodEnd,
                  paidAt: now,
                },
              });
            });

            await writeAuditLog("STRIPE_CHARGE_SUCCEEDED", "system", metadata.schoolId, {
              chargeId,
              amount: chargeAmount / 100,
              currency: chargeCurrency,
              plan,
            });
          }
          break;
        }

        case "charge.failed": {
          const charge = event.data?.object ?? {};
          const metadata = (charge.metadata ?? {}) as Record<string, string>;

          if (metadata.schoolId) {
            await prisma.school.updateMany({
              where: { id: metadata.schoolId },
              data: {
                paymentFailureCount: {
                  increment: 1,
                },
              },
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
            await writeAuditLog("REFUND_CREATED", "system", metadata.schoolId, {
              chargeId: charge.id,
              amount: Number(charge.amount_refunded ?? 0) / 100,
              currency: String(charge.currency ?? "").toUpperCase(),
            });
          }
          break;
        }

        default:
          request.log.debug({ type: eventType }, "Stripe webhook event ignored");
      }
      // Record successful processing for dedup
      if (stripeEventId) {
        try {
          await prisma.webhookEvent.create({
            data: { eventId: stripeEventId, provider: "stripe" },
          });
        } catch (dedupErr) {
          request.log.debug(
            { eventId: stripeEventId, err: dedupErr },
            "Stripe webhook dedup record race (harmless)"
          );
        }
      }
    } catch (err) {
      request.log.error({ err, type: eventType }, "Stripe webhook handler failed");

      const failureId = await queueWebhookRetry(
        server,
        eventType,
        rawBody,
        err
      );

      return reply
        .status(200)
        .send({ success: false, message: "Handler error — logged", failureId });
    }

    return reply.status(200).send({ success: true });
  });
}
