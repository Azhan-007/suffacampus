import fp from "fastify-plugin";
import type { FastifyInstance } from "fastify";
import NodeCache from "node-cache";

/**
 * In-memory cache plugin wrapping node-cache.
 *
 * Exposes `fastify.cache` with typed namespace helpers.
 * Each namespace has its own TTL and prefix so keys never collide.
 *
 * Hot-path namespaces (hit on every request):
 *   - user        (auth middleware)       5 min TTL
 *   - school      (subscription/tenant)   5 min TTL
 *
 * Warm-path namespaces:
 *   - settings    (school settings)      10 min TTL
 *   - plan        (plan catalog)          1 hr  TTL
 *   - dashboard   (dashboard stats)       5 min TTL
 */

/* ── TTL configuration (seconds) ────────────────────────── */
const TTL = {
  user: 300,       // 5 minutes  –  invalidated on role / profile change
  school: 300,     // 5 minutes  –  invalidated on plan change / settings update
  settings: 600,   // 10 minutes –  invalidated on settings update
  plan: 3600,      // 1 hour     –  static catalog, rarely changes
  dashboard: 300,  // 5 minutes  –  invalidated on student/attendance/fee/result mutations
} as const;

type CacheNamespace = keyof typeof TTL;

export interface CacheService {
  /** Get a cached value, or undefined if miss / expired. */
  get<T>(namespace: CacheNamespace, key: string): T | undefined;

  /** Set a value with the namespace default TTL. */
  set<T>(namespace: CacheNamespace, key: string, value: T): boolean;

  /** Set a value with a custom TTL (seconds). */
  setWithTTL<T>(namespace: CacheNamespace, key: string, value: T, ttl: number): boolean;

  /** Delete a specific key. */
  del(namespace: CacheNamespace, key: string): number;

  /** Flush all keys for a given namespace. */
  flushNamespace(namespace: CacheNamespace): void;

  /** Flush everything. */
  flushAll(): void;

  /** Return cache statistics. */
  stats(): CacheStats;
}

export interface CacheStats {
  hits: number;
  misses: number;
  keys: number;
  ksize: number;
  vsize: number;
}

/* ── Namespace-prefixed key helper ───────────────────────── */
function nsKey(ns: CacheNamespace, key: string): string {
  return `${ns}:${key}`;
}

/* ── Plugin implementation ───────────────────────────────── */
async function cachePlugin(fastify: FastifyInstance): Promise<void> {
  const store = new NodeCache({
    stdTTL: 300,            // fallback TTL
    checkperiod: 120,       // cleanup interval
    useClones: false,       // avoid deep-clone overhead; callers must not mutate
    deleteOnExpire: true,
  });

  const service: CacheService = {
    get<T>(namespace: CacheNamespace, key: string): T | undefined {
      return store.get<T>(nsKey(namespace, key));
    },

    set<T>(namespace: CacheNamespace, key: string, value: T): boolean {
      return store.set(nsKey(namespace, key), value, TTL[namespace]);
    },

    setWithTTL<T>(namespace: CacheNamespace, key: string, value: T, ttl: number): boolean {
      return store.set(nsKey(namespace, key), value, ttl);
    },

    del(namespace: CacheNamespace, key: string): number {
      return store.del(nsKey(namespace, key));
    },

    flushNamespace(namespace: CacheNamespace): void {
      const prefix = `${namespace}:`;
      const keys = store.keys().filter((k) => k.startsWith(prefix));
      if (keys.length > 0) {
        store.del(keys);
      }
    },

    flushAll(): void {
      store.flushAll();
    },

    stats(): CacheStats {
      return store.getStats();
    },
  };

  // Decorate the Fastify instance
  fastify.decorate("cache", service);

  // Log stats on shutdown
  fastify.addHook("onClose", () => {
    const s = store.getStats();
    fastify.log.info(
      { cacheHits: s.hits, cacheMisses: s.misses, cacheKeys: s.keys },
      "Cache shutting down"
    );
    store.flushAll();
    store.close();
  });

  fastify.log.info("In-memory cache plugin registered");
}

/* ── Type augmentation ───────────────────────────────────── */
declare module "fastify" {
  interface FastifyInstance {
    cache: CacheService;
  }
}

export default fp(cachePlugin, {
  name: "cache",
  fastify: ">=5.0.0",
});
