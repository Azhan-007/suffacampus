import type { FastifyInstance } from "fastify";
import { firestore } from "../lib/firebase-admin";
import { prisma } from "../lib/prisma";
import { getRealtimeBridgeStatus } from "../lib/realtime";
import { getSearchBackendStatus } from "../services/search.service";
import { getWebhookRetryQueueStats } from "../services/webhook-retry-queue.service";
import { getEmailQueueStats } from "../services/email-queue.service";

/**
 * Build info — populated at compile time or from environment.
 */
const BUILD_INFO = {
  version: process.env.APP_VERSION ?? "1.0.0",
  commitSha: process.env.COMMIT_SHA ?? "unknown",
  environment: process.env.NODE_ENV ?? "development",
};

/**
 * Check Firestore connectivity by performing a lightweight read.
 */
async function checkFirestore(): Promise<{
  status: "healthy" | "degraded" | "unhealthy";
  latencyMs: number;
  error?: string;
}> {
  const start = Date.now();
  try {
    await firestore.collection("_health").doc("ping").get();
    return { status: "healthy", latencyMs: Date.now() - start };
  } catch (err) {
    return {
      status: "unhealthy",
      latencyMs: Date.now() - start,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

async function checkPostgres(): Promise<{
  status: "healthy" | "degraded" | "unhealthy";
  latencyMs: number;
  error?: string;
}> {
  const start = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { status: "healthy", latencyMs: Date.now() - start };
  } catch (err) {
    return {
      status: "unhealthy",
      latencyMs: Date.now() - start,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

/**
 * Check Razorpay connectivity (lightweight — just verify client is configured).
 */
function checkRazorpay(): {
  status: "healthy" | "degraded" | "unhealthy";
  error?: string;
} {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;

  if (!keyId || !keySecret) {
    return { status: "degraded", error: "Razorpay credentials not configured" };
  }
  return { status: "healthy" };
}

/**
 * Get memory and uptime metrics.
 */
function getSystemMetrics() {
  const mem = process.memoryUsage();
  return {
    uptime: Math.floor(process.uptime()),
    memory: {
      rss: Math.round(mem.rss / 1024 / 1024),
      heapUsed: Math.round(mem.heapUsed / 1024 / 1024),
      heapTotal: Math.round(mem.heapTotal / 1024 / 1024),
      external: Math.round(mem.external / 1024 / 1024),
    },
    pid: process.pid,
    nodeVersion: process.version,
  };
}

/**
 * Register health and readiness check endpoints.
 *
 * - GET /health      — shallow liveness probe (always 200 if process is alive)
 * - GET /health/ready — deep readiness probe (checks dependencies)
 * - GET /health/live  — Kubernetes liveness alias
 */
export async function healthRoutes(server: FastifyInstance) {
  // Shallow liveness check — returns 200 if the event loop is alive
  server.get("/health", async (_request, reply) => {
    return reply.status(200).send({
      success: true,
      status: "alive",
      ...BUILD_INFO,
      timestamp: new Date().toISOString(),
    });
  });

  // Kubernetes liveness probe alias
  server.get("/health/live", async (_request, reply) => {
    return reply.status(200).send({ status: "alive" });
  });

  // Deep readiness check — validates all dependencies
  server.get("/health/ready", async (_request, reply) => {
    const [firestoreCheck, postgresCheck, searchStatus, webhookRetryQueue, emailQueue] = await Promise.all([
      checkFirestore(),
      checkPostgres(),
      getSearchBackendStatus(),
      getWebhookRetryQueueStats(),
      getEmailQueueStats(),
    ]);
    const razorpayCheck = checkRazorpay();
    const realtimeBridge = getRealtimeBridgeStatus();

    const redisCheck = !realtimeBridge.enabled
      ? {
          status: "degraded" as const,
          error: "REDIS_URL not configured; realtime runs single-instance mode",
        }
      : realtimeBridge.ready &&
          realtimeBridge.publisherConnected &&
          realtimeBridge.subscriberConnected
        ? { status: "healthy" as const }
        : {
            status: "unhealthy" as const,
            error: "Redis realtime bridge is not connected",
          };

    const dependencies = {
      postgres: postgresCheck,
      firestore: firestoreCheck,
      razorpay: razorpayCheck,
      redis: redisCheck,
      search: searchStatus,
      queues: {
        status:
          webhookRetryQueue.enabled || emailQueue.enabled
            ? "healthy"
            : "degraded",
        webhookRetry: webhookRetryQueue,
        email: emailQueue,
      },
    };

    const overallStatus =
      Object.values(dependencies).some((d) => d.status === "unhealthy")
        ? "unhealthy"
        : Object.values(dependencies).some((d) => d.status === "degraded")
          ? "degraded"
          : "healthy";

    const statusCode = overallStatus === "unhealthy" ? 503 : 200;

    return reply.status(statusCode).send({
      success: overallStatus !== "unhealthy",
      status: overallStatus,
      ...BUILD_INFO,
      system: getSystemMetrics(),
      dependencies,
      timestamp: new Date().toISOString(),
    });
  });

  // Cache stats endpoint (for monitoring / debugging)
  server.get("/health/cache", async (_request, reply) => {
    const stats = server.cache?.stats() ?? { hits: 0, misses: 0, keys: 0, ksize: 0, vsize: 0 };
    const hitRate =
      stats.hits + stats.misses > 0
        ? ((stats.hits / (stats.hits + stats.misses)) * 100).toFixed(1)
        : "0.0";

    return reply.status(200).send({
      success: true,
      cache: {
        ...stats,
        hitRatePercent: parseFloat(hitRate),
      },
      timestamp: new Date().toISOString(),
    });
  });
}
