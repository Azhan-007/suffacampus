import { apiFetch, ApiError } from '@/lib/api';
import { Library } from '@/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toDate(value: unknown): Date {
  if (!value) return new Date(0);
  if (value instanceof Date) return value;
  if (typeof value === 'string' || typeof value === 'number') return new Date(value);
  if (typeof value === 'object') {
    const v = value as Record<string, number>;
    if ('seconds' in v) return new Date(v.seconds * 1000);
    if ('_seconds' in v) return new Date(v._seconds * 1000);
  }
  return new Date(0);
}

function deserializeBook(raw: Record<string, unknown>): Library {
  return {
    ...(raw as unknown as Library),
    createdAt: toDate(raw.createdAt),
    updatedAt: toDate(raw.updatedAt),
  };
}

// ---------------------------------------------------------------------------

export class LibraryService {
  /**
   * Get all books — backend: GET /library/books
   */
  static async getBooks(): Promise<Library[]> {
    const raw = await apiFetch<Record<string, unknown>[]>('/library/books?limit=1000');
    return raw.map(deserializeBook);
  }

  /**
   * Get book by ID — backend: GET /library/books/:id
   */
  static async getBookById(id: string): Promise<Library | null> {
    try {
      const raw = await apiFetch<Record<string, unknown>>(`/library/books/${id}`);
      return deserializeBook(raw);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) return null;
      throw err;
    }
  }

  /**
   * Create new book — backend: POST /library/books
   */
  static async createBook(
    data: Omit<Library, 'id' | 'createdAt' | 'updatedAt' | 'issuedCount' | 'status'>
  ): Promise<string> {
    const raw = await apiFetch<Record<string, unknown>>('/library/books', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return raw.id as string;
  }

  /**
   * Update book — backend: PATCH /library/books/:id
   */
  static async updateBook(
    id: string,
    data: Partial<Omit<Library, 'id' | 'createdAt' | 'updatedAt'>>
  ): Promise<void> {
    await apiFetch(`/library/books/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  /**
   * Delete book (soft-delete) — backend: DELETE /library/books/:id
   */
  static async deleteBook(id: string): Promise<void> {
    await apiFetch(`/library/books/${id}`, { method: 'DELETE' });
  }

  /**
   * Get library statistics — backend: GET /library/stats
   */
  static async getLibraryStats(): Promise<{
    totalBooks: number;
    totalCopies: number;
    issuedCopies: number;
    availableCopies: number;
    categoryDistribution: { category: string; count: number }[];
  }> {
    try {
      const stats = await apiFetch<Record<string, unknown>>('/library/stats');
      return {
        totalBooks: (stats.totalBooks as number) ?? 0,
        totalCopies: (stats.totalCopies as number) ?? 0,
        issuedCopies: (stats.issuedCopies as number) ?? 0,
        availableCopies: (stats.availableCopies as number) ?? 0,
        categoryDistribution: (stats.categoryDistribution as { category: string; count: number }[]) ?? [],
      };
    } catch {
      return {
        totalBooks: 0,
        totalCopies: 0,
        issuedCopies: 0,
        availableCopies: 0,
        categoryDistribution: [],
      };
    }
  }

  /**
   * Get books by category — backend: GET /library/books?category=…
   */
  static async getBooksByCategory(category: string): Promise<Library[]> {
    const raw = await apiFetch<Record<string, unknown>[]>(
      `/library/books?category=${encodeURIComponent(category)}&limit=1000`
    );
    return raw.map(deserializeBook);
  }

  /**
   * Issue book (decrease available copies) — PATCH /library/books/:id
   */
  static async issueBook(id: string): Promise<void> {
    const book = await LibraryService.getBookById(id);
    if (!book) throw new Error('Book not found');
    if (book.availableCopies <= 0) throw new Error('No copies available to issue');

    await LibraryService.updateBook(id, {
      availableCopies: book.availableCopies - 1,
      issuedCount: book.issuedCount + 1,
    });
  }

  /**
   * Return book (increase available copies) — PATCH /library/books/:id
   */
  static async returnBook(id: string): Promise<void> {
    const book = await LibraryService.getBookById(id);
    if (!book) throw new Error('Book not found');
    if (book.issuedCount <= 0) throw new Error('No issued copies to return');

    await LibraryService.updateBook(id, {
      availableCopies: book.availableCopies + 1,
      issuedCount: book.issuedCount - 1,
    });
  }
}
