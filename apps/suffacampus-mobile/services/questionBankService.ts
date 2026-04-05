/**
 * questionBankService.ts
 *
 * Backend routes:
 *   GET    /question-bank?class=   — list questions
 *   POST   /question-bank          — create a question (teacher)
 *   PUT    /question-bank/:id      — update a question (teacher)
 *   DELETE /question-bank/:id      — delete a question (teacher)
 */

import { apiFetch } from "./api";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface Question {
  id: string;
  subject: string;
  title: string;
  description?: string;
  type: "mcq" | "text" | "pdf" | "image" | "document";
  question?: string;
  options?: string[];
  answer?: string;
  fileUrl?: string;
  fileName?: string;
  fileType?: string;
  uploadedBy?: string;
  uploadedDate?: string;
  class?: string;
}

// ─── Functions ────────────────────────────────────────────────────────────────

/**
 * Fetch questions from the question bank.
 * Replaces: getDocs(query(collection(db, "questionBank"), orderBy("uploadedDate", "desc")))
 */
export async function getQuestions(params?: {
  class?: string;
}): Promise<Question[]> {
  try {
    return await apiFetch<Question[]>("/question-bank", { params });
  } catch {
    return [];
  }
}

export interface QuestionPayload {
  subject: string;
  title: string;
  description?: string;
  type: Question["type"];
  question?: string;
  options?: string[];
  answer?: string;
  fileUrl?: string;
  fileName?: string;
  fileType?: string;
  class: string;
  uploadedBy?: string;
  uploadedDate?: string;
}

/** Create a new question (teacher). */
export async function createQuestion(data: QuestionPayload): Promise<Question> {
  return apiFetch<Question>("/question-bank", { method: "POST", body: data });
}

/** Update an existing question (teacher). */
export async function updateQuestion(
  id: string,
  data: Partial<QuestionPayload>
): Promise<Question> {
  return apiFetch<Question>(`/question-bank/${id}`, {
    method: "PATCH",
    body: data,
  });
}

/** Delete a question (teacher). */
export async function deleteQuestion(id: string): Promise<void> {
  await apiFetch<void>(`/question-bank/${id}`, { method: "DELETE" });
}
