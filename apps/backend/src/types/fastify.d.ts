/**
 * Consolidated Fastify type augmentations.
 *
 * This file pulls all augmentations into a single place so every file in
 * the project can use `request.user`, `request.schoolId`, `request.apiKeyName`,
 * etc. without `as any` casts.
 *
 * Individual augmentations still live co-located with their middleware/plugin
 * for discoverability — this file simply re-exports them for the TS compiler.
 */

import type { UserRecord } from "../middleware/auth";
import type { CacheService } from "../plugins/cache";

declare module "fastify" {
  interface FastifyRequest {
    /** Authenticated Firebase user (set by auth middleware) */
    user: UserRecord;
    /** Tenant school ID (set by tenant middleware) */
    schoolId: string;
    /** Unique per-request identifier for tracing */
    requestId: string;
    /** High-resolution start time for duration calculation */
    startTime: bigint;
    /** API key name (set by apiKey middleware) */
    apiKeyName?: string;
    /** Multipart file accessor (provided by @fastify/multipart) */
    file: () => Promise<{
      filename: string;
      mimetype: string;
      file: NodeJS.ReadableStream;
      toBuffer: () => Promise<Buffer>;
    } | undefined>;
  }

  interface FastifyInstance {
    /** In-memory cache service (set by cache plugin) */
    cache: CacheService;
  }
}
