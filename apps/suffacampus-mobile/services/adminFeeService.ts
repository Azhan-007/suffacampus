/**
 * adminFeeService.ts
 *
 * Backend routes:
 *   GET    /admin/student-fees     — list all students' fee data
 *   POST   /admin/student-fees     — record a manual fee payment
 *   DELETE /admin/student-fees/:id — delete a fee record
 *   GET    /admin/fee-templates    — list fee templates
 *   POST   /admin/fee-templates    — create a fee template
 *   DELETE /admin/fee-templates/:id — delete a fee template
 */

import { apiFetch } from "./api";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface StudentFeeRecord {
  id: string;
  name: string;
  rollNo: string;
  class: string;
  totalFees: number;
  paidFees: number;
  pendingFees: number;
  dueDate: string;
  status: "Paid" | "Pending" | "Overdue";
}

export interface FeeTemplate {
  id: string;
  name: string;
  amount: number;
  description: string;
  category: string;
}

export interface CreateFeeTemplatePayload {
  name: string;
  amount: number;
  description: string;
  category: string;
}

// ─── Functions ───────────────────────────────────────────────────────────────

/** Fetch all students' fee data (admin). Uses /fees endpoint. */
export async function getAdminStudentFees(): Promise<StudentFeeRecord[]> {
  try {
    return await apiFetch<StudentFeeRecord[]>("/fees");
  } catch {
    return [];
  }
}

/** Record a manual fee payment (admin). Queues for offline retry if network fails. */
export async function recordAdminFeePayment(
  data: Partial<StudentFeeRecord>
): Promise<StudentFeeRecord> {
  try {
    return await apiFetch<StudentFeeRecord>("/fees", {
      method: "POST",
      body: data,
    });
  } catch (error: any) {
    // Queue for offline retry
    const { enqueueOfflineMutation } = await import("./offlineSyncQueue");
    await enqueueOfflineMutation({
      path: "/fees",
      method: "POST",
      body: data,
    });
    console.warn("[AdminFeePayment] Queued fee payment for offline retry:", error.message);
    throw error;
  }
}

/** Delete a student fee record (admin). */
export async function deleteAdminFeeRecord(id: string): Promise<void> {
  await apiFetch<void>(`/fees/${id}`, { method: "DELETE" });
}

/** Fetch all fee templates (admin). Endpoint may not exist yet. */
export async function getFeeTemplates(): Promise<FeeTemplate[]> {
  try {
    return await apiFetch<FeeTemplate[]>("/admin/fee-templates");
  } catch {
    return [];
  }
}

/** Create a new fee template (admin). Queues for offline retry if network fails. */
export async function createFeeTemplate(
  data: CreateFeeTemplatePayload
): Promise<FeeTemplate> {
  try {
    return await apiFetch<FeeTemplate>("/admin/fee-templates", {
      method: "POST",
      body: data,
    });
  } catch (error: any) {
    // Queue for offline retry
    const { enqueueOfflineMutation } = await import("./offlineSyncQueue");
    await enqueueOfflineMutation({
      path: "/admin/fee-templates",
      method: "POST",
      body: data,
    });
    console.warn("[FeeTemplate] Queued fee template creation for offline retry:", error.message);
    throw error;
  }
}

/** Delete a fee template (admin). */
export async function deleteFeeTemplate(id: string): Promise<void> {
  await apiFetch<void>(`/admin/fee-templates/${id}`, { method: "DELETE" });
}
