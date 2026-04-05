import type { FastifyInstance } from "fastify";
import rateLimit from "@fastify/rate-limit";
import { env } from "../lib/env";

/**
 * Global API rate limiting.
 *
 * Default policy:
 * - `100 req/min` per IP (configurable via RATE_LIMIT_MAX)
 * - Webhook endpoints are allow-listed
 *
 * Route-level overrides are supported using:
 * `{ config: { rateLimit: { max, timeWindow } } }`
 */
export async function rateLimitPlugin(server: FastifyInstance): Promise<void> {
  await server.register(rateLimit, {
    global: true,
    max: env.RATE_LIMIT_MAX,
    timeWindow: "1 minute",
    keyGenerator: (request) => request.ip,
    allowList: (request) => request.url.startsWith("/webhooks/"),
  });
}
