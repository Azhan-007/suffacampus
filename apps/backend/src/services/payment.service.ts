import crypto from "crypto";
import { razorpay } from "../lib/razorpay";
import { prisma } from "../lib/prisma";
import { writeAuditLog } from "./audit.service";
import { Errors } from "../errors";
import { assertSchoolScope } from "../lib/tenant-scope";

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

export interface HandlePaymentCapturedOptions {
  source?: "webhook" | "verify" | "retry";
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

export async function handlePaymentCaptured(
  payload: PaymentCapturedPayload,
  options: HandlePaymentCapturedOptions = {}
): Promise<boolean> {
  const payment = payload.payload.payment.entity;
  const notes = toStringRecord(payment.notes);

  if (String(payment.status).toLowerCase() !== "captured") {
    throw Errors.paymentFailed("Payment is not captured");
  }

  const context = buildCaptureContext(notes, options.fallbackMetadata);
  const amount = Math.trunc(Number(payment.amount));
  const currency = normalizeCurrency(payment.currency);

  if (!Number.isFinite(amount) || amount <= 0) {
    throw Errors.badRequest("Captured payment amount is invalid");
  }

  const now = new Date();
  const periodEnd = new Date(
    now.getTime() + context.durationDays * 24 * 60 * 60 * 1000
  );

  try {
    const processed = await prisma.$transaction(async (tx) => {
      const existingInvoice = await tx.invoice.findFirst({
        where: { razorpayPaymentId: payment.id },
        select: { id: true },
      });

      if (existingInvoice) {
        return false;
      }

      const existingOrderPayment = await tx.legacyPayment.findUnique({
        where: { gatewayOrderId: payment.order_id },
        select: { id: true, schoolId: true, paymentMethodDetails: true },
      });

      if (existingOrderPayment && existingOrderPayment.schoolId !== context.schoolId) {
        throw Errors.tenantMismatch();
      }

      const method = normalizePaymentMethod(payment.method);
      const combinedMetadata = {
        ...readFallbackNotes(existingOrderPayment?.paymentMethodDetails),
        ...notes,
        plan: context.plan,
        billingCycle: context.billingCycle,
        durationDays: context.durationDays,
        source: options.source ?? "webhook",
      };

      if (existingOrderPayment) {
        await tx.legacyPayment.update({
          where: { id: existingOrderPayment.id },
          data: {
            status: "completed",
            amount,
            currency,
            method,
            gatewayId: payment.id,
            gatewaySignature: options.gatewaySignature,
            verifiedAt: new Date(),
            paymentMethodDetails: combinedMetadata,
          },
        });
      } else {
        await tx.legacyPayment.create({
          data: {
            schoolId: context.schoolId,
            amount,
            currency,
            status: "completed",
            method,
            gatewayId: payment.id,
            gatewayOrderId: payment.order_id,
            gatewaySignature: options.gatewaySignature,
            verifiedAt: new Date(),
            description: `Subscription payment for ${context.plan}`,
            paymentMethodDetails: combinedMetadata,
          },
        });
      }

      await tx.school.update({
        where: { id: context.schoolId },
        data: {
          subscriptionPlan: context.plan as any,
          subscriptionStatus: "active",
          currentPeriodStart: now,
          currentPeriodEnd: periodEnd,
          paymentFailureCount: 0,
          lastPaymentId: payment.id,
        },
      });

      await tx.invoice.create({
        data: {
          schoolId: context.schoolId,
          plan: context.plan,
          razorpayPaymentId: payment.id,
          razorpayOrderId: payment.order_id,
          amount,
          currency,
          status: "paid",
          periodStart: now,
          periodEnd,
          paidAt: now,
        },
      });

      return true;
    });

    if (!processed) {
      return false;
    }
  } catch (error) {
    if (isPrismaUniqueViolation(error)) {
      return false;
    }

    throw error;
  }

  await writeAuditLog("PAYMENT_RECEIVED", "system", context.schoolId, {
    source: options.source ?? "webhook",
    razorpayPaymentId: payment.id,
    razorpayOrderId: payment.order_id,
    amount,
    currency,
    plan: context.plan,
  });

  await writeAuditLog("PAYMENT_CAPTURED", "system", context.schoolId, {
    source: options.source ?? "webhook",
    razorpayPaymentId: payment.id,
    razorpayOrderId: payment.order_id,
    amount,
    currency,
    plan: context.plan,
    capturedAt: now.toISOString(),
  });

  await writeAuditLog("SUBSCRIPTION_UPGRADED", "system", context.schoolId, {
    plan: context.plan,
    subscriptionStatus: "active",
    durationDays: context.durationDays,
  });

  return true;
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
