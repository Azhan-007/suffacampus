/**
 * Error tracking service — Sentry + in-memory ring buffer + PostgreSQL for high/critical.
 * Firestore persistence replaced with Prisma.
 */

import * as Sentry from "@sentry/node";
import pino from "pino";
import { prisma } from "../lib/prisma";

const log = pino({ name: "error-tracking" });

let sentryInitialised = false;

export function initSentry(): void {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) {
    log.warn("SENTRY_DSN not set — errors tracked in-memory + PostgreSQL only");
    return;
  }
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV ?? "development",
    release: process.env.APP_VERSION ?? "1.0.0",
    tracesSampleRate: process.env.NODE_ENV === "production" ? 0.2 : 1.0,
    integrations: [Sentry.onUncaughtExceptionIntegration(), Sentry.onUnhandledRejectionIntegration()],
    beforeSend(event) {
      if (event.breadcrumbs) {
        event.breadcrumbs = event.breadcrumbs.map((bc) => {
          if (bc.data && typeof bc.data === "object") {
            const { authorization, cookie, ...safe } = bc.data as Record<string, unknown>;
            bc.data = safe;
          }
          return bc;
        });
      }
      return event;
    },
  });
  sentryInitialised = true;
  log.info({ environment: process.env.NODE_ENV }, "Sentry initialised");
}

export async function flushSentry(timeoutMs = 2000): Promise<void> {
  if (sentryInitialised) await Sentry.flush(timeoutMs);
}

export interface TrackedError {
  id: string; message: string; stack?: string; code?: string; statusCode?: number;
  requestId?: string; userId?: string; schoolId?: string; method?: string; url?: string;
  severity: "low" | "medium" | "high" | "critical"; timestamp: string;
  metadata?: Record<string, unknown>;
}

const MAX_BUFFER_SIZE = 500;
const errorBuffer: TrackedError[] = [];

function classifySeverity(statusCode?: number, message?: string): TrackedError["severity"] {
  if (statusCode && statusCode >= 500) return "high";
  if (message && (message.includes("ECONNREFUSED") || message.includes("ENOTFOUND") || message.includes("timeout"))) return "critical";
  if (statusCode === 429) return "medium";
  if (statusCode && statusCode >= 400) return "low";
  return "medium";
}

function severityToSentryLevel(severity: TrackedError["severity"]): Sentry.SeverityLevel {
  switch (severity) { case "critical": return "fatal"; case "high": return "error"; case "medium": return "warning"; case "low": return "info"; }
}

export async function trackError(params: {
  error: Error | unknown; requestId?: string; userId?: string; schoolId?: string;
  method?: string; url?: string; statusCode?: number; metadata?: Record<string, unknown>;
}): Promise<string> {
  const err = params.error instanceof Error ? params.error : new Error(String(params.error));
  const id = `err_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const severity = classifySeverity(params.statusCode, err.message);

  if (sentryInitialised) {
    Sentry.withScope((scope) => {
      scope.setLevel(severityToSentryLevel(severity));
      scope.setTag("error.code", (err as Error & { code?: string }).code ?? "UNKNOWN");
      if (params.schoolId) scope.setTag("tenant.schoolId", params.schoolId);
      if (params.userId) scope.setUser({ id: params.userId });
      if (params.requestId) scope.setTag("request.id", params.requestId);
      Sentry.captureException(err);
    });
  }

  const tracked: TrackedError = {
    id, message: err.message, stack: err.stack, code: (err as Error & { code?: string }).code,
    statusCode: params.statusCode, requestId: params.requestId, userId: params.userId,
    schoolId: params.schoolId, method: params.method, url: params.url, severity,
    timestamp: new Date().toISOString(), metadata: params.metadata,
  };

  errorBuffer.push(tracked);
  if (errorBuffer.length > MAX_BUFFER_SIZE) errorBuffer.shift();

  // Persist high/critical to PostgreSQL
  if (severity === "critical" || severity === "high") {
    try {
      await prisma.errorLog.create({
        data: {
          errorId: id, message: err.message, stack: err.stack, code: tracked.code,
          statusCode: params.statusCode, requestId: params.requestId,
          userId: params.userId, schoolId: params.schoolId, method: params.method,
          url: params.url, severity, metadata: params.metadata ? (params.metadata as any) : undefined,
        },
      });
    } catch (persistErr) {
      log.error({ err: persistErr }, "Failed to persist error to PostgreSQL");
    }
  }

  return id;
}

export function getRecentErrors(limit = 50, severity?: TrackedError["severity"]): TrackedError[] {
  let errors = [...errorBuffer].reverse();
  if (severity) errors = errors.filter((e) => e.severity === severity);
  return errors.slice(0, limit);
}

export function getErrorStats() {
  const now = Date.now();
  const last5min = errorBuffer.filter((e) => now - new Date(e.timestamp).getTime() < 5 * 60 * 1000);
  const last1hr = errorBuffer.filter((e) => now - new Date(e.timestamp).getTime() < 60 * 60 * 1000);
  const bySeverity = { low: 0, medium: 0, high: 0, critical: 0 };
  for (const e of errorBuffer) bySeverity[e.severity]++;
  return { total: errorBuffer.length, last5min: last5min.length, last1hr: last1hr.length, bySeverity, bufferSize: MAX_BUFFER_SIZE, oldestTimestamp: errorBuffer.length > 0 ? errorBuffer[0].timestamp : null };
}

export function clearErrors(): void { errorBuffer.length = 0; }
