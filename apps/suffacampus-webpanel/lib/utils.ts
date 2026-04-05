// ─── Shared Utilities ────────────────────────────────────────────────────────
// Extracted from page-level duplicates to a single source of truth.

/** Pagination page-size options used across all CRUD tables. */
export const PAGE_SIZE_OPTIONS = [10, 20, 50] as const;

/**
 * Safely coerce an unknown value into a JavaScript `Date`.
 *
 * Handles: `Date` instances, ISO strings, Unix-ms numbers,
 * Firestore `Timestamp`-like objects (`{ seconds }` / `{ _seconds }`).
 * Falls back to the Unix epoch (`1970-01-01`) for `null`/`undefined`.
 */
export function toDate(value: unknown): Date {
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

/**
 * Extract a human-readable message from an unknown `catch` value.
 *
 * Handles `Error` instances, objects with `.message`, plain strings,
 * and Firebase Auth errors (which carry a `.code` property).
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message: unknown }).message);
  }
  return 'An unexpected error occurred';
}
