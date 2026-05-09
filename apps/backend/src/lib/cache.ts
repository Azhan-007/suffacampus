/**
 * Redis cache helper — thin wrapper around ioredis for application-level caching.
 *
 * Falls back gracefully to no-cache if Redis is unavailable.
 * Uses the same Redis connection URL as BullMQ (REDIS_URL env var).
 */

import IORedis from "ioredis";
import { redisConnectionConfig } from "./redis-connection";
import pino from "pino";
import { recordCacheOp } from "../plugins/metrics";

const log = pino({ name: "cache" });

let redis: IORedis | null = null;
let connectionAttempted = false;

function getRedis(): IORedis | null {
  if (redis) return redis;
  if (connectionAttempted) return null;

  connectionAttempted = true;
  const url = process.env.REDIS_URL;
  if (!url) {
    log.info("REDIS_URL not set — cache disabled");
    return null;
  }

  try {
    redis = new IORedis(url, {
      ...redisConnectionConfig,
      lazyConnect: false,
      maxRetriesPerRequest: 1, // Don't block request threads waiting for cache
      retryStrategy: (times) => {
        // Capped exponential backoff — never stop retrying.
        // A transient Redis outage should not permanently kill caching.
        return Math.min(times * 500, 30_000);
      },
    });

    redis.on("error", (err) => {
      log.warn({ err: err.message }, "Redis cache connection error");
    });

    // If Redis disconnects permanently, allow re-initialization on next call
    redis.on("end", () => {
      log.warn("Redis cache connection ended — will retry on next access");
      redis = null;
      connectionAttempted = false;
    });

    return redis;
  } catch (err) {
    log.warn({ err }, "Failed to create Redis cache connection");
    return null;
  }
}

/**
 * Get a cached value by key.
 * Returns null if not found, expired, or Redis unavailable.
 */
export async function cacheGet<T>(key: string): Promise<T | null> {
  const client = getRedis();
  if (!client) {
    recordCacheOp("disabled");
    return null;
  }

  try {
    const raw = await client.get(key);
    if (raw === null) {
      recordCacheOp("miss");
      return null;
    }
    recordCacheOp("hit");
    return JSON.parse(raw) as T;
  } catch {
    recordCacheOp("error");
    return null;
  }
}

/**
 * Set a cached value with TTL.
 * Silently fails if Redis is unavailable.
 */
export async function cacheSet(
  key: string,
  value: unknown,
  ttlSeconds: number
): Promise<void> {
  const client = getRedis();
  if (!client) return;

  try {
    await client.setex(key, ttlSeconds, JSON.stringify(value));
  } catch {
    // Silently ignore cache write failures
  }
}

/**
 * Delete a cached key.
 */
export async function cacheDel(key: string): Promise<void> {
  const client = getRedis();
  if (!client) return;

  try {
    await client.del(key);
  } catch {
    // Silently ignore
  }
}

/**
 * Delete all keys matching a pattern (e.g. "dashboard:stats:*").
 * Uses SCAN to avoid blocking.
 */
export async function cacheInvalidate(pattern: string): Promise<void> {
  const client = getRedis();
  if (!client) return;

  try {
    let cursor = "0";
    do {
      const [nextCursor, keys] = await client.scan(cursor, "MATCH", pattern, "COUNT", 100);
      cursor = nextCursor;
      if (keys.length > 0) {
        await client.del(...keys);
      }
    } while (cursor !== "0");
  } catch {
    // Silently ignore cache invalidation failures
  }
}
