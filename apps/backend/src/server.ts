import 'dotenv/config';
import { env } from "./lib/env";          // â† validate env vars first
import Fastify, { type FastifyError } from "fastify";
import cors from "@fastify/cors";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import websocket from "@fastify/websocket";
import { requestContext } from "./plugins/requestContext";
import { healthRoutes } from "./plugins/health";
import { metricsPlugin } from "./plugins/metrics";
import { securityHeaders } from "./plugins/security";
import { rateLimitPlugin } from "./plugins/rateLimit";
import cachePlugin from "./plugins/cache";
import { sanitizeInput } from "./middleware/sanitize";
import { trackError, initSentry, flushSentry } from "./services/error-tracking.service";
import { AppError } from "./errors";

// --- Route modules ---
import v1Routes from "./routes/v1";
import webhookRoutes from "./routes/webhooks";
import webhookRetryRoutes from "./routes/webhook-retry";
import { startWorkers, stopWorkers } from "./workers";
import { initWebhookRetryQueue, shutdownWebhookRetryQueue } from "./services/webhook-retry-queue.service";
import {
  initNotificationQueueWorker,
  shutdownNotificationQueueWorker,
} from "./services/notification-queue.service";
import { setupCacheInvalidation } from "./middleware/cache";
import { initRealtimeBridge, shutdownRealtimeBridge } from "./lib/realtime";

import compress from "@fastify/compress";
const envToLogger: Record<string, object | boolean> = {
  development: {
    level: env.LOG_LEVEL,
    transport: {
      target: "pino-pretty",
      options: { translateTime: "HH:MM:ss Z", ignore: "pid,hostname" },
    },
  },
  production: { level: env.LOG_LEVEL },
  test: false,
};

const environment = env.NODE_ENV;

type NotificationWorkerMode = "in-process" | "separate";

function resolveNotificationWorkerMode(): NotificationWorkerMode {
  const configured = process.env.NOTIFICATION_WORKER_MODE;
  if (configured === "in-process" || configured === "separate") {
    return configured;
  }

  return environment === "production" ? "separate" : "in-process";
}

export function buildServer() {
  const server = Fastify({
    logger: envToLogger[environment] ?? true,
    bodyLimit: 1_048_576, // 1 MB
    requestTimeout: 30_000,    // 30 s â€” abort slow requests
    connectionTimeout: 10_000, // 10 s â€” reject slow TCP handshakes
  });

  // --- Plugins ---
  server.register(cors, {
    origin: env.CORS_ORIGINS
      ? env.CORS_ORIGINS.split(",").map((s) => s.trim())
      : true, // permissive in dev; production enforced by env.ts
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Authorization",
      "Content-Type",
      "X-Request-Id",
      "X-School-Id",
    ],
    credentials: true,
  });

  // Compression (gzip/deflate) for responses
  server.register(compress, {
    threshold: 1024, // Only compress if > 1KB
    encodings: ["gzip", "deflate"],
  });

  // WebSocket support for real-time feeds
  server.register(websocket);
  void initRealtimeBridge();
  server.addHook("onClose", async () => {
    await shutdownRealtimeBridge();
  });

  // --- OpenAPI / Swagger documentation (dev/test only) ---
  if (environment !== "production") {
  server.register(swagger, {
  // CORS
    openapi: {
      info: {
        title: "SuffaCampus API",
        description:
          "Multi-tenant School ERP API â€” Students, Teachers, Attendance, Fees, Subscriptions, and more.",
        version: "1.0.0",
        contact: { name: "SuffaCampus Team", url: "https://SuffaCampus.in" },
      },
      servers: [
        { url: "http://localhost:5000", description: "Development" },
        { url: "https://api.SuffaCampus.in", description: "Production" },
      ],
      components: {
        securitySchemes: {
          BearerAuth: {
            type: "http",
            scheme: "bearer",
            bearerFormat: "Firebase ID Token",
            description: "Firebase Auth ID token obtained via client SDK",
          },
        },
      },
      security: [{ BearerAuth: [] }],
      tags: [
        { name: "Students", description: "Student CRUD operations" },
        { name: "Teachers", description: "Teacher CRUD operations" },
        { name: "Attendance", description: "Attendance marking & listing" },
        { name: "Classes", description: "Class & section management" },
        { name: "Events", description: "School events" },
        { name: "Fees", description: "Fee management & payments" },
        { name: "Library", description: "Library book management" },
        { name: "Results", description: "Exam results & grades" },
        { name: "Timetable", description: "Schedule management" },
        { name: "Subscriptions", description: "Plan management & billing" },
        { name: "Payments", description: "Razorpay payment processing" },
        { name: "Settings", description: "School settings & branding" },
        { name: "Dashboard", description: "Dashboard statistics" },
        { name: "Reports", description: "Analytics & reports" },
        { name: "Admin", description: "SuperAdmin school management" },
        { name: "Users", description: "User management" },
        { name: "Notifications", description: "In-app notifications" },
        { name: "Auth", description: "Authentication" },
      ],
    },
  });

  server.register(swaggerUi, {
    routePrefix: "/api/docs",
    uiConfig: {
      docExpansion: "list",
      deepLinking: true,
      persistAuthorization: true,
    },
  });
  } // end swagger dev-only block

  server.register(rateLimitPlugin);

  // Request ID, duration tracking, structured logging
  server.register(requestContext);

  // Security headers (X-Content-Type-Options, HSTS, etc.)
  server.register(securityHeaders);

  // In-process metrics collection
  server.register(metricsPlugin);

  // In-memory cache for Firestore read reduction
  server.register(cachePlugin);

  // Setup cache invalidation hooks on mutations
  setupCacheInvalidation(server);

  // Global input sanitization (HTML stripping, NoSQL injection prevention)
  server.addHook("preHandler", sanitizeInput);

  // --- Health check endpoints (liveness, readiness) ---
  server.register(healthRoutes);

  // --- Legacy redirect: help clients find the new prefix ---
  server.all("/students", async (_request, reply) => {
    return reply.status(301).header("Location", "/api/v1/students").send({
      success: false,
      error: {
        code: "API_MOVED",
        message: "This API has moved to /api/v1/students",
      },
    });
  });
  server.all("/teachers", async (_request, reply) => {
    return reply.status(301).header("Location", "/api/v1/teachers").send({
      success: false,
      error: {
        code: "API_MOVED",
        message: "This API has moved to /api/v1/teachers",
      },
    });
  });
  server.all("/attendance", async (_request, reply) => {
    return reply.status(301).header("Location", "/api/v1/attendance").send({
      success: false,
      error: {
        code: "API_MOVED",
        message: "This API has moved to /api/v1/attendance",
      },
    });
  });

  // --- API v1 (all versioned routes) ---
  server.register(v1Routes, { prefix: "/api/v1" });

  // --- Public Webhook Routes (signature verified inside handler) ---
  server.register(webhookRoutes);

  // --- Protected Webhook Retry Route (SuperAdmin only) ---
  server.register(webhookRetryRoutes);

  // --- Global Error Handler ---
  server.setErrorHandler((error: FastifyError | AppError, request, reply) => {
    // AppError â€” our custom domain errors
    if (error instanceof AppError) {
      if (error.statusCode >= 500) {
        request.log.error({ err: error }, error.message);
        trackError({
          error,
          requestId: request.requestId,
          userId: request.user?.uid,
          schoolId: request.schoolId,
          method: request.method,
          url: request.url,
          statusCode: error.statusCode,
        });
      } else {
        request.log.warn(
          { code: error.code, statusCode: error.statusCode },
          error.message
        );

        return reply.status(error.statusCode).send({
          success: false,
          error: error.toJSON(),
          meta: { requestId: request.requestId ?? "unknown" },
        });
      }

      return reply.status(500).send({
        code: "INTERNAL_ERROR",
        message: "Something went wrong",
      });
    }

    // Fastify validation errors
    if ((error as FastifyError).validation) {
      request.log.warn({ err: error }, "Validation error");
      return reply.status(400).send({
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Validation error",
          details: (error as FastifyError).validation,
        },
        meta: { requestId: request.requestId ?? "unknown" },
      });
    }

    // Rate limit errors
    if (error.statusCode === 429) {
      return reply.status(429).send({
        success: false,
        error: {
          code: "RATE_LIMIT_EXCEEDED",
          message: "Too many requests â€” please slow down",
        },
        meta: { requestId: request.requestId ?? "unknown" },
      });
    }

    // Unknown / unexpected errors
    const statusCode = error.statusCode ?? 500;

    if (statusCode >= 500) {
      request.log.error({ err: error }, error.message);
      trackError({
        error,
        requestId: request.requestId,
        userId: request.user?.uid,
        schoolId: request.schoolId,
        method: request.method,
        url: request.url,
        statusCode,
      });
    } else {
      request.log.warn({ err: error }, error.message);
    }

    if (statusCode >= 500) {
      return reply.status(500).send({
        code: "INTERNAL_ERROR",
        message: "Something went wrong",
      });
    }

    return reply.status(statusCode).send({
      success: false,
      error: {
        code: "UNKNOWN_ERROR",
        message: error.message,
      },
      meta: { requestId: request.requestId ?? "unknown" },
    });
  });

  return server;
}

async function main() {
  // Initialise Sentry before anything else (no-op if SENTRY_DSN not set)
  initSentry();

  const server = buildServer();

  const port = env.PORT;
  const host = "0.0.0.0";
  const notificationWorkerMode = resolveNotificationWorkerMode();
  const runNotificationWorkerInProcess = notificationWorkerMode === "in-process";

  try {
    await server.listen({ port, host });
    server.log.info(`ðŸš€ API v1 ready at http://${host}:${port}/api/v1`);

    // Start background workers (subscription lifecycle, usage snapshots)
    startWorkers();
    server.log.info("â±ï¸  Background workers started");

    await initWebhookRetryQueue();
    server.log.info("ðŸ“¬ Webhook retry queue initialized");

    if (runNotificationWorkerInProcess) {
      await initNotificationQueueWorker();
      server.log.info("ðŸ”” Notification queue worker initialized (in-process mode)");
    } else {
      server.log.info(
        "ðŸ”” Notification queue worker set to separate mode (run a dedicated worker process)"
      );
    }
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }

  // Graceful shutdown
  const SHUTDOWN_TIMEOUT_MS = 10_000; // force-kill after 10 s
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, async () => {
      server.log.info(`Received ${signal}, shutting down gracefullyâ€¦`);

      // Force-kill safety net: if draining hangs, terminate anyway
      const forceKill = setTimeout(() => {
        server.log.error("Shutdown timed out â€” forcing exit");
        process.exit(1);
      }, SHUTDOWN_TIMEOUT_MS);
      forceKill.unref(); // don't keep event loop alive just for this timer

      try {
        stopWorkers();      // stop cron tasks first
        if (runNotificationWorkerInProcess) {
          await shutdownNotificationQueueWorker();
        }
        await shutdownWebhookRetryQueue();
        await flushSentry();
        await server.close(); // drains in-flight connections
      } catch (err) {
        server.log.error(err, "Error during shutdown");
      }
      clearTimeout(forceKill);
      process.exit(0);
    });
  }
}

if (require.main === module) {
  void main();
}

