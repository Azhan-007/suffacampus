/**
 * Prometheus-compatible metrics plugin.
 *
 * Exposes:
 *   GET /metrics          — Prometheus text format (OpenMetrics)
 *   GET /metrics/json     — JSON snapshot for internal dashboards
 *
 * Key metrics:
 *   http_request_duration_seconds  — histogram per route/method/status
 *   http_requests_total            — counter per route/method/status
 *   http_request_errors_total      — counter (status >= 500)
 *   SuffaCampus_active_tenants      — gauge (unique schoolIds in sliding window)
 *   nodejs_*                       — default Node.js metrics (memory, GC, event loop)
 *
 * Protected in production by METRICS_AUTH_TOKEN bearer check.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import crypto from "crypto";
import client, {
  Registry,
  Counter,
  Histogram,
  Gauge,
  collectDefaultMetrics,
} from "prom-client";
import { getEmailQueueStats } from "../services/email-queue.service";
import { getWebhookRetryQueueStats } from "../services/webhook-retry-queue.service";

// ---------------------------------------------------------------------------
// Registry & default Node.js metrics
// ---------------------------------------------------------------------------

const register = new Registry();
register.setDefaultLabels({ app: "SuffaCampus-api" });
collectDefaultMetrics({ register, prefix: "nodejs_" });

// ---------------------------------------------------------------------------
// Custom metrics
// ---------------------------------------------------------------------------

const httpRequestDuration = new Histogram({
  name: "http_request_duration_seconds",
  help: "Duration of HTTP requests in seconds",
  labelNames: ["method", "route", "status_code"] as const,
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [register],
});

const httpRequestsTotal = new Counter({
  name: "http_requests_total",
  help: "Total number of HTTP requests",
  labelNames: ["method", "route", "status_code"] as const,
  registers: [register],
});

const httpRequestErrorsTotal = new Counter({
  name: "http_request_errors_total",
  help: "Total number of HTTP 5xx errors",
  labelNames: ["method", "route"] as const,
  registers: [register],
});

const criticalRequestDuration = new Histogram({
  name: "SuffaCampus_critical_request_duration_seconds",
  help: "Latency for critical API endpoints (auth and dashboard) in seconds",
  labelNames: ["endpoint", "method", "status_code"] as const,
  buckets: [0.01, 0.03, 0.05, 0.1, 0.2, 0.35, 0.5, 0.75, 1, 1.5, 2.5, 5],
  registers: [register],
});

const criticalSlowRequestsTotal = new Counter({
  name: "SuffaCampus_critical_slow_requests_total",
  help: "Count of critical endpoint requests slower than threshold",
  labelNames: ["endpoint", "method"] as const,
  registers: [register],
});

const authLookupCacheEventsTotal = new Counter({
  name: "SuffaCampus_auth_lookup_cache_events_total",
  help: "Auth pre-login lookup cache events by lookup type and outcome",
  labelNames: ["lookup_type", "outcome"] as const,
  registers: [register],
});

const dashboardQueryDuration = new Histogram({
  name: "SuffaCampus_dashboard_query_duration_seconds",
  help: "Dashboard service query duration in seconds",
  labelNames: ["query", "success"] as const,
  buckets: [0.005, 0.01, 0.02, 0.05, 0.1, 0.2, 0.35, 0.5, 0.75, 1.5, 3],
  registers: [register],
});

const overloadShedRequestsTotal = new Counter({
  name: "SuffaCampus_overload_shed_requests_total",
  help: "Requests rejected due to critical endpoint overload protection",
  labelNames: ["lane", "method"] as const,
  registers: [register],
});

const CRITICAL_SLOW_THRESHOLD_SECONDS = 0.75;

export function recordAuthLookupCacheEvent(
  lookupType: "username" | "school",
  outcome: "hit" | "miss"
): void {
  authLookupCacheEventsTotal.inc({ lookup_type: lookupType, outcome });
}

export function recordDashboardQuery(
  query: "stats" | "activity" | "upcoming_events",
  durationMs: number,
  success: boolean
): void {
  dashboardQueryDuration.observe(
    { query, success: success ? "true" : "false" },
    durationMs / 1000
  );
}

export function recordOverloadShedRequest(
  lane: "auth_lookup" | "auth_login" | "dashboard",
  method: string
): void {
  overloadShedRequestsTotal.inc({ lane, method });
}

function toCriticalEndpoint(routePattern: string): string | null {
  if (routePattern === "/api/v1/auth/user-by-username") return "auth_user_lookup";
  if (routePattern === "/api/v1/auth/schools") return "auth_school_lookup";
  if (routePattern === "/api/v1/auth/login") return "auth_login";
  if (routePattern === "/api/v1/auth/me") return "auth_me";
  if (routePattern === "/api/v1/dashboard/stats") return "dashboard_stats";
  if (routePattern === "/api/v1/dashboard/activity") return "dashboard_activity";
  if (routePattern === "/api/v1/dashboard/upcoming-events") return "dashboard_upcoming_events";
  return null;
}

const activeTenants = new Gauge({
  name: "SuffaCampus_active_tenants",
  help: "Number of unique tenants (schools) seen in sliding window",
  registers: [register],
});

const queueWaitingJobs = new Gauge({
  name: "SuffaCampus_queue_waiting_jobs",
  help: "Number of waiting jobs by queue",
  labelNames: ["queue"] as const,
  registers: [register],
});

const queueActiveJobs = new Gauge({
  name: "SuffaCampus_queue_active_jobs",
  help: "Number of active jobs by queue",
  labelNames: ["queue"] as const,
  registers: [register],
});

const queueFailedJobs = new Gauge({
  name: "SuffaCampus_queue_failed_jobs",
  help: "Number of failed jobs by queue",
  labelNames: ["queue"] as const,
  registers: [register],
});

const queueOldestWaitingAgeSeconds = new Gauge({
  name: "SuffaCampus_queue_oldest_waiting_job_age_seconds",
  help: "Age in seconds of the oldest waiting job by queue",
  labelNames: ["queue"] as const,
  registers: [register],
});

// ---------------------------------------------------------------------------
// Operational observability metrics (blind spot elimination)
// ---------------------------------------------------------------------------

const cacheOpsTotal = new Counter({
  name: "SuffaCampus_cache_ops_total",
  help: "Cache operations by result (hit, miss, error, disabled)",
  labelNames: ["result"] as const,
  registers: [register],
});

const auditWriteFailuresTotal = new Counter({
  name: "SuffaCampus_audit_write_failures_total",
  help: "Number of audit log writes that failed silently",
  registers: [register],
});

const cronExecutionDuration = new Histogram({
  name: "SuffaCampus_cron_execution_duration_seconds",
  help: "Duration of cron job executions",
  labelNames: ["job", "success"] as const,
  buckets: [0.1, 0.5, 1, 5, 10, 30, 60, 120, 300],
  registers: [register],
});

const reportQueueBacklog = new Gauge({
  name: "SuffaCampus_report_queue_backlog",
  help: "Number of pending or stuck reports awaiting processing",
  registers: [register],
});

const redisFallbackTotal = new Counter({
  name: "SuffaCampus_redis_fallback_total",
  help: "Times a service fell back to inline processing due to Redis unavailability",
  labelNames: ["service"] as const,
  registers: [register],
});

const singleflightCoalesceTotal = new Counter({
  name: "SuffaCampus_singleflight_coalesce_total",
  help: "Requests coalesced by singleflight (avoided redundant DB queries)",
  labelNames: ["key"] as const,
  registers: [register],
});

/** Record a cache operation result. */
export function recordCacheOp(result: "hit" | "miss" | "error" | "disabled"): void {
  cacheOpsTotal.inc({ result });
}

/** Record an audit log write failure. */
export function recordAuditWriteFailure(): void {
  auditWriteFailuresTotal.inc();
}

/** Record a cron job execution. */
export function recordCronExecution(job: string, durationMs: number, success: boolean): void {
  cronExecutionDuration.observe({ job, success: success ? "true" : "false" }, durationMs / 1000);
}

/** Set the current report queue backlog size. */
export function setReportQueueBacklog(count: number): void {
  reportQueueBacklog.set(count);
}

/** Record a Redis fallback activation. */
export function recordRedisFallback(service: string): void {
  redisFallbackTotal.inc({ service });
}

/** Record a singleflight coalesce. */
export function recordSingleflightCoalesce(key: string): void {
  singleflightCoalesceTotal.inc({ key });
}

async function refreshQueueMetrics() {
  const [emailStats, webhookRetryStats] = await Promise.all([
    getEmailQueueStats(),
    getWebhookRetryQueueStats(),
  ]);

  queueWaitingJobs.set({ queue: "email" }, emailStats.waiting);
  queueWaitingJobs.set({ queue: "webhook_retry" }, webhookRetryStats.waiting);

  queueActiveJobs.set({ queue: "email" }, emailStats.active);
  queueActiveJobs.set({ queue: "webhook_retry" }, webhookRetryStats.active);

  queueFailedJobs.set({ queue: "email" }, emailStats.failed);
  queueFailedJobs.set({ queue: "webhook_retry" }, webhookRetryStats.failed);

  queueOldestWaitingAgeSeconds.set(
    { queue: "email" },
    emailStats.oldestWaitingAgeSeconds
  );
  queueOldestWaitingAgeSeconds.set(
    { queue: "webhook_retry" },
    webhookRetryStats.oldestWaitingAgeSeconds
  );

  return {
    email: emailStats,
    webhookRetry: webhookRetryStats,
  };
}

// Sliding-window tenant tracker (5 min window)
const TENANT_WINDOW_MS = 5 * 60 * 1000;
const tenantLastSeen = new Map<string, number>();

function trackTenant(schoolId?: string): void {
  if (!schoolId) return;
  tenantLastSeen.set(schoolId, Date.now());
  // Prune expired entries periodically
  if (Math.random() < 0.05) {
    const cutoff = Date.now() - TENANT_WINDOW_MS;
    for (const [id, ts] of tenantLastSeen) {
      if (ts < cutoff) tenantLastSeen.delete(id);
    }
  }
  activeTenants.set(tenantLastSeen.size);
}

// ---------------------------------------------------------------------------
// Legacy in-memory helpers (kept for /metrics/json backward compat)
// ---------------------------------------------------------------------------

interface RouteMetrics {
  totalRequests: number;
  totalErrors: number;
  statusCodes: Record<number, number>;
  totalDurationMs: number;
  minDurationMs: number;
  maxDurationMs: number;
}

const routeMetrics = new Map<string, RouteMetrics>();
let globalRequestCount = 0;
let globalErrorCount = 0;
let startedAt = Date.now();

function getOrCreateMetrics(routeKey: string): RouteMetrics {
  let m = routeMetrics.get(routeKey);
  if (!m) {
    m = {
      totalRequests: 0,
      totalErrors: 0,
      statusCodes: {},
      totalDurationMs: 0,
      minDurationMs: Infinity,
      maxDurationMs: 0,
    };
    routeMetrics.set(routeKey, m);
  }
  return m;
}

/**
 * Record a completed request (feeds both Prometheus and in-memory store).
 */
export function recordRequest(
  method: string,
  routePattern: string,
  statusCode: number,
  durationMs: number
): void {
  const durationSec = durationMs / 1000;
  const statusStr = String(statusCode);

  // Prometheus
  httpRequestDuration.observe({ method, route: routePattern, status_code: statusStr }, durationSec);
  httpRequestsTotal.inc({ method, route: routePattern, status_code: statusStr });
  if (statusCode >= 500) {
    httpRequestErrorsTotal.inc({ method, route: routePattern });
  }

  const endpoint = toCriticalEndpoint(routePattern);
  if (endpoint) {
    criticalRequestDuration.observe(
      { endpoint, method, status_code: statusStr },
      durationSec
    );
    if (durationSec > CRITICAL_SLOW_THRESHOLD_SECONDS) {
      criticalSlowRequestsTotal.inc({ endpoint, method });
    }
  }

  // In-memory (for /metrics/json)
  globalRequestCount++;
  if (statusCode >= 500) globalErrorCount++;
  const key = `${method} ${routePattern}`;
  const m = getOrCreateMetrics(key);
  m.totalRequests++;
  if (statusCode >= 400) m.totalErrors++;
  m.statusCodes[statusCode] = (m.statusCodes[statusCode] ?? 0) + 1;
  m.totalDurationMs += durationMs;
  if (durationMs < m.minDurationMs) m.minDurationMs = durationMs;
  if (durationMs > m.maxDurationMs) m.maxDurationMs = durationMs;
}

/**
 * Get aggregated JSON metrics snapshot.
 */
export function getMetricsSnapshot() {
  const routes: Record<string, RouteMetrics & { avgDurationMs: number }> = {};
  for (const [key, m] of routeMetrics) {
    routes[key] = {
      ...m,
      avgDurationMs: m.totalRequests > 0 ? Math.round((m.totalDurationMs / m.totalRequests) * 100) / 100 : 0,
      minDurationMs: m.minDurationMs === Infinity ? 0 : m.minDurationMs,
    };
  }
  return {
    global: {
      totalRequests: globalRequestCount,
      totalErrors: globalErrorCount,
      errorRate: globalRequestCount > 0 ? Math.round((globalErrorCount / globalRequestCount) * 10000) / 100 : 0,
      uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
    },
    routes,
  };
}

/**
 * Reset all metrics (useful for testing).
 */
export function resetMetrics(): void {
  routeMetrics.clear();
  globalRequestCount = 0;
  globalErrorCount = 0;
  startedAt = Date.now();
  register.resetMetrics();
}

function timingSafeTokenMatch(actual: string, expected: string): boolean {
  const actualBytes = Buffer.from(actual, "utf8");
  const expectedBytes = Buffer.from(expected, "utf8");

  if (actualBytes.length !== expectedBytes.length) {
    return false;
  }

  return crypto.timingSafeEqual(actualBytes, expectedBytes);
}

function verifyMetricsAccess(
  request: FastifyRequest,
  reply: FastifyReply
): boolean {
  const metricsToken = process.env.METRICS_AUTH_TOKEN?.trim();

  if (!metricsToken) {
    void reply.status(503).send({
      success: false,
      error: {
        code: "METRICS_DISABLED",
        message: "Metrics endpoint is disabled until METRICS_AUTH_TOKEN is configured",
      },
    });
    return false;
  }

  const auth = request.headers.authorization;
  if (!auth || !auth.startsWith("Bearer ")) {
    void reply.status(401).send({
      success: false,
      error: {
        code: "UNAUTHORIZED",
        message: "Bearer metrics token is required",
      },
    });
    return false;
  }

  const providedToken = auth.slice(7).trim();
  if (!timingSafeTokenMatch(providedToken, metricsToken)) {
    void reply.status(401).send({
      success: false,
      error: {
        code: "UNAUTHORIZED",
        message: "Invalid metrics token",
      },
    });
    return false;
  }

  return true;
}

// ---------------------------------------------------------------------------
// Fastify plugin
// ---------------------------------------------------------------------------

export async function metricsPlugin(server: FastifyInstance) {
  // Record metrics for every response
  server.addHook("onResponse", (request: FastifyRequest, reply: FastifyReply, done) => {
    const routePattern =
      request.routeOptions?.url ??
      request.routeOptions?.config?.url ??
      request.url;

    const durationMs =
      request.startTime != null
        ? Number(process.hrtime.bigint() - request.startTime) / 1e6
        : 0;

    const schoolId = request.schoolId;
    trackTenant(schoolId);

    recordRequest(
      request.method,
      routePattern,
      reply.statusCode,
      Math.round(durationMs * 100) / 100
    );

    done();
  });

  // ---------- Prometheus text endpoint ----------
  server.get("/metrics", async (request, reply) => {
    if (!verifyMetricsAccess(request, reply)) {
      return;
    }

    await refreshQueueMetrics();

    reply.header("Content-Type", register.contentType);
    return reply.send(await register.metrics());
  });

  // ---------- JSON snapshot endpoint (legacy / dashboards) ----------
  server.get("/metrics/json", async (request, reply) => {
    if (!verifyMetricsAccess(request, reply)) {
      return;
    }

    const queueStats = await refreshQueueMetrics();

    const snapshot = getMetricsSnapshot();
    const mem = process.memoryUsage();

    return reply.status(200).send({
      success: true,
      data: {
        ...snapshot,
        system: {
          memory: {
            rss: Math.round(mem.rss / 1024 / 1024),
            heapUsed: Math.round(mem.heapUsed / 1024 / 1024),
            heapTotal: Math.round(mem.heapTotal / 1024 / 1024),
          },
          uptime: Math.floor(process.uptime()),
          nodeVersion: process.version,
          pid: process.pid,
          activeTenants: tenantLastSeen.size,
        },
        queues: queueStats,
      },
      timestamp: new Date().toISOString(),
    });
  });
}

