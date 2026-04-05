import { z } from "zod";

// ---------------------------------------------------------------------------
// Common search/filter schema fragments (composable per module)
// ---------------------------------------------------------------------------

/** Generic search + status filter shared by students, teachers, etc. */
export const searchFilterSchema = z.object({
  search: z.string().optional(),
  status: z.enum(["active", "inactive", "all"]).optional().default("active"),
});

/** Student-specific filters */
export const studentFilterSchema = searchFilterSchema.extend({
  classId: z.string().optional(),
  sectionId: z.string().optional(),
  gender: z.enum(["Male", "Female", "Other"]).optional(),
});

/** Teacher-specific filters */
export const teacherFilterSchema = searchFilterSchema.extend({
  department: z.string().optional(),
  subject: z.string().optional(),
});

export type SearchFilter = z.input<typeof searchFilterSchema>;
export type StudentFilter = z.input<typeof studentFilterSchema>;
export type TeacherFilter = z.input<typeof teacherFilterSchema>;

// ---------------------------------------------------------------------------
// In-memory name search helper (Firestore lacks native full-text search)
// ---------------------------------------------------------------------------

/**
 * Filter an array of documents by a search string, matching against
 * first name and last name (case-insensitive contains).
 *
 * This runs AFTER Firestore returns results, so it works with pagination.
 * For truly large collections, consider Algolia / Typesense integration.
 */
export function filterByName<T extends { firstName?: string; lastName?: string; name?: string }>(
  items: T[],
  search: string
): T[] {
  if (!search) return items;

  const q = search.toLowerCase().trim();
  if (!q) return items;

  return items.filter((item) => {
    const first = (item.firstName ?? "").toLowerCase();
    const last = (item.lastName ?? "").toLowerCase();
    const full = (item.name ?? `${first} ${last}`).toLowerCase();
    return first.includes(q) || last.includes(q) || full.includes(q);
  });
}
