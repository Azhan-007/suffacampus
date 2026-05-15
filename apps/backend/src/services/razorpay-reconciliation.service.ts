import { razorpay } from "../lib/razorpay";
import { createLogger } from "../utils/logger";

const log = createLogger("razorpay-reconciliation");

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export interface ProviderPaymentState {
  id: string;
  status: string;
  amount: number; // paise
  currency: string;
  method: string | null;
  orderId: string | null;
  captured: boolean;
  refundStatus: string | null; // null | "partial" | "full"
  amountRefunded: number; // paise
  notes: Record<string, string>;
  createdAt: number; // unix timestamp
  error?: string;
}

export interface ProviderRefundState {
  id: string;
  paymentId: string;
  amount: number; // paise
  status: string; // "processed" | "pending" | "failed"
  createdAt: number;
}

export interface ProviderVerificationResult {
  exists: boolean;
  payment: ProviderPaymentState | null;
  error?: string;
}

export interface RefundVerificationResult {
  exists: boolean;
  refund: ProviderRefundState | null;
  error?: string;
}

export interface AmountVerificationResult {
  matches: boolean;
  providerAmount: number;
  internalAmount: number;
  difference: number;
  error?: string;
}

// ─────────────────────────────────────────────────────────────
// Fetch payment state from Razorpay
// ─────────────────────────────────────────────────────────────

export async function fetchProviderPaymentState(
  paymentId: string
): Promise<ProviderVerificationResult> {
  try {
    const raw = (await razorpay.payments.fetch(paymentId)) as unknown as Record<string, unknown>;

    const payment: ProviderPaymentState = {
      id: String(raw.id ?? ""),
      status: String(raw.status ?? ""),
      amount: Number(raw.amount ?? 0),
      currency: String(raw.currency ?? "INR"),
      method: raw.method ? String(raw.method) : null,
      orderId: raw.order_id ? String(raw.order_id) : null,
      captured: Boolean(raw.captured),
      refundStatus: raw.refund_status ? String(raw.refund_status) : null,
      amountRefunded: Number(raw.amount_refunded ?? 0),
      notes: normalizeNotes(raw.notes),
      createdAt: Number(raw.created_at ?? 0),
    };

    return { exists: true, payment };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    const isNotFound =
      message.includes("not found") ||
      message.includes("BAD_REQUEST_ERROR") ||
      message.includes("404");

    if (isNotFound) {
      return { exists: false, payment: null };
    }

    log.error({ err, paymentId }, "Failed to fetch provider payment state");
    return { exists: false, payment: null, error: message };
  }
}

// ─────────────────────────────────────────────────────────────
// Fetch refund state from Razorpay
// ─────────────────────────────────────────────────────────────

export async function fetchProviderRefundState(
  paymentId: string,
  refundId: string
): Promise<RefundVerificationResult> {
  try {
    const raw = (await (razorpay.payments as any).fetchRefund(
      paymentId,
      refundId
    )) as Record<string, unknown>;

    const refund: ProviderRefundState = {
      id: String(raw.id ?? ""),
      paymentId: String(raw.payment_id ?? ""),
      amount: Number(raw.amount ?? 0),
      status: String(raw.status ?? ""),
      createdAt: Number(raw.created_at ?? 0),
    };

    return { exists: true, refund };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    const isNotFound = message.includes("not found") || message.includes("404");

    if (isNotFound) {
      return { exists: false, refund: null };
    }

    log.error({ err, paymentId, refundId }, "Failed to fetch provider refund state");
    return { exists: false, refund: null, error: message };
  }
}

// ─────────────────────────────────────────────────────────────
// Verify captured amount matches
// ─────────────────────────────────────────────────────────────

export async function verifyCapturedAmount(
  paymentId: string,
  expectedAmountPaise: number
): Promise<AmountVerificationResult> {
  const result = await fetchProviderPaymentState(paymentId);

  if (!result.exists || !result.payment) {
    return {
      matches: false,
      providerAmount: 0,
      internalAmount: expectedAmountPaise,
      difference: expectedAmountPaise,
      error: result.error ?? "Payment not found at provider",
    };
  }

  const providerAmount = result.payment.amount;
  const difference = Math.abs(providerAmount - expectedAmountPaise);

  return {
    matches: difference === 0,
    providerAmount,
    internalAmount: expectedAmountPaise,
    difference,
  };
}

// ─────────────────────────────────────────────────────────────
// Verify refunded amount matches
// ─────────────────────────────────────────────────────────────

export async function verifyRefundedAmount(
  paymentId: string,
  expectedRefundPaise: number
): Promise<AmountVerificationResult> {
  const result = await fetchProviderPaymentState(paymentId);

  if (!result.exists || !result.payment) {
    return {
      matches: false,
      providerAmount: 0,
      internalAmount: expectedRefundPaise,
      difference: expectedRefundPaise,
      error: result.error ?? "Payment not found at provider",
    };
  }

  const providerRefunded = result.payment.amountRefunded;
  const difference = Math.abs(providerRefunded - expectedRefundPaise);

  return {
    matches: difference === 0,
    providerAmount: providerRefunded,
    internalAmount: expectedRefundPaise,
    difference,
  };
}

// ─────────────────────────────────────────────────────────────
// Verify payment existence
// ─────────────────────────────────────────────────────────────

export async function verifyPaymentExists(paymentId: string): Promise<boolean> {
  const result = await fetchProviderPaymentState(paymentId);
  return result.exists;
}

// ─────────────────────────────────────────────────────────────
// Verify refund existence
// ─────────────────────────────────────────────────────────────

export async function verifyRefundExists(
  paymentId: string,
  refundId: string
): Promise<boolean> {
  const result = await fetchProviderRefundState(paymentId, refundId);
  return result.exists;
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function normalizeNotes(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== "object") return {};
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    result[key] = String(value ?? "");
  }
  return result;
}
