import crypto from "crypto";
import { Prisma } from "@prisma/client";
import { razorpay } from "../lib/razorpay";
import { prisma, type PrismaTransactionClient } from "../lib/prisma";
import { createImmutableInvoice } from "./invoice.service";
import { writeAuditLog } from "./audit.service";
import { Errors } from "../errors";
import { assertSchoolScope } from "../lib/tenant-scope";
import { activatePaid } from "./tenant-lifecycle.service";

// ---------------------------------------------------------------------------
// Plan durations
// ---------------------------------------------------------------------------

export type SubscriptionStatus = "trial" | "active" | "past_due" | "expired";

export type BillingCycle = "monthly" | "yearly";

type SupportedPlan = "free" | "basic" | "pro" | "enterprise";

const PLAN_PRICING_PAISE: Record<SupportedPlan, { monthly: number; yearly: number }> = {
  free: { monthly: 0, yearly: 0 },
  basic: { monthly: 99900, yearly: 999900 },
  pro: { monthly: 249900, yearly: 2499900 },
  enterprise: { monthly: 499900, yearly: 4999900 },
};

const PLAN_ALIASES: Record<string, SupportedPlan> = {
  free: "free",
  trial: "free",
  basic: "basic",
  standard: "pro",
  pro: "pro",
  premium: "enterprise",
  enterprise: "enterprise",
};

const DEFAULT_CYCLE_DURATION: Record<BillingCycle, number> = {
  monthly: 30,
  yearly: 365,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toStringRecord(value: unknown): Record<string, string> {
  if (!isRecord(value)) return {};

  const output: Record<string, string> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (raw === undefined || raw === null) continue;
    output[key] = String(raw);
  }

  return output;
}

function safeCompare(expected: string, provided: string): boolean {
  const expectedBuffer = Buffer.from(expected, "utf8");
  const providedBuffer = Buffer.from(provided.trim(), "utf8");

  if (expectedBuffer.length !== providedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(expectedBuffer, providedBuffer);
}

function isPrismaUniqueViolation(error: unknown): boolean {
  return (
    isRecord(error) &&
    typeof error.code === "string" &&
    error.code === "P2002"
  );
}

function normalizeCurrency(currency?: string): string {
  const normalized = String(currency ?? "INR").trim().toUpperCase();
  if (!normalized || normalized.length !== 3) {
    throw Errors.badRequest("Currency must be a valid 3-letter code");
  }
  return normalized;
}

function normalizeBillingCycle(cycle?: string): BillingCycle {
  return String(cycle ?? "monthly").toLowerCase() === "yearly"
    ? "yearly"
    : "monthly";
}

export function normalizePlanCode(plan: string): SupportedPlan | null {
  const key = plan.trim().toLowerCase();
  return PLAN_ALIASES[key] ?? null;
}

function resolveDurationDays(billingCycle: BillingCycle, override?: number): number {
  if (override !== undefined) {
    const days = Math.trunc(override);
    if (days < 1 || days > 730) {
      throw Errors.badRequest("durationDays must be between 1 and 730");
    }
    return days;
  }

  return DEFAULT_CYCLE_DURATION[billingCycle];
}

export function resolveSubscriptionAmountPaise(
  planCode: string,
  billingCycle: BillingCycle,
  durationDays?: number
): number {
  const normalizedPlan = normalizePlanCode(planCode);
  if (!normalizedPlan) {
    throw Errors.badRequest(`Unsupported plan: ${planCode}`);
  }

  const effectiveDuration = resolveDurationDays(billingCycle, durationDays);
  const pricing = PLAN_PRICING_PAISE[normalizedPlan];
  const baseAmount = pricing[billingCycle];

  if (billingCycle === "yearly" || effectiveDuration === DEFAULT_CYCLE_DURATION.monthly) {
    return baseAmount;
  }

  // Prorate non-standard monthly durations using a daily rate.
  return Math.round((pricing.monthly / DEFAULT_CYCLE_DURATION.monthly) * effectiveDuration);
}

function normalizeIdempotencyKey(raw?: string): string | undefined {
  if (!raw) return undefined;
  const value = raw.trim();
  if (!value) return undefined;
  if (value.length < 8 || value.length > 128) {
    throw Errors.badRequest("Idempotency-Key must be 8-128 characters long");
  }
  return value;
}

function normalizePaymentMethod(method: unknown): "card" | "upi" | "netbanking" | "wallet" | undefined {
  const normalized = String(method ?? "").trim().toLowerCase();
  if (
    normalized === "card" ||
    normalized === "upi" ||
    normalized === "netbanking" ||
    normalized === "wallet"
  ) {
    return normalized;
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Create order
// ---------------------------------------------------------------------------

export interface CreateOrderOptions {
  amount: number;
  currency?: string;
  schoolId: string;
  plan: string;
  durationDays?: number;
  billingCycle?: BillingCycle;
  idempotencyKey?: string;
  initiatedBy?: string;
  description?: string;
}

export interface RazorpayOrder {
  id: string;
  amount: number;
  currency: string;
  receipt: string;
}

export async function createOrder(options: CreateOrderOptions): Promise<RazorpayOrder> {
  const {
    amount,
    currency = "INR",
    schoolId,
    plan,
    durationDays,
    billingCycle = "monthly",
    idempotencyKey,
    initiatedBy = "system",
    description,
  } = options;

  assertSchoolScope(schoolId);

  const normalizedPlan = normalizePlanCode(plan) ?? plan.trim().toLowerCase();
  const normalizedCurrency = normalizeCurrency(currency);
  const normalizedAmount = Math.trunc(amount);
  const normalizedIdempotencyKey = normalizeIdempotencyKey(idempotencyKey);

  if (normalizedAmount <= 0) {
    throw Errors.badRequest("Amount must be a positive integer in paise");
  }

  let idempotencyRecordId: string | null = null;

  if (normalizedIdempotencyKey) {
    const existingByKey = await prisma.legacyPayment.findUnique({
      where: {
        schoolId_idempotencyKey: {
          schoolId,
          idempotencyKey: normalizedIdempotencyKey,
        },
      },
      select: {
        id: true,
        gatewayOrderId: true,
        amount: true,
        currency: true,
        paymentMethodDetails: true,
      },
    });

    if (existingByKey?.gatewayOrderId) {
      const details = toStringRecord(existingByKey.paymentMethodDetails);
      return {
        id: existingByKey.gatewayOrderId,
        amount: Number(existingByKey.amount),
        currency: existingByKey.currency,
        receipt: details.receipt ?? `rcpt_${schoolId}`,
      };
    }

    if (existingByKey) {
      idempotencyRecordId = existingByKey.id;
    } else {
      try {
        const placeholder = await prisma.legacyPayment.create({
          data: {
            schoolId,
            amount: normalizedAmount,
            currency: normalizedCurrency,
            status: "pending",
            idempotencyKey: normalizedIdempotencyKey,
            description:
              description ??
              `Pending subscription payment for ${normalizedPlan} (${billingCycle})`,
            paymentMethodDetails: {
              schoolId,
              plan: normalizedPlan,
              billingCycle,
              durationDays: resolveDurationDays(billingCycle, durationDays),
              initiatedBy,
            },
          },
        });

        idempotencyRecordId = placeholder.id;
      } catch (error) {
        if (isPrismaUniqueViolation(error)) {
          const existing = await prisma.legacyPayment.findUnique({
            where: {
              schoolId_idempotencyKey: {
                schoolId,
                idempotencyKey: normalizedIdempotencyKey,
              },
            },
            select: {
              id: true,
              gatewayOrderId: true,
              amount: true,
              currency: true,
              paymentMethodDetails: true,
            },
          });

          if (existing?.gatewayOrderId) {
            const details = toStringRecord(existing.paymentMethodDetails);
            return {
              id: existing.gatewayOrderId,
              amount: Number(existing.amount),
              currency: existing.currency,
              receipt: details.receipt ?? `rcpt_${schoolId}`,
            };
          }

          if (existing?.id) {
            idempotencyRecordId = existing.id;
          }
        } else {
          throw error;
        }
      }
    }
  }

  const receipt = `rcpt_${schoolId}_${Date.now()}`;

  let order: any;

  try {
    order = (await razorpay.orders.create({
      amount: normalizedAmount,
      currency: normalizedCurrency,
      receipt,
      notes: {
        schoolId,
        plan: normalizedPlan,
        billingCycle,
        durationDays: String(
          durationDays ?? resolveDurationDays(billingCycle, durationDays)
        ),
      },
    })) as any;
  } catch (error) {
    if (idempotencyRecordId) {
      await prisma.legacyPayment.updateMany({
        where: {
          id: idempotencyRecordId,
          schoolId,
        },
        data: {
          status: "failed",
          failureReason:
            error instanceof Error ? error.message : "Failed to create Razorpay order",
        },
      });
    }

    throw error;
  }

  const metadata = {
    schoolId,
    plan: normalizedPlan,
    billingCycle,
    durationDays: resolveDurationDays(billingCycle, durationDays),
    initiatedBy,
    receipt: order.receipt ?? receipt,
  };

  if (normalizedIdempotencyKey && idempotencyRecordId) {
    await prisma.legacyPayment.update({
      where: { id: idempotencyRecordId },
      data: {
        gatewayOrderId: order.id,
        amount: Number(order.amount),
        currency: order.currency,
        status: "pending",
        failureReason: null,
        paymentMethodDetails: metadata,
      },
    });
  } else if (normalizedIdempotencyKey) {
    const updateResult = await prisma.legacyPayment.updateMany({
      where: {
        schoolId,
        idempotencyKey: normalizedIdempotencyKey,
      },
      data: {
        gatewayOrderId: order.id,
        amount: Number(order.amount),
        currency: order.currency,
        status: "pending",
        failureReason: null,
        paymentMethodDetails: metadata,
      },
    });

    if (updateResult.count === 0) {
      await prisma.legacyPayment.create({
        data: {
          schoolId,
          amount: Number(order.amount),
          currency: order.currency,
          status: "pending",
          idempotencyKey: normalizedIdempotencyKey,
          gatewayOrderId: order.id,
          description:
            description ??
            `Pending subscription payment for ${normalizedPlan} (${billingCycle})`,
          paymentMethodDetails: metadata,
        },
      });
    }
  } else {
    await prisma.legacyPayment.create({
      data: {
        schoolId,
        amount: Number(order.amount),
        currency: order.currency,
        status: "pending",
        gatewayOrderId: order.id,
        description:
          description ??
          `Pending subscription payment for ${normalizedPlan} (${billingCycle})`,
        paymentMethodDetails: metadata,
      },
    });
  }

  return {
    id: order.id,
    amount: Number(order.amount),
    currency: order.currency,
    receipt: order.receipt ?? receipt,
  };
}

// ---------------------------------------------------------------------------
// Webhook
// ---------------------------------------------------------------------------

export interface PaymentCapturedPayload {
  event: string;
  payload: {
    payment: {
      entity: {
        id: string;
        order_id: string;
        amount: number;
        currency: string;
        status: string;
        method?: string;
        notes: Record<string, string>;
      };
    };
  };
}

export type PaymentSource = "webhook" | "verify" | "retry" | "reconcile";

export interface ProviderPaymentData {
  status: string;
  amount: number;
  currency: string;
  method?: string;
  notes?: Record<string, string>;
  orderId?: string | null;
}

export interface ProcessProviderPaymentOptions {
  source?: PaymentSource;
  gatewaySignature?: string;
  fallbackMetadata?: Record<string, unknown>;
  paymentData?: ProviderPaymentData;
  useTransaction?: PrismaTransactionClient;
}

export interface ProcessProviderPaymentResult {
  processed: boolean;
  duplicate: boolean;
  schoolId?: string;
  plan?: string;
  durationDays?: number;
  activationState?: ActivationFinalState;
  activationFailureReason?: string | null;
  paymentId: string;
  orderId: string | null;
}

export interface HandlePaymentCapturedOptions {
  source?: PaymentSource;
  gatewaySignature?: string;
  fallbackMetadata?: Record<string, unknown>;
}

export function verifyWebhookSignature(rawBody: Buffer, signature: string): boolean {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) throw new Error("RAZORPAY_WEBHOOK_SECRET environment variable is not set");

  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  return safeCompare(expected, signature);
}

export function verifyPaymentSignature(
  orderId: string,
  paymentId: string,
  signature: string
): boolean {
  const secret = process.env.RAZORPAY_KEY_SECRET;
  if (!secret) {
    throw new Error("RAZORPAY_KEY_SECRET environment variable is not set");
  }

  const payload = `${orderId}|${paymentId}`;
  const expected = crypto.createHmac("sha256", secret).update(payload).digest("hex");
  return safeCompare(expected, signature);
}

/**
 * Verify Stripe webhook signature using timestamp and signature header
 * @param rawBody - Raw request body (as string or buffer)
 * @param signature - Stripe signature header (t=timestamp,v1=signature,v2=old)
 * @returns true if signature is valid and within 5-minute window
 */
export function verifyStripeWebhookSignature(rawBody: string | Buffer, signature: string): boolean {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) throw new Error("STRIPE_WEBHOOK_SECRET environment variable is not set");

  try {
    // Parse the signature header: format is "t=timestamp,v1=signature"
    const parts = signature.split(',').reduce((acc, part) => {
      const [key, value] = part.split('=');
      acc[key] = value;
      return acc;
    }, {} as Record<string, string>);

    const timestamp = parseInt(parts.t, 10);
    const providedSignature = parts.v1;

    if (!timestamp || !providedSignature) {
      throw new Error("Invalid signature format");
    }

    // Check timestamp is within 5 minutes (to prevent replay attacks)
    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - timestamp) > 300) {
      throw new Error("Signature timestamp outside 5-minute window");
    }

    // Compute signing string and HMAC
    const bodyStr = typeof rawBody === 'string' ? rawBody : rawBody.toString('utf-8');
    const signingString = `${timestamp}.${bodyStr}`;
    const computed = crypto
      .createHmac("sha256", secret)
      .update(signingString)
      .digest("hex");

    return safeCompare(computed, providedSignature);
  } catch (err) {
    throw new Error(`Stripe signature verification failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

function readFallbackNotes(source: unknown): Record<string, string> {
  if (!isRecord(source)) return {};
  return toStringRecord(source);
}

function buildCaptureContext(
  notes: Record<string, string>,
  fallbackMetadata?: Record<string, unknown>
): {
  schoolId: string;
  plan: string;
  durationDays: number;
  billingCycle: BillingCycle;
} {
  const fallback = readFallbackNotes(fallbackMetadata);

  const schoolId = (notes.schoolId ?? fallback.schoolId ?? "").trim();
  const rawPlan = (notes.plan ?? fallback.plan ?? "").trim();
  const normalizedPlan = normalizePlanCode(rawPlan) ?? rawPlan.toLowerCase();
  const billingCycle = normalizeBillingCycle(notes.billingCycle ?? fallback.billingCycle);

  if (!schoolId || !normalizedPlan) {
    throw Errors.badRequest("Missing schoolId or plan in payment metadata");
  }

  assertSchoolScope(schoolId);

  const durationCandidate = Number.parseInt(
    notes.durationDays ?? fallback.durationDays ?? "",
    10
  );
  const durationDays = resolveDurationDays(
    billingCycle,
    Number.isFinite(durationCandidate) ? durationCandidate : undefined
  );

  return {
    schoolId,
    plan: normalizedPlan,
    durationDays,
    billingCycle,
  };
}

type ActivationFinalState =
  | "activated"
  | "captured_activation_pending"
  | "activation_failed"
  | "reconciliation_required";

async function lockCanonicalPaymentRow(
  tx: PrismaTransactionClient,
  providerPaymentId: string,
  providerOrderId: string | null
): Promise<{ id: string } | null> {
  const paymentIdFilter = providerOrderId
    ? Prisma.sql`("gatewayId" = ${providerPaymentId} OR "gatewayOrderId" = ${providerOrderId})`
    : Prisma.sql`"gatewayId" = ${providerPaymentId}`;

  const rows = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT "id"
    FROM "Payment"
    WHERE ${paymentIdFilter}
    ORDER BY "updatedAt" DESC, "createdAt" DESC
    LIMIT 1
    FOR UPDATE
  `);

  return rows[0] ?? null;
}

async function findCanonicalPaymentRow(
  tx: PrismaTransactionClient,
  providerPaymentId: string,
  providerOrderId: string | null
) {
  return tx.legacyPayment.findFirst({
    where: {
      OR: [
        { gatewayId: providerPaymentId },
        ...(providerOrderId ? [{ gatewayOrderId: providerOrderId }] : []),
      ],
    },
    select: {
      id: true,
      schoolId: true,
      amount: true,
      currency: true,
      status: true,
      gatewayId: true,
      gatewayOrderId: true,
      paymentMethodDetails: true,
      activationState: true,
      activationAttemptCount: true,
      activationLastError: true,
      invoiceId: true,
      ledgerEventId: true,
    },
  });
}

async function writeActivationLedger(
  tx: PrismaTransactionClient,
  params: {
    schoolId: string;
    legacyPaymentId: string;
    providerPaymentId: string;
    providerOrderId: string | null;
    action: string;
    state: ActivationFinalState;
    details?: Record<string, unknown>;
  }
): Promise<string> {
  const record = await tx.paymentActivationLedger.upsert({
    where: {
      legacyPaymentId_action: {
        legacyPaymentId: params.legacyPaymentId,
        action: params.action,
      },
    },
    create: {
      schoolId: params.schoolId,
      legacyPaymentId: params.legacyPaymentId,
      providerPaymentId: params.providerPaymentId,
      providerOrderId: params.providerOrderId,
      action: params.action,
      state: params.state,
      details: params.details ?? undefined,
    },
    update: {
      state: params.state,
      providerPaymentId: params.providerPaymentId,
      providerOrderId: params.providerOrderId,
      details: params.details ?? undefined,
    },
  });

  return record.id;
}

function buildPaymentActivationMarker(
  providerPaymentId: string,
  state: ActivationFinalState,
  attempt: number
): string {
  return `${providerPaymentId}:${state}:${attempt}`;
}

async function fetchProviderPaymentData(paymentId: string): Promise<ProviderPaymentData> {
  const fetched = (await razorpay.payments.fetch(paymentId)) as unknown as Record<string, unknown>;

  if (!isRecord(fetched)) {
    throw Errors.paymentFailed("Unable to validate payment with gateway");
  }

  return {
    status: String(fetched.status ?? ""),
    amount: Math.trunc(Number(fetched.amount ?? 0)),
    currency: String(fetched.currency ?? "INR"),
    method: String(fetched.method ?? ""),
    notes: toStringRecord(fetched.notes),
    orderId: fetched.order_id ? String(fetched.order_id) : null,
  };
}

export async function processProviderPayment(
  providerPaymentId: string,
  providerOrderId: string | null,
  options: ProcessProviderPaymentOptions = {}
): Promise<ProcessProviderPaymentResult> {
  if (!providerPaymentId) {
    throw Errors.badRequest("providerPaymentId is required");
  }

  const source = options.source ?? "webhook";
  const paymentData = options.paymentData ?? (await fetchProviderPaymentData(providerPaymentId));
  const normalizedStatus = String(paymentData.status ?? "").toLowerCase();

  if (normalizedStatus !== "captured") {
    throw Errors.paymentFailed("Payment is not captured");
  }

  const amount = Math.trunc(Number(paymentData.amount));
  const currency = normalizeCurrency(paymentData.currency);

  if (!Number.isFinite(amount) || amount <= 0) {
    throw Errors.badRequest("Captured payment amount is invalid");
  }

  const notes = toStringRecord(paymentData.notes);
  const orderId = providerOrderId ?? paymentData.orderId ?? null;
  const now = new Date();

  const run = async (tx: PrismaTransactionClient): Promise<ProcessProviderPaymentResult> => {
    const existingInvoice = await tx.invoice.findFirst({
      where: {
        OR: [
          { razorpayPaymentId: providerPaymentId },
          ...(orderId ? [{ razorpayOrderId: orderId }] : []),
        ],
      },
      select: { id: true, schoolId: true },
    });

    const existingPayment = await findCanonicalPaymentRow(tx, providerPaymentId, orderId);

    if (existingPayment) {
      await lockCanonicalPaymentRow(tx, providerPaymentId, orderId);
    }

    if (existingInvoice || existingPayment?.activationState === "activated") {
      return {
        processed: false,
        duplicate: true,
        schoolId: existingInvoice?.schoolId ?? existingPayment?.schoolId,
        paymentId: providerPaymentId,
        orderId,
        activationState: "activated",
        activationFailureReason: null,
      };
    }

    const fallbackMetadata = {
      ...readFallbackNotes(existingPayment?.paymentMethodDetails),
      ...readFallbackNotes(options.fallbackMetadata),
    };

    const context = buildCaptureContext(notes, fallbackMetadata);
    const periodEnd = new Date(now.getTime() + context.durationDays * 24 * 60 * 60 * 1000);
    const method = normalizePaymentMethod(paymentData.method);
    const combinedMetadata = {
      ...fallbackMetadata,
      ...notes,
      plan: context.plan,
      billingCycle: context.billingCycle,
      durationDays: context.durationDays,
      source,
    };

    const paymentRow = existingPayment
      ? await tx.legacyPayment.update({
          where: { id: existingPayment.id },
          data: {
            amount,
            currency,
            status: "completed",
            method,
            gatewayId: providerPaymentId,
            gatewayOrderId: orderId ?? undefined,
            gatewaySignature: options.gatewaySignature,
            verifiedAt: now,
            activationState: "captured_activation_pending",
            activationAttemptCount: { increment: 1 },
            activationRequestedAt: now,
            activationStartedAt: now,
            activationLastError: null,
            capturedAt: now,
            reconciliationMarker: buildPaymentActivationMarker(
              providerPaymentId,
              "captured_activation_pending",
              existingPayment.activationAttemptCount + 1
            ),
            paymentMethodDetails: combinedMetadata,
            failureReason: null,
          },
          select: {
            id: true,
            schoolId: true,
            activationAttemptCount: true,
          },
        })
      : await tx.legacyPayment.create({
          data: {
            schoolId: context.schoolId,
            amount,
            currency,
            status: "completed",
            method,
            gatewayId: providerPaymentId,
            gatewayOrderId: orderId ?? undefined,
            gatewaySignature: options.gatewaySignature,
            verifiedAt: now,
            activationState: "captured_activation_pending",
            activationAttemptCount: 1,
            activationRequestedAt: now,
            activationStartedAt: now,
            capturedAt: now,
            reconciliationMarker: buildPaymentActivationMarker(
              providerPaymentId,
              "captured_activation_pending",
              1
            ),
            paymentMethodDetails: combinedMetadata,
            description: `Subscription payment for ${context.plan}`,
          },
          select: {
            id: true,
            schoolId: true,
            activationAttemptCount: true,
          },
        });

    const captureLedgerId = await writeActivationLedger(tx, {
      schoolId: context.schoolId,
      legacyPaymentId: paymentRow.id,
      providerPaymentId,
      providerOrderId: orderId,
      action: "capture_received",
      state: "captured_activation_pending",
      details: {
        source,
        amount,
        currency,
        plan: context.plan,
        durationDays: context.durationDays,
      },
    });

    const finalizeActivation = async (): Promise<void> => {
      const transition = await activatePaid({
        schoolId: context.schoolId,
        plan: context.plan,
        periodStart: now,
        periodEnd,
        paymentId: providerPaymentId,
        performedBy: "system",
        reason: "payment_captured",
        source,
        useTransaction: tx,
      });

      if (transition.status !== "applied" && transition.status !== "noop") {
        throw Errors.conflict("Subscription activation conflict — retry processing");
      }

      const invoice = await createImmutableInvoice(tx, {
        schoolId: context.schoolId,
        plan: context.plan,
        amount,
        currency,
        status: "paid",
        razorpayPaymentId: providerPaymentId,
        razorpayOrderId: orderId,
        periodStart: now,
        periodEnd,
        description: `Subscription payment for ${context.plan}`,
        paidAt: now,
        finalizedAt: now,
      });

      await tx.legacyPayment.update({
        where: { id: paymentRow.id },
        data: {
          activationState: "activated",
          activationCompletedAt: now,
          activationLastError: null,
          invoiceId: invoice.id,
          ledgerEventId: captureLedgerId,
          reconciliationMarker: buildPaymentActivationMarker(
            providerPaymentId,
            "activated",
            paymentRow.activationAttemptCount
          ),
          reconciledAt: now,
        },
      });

      const activationLedgerId = await writeActivationLedger(tx, {
        schoolId: context.schoolId,
        legacyPaymentId: paymentRow.id,
        providerPaymentId,
        providerOrderId: orderId,
        action: "activation_complete",
        state: "activated",
        details: {
          invoiceId: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          plan: context.plan,
        },
      });

      await tx.legacyPayment.update({
        where: { id: paymentRow.id },
        data: {
          ledgerEventId: activationLedgerId,
        },
      });
    };

    try {
      await finalizeActivation();
    } catch (error) {
      const failureMessage = error instanceof Error ? error.message : String(error);

      await tx.legacyPayment.update({
        where: { id: paymentRow.id },
        data: {
          activationState: "activation_failed",
          activationLastError: failureMessage,
          activationStartedAt: now,
          reconciliationMarker: buildPaymentActivationMarker(
            providerPaymentId,
            "activation_failed",
            paymentRow.activationAttemptCount
          ),
        },
      });

      await writeActivationLedger(tx, {
        schoolId: context.schoolId,
        legacyPaymentId: paymentRow.id,
        providerPaymentId,
        providerOrderId: orderId,
        action: "activation_failed",
        state: "activation_failed",
        details: {
          errorMessage: failureMessage,
          source,
          plan: context.plan,
        },
      });

      return {
        processed: true,
        duplicate: false,
        schoolId: context.schoolId,
        plan: context.plan,
        durationDays: context.durationDays,
        activationState: "activation_failed",
        activationFailureReason: failureMessage,
        paymentId: providerPaymentId,
        orderId,
      };
    }

    return {
      processed: true,
      duplicate: false,
      schoolId: context.schoolId,
      plan: context.plan,
      durationDays: context.durationDays,
      activationState: "activated",
      activationFailureReason: null,
      paymentId: providerPaymentId,
      orderId,
    };
  };

  let result: ProcessProviderPaymentResult;

  try {
    result = options.useTransaction ? await run(options.useTransaction) : await prisma.$transaction(run);
  } catch (error) {
    if (isPrismaUniqueViolation(error)) {
      return {
        processed: false,
        duplicate: true,
        activationFailureReason: null,
        paymentId: providerPaymentId,
        orderId,
      };
    }

    throw error;
  }

  if (result.processed && result.schoolId) {
    await writeAuditLog("PAYMENT_RECEIVED", "system", result.schoolId, {
      source,
      razorpayPaymentId: providerPaymentId,
      razorpayOrderId: result.orderId,
      amount,
      currency,
      activationState: result.activationState,
    });

    await writeAuditLog("PAYMENT_CAPTURED", "system", result.schoolId, {
      source,
      razorpayPaymentId: providerPaymentId,
      razorpayOrderId: result.orderId,
      amount,
      currency,
      activationState: result.activationState,
      capturedAt: now.toISOString(),
    });

    if (result.activationState === "activated") {
      await writeAuditLog("SUBSCRIPTION_UPGRADED", "system", result.schoolId, {
        plan: result.plan,
        subscriptionStatus: "active",
        durationDays: result.durationDays,
      });
    } else if (result.activationState === "activation_failed" && source !== "reconcile") {
      void import("./payment-recovery-queue.service.js")
        .then(({ enqueuePaymentRecovery }) =>
          enqueuePaymentRecovery(result.paymentId, {
            requestedBy: "system:payment-activation",
          })
        )
        .catch((err) => {
          console.warn("Failed to enqueue payment recovery", err);
        });
    }
  }

  return result;
}

export async function handlePaymentCaptured(
  payload: PaymentCapturedPayload,
  options: HandlePaymentCapturedOptions = {}
): Promise<boolean> {
  const payment = payload.payload.payment.entity;
  const result = await processProviderPayment(payment.id, payment.order_id ?? null, {
    source: options.source ?? "webhook",
    gatewaySignature: options.gatewaySignature,
    fallbackMetadata: options.fallbackMetadata,
    paymentData: {
      status: payment.status,
      amount: payment.amount,
      currency: payment.currency,
      method: payment.method,
      notes: toStringRecord(payment.notes),
      orderId: payment.order_id,
    },
  });

  return result.processed;
}

export interface VerifyPaymentOptions {
  schoolId: string;
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
  performedBy: string;
}

export interface VerifyPaymentResult {
  verified: boolean;
  duplicate: boolean;
  paymentId: string;
  orderId: string;
}

export async function verifyPaymentAndPersist(
  options: VerifyPaymentOptions
): Promise<VerifyPaymentResult> {
  assertSchoolScope(options.schoolId);

  const signatureOk = verifyPaymentSignature(
    options.razorpayOrderId,
    options.razorpayPaymentId,
    options.razorpaySignature
  );

  if (!signatureOk) {
    throw Errors.paymentFailed("Invalid payment signature");
  }

  const existingInvoice = await prisma.invoice.findFirst({
    where: {
      schoolId: options.schoolId,
      OR: [
        { razorpayPaymentId: options.razorpayPaymentId },
        { razorpayOrderId: options.razorpayOrderId },
      ],
    },
    select: { id: true },
  });

  if (existingInvoice) {
    return {
      verified: true,
      duplicate: true,
      paymentId: options.razorpayPaymentId,
      orderId: options.razorpayOrderId,
    };
  }

  const pending = await prisma.legacyPayment.findFirst({
    where: {
      schoolId: options.schoolId,
      gatewayOrderId: options.razorpayOrderId,
    },
    select: {
      amount: true,
      currency: true,
      paymentMethodDetails: true,
    },
  });

  if (!pending) {
    throw Errors.notFound("Payment Order", options.razorpayOrderId);
  }

  const fetched = (await razorpay.payments.fetch(
    options.razorpayPaymentId
  )) as unknown as Record<string, unknown>;

  if (!isRecord(fetched)) {
    throw Errors.paymentFailed("Unable to validate payment with gateway");
  }

  const fetchedOrderId = String(fetched.order_id ?? "").trim();
  if (fetchedOrderId !== options.razorpayOrderId) {
    throw Errors.paymentFailed("Gateway order mismatch");
  }

  let captured = fetched;
  const status = String(fetched.status ?? "").toLowerCase();

  if (status === "authorized") {
    captured = (await razorpay.payments.capture(
      options.razorpayPaymentId,
      Math.trunc(Number(pending.amount)),
      pending.currency
    )) as unknown as Record<string, unknown>;
  }

  if (String(captured.status ?? "").toLowerCase() !== "captured") {
    throw Errors.paymentFailed(
      `Payment status is ${String(captured.status ?? "unknown")}`
    );
  }

  const capturedAmount = Math.trunc(Number(captured.amount));
  if (capturedAmount !== Math.trunc(Number(pending.amount))) {
    throw Errors.paymentFailed("Gateway amount mismatch");
  }

  const capturedCurrency = normalizeCurrency(String(captured.currency ?? ""));
  if (capturedCurrency !== normalizeCurrency(pending.currency)) {
    throw Errors.paymentFailed("Gateway currency mismatch");
  }

  const capturedNotes = toStringRecord(captured.notes);
  if (
    capturedNotes.schoolId &&
    capturedNotes.schoolId.trim() !== options.schoolId
  ) {
    throw Errors.tenantMismatch();
  }

  const processed = await handlePaymentCaptured(
    {
      event: "payment.captured",
      payload: {
        payment: {
          entity: {
            id: String(captured.id ?? options.razorpayPaymentId),
            order_id: fetchedOrderId,
            amount: capturedAmount,
            currency: capturedCurrency,
            status: String(captured.status ?? "captured"),
            method: String(captured.method ?? ""),
            notes: capturedNotes,
          },
        },
      },
    },
    {
      source: "verify",
      gatewaySignature: options.razorpaySignature,
      fallbackMetadata: isRecord(pending.paymentMethodDetails)
        ? pending.paymentMethodDetails
        : undefined,
    }
  );

  await writeAuditLog("PAYMENT_VERIFIED", options.performedBy, options.schoolId, {
    razorpayPaymentId: options.razorpayPaymentId,
    razorpayOrderId: options.razorpayOrderId,
    duplicate: !processed,
  });

  return {
    verified: true,
    duplicate: !processed,
    paymentId: options.razorpayPaymentId,
    orderId: options.razorpayOrderId,
  };
}
