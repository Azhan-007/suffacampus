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

// ---------------------------------------------------------------------------
// Firestore cursor-based pagination helper
// ---------------------------------------------------------------------------

import type { firestore as FirestoreType } from "firebase-admin";

/**
 * Execute a Firestore query with cursor-based pagination.
 *
 * @param query     - Base Firestore query (already filtered by schoolId, isDeleted, etc.)
 * @param params    - Parsed pagination query params
 * @param firestore - Firestore instance (for doc lookup when resolving cursor)
 * @param collection - Collection name (for cursor doc lookup)
 * @returns Paginated result with data, cursor, hasMore
 */
export async function paginateQuery<T>(
  query: FirestoreType.Query,
  params: PaginationQuery,
  firestore: FirestoreType.Firestore,
  collection: string
): Promise<PaginatedResult<T>> {
  let q = query;

  // If a cursor is provided, start after that document
  if (params.cursor) {
    const cursorDoc = await firestore.collection(collection).doc(params.cursor).get();
    if (cursorDoc.exists) {
      q = q.startAfter(cursorDoc);
    }
  }

  // Fetch limit + 1 to determine if there are more results
  const fetchLimit = params.limit + 1;
  const snapshot = await q.limit(fetchLimit).get();

  const docs = snapshot.docs;
  const hasMore = docs.length > params.limit;

  // Trim the extra doc if present
  const resultDocs = hasMore ? docs.slice(0, params.limit) : docs;

  const data = resultDocs.map((doc) => doc.data() as T);
  const lastDoc = resultDocs[resultDocs.length - 1];

  const result: PaginatedResult<T> = {
    data,
    pagination: {
      cursor: lastDoc ? lastDoc.id : null,
      hasMore,
      limit: params.limit,
    },
  };

  // Optionally include total count (expensive — only when ?count=true)
  if (params.count) {
    const countSnapshot = await query.count().get();
    result.pagination.total = countSnapshot.data().count;
  }

  return result;
}
