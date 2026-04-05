/**
 * Cache Invalidation Helpers
 * Call these when data changes to purge related caches
 */

import type { FastifyInstance } from "fastify";

const getCacheService = () => {
  // Cache service will be available as fastify.cache
  return null; // Will be passed via FastifyInstance
};

/**
 * Hook to invalidate caches on data mutations
 */
export function setupCacheInvalidation(fastify: FastifyInstance) {
  // Hook into routes that modify data to invalidate related caches
  
  // Example: When school config changes, invalidate school cache
  fastify.addHook("onResponse", async (request, reply) => {
    if (request.method !== "PATCH" && request.method !== "POST" && request.method !== "DELETE") {
      return;
    }

    const path = request.url;
    const cache = (fastify as any).cache;

    // Invalidate school cache on config updates
    if (path.includes("/config") && (request as any).schoolId) {
      cache.flushNamespace("school");
      cache.flushNamespace("settings");
    }

    // Invalidate user cache on permission/role changes
    if (path.includes("/users") && (request as any).schoolId) {
      cache.flushNamespace("user");
    }

    // Invalidate subscription cache on plan changes
    if (path.includes("/subscriptions") && (request as any).schoolId) {
      cache.flushNamespace("school");
      cache.flushNamespace("plan");
    }

    // Invalidate dashboard cache on data changes
    if (
      ["/students", "/attendance", "/fees", "/results"].some((route) =>
        path.includes(route)
      )
    ) {
      cache.flushNamespace("dashboard");
    }
  });
}
