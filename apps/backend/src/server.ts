import 'dotenv/config';
import { env } from "./lib/env";          // â† validate env vars first
import Fastify, { type FastifyError } from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import websocket from "@fastify/websocket";
import { requestContext } from "./plugins/requestContext";
import { tenantContextPlugin } from "./plugins/tenantContext";
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
import { startCronJobs, stopCronJobs } from "./jobs";
import { initWebhookRetryQueue, shutdownWebhookRetryQueue } from "./services/webhook-retry-queue.service";
import {
  initNotificationQueueWorker,
  shutdownNotificationQueueWorker,
} from "./services/notification-queue.service";
import { setupCacheInvalidation } from "./middleware/cache";
import { initRealtimeBridge, shutdownRealtimeBridge } from "./lib/realtime";
import { sendError } from "./utils/response";

import compress from "@fastify/compress";

const LOGGER_REDACTION_PATHS = [
  "req.headers.authorization",
  "req.headers.cookie",
  "req.headers.x-api-key",
  "req.headers.stripe-signature",
  "req.headers.x-razorpay-signature",
  "req.body.password",
  "req.body.newPassword",
  "req.body.token",
  "req.body.apiKey",
  "req.body.rawKey",
  "req.body.razorpaySignature",
  "req.body.razorpay_signature",
  "req.body.signature",
] as const;

const envToLogger: Record<string, object | boolean> = {
  development: {
    level: env.LOG_LEVEL,
    redact: {
      paths: LOGGER_REDACTION_PATHS,
      censor: "[REDACTED]",
    },
    transport: {
      target: "pino-pretty",
      options: { translateTime: "HH:MM:ss Z", ignore: "pid,hostname" },
    },
  },
  production: {
    level: env.LOG_LEVEL,
    redact: {
      paths: LOGGER_REDACTION_PATHS,
      censor: "[REDACTED]",
    },
  },
  test: false,
};

const environment = env.NODE_ENV;

function normalizeOrigin(origin: string): string {
  return origin.trim().replace(/\/+$/, "");
}

function addCsvOrigins(target: Set<string>, csv?: string): void {
  if (!csv) {
    return;
  }

  for (const rawOrigin of csv.split(",")) {
    const trimmed = rawOrigin.trim();
    if (trimmed.length === 0) {
      continue;
    }

    target.add(normalizeOrigin(trimmed));
  }
}

function buildCorsAllowList(): Set<string> {
  const allowList = new Set<string>();

  if (env.FRONTEND_URL) {
    allowList.add(normalizeOrigin(env.FRONTEND_URL));
  }

  addCsvOrigins(allowList, env.CORS_ORIGINS);

  if (environment !== "production") {
    addCsvOrigins(
      allowList,
      "http://localhost:3000,http://localhost:3001,http://localhost:8081,http://127.0.0.1:3000,http://127.0.0.1:3001"
    );
  }

  return allowList;
}

export function buildServer() {
  const corsAllowList = buildCorsAllowList();

  const server = Fastify({
    logger: envToLogger[environment] ?? true,
    bodyLimit: 1_048_576, // 1 MB
    requestTimeout: 30_000,    // 30 s â€” abort slow requests
    connectionTimeout: 10_000, // 10 s â€” reject slow TCP handshakes
  });

  // --- Plugins ---
  server.register(cors, {
    origin: (origin, callback) => {
      // Allow same-origin, native/mobile, and non-browser clients without Origin header.
      if (!origin) {
        callback(null, true);
        return;
      }

      const normalizedOrigin = normalizeOrigin(origin);
      const isAllowed = corsAllowList.has(normalizedOrigin);

      if (isAllowed) {
        callback(null, true);
        return;
      }

      callback(null, false);
    },
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Authorization",
      "Content-Type",
      "X-Request-Id",
      "X-School-Id",
      "X-API-Key",
    ],
    credentials: true,
  });

  // Compression (gzip/deflate) for responses
  server.register(compress, {
    threshold: 1024, // Only compress if > 1KB
    encodings: ["gzip", "deflate"],
  });

  // Multipart parser for upload endpoints. Limits are enforced again per category in route validation.
  server.register(multipart, {
    limits: {
      files: 1,
      fileSize: 50 * 1024 * 1024,
      fields: 10,
      parts: 12,
    },
    throwFileSizeLimit: true,
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

  // Initialize request-scoped tenant context before auth/handlers run.
  server.register(tenantContextPlugin);

  // Request ID, duration tracking, structured logging
  server.register(requestContext);

  // Security headers (X-Content-Type-Options, HSTS, etc.)
  server.register(securityHeaders);

  // In-process metrics collection
  server.register(metricsPlugin);

  // In-memory cache for repeated read reduction
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
    const requestId = request.requestId ?? "unknown";

    const sendInternalError = () => {
      const legacy = {
        code: "INTERNAL_ERROR",
        message: "Something went wrong",
      };

      return reply.status(500).send({
        success: false,
        error: legacy,
        meta: { requestId },
        ...legacy,
      });
    };

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
        return sendError(
          request,
          reply,
          error.statusCode,
          error.code,
          error.message,
          error.details
        );
      }

      return sendInternalError();
    }

    // Fastify validation errors
    if ((error as FastifyError).validation) {
      request.log.warn({ err: error }, "Validation error");
      return sendError(
        request,
        reply,
        400,
        "VALIDATION_ERROR",
        "Validation error",
        (error as FastifyError).validation
      );
    }

    // Rate limit errors
    if (error.statusCode === 429) {
      return sendError(
        request,
        reply,
        429,
        "RATE_LIMIT_EXCEEDED",
        "Too many requests â€” please slow down"
      );
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
      return sendInternalError();
    }

    return sendError(
      request,
      reply,
      statusCode,
      "UNKNOWN_ERROR",
      error.message
    );
  });

  return server;
}

async function main() {
  // Initialise Sentry before anything else (no-op if SENTRY_DSN not set)
  initSentry();

  const server = buildServer();

  const port = env.PORT;
  const host = "0.0.0.0";
  const configuredRunWorkers = env.RUN_WORKERS;
  const configuredWorkerMode = env.NOTIFICATION_WORKER_MODE;

  try {
    await server.listen({ port, host });
    server.log.info(`ðŸš€ API v1 ready at http://${host}:${port}/api/v1`);

    // Temporary testing deployment: force a single-service runtime.
    // API, cron jobs, and notification processing all run in this same process.
    if (!configuredRunWorkers || configuredWorkerMode !== "in-process") {
      server.log.warn(
        {
          configuredRunWorkers,
          configuredWorkerMode,
        },
        "Temporary testing mode enforces in-process workers; ignoring split-worker settings"
      );
    }

    startCronJobs();
    server.log.info("Background cron jobs started (single-service testing mode)");

    await initNotificationQueueWorker();
    server.log.info("Notification queue worker initialized (single-service testing mode)");

    await initWebhookRetryQueue();
    server.log.info("Webhook retry queue initialized");
    server.log.info("Application startup complete");
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
        stopCronJobs();
        await shutdownNotificationQueueWorker();
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

