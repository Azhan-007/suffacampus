/**
 * libraryService.ts
 *
 * Backend routes:
 *   GET    /library          — list all library items
 *   POST   /library          — create a library item (teacher/admin)
 *   PUT    /library/:id      — update a library item (teacher/admin)
 *   DELETE /library/:id      — delete a library item (teacher/admin)
 */

import { apiFetch } from "./api";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface LibraryItem {
  id: string;
  subject: string;
  title: string;
  author: string;
  fileUrl?: string;
  type: "PDF" | "DOC" | "DOCX" | "PPT" | "PPTX" | "Book" | "eBook";
  uploadedBy: string;
  uploadedDate: string;
  availableCopies?: number;
  totalCopies?: number;
}

// ─── Functions ────────────────────────────────────────────────────────────────

/**
 * Fetch all library materials.
 * Replaces: getDocs(query(collection(db, "library"), orderBy("uploadedDate", "desc")))
 */
export async function getLibraryItems(): Promise<LibraryItem[]> {
  try {
    return await apiFetch<LibraryItem[]>("/library/books");
  } catch {
    return [];
  }
}

export interface LibraryItemPayload {
  title: string;
  author: string;
  subject: string;
  type: LibraryItem["type"];
  fileUrl?: string;
  availableCopies?: number;
  totalCopies?: number;
  uploadedBy: string;
  uploadedDate: string;
}

/** Create a new library item (teacher/admin). */
export async function createLibraryItem(
  data: LibraryItemPayload
): Promise<LibraryItem> {
  return apiFetch<LibraryItem>("/library/books", { method: "POST", body: data });
}

/** Update an existing library item (teacher/admin). */
export async function updateLibraryItem(
  id: string,
  data: Partial<LibraryItemPayload>
): Promise<LibraryItem> {
  return apiFetch<LibraryItem>(`/library/books/${id}`, {
    method: "PATCH",
    body: data,
  });
}

/** Delete a library item (teacher/admin). */
export async function deleteLibraryItem(id: string): Promise<void> {
  await apiFetch<void>(`/library/books/${id}`, { method: "DELETE" });
}
