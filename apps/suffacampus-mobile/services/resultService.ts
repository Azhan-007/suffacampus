/**
 * resultService.ts
 *
 * Backend routes:
 *   GET    /results?studentId=&published=  — fetch results
 *   POST   /results                        — create a result (teacher)
 *   PUT    /results/:id                    — update a result (teacher)
 *   DELETE /results/:id                    — delete a result (teacher)
 *   PATCH  /results/:id/publish            — toggle publish status
 *   PATCH  /results/bulk-publish           — publish all drafts for a teacher
 */

import { apiFetch } from "./api";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ResultEntry {
  id: string;
  subject: string;
  marks: number;
  total: number;
  grade: string;
  examType?: string;
  examDate?: string;
  remarks?: string;
  published?: boolean;
  studentId?: string;
  studentName?: string;
  class?: string;
  percentage?: number;
  teacherId?: string;
  createdAt?: string;
}

// ─── Functions ────────────────────────────────────────────────────────────────

/**
 * Fetch published results for a student.
 * Replaces: getDocs(query(collection(db, "results"), where("studentId", ...), where("published", ...)))
 */
export async function getStudentResults(params: {
  studentId: string;
  published?: boolean;
}): Promise<ResultEntry[]> {
  return apiFetch<ResultEntry[]>("/results", {
    params: {
      studentId: params.studentId,
      published: params.published ?? true,
    },
  });
}

/** Fetch all results (teacher — no studentId filter). Backend uses `classId`, not `class`. */
export async function getAllResults(params?: {
  class?: string;
  examType?: string;
}): Promise<ResultEntry[]> {
  return apiFetch<ResultEntry[]>("/results", {
    params: {
      classId: params?.class,
      examType: params?.examType,
    },
  });
}

export interface ResultPayload {
  studentId: string;
  studentName: string;
  class: string;
  subject: string;
  marks: number;
  total: number;
  grade: string;
  percentage?: number;
  examType: string;
  examDate: string;
  remarks?: string;
  published: boolean;
  teacherId?: string;
}

/** Create a new result (teacher). */
export async function createResult(data: ResultPayload): Promise<ResultEntry> {
  return apiFetch<ResultEntry>("/results", { method: "POST", body: data });
}

/** Update an existing result (teacher). */
export async function updateResult(
  id: string,
  data: Partial<ResultPayload>
): Promise<ResultEntry> {
  return apiFetch<ResultEntry>(`/results/${id}`, {
    method: "PATCH",
    body: data,
  });
}

/** Delete a result (teacher). */
export async function deleteResult(id: string): Promise<void> {
  await apiFetch<void>(`/results/${id}`, { method: "DELETE" });
}

/** Toggle the published status of a result. */
export async function toggleResultPublish(
  id: string,
  published: boolean
): Promise<void> {
  await apiFetch<void>(`/results/${id}/publish`, {
    method: "PATCH",
    body: { published },
  });
}

/** Bulk-publish all draft results for a teacher. */
export async function bulkPublishResults(teacherId: string): Promise<void> {
  await apiFetch<void>("/results/bulk-publish", {
    method: "PATCH",
    body: { teacherId },
  });
}
