/**
 * feesService.ts
 *
 * Backend routes:
 *   GET  /fees?studentId=       — fetch student fee summary + history
 *   POST /payments/create-order — initiate a payment order (Razorpay / gateway)
 *   POST /payments              — record a completed payment
 */

import { apiFetch } from "./api";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface PaymentHistoryItem {
  date: string;
  amount: number;
  receiptId: string;
  status: "Paid" | "Pending" | "Failed";
  method?: string;
}

export interface FeeStructureItem {
  id: string;
  name: string;
  amount: number;
  dueDate: string;
  status: "Paid" | "Pending" | "Overdue";
}

export interface FeesData {
  total: number;
  paid: number;
  pending: number;
  dueDate: string;
  history: PaymentHistoryItem[];
  feeStructure: FeeStructureItem[];
}

type BackendFeeItem = {
  id: string;
  feeType?: string;
  amount?: number;
  amountPaid?: number;
  dueDate?: string;
  status?: string;
  createdAt?: string;
};

export interface PaymentOrderPayload {
  studentId: string;
  feeId: string;
  amount: number;
  method: string;
}

export interface PaymentOrderResult {
  orderId: string;
  receiptId: string;
  amount: number;
  currency: string;
}

export interface RecordPaymentPayload {
  studentId: string;
  feeId: string;
  amount: number;
  method: string;
  receiptId: string;
  status: "Paid";
}

// ─── Functions ────────────────────────────────────────────────────────────────

/**
 * Fetch fee summary and history for a student.
 * Replaces: getDocs(query(collection(db, "fees"), where("studentId", "==", id)))
 */
export async function getStudentFees(studentId: string): Promise<FeesData> {
  try {
    const fees = await apiFetch<BackendFeeItem[]>("/fees", {
      params: { studentId, limit: 200 },
    });

    const safeFees = Array.isArray(fees) ? fees : [];
    const total = safeFees.reduce((sum, fee) => sum + (fee.amount ?? 0), 0);
    const paid = safeFees.reduce((sum, fee) => sum + (fee.amountPaid ?? 0), 0);

    const dueDate = safeFees
      .filter((fee) => (fee.status ?? "").toLowerCase() !== "paid" && typeof fee.dueDate === "string")
      .map((fee) => fee.dueDate as string)
      .sort()[0] ?? "";

    const history: PaymentHistoryItem[] = safeFees.map((fee) => ({
      date: fee.createdAt ?? fee.dueDate ?? "",
      amount: fee.amountPaid ?? fee.amount ?? 0,
      receiptId: fee.id,
      status:
        (fee.status ?? "").toLowerCase() === "paid"
          ? "Paid"
          : (fee.status ?? "").toLowerCase() === "partial"
            ? "Pending"
            : (fee.status ?? "").toLowerCase() === "overdue"
              ? "Failed"
              : "Pending",
    }));

    const feeStructure: FeeStructureItem[] = safeFees.map((fee) => ({
      id: fee.id,
      name: fee.feeType ?? "Fee",
      amount: fee.amount ?? 0,
      dueDate: fee.dueDate ?? "",
      status:
        (fee.status ?? "").toLowerCase() === "paid"
          ? "Paid"
          : (fee.status ?? "").toLowerCase() === "overdue"
            ? "Overdue"
            : "Pending",
    }));

    return {
      total,
      paid,
      pending: Math.max(0, total - paid),
      dueDate,
      history,
      feeStructure,
    };
  } catch {
    return { total: 0, paid: 0, pending: 0, dueDate: "", history: [], feeStructure: [] };
  }
}

/**
 * Create a payment order with the payment gateway.
 * Maps to: POST /payments/create-order
 * Queues for offline retry if the network request fails.
 */
export async function createPaymentOrder(
  payload: PaymentOrderPayload
): Promise<PaymentOrderResult> {
  try {
    return await apiFetch<PaymentOrderResult>("/payments/create-order", {
      method: "POST",
      body: payload,
    });
  } catch (error: any) {
    // Queue for offline retry
    const { enqueueOfflineMutation } = await import("./offlineSyncQueue");
    await enqueueOfflineMutation({
      path: "/payments/create-order",
      method: "POST",
      body: payload,
    });
    console.warn("[PaymentOrder] Queued payment order for offline retry:", error.message);
    throw error; // Re-throw so caller knows it failed
  }
}

/**
 * Record a completed payment in the backend.
 * Maps to: POST /payments
 * Queues for offline retry if the network request fails.
 */
export async function recordPayment(
  payload: RecordPaymentPayload
): Promise<void> {
  try {
    await apiFetch<void>("/payments", {
      method: "POST",
      body: payload,
    });
  } catch (error: any) {
    // Queue for offline retry
    const { enqueueOfflineMutation } = await import("./offlineSyncQueue");
    await enqueueOfflineMutation({
      path: "/payments",
      method: "POST",
      body: payload,
    });
    console.warn("[PaymentRecord] Queued payment record for offline retry:", error.message);
    throw error; // Re-throw so caller knows it failed
  }
}
