/**
 * Centralised environment variable validation.
 *
 * Parsed once at import-time (top of server.ts) so any misconfiguration
 * fails fast before the HTTP server starts accepting traffic.
 *
 * Pattern:
 *   required  â†’ `z.string().min(1)` â€” must be set & non-empty
 *   optional  â†’ `z.string().optional().default(...)` â€” has a safe fallback
 *   optional  â†’ `z.string().optional()` â€” feature disabled when absent
 */
import { z } from "zod";
import { createLogger } from "../utils/logger";

const log = createLogger("env");

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const envSchema = z.object({
  // â”€â”€ Node / Fastify â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  PORT: z.coerce.number().int().positive().default(5000),

  // â”€â”€ Database (PostgreSQL via Prisma) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),

  // â”€â”€ Firebase (required â€” Auth only, no Firestore for data) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  FIREBASE_PROJECT_ID: z.string().min(1, "FIREBASE_PROJECT_ID is required"),
  FIREBASE_CLIENT_EMAIL: z
    .string()
    .min(1, "FIREBASE_CLIENT_EMAIL is required"),
  FIREBASE_PRIVATE_KEY: z
    .string()
    .min(1, "FIREBASE_PRIVATE_KEY is required"),


  // â”€â”€ Firebase (optional) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  FIREBASE_STORAGE_BUCKET: z.string().optional(),

  // â”€â”€ CORS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  /** Primary frontend origin, used as the default CORS allow-list entry. */
  FRONTEND_URL: z.string().url().optional(),
  /** Comma-separated origins. Required in production to restrict access. */
  CORS_ORIGINS: z.string().optional(),

  // â”€â”€ Razorpay â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  RAZORPAY_KEY_ID: z.string().optional(),
  RAZORPAY_KEY_SECRET: z.string().optional(),
  RAZORPAY_WEBHOOK_SECRET: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),

  // —— Session JWT ——
  JWT_ACCESS_SECRET: z.string().min(1).default("dev-session-secret-change-me"),
  JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().positive().default(60 * 60 * 24),
  JWT_ISSUER: z.string().min(1).default("suffacampus-api"),
  JWT_AUDIENCE: z.string().min(1).default("suffacampus-clients"),
  AUTH_ALLOW_FIREBASE_FALLBACK: z.preprocess(
    (value) => {
      if (typeof value === "string") {
        return value.trim().toLowerCase() === "true";
      }
      if (typeof value === "boolean") {
        return value;
      }
      return false;
    },
    z.boolean().default(false)
  ),

  // â”€â”€ Queue / Redis â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  REDIS_URL: z.string().optional(),
  RUN_WORKERS: z.preprocess(
    (value) => {
      if (typeof value === "string") {
        const normalized = value.trim().toLowerCase();
        if (normalized === "true") return true;
        if (normalized === "false") return false;
      }
      if (typeof value === "boolean") {
        return value;
      }
      return true;
    },
    z.boolean().default(true)
  ),
  NOTIFICATION_WORKER_MODE: z
    .enum(["in-process", "separate"])
    .default("in-process"),

  // â”€â”€ SendGrid / Email â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  SENDGRID_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().default("noreply@SuffaCampus.app"),
  EMAIL_FROM_NAME: z.string().default("SuffaCampus"),

  // â”€â”€ Observability â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  SENTRY_DSN: z.string().optional(),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .default("info"),
  APP_VERSION: z.string().default("1.0.0"),
  COMMIT_SHA: z.string().default("unknown"),
  METRICS_AUTH_TOKEN: z.string().optional(),

  // â”€â”€ Rate Limiting â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(100),

  // â”€â”€ Critical endpoint overload protection (concurrent in-flight requests) â”€
  CRITICAL_AUTH_LOOKUP_CONCURRENCY: z.coerce.number().int().positive().default(150),
  CRITICAL_AUTH_LOGIN_CONCURRENCY: z.coerce.number().int().positive().default(120),
  CRITICAL_DASHBOARD_CONCURRENCY: z.coerce.number().int().positive().default(220),

  // â”€â”€ API Keys (comma-separated valid keys for external API access) â”€â”€â”€â”€â”€â”€
  API_KEYS: z.string().optional(),
});

// ---------------------------------------------------------------------------
// Parse & export
// ---------------------------------------------------------------------------

const isTestRuntime =
  process.env.NODE_ENV === "test" ||
  typeof process.env.JEST_WORKER_ID === "string";

const envInput = {
  ...process.env,
  ...(isTestRuntime
    ? {
        DATABASE_URL:
          process.env.DATABASE_URL ??
          "postgresql://test:test@localhost:5432/suffacampus_test",
        FIREBASE_PROJECT_ID:
          process.env.FIREBASE_PROJECT_ID ?? "suffacampus-test-project",
        FIREBASE_CLIENT_EMAIL:
          process.env.FIREBASE_CLIENT_EMAIL ??
          "firebase-adminsdk@suffacampus-test-project.iam.gserviceaccount.com",
        FIREBASE_PRIVATE_KEY:
          process.env.FIREBASE_PRIVATE_KEY ??
          "-----BEGIN PRIVATE KEY-----\\nTEST\\n-----END PRIVATE KEY-----\\n",
      }
    : {}),
};

const parsed = envSchema.safeParse(envInput);

if (!parsed.success) {
  // Pretty-print exactly which vars are wrong / missing
  const formatted = parsed.error.issues
    .map((i) => `  â€¢ ${i.path.join(".")}: ${i.message}`)
    .join("\n");
  log.error(
    `\nâŒ  Environment validation failed:\n${formatted}\n\nFix your .env file or CI secrets and restart.\n`
  );
  process.exit(1);
}

/** Typed, validated environment â€” use this instead of `process.env` */
export const env = parsed.data;

if (env.NODE_ENV === "production" && !env.FRONTEND_URL && !env.CORS_ORIGINS) {
  log.error(
    "\nâŒ  FRONTEND_URL or CORS_ORIGINS must be set in production to restrict allowed origins.\n"
  );
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Runtime warnings (non-fatal)
// ---------------------------------------------------------------------------

if (env.NODE_ENV === "production") {
  if (!env.SENTRY_DSN) {
    log.warn(
      "âš ï¸  SENTRY_DSN is not set â€” error tracking is disabled in production."
    );
  }
  if (!env.RAZORPAY_KEY_ID || !env.RAZORPAY_KEY_SECRET) {
    log.warn(
      "âš ï¸  Razorpay credentials are not set â€” payment features will fail."
    );
  }
  if (!env.REDIS_URL) {
    log.warn(
      "âš ï¸  REDIS_URL is not set â€” queue workers and retries will run in degraded mode."
    );
  }
  if (!env.METRICS_AUTH_TOKEN) {
    log.warn(
      "⚠️  METRICS_AUTH_TOKEN is not set — /metrics endpoints will return 503 (disabled)."
    );
  }
  if (env.JWT_ACCESS_SECRET === "dev-session-secret-change-me") {
    log.error(
      "\n❌  JWT_ACCESS_SECRET must be set to a strong value in production.\n"
    );
    process.exit(1);
  }
  if (env.AUTH_ALLOW_FIREBASE_FALLBACK) {
    log.error(
      "\n❌  AUTH_ALLOW_FIREBASE_FALLBACK must be false in production.\n"
    );
    process.exit(1);
  }
}

