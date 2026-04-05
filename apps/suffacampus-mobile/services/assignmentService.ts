/**
 * assignmentService.ts
 *
 * Backend routes:
 *   GET    /assignments?class=&status=    — list assignments for a class
 *   GET    /submissions?studentId=        — list submissions by student
 *   POST   /submissions                   — submit an assignment (student)
 *   POST   /assignments                   — create an assignment (teacher)
 *   PUT    /assignments/:id               — update an assignment (teacher)
 *   DELETE /assignments/:id               — delete an assignment (teacher)
 *   PATCH  /assignments/:id/status        — toggle assignment status (teacher)
 */

import { apiFetch } from "./api";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface Assignment {
  id: string;
  subject: string;
  title: string;
  description: string;
  dueDate: string;
  class: string;
  priority: "High" | "Medium" | "Low";
  totalMarks: number;
  createdBy: string;
  teacher?: string;
  status: "active" | "draft" | "closed";
  submissionCount?: number;
}

export interface Submission {
  id?: string;
  assignmentId: string;
  studentId: string;
  studentName?: string;
  studentClass?: string;
  submissionText?: string;
  submittedAt?: string;
  status: "pending" | "submitted" | "graded";
  grade?: number;
  feedback?: string;
}

export interface SubmissionPayload {
  assignmentId: string;
  studentId: string;
  studentName: string;
  studentClass: string;
  submissionText: string;
  submittedAt: string;
  status: "submitted";
}

/** Fetch submissions keyed by assignmentId for quick lookup. */
export async function getSubmissionsMap(
  studentId: string
): Promise<Record<string, Submission>> {
  try {
    const list = await apiFetch<Submission[]>("/submissions", {
      params: { studentId },
    });
    return (Array.isArray(list) ? list : []).reduce<Record<string, Submission>>((acc, s) => {
      acc[s.assignmentId] = s;
      return acc;
    }, {});
  } catch {
    return {};
  }
}

/** Fetch active assignments for a given class, merged with submission status. */
export async function getAssignmentsWithSubmissions(params: {
  class: string;
  status?: string;
  studentId: string;
}): Promise<
  Array<
    Assignment & {
      submissionStatus: "pending" | "submitted" | "graded";
      submittedAt?: string;
      grade?: number;
      feedback?: string;
    }
  >
> {
  const [assignments, submissions] = await Promise.all([
    apiFetch<Assignment[]>("/assignments", {
      params: { class: params.class, status: params.status ?? "active" },
    }).catch(() => [] as Assignment[]),
    getSubmissionsMap(params.studentId),
  ]);

  return assignments.map((a) => {
    const sub = submissions[a.id];
    return {
      ...a,
      submissionStatus: (sub?.status ?? "pending") as
        | "pending"
        | "submitted"
        | "graded",
      submittedAt: sub?.submittedAt,
      grade: sub?.grade,
      feedback: sub?.feedback,
    };
  });
}

/** Submit an assignment. */
export async function submitAssignment(
  payload: SubmissionPayload
): Promise<void> {
  try {
    await apiFetch<void>("/submissions", {
      method: "POST",
      body: payload,
    });
  } catch (error: any) {
    // If submission fails, queue it for retry (offline sync)
    const { enqueueOfflineMutation } = await import("./offlineSyncQueue");
    await enqueueOfflineMutation({
      path: "/submissions",
      method: "POST",
      body: payload,
    });
    console.warn("[AssignmentSubmit] Queued submission for offline retry:", error.message);
  }
}

// ─── Teacher CRUD ─────────────────────────────────────────────────────────────

export interface AssignmentPayload {
  subject: string;
  title: string;
  description: string;
  dueDate: string;
  class: string;
  priority: "High" | "Medium" | "Low";
  totalMarks: number;
  status: "active" | "draft" | "closed";
  createdBy?: string;
}

/** Fetch all assignments for teacher management (no student filter). */
export async function getTeacherAssignments(params?: {
  class?: string;
  status?: string;
}): Promise<Assignment[]> {
  try {
    return await apiFetch<Assignment[]>("/assignments", { params });
  } catch {
    return [];
  }
}

/** Create a new assignment (teacher). */
export async function createAssignment(
  data: AssignmentPayload
): Promise<Assignment> {
  return apiFetch<Assignment>("/assignments", { method: "POST", body: data });
}

/** Update an existing assignment (teacher). */
export async function updateAssignment(
  id: string,
  data: Partial<AssignmentPayload>
): Promise<Assignment> {
  return apiFetch<Assignment>(`/assignments/${id}`, {
    method: "PATCH",
    body: data,
  });
}

/** Delete an assignment (teacher). */
export async function deleteAssignment(id: string): Promise<void> {
  await apiFetch<void>(`/assignments/${id}`, { method: "DELETE" });
}

/** Toggle assignment status (teacher). */
export async function toggleAssignmentStatus(
  id: string,
  status: "active" | "draft" | "closed"
): Promise<void> {
  await apiFetch<void>(`/assignments/${id}/status`, {
    method: "PATCH",
    body: { status },
  });
}
