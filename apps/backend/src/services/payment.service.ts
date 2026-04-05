import crypto from "crypto";
import { razorpay } from "../lib/razorpay";
import { prisma } from "../lib/prisma";
import { writeAuditLog } from "./audit.service";

// ---------------------------------------------------------------------------
// Plan durations
// ---------------------------------------------------------------------------

export type SubscriptionStatus = "trial" | "active" | "past_due" | "expired";

const PLAN_DURATION_DAYS: Record<string, number> = {
  Trial: 14, Basic: 30, Standard: 30, Premium: 30, Annual: 365,
};

function getPlanDurationDays(plan: string, overrideDays?: string): number {
  if (overrideDays) {
    const parsed = parseInt(overrideDays, 10);
    if (!isNaN(parsed) && parsed > 0) return parsed;
  }
  return PLAN_DURATION_DAYS[plan] ?? 30;
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
}

export interface RazorpayOrder {
  id: string;
  amount: number;
  currency: string;
  receipt: string;
}

export async function createOrder(options: CreateOrderOptions): Promise<RazorpayOrder> {
  const { amount, currency = "INR", schoolId, plan, durationDays } = options;
  const receipt = `rcpt_${schoolId}_${Date.now()}`;

  const order = await razorpay.orders.create({
    amount,
    currency,
    receipt,
    notes: {
      schoolId,
      plan,
      durationDays: String(durationDays ?? getPlanDurationDays(plan)),
    },
  });

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
        notes: Record<string, string>;
      };
    };
  };
}

export function verifyWebhookSignature(rawBody: Buffer, signature: string): boolean {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) throw new Error("RAZORPAY_WEBHOOK_SECRET environment variable is not set");

  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  return expected === signature;
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

    return computed === providedSignature;
  } catch (err) {
    throw new Error(`Stripe signature verification failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

export async function handlePaymentCaptured(payload: PaymentCapturedPayload): Promise<boolean> {
  const payment = payload.payload.payment.entity;
  const { schoolId, plan, durationDays } = payment.notes;

  if (!schoolId || !plan) throw new Error("Missing schoolId or plan in payment notes");

  // 1. Idempotency — check for existing invoice
  const existing = await prisma.invoice.findFirst({
    where: { razorpayPaymentId: payment.id },
  });

  if (existing) return false; // Already processed

  const now = new Date();
  const periodDays = getPlanDurationDays(plan, durationDays);
  const periodEnd = new Date(now.getTime() + periodDays * 24 * 60 * 60 * 1000);

  // Atomic: update school + create invoice
  try {
    await prisma.$transaction([
      prisma.school.update({
        where: { id: schoolId },
        data: {
          subscriptionPlan: plan as any,
          subscriptionStatus: "active",
          currentPeriodStart: now,
          currentPeriodEnd: periodEnd,
        },
      }),
      prisma.invoice.create({
        data: {
          schoolId,
          plan,
          razorpayPaymentId: payment.id,
          razorpayOrderId: payment.order_id,
          amount: payment.amount,
          currency: payment.currency,
          status: "paid",
          periodStart: now.toISOString(),
          periodEnd: periodEnd.toISOString(),
        },
      }),
    ]);
  } catch (error: unknown) {
    const code =
      typeof error === "object" && error !== null && "code" in error
        ? (error as { code?: string }).code
        : undefined;

    // Another worker/request already processed this payment.
    if (code === "P2002") {
      return false;
    }

    throw error;
  }

  await writeAuditLog("PAYMENT_RECEIVED", "system", schoolId, {
    razorpayPaymentId: payment.id,
    razorpayOrderId: payment.order_id,
    amount: payment.amount,
    currency: payment.currency,
    plan,
  });

  await writeAuditLog("SUBSCRIPTION_UPGRADED", "system", schoolId, {
    plan,
    subscriptionStatus: "active",
    durationDays: periodDays,
  });

  return true;
}
