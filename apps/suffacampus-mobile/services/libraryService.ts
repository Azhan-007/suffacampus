/**
 * libraryService.ts
 *
 * Backend routes:
 *   GET    /library/books          — list all books (paginated)
 *   POST   /library/books          — create a book (admin/teacher)
 *   PATCH  /library/books/:id      — update a book (admin/teacher)
 *   DELETE /library/books/:id      — delete a book (admin/teacher)
 *
 * Backend Book model fields:
 *   id, title, author, category, isbn, totalCopies, availableCopies,
 *   issuedCount, publishedYear, publisher, description, coverImageURL, isActive
 */

import { apiFetch } from "./api";

// ─── Types ───────────────────────────────────────────────────────────────────

/** Backend shape (matches Prisma Book model) */
interface BackendBook {
  id: string;
  title: string;
  author: string;
  category: string;
  isbn: string;
  totalCopies: number;
  availableCopies: number;
  issuedCount?: number;
  publishedYear?: number | null;
  publisher?: string | null;
  description?: string | null;
  coverImageURL?: string | null;
  isActive?: boolean;
  createdAt?: string;
}

/** Frontend shape used by mobile screens */
export interface LibraryItem {
  id: string;
  title: string;
  author: string;
  subject: string;       // ← mapped from category
  isbn: string;
  fileUrl?: string;       // ← mapped from coverImageURL
  type: string;           // ← derived from category or default "Book"
  availableCopies?: number;
  totalCopies?: number;
  publisher?: string;
  description?: string;
  uploadedDate: string;   // ← mapped from createdAt
}

function mapBackendBook(b: BackendBook): LibraryItem {
  return {
    id: b.id,
    title: b.title,
    author: b.author,
    subject: b.category,
    isbn: b.isbn,
    fileUrl: b.coverImageURL ?? undefined,
    type: "Book",
    availableCopies: b.availableCopies,
    totalCopies: b.totalCopies,
    publisher: b.publisher ?? undefined,
    description: b.description ?? undefined,
    uploadedDate: b.createdAt ?? new Date().toISOString(),
  };
}

// ─── Functions ────────────────────────────────────────────────────────────────

/**
 * Fetch all library books.
 */
export async function getLibraryItems(): Promise<LibraryItem[]> {
  try {
    const raw = await apiFetch<BackendBook[]>("/library/books");
    const list = Array.isArray(raw) ? raw : [];
    return list.map(mapBackendBook);
  } catch {
    return [];
  }
}

/** Payload for creating/updating a book — uses backend field names. */
export interface LibraryItemPayload {
  title: string;
  author: string;
  category: string;     // ← was "subject" before
  isbn: string;         // ← was missing before
  totalCopies: number;
  availableCopies: number;
  publisher?: string;
  publishedYear?: number;
  description?: string;
  coverImageURL?: string;
}

/** Create a new book (admin/teacher). */
export async function createLibraryItem(
  data: LibraryItemPayload
): Promise<LibraryItem> {
  const raw = await apiFetch<BackendBook>("/library/books", { method: "POST", body: data });
  return mapBackendBook(raw);
}

/** Update an existing book (admin/teacher). */
export async function updateLibraryItem(
  id: string,
  data: Partial<LibraryItemPayload>
): Promise<LibraryItem> {
  const raw = await apiFetch<BackendBook>(`/library/books/${id}`, {
    method: "PATCH",
    body: data,
  });
  return mapBackendBook(raw);
}

/** Delete a book (admin/teacher). */
export async function deleteLibraryItem(id: string): Promise<void> {
  await apiFetch<void>(`/library/books/${id}`, { method: "DELETE" });
}
