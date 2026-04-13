import crypto from "node:crypto";
import type { FastifyInstance, FastifyRequest } from "fastify";
import rateLimit from "@fastify/rate-limit";
import { env } from "../lib/env";

export const globalRateLimitProfile = {
  max: env.RATE_LIMIT_MAX,
  timeWindow: "15 minutes",
} as const;

export const authRateLimitProfile = {
  max: 5,
  timeWindow: "15 minutes",
} as const;

export const authRateLimitConfig = {
  config: {
    rateLimit: authRateLimitProfile,
  },
} as const;

function normalizeHeaderValue(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) {
    const first = value[0]?.trim();
    return first && first.length > 0 ? first : null;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  return null;
}

function fingerprint(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex").slice(0, 24);
}

// Prefer tenant-scoped API key identities and fall back to client IP for user tokens.
export function apiKeyAwareRateLimitKeyGenerator(request: FastifyRequest): string {
  const apiKeyId = request.apiKeyId?.trim();
  if (apiKeyId) {
    return `api-key:${apiKeyId}`;
  }

  const rawApiKey = normalizeHeaderValue(request.headers["x-api-key"]);
  if (rawApiKey) {
    return `api-key-fingerprint:${fingerprint(rawApiKey)}`;
  }

  return `ip:${request.ip}`;
}

export const exportsRateLimitProfile = {
  max: 20,
  timeWindow: "1 minute",
  keyGenerator: apiKeyAwareRateLimitKeyGenerator,
} as const;

export const analyticsRateLimitProfile = {
  max: 90,
  timeWindow: "1 minute",
  keyGenerator: apiKeyAwareRateLimitKeyGenerator,
} as const;

export const webhooksRateLimitProfile = {
  max: 240,
  timeWindow: "1 minute",
  keyGenerator: apiKeyAwareRateLimitKeyGenerator,
} as const;

/**
 * Global API rate limiting.
 *
 * Default policy:
 * - `100 req/15 min` per IP (configurable via RATE_LIMIT_MAX)
 * - Webhook endpoints are allow-listed
 *
 * Route-level overrides are supported using:
 * `{ config: { rateLimit: { max, timeWindow } } }`
 */
export async function rateLimitPlugin(server: FastifyInstance): Promise<void> {
  await server.register(rateLimit, {
    global: true,
    ...globalRateLimitProfile,
    keyGenerator: (request) => request.ip,
    allowList: (request) => request.url.startsWith("/webhooks/"),
  });
}
