/**
 * Shared Redis connection factory for BullMQ queue services.
 *
 * All queue services (webhook-event, payment-recovery, reconciliation) share
 * a single IORedis connection rather than creating independent connections.
 *
 * Connection is lazy — only established when first requested.
 * REDIS_URL absence is a safe degraded mode (queues run inline).
 */
import IORedis, { type RedisOptions } from "ioredis";
import { createLogger } from "../utils/logger";

const log = createLogger("redis");

/** BullMQ requires maxRetriesPerRequest=null for blocking commands. */
export const bullmqRedisOptions: RedisOptions = {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  lazyConnect: true,
};

/** Returns true if Redis is configured. Absence = graceful degraded mode. */
export function isRedisConfigured(): boolean {
  return Boolean(process.env.REDIS_URL);
}

// Module-level singleton connections keyed by purpose.
const connections = new Map<string, IORedis>();

/**
 * Get or create a named IORedis connection.
 *
 * BullMQ requires separate connections for Queue and Worker, so callers
 * should pass distinct names (e.g. "webhook-event-queue", "webhook-event-worker").
 *
 * @throws Error if REDIS_URL is not set.
 */
export function getRedisConnection(name: string): IORedis {
  const existing = connections.get(name);
  if (existing) return existing;

  const url = process.env.REDIS_URL;
  if (!url) {
    throw new Error(
      `REDIS_URL is not configured — cannot create Redis connection "${name}". ` +
        "Ensure REDIS_URL is set or use isRedisConfigured() guard before calling."
    );
  }

  const conn = new IORedis(url, bullmqRedisOptions);

  conn.on("error", (err) => {
    log.error({ err, name }, `Redis connection error [${name}]`);
  });

  conn.on("connect", () => {
    log.debug({ name }, `Redis connected [${name}]`);
  });

  conn.on("close", () => {
    log.warn({ name }, `Redis connection closed [${name}]`);
    // Remove from cache so next call recreates it
    connections.delete(name);
  });

  connections.set(name, conn);
  return conn;
}

/**
 * Backward-compatible alias.
 * @deprecated Use `bullmqRedisOptions` directly. This export exists to avoid
 * breaking cache.ts and queue.ts which import the old name.
 */
export const redisConnectionConfig = bullmqRedisOptions;

/**
 * Backward-compatible alias for the old string export.
 * @deprecated New code should use getRedisConnection() or isRedisConfigured().
 */
export const redisConnectionUrl = process.env.REDIS_URL;

export async function closeRedisConnection(name: string): Promise<void> {
  const conn = connections.get(name);
  if (!conn) return;
  connections.delete(name);
  try {
    await conn.quit();
  } catch {
    conn.disconnect();
  }
}

/**
 * Ping Redis to check liveness. Returns true if reachable.
 * Used in startup health checks.
 */
export async function pingRedis(): Promise<boolean> {
  if (!isRedisConfigured()) return false;
  let conn: IORedis | null = null;
  try {
    conn = new IORedis(process.env.REDIS_URL!, {
      ...bullmqRedisOptions,
      connectTimeout: 3000,
      commandTimeout: 3000,
    });
    const result = await conn.ping();
    return result === "PONG";
  } catch {
    return false;
  } finally {
    conn?.disconnect();
  }
}
