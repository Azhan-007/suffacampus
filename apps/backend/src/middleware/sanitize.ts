/**
 * Input sanitization middleware.
 *
 * Strips HTML tags, trims whitespace, and prevents NoSQL injection
 * patterns from reaching service layer. Applied as a preHandler.
 *
 * Designed to be non-destructive — only removes clearly dangerous patterns
 * while preserving valid text content.
 */

import type { FastifyRequest, FastifyReply } from "fastify";

// ---------------------------------------------------------------------------
// Sanitization helpers
// ---------------------------------------------------------------------------

/** Remove HTML tags from a string */
function stripHtml(str: string): string {
  return str.replace(/<[^>]*>/g, "");
}

/** Trim excessive whitespace (leading/trailing + collapse internal) */
function trimWhitespace(str: string): string {
  return str.trim().replace(/\s{2,}/g, " ");
}

/** Remove common NoSQL injection patterns */
function sanitizeNoSql(str: string): string {
  // Remove MongoDB-style operators that could be injected
  return str.replace(/\$(?:gt|gte|lt|lte|ne|in|nin|or|and|not|regex|where|exists)/gi, "");
}

/**
 * Recursively sanitize all string values in an object.
 */
function sanitizeValue(value: unknown): unknown {
  if (typeof value === "string") {
    let sanitized = stripHtml(value);
    sanitized = sanitizeNoSql(sanitized);
    sanitized = trimWhitespace(sanitized);
    return sanitized;
  }

  if (Array.isArray(value)) {
    return value.map(sanitizeValue);
  }

  if (value !== null && typeof value === "object") {
    const sanitized: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) {
      // Block keys that start with $ (NoSQL injection via key names)
      if (key.startsWith("$")) continue;
      sanitized[key] = sanitizeValue(val);
    }
    return sanitized;
  }

  return value;
}

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

/**
 * Fastify preHandler that sanitizes request body and query parameters.
 * Applied globally to all routes, runs before Zod validation.
 */
export async function sanitizeInput(
  request: FastifyRequest,
  _reply: FastifyReply
): Promise<void> {
  // Sanitize body (skip Buffers — needed for webhook raw bodies)
  if (request.body && typeof request.body === "object" && !Buffer.isBuffer(request.body)) {
    request.body = sanitizeValue(request.body);
  }

  // Sanitize query params
  if (request.query && typeof request.query === "object") {
    Object.assign(request, { query: sanitizeValue(request.query) });
  }
}
