import type { FastifyReply, FastifyRequest } from "fastify";

// ---------------------------------------------------------------------------
// Standard response envelope
// ---------------------------------------------------------------------------

interface SuccessMeta {
  requestId: string;
}

interface PaginationMeta {
  cursor: string | null;
  hasMore: boolean;
  total?: number;
  limit: number;
}

/**
 * Send a single-resource success response.
 *
 * ```json
 * { "success": true, "data": { ... }, "meta": { "requestId": "..." } }
 * ```
 */
export function sendSuccess<T>(
  request: FastifyRequest,
  reply: FastifyReply,
  data: T,
  statusCode = 200
) {
  return reply.status(statusCode).send({
    success: true,
    data,
    meta: buildMeta(request),
  });
}

/**
 * Send a paginated list response.
 *
 * ```json
 * {
 *   "success": true,
 *   "data": [ ... ],
 *   "pagination": { "cursor": "...", "hasMore": true, "limit": 20 },
 *   "meta": { "requestId": "..." }
 * }
 * ```
 */
export function sendPaginated<T>(
  request: FastifyRequest,
  reply: FastifyReply,
  data: T[],
  pagination: PaginationMeta
) {
  return reply.status(200).send({
    success: true,
    data,
    pagination,
    meta: buildMeta(request),
  });
}

/**
 * Send a standardised error response.
 *
 * ```json
 * {
 *   "success": false,
 *   "error": { "code": "...", "message": "...", "details": { ... } },
 *   "meta": { "requestId": "..." }
 * }
 * ```
 */
export function sendError(
  request: FastifyRequest,
  reply: FastifyReply,
  statusCode: number,
  code: string,
  message: string,
  details?: unknown
) {
  return reply.status(statusCode).send({
    success: false,
    error: {
      code,
      message,
      ...(details !== undefined ? { details } : {}),
    },
    meta: buildMeta(request),
  });
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function buildMeta(request: FastifyRequest): SuccessMeta {
  return {
    requestId: request.requestId ?? "unknown",
  };
}
