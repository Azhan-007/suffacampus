import { z } from "zod";

// ---------------------------------------------------------------------------
// Pagination query schema (reusable across all list endpoints)
// ---------------------------------------------------------------------------

export const paginationSchema = z.object({
  limit: z
    .string()
    .optional()
    .transform((v) => {
      const n = Number(v);
      if (!v || isNaN(n) || n < 1) return 20;
      return Math.min(n, 100); // cap at 100
    }),
  cursor: z.string().optional(),
  sortBy: z.string().optional(),
  sortOrder: z
    .enum(["asc", "desc"])
    .optional()
    .default("desc"),
  count: z
    .string()
    .optional()
    .transform((v) => v === "true"),
});

export type PaginationQuery = z.infer<typeof paginationSchema>;

// ---------------------------------------------------------------------------
// Paginated result type
// ---------------------------------------------------------------------------

export interface PaginationMeta {
  cursor: string | null;
  hasMore: boolean;
  total?: number;
  limit: number;
}

export interface PaginatedResult<T> {
  data: T[];
  pagination: PaginationMeta;
}
