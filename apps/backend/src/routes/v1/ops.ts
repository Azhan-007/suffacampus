/**
 * Operational inspection endpoints — lightweight admin-only read endpoints.
 *
 * These expose payment health, reconciliation state, and queue backlog
 * without calling external APIs or triggering any state changes.
 *
 * All endpoints require SuperAdmin authentication via X-API-Key.
 *
 * Routes:
 *   GET /api/v1/ops/payment-health       — payment & webhook operational summary
 *   GET /api/v1/ops/reconciliation        — open drift records by type + recent events
 *   GET /api/v1/ops/queue-health          — queue counts by status
 */
import type { FastifyInstance } from "fastify";
import { prisma } from "../../lib/prisma";
import { getPaymentHealthSummary } from "../../services/reconciliation.service";
import { createLogger } from "../../utils/logger";

const log = createLogger("ops-routes");

/** Verify the request carries a valid X-API-Key (SuperAdmin). */
function requireApiKey(request: { headers: Record<string, string | string[] | undefined> }): boolean {
  const apiKeys = process.env.API_KEYS;
  if (!apiKeys) return false;

  const provided = request.headers["x-api-key"];
  if (!provided || typeof provided !== "string") return false;

  const validKeys = apiKeys.split(",").map((k) => k.trim()).filter(Boolean);
  return validKeys.includes(provided.trim());
}

export default async function opsRoutes(server: FastifyInstance) {
  // ── GET /api/v1/ops/payment-health ──────────────────────────────────────
  server.get(
    "/ops/payment-health",
    {
      schema: {
        description: "Operational payment system health snapshot. SuperAdmin only.",
        tags: ["Admin"],
      },
    },

    async (request, reply) => {
      if (!requireApiKey(request as any)) {
        return reply.status(401).send({ success: false, error: "Unauthorized" });
      }

      try {
        const summary = await getPaymentHealthSummary();

        // Determine overall health status
        const isHealthy =
          summary.stuckPayments === 0 &&
          summary.reconciliationRequired === 0 &&
          summary.deadLetterWebhooks === 0 &&
          summary.staleProcessingWebhooks === 0 &&
          summary.manualReviewDrifts === 0;

        const isDegraded =
          !isHealthy &&
          summary.stuckPayments < 5 &&
          summary.deadLetterWebhooks < 10;

        const status = isHealthy ? "healthy" : isDegraded ? "degraded" : "critical";

        log.info({ status, summary }, "Payment health check requested");

        return reply.send({
          success: true,
          data: {
            status,
            ...summary,
          },
        });
      } catch (err) {
        log.error({ err }, "Payment health check failed");
        return reply.status(500).send({ success: false, error: "Failed to fetch payment health" });
      }
    }
  );

  // ── GET /api/v1/ops/reconciliation ──────────────────────────────────────
  server.get(
    "/ops/reconciliation",
    {
      schema: {
        description: "Open drift records and recent reconciliation events. SuperAdmin only.",
        tags: ["Admin"],
      },
    },
    async (request, reply) => {
      if (!requireApiKey(request as any)) {
        return reply.status(401).send({ success: false, error: "Unauthorized" });
      }

      try {
        const [openDrifts, manualReviewDrifts, recentEvents] = await Promise.all([
          prisma.reconciliationDriftRecord.findMany({
            where: { status: { in: ["detected", "repair_attempted"] } },
            orderBy: { detectedAt: "asc" },
            take: 50,
            select: {
              id: true,
              schoolId: true,
              driftType: true,
              entityType: true,
              entityId: true,
              driftReason: true,
              repairAttemptCount: true,
              status: true,
              detectedAt: true,
              lastRepairAttemptAt: true,
            },
          }),
          prisma.reconciliationDriftRecord.findMany({
            where: { status: "manual_review_required" },
            orderBy: { detectedAt: "desc" },
            take: 20,
            select: {
              id: true,
              schoolId: true,
              driftType: true,
              entityId: true,
              driftReason: true,
              repairAttemptCount: true,
              detectedAt: true,
            },
          }),
          prisma.reconciliationAuditEvent.findMany({
            orderBy: { createdAt: "desc" },
            take: 20,
            select: {
              id: true,
              eventType: true,
              schoolId: true,
              entityType: true,
              entityId: true,
              outcome: true,
              createdAt: true,
            },
          }),
        ]);

        return reply.send({
          success: true,
          data: {
            openDrifts,
            manualReviewDrifts,
            recentEvents,
            generatedAt: new Date().toISOString(),
          },
        });
      } catch (err) {
        log.error({ err }, "Reconciliation ops endpoint failed");
        return reply.status(500).send({ success: false, error: "Failed to fetch reconciliation data" });
      }
    }
  );

  // ── GET /api/v1/ops/queue-health ─────────────────────────────────────────
  server.get(
    "/ops/queue-health",
    {
      schema: {
        description: "Webhook event and payment recovery queue status counts. SuperAdmin only.",
        tags: ["Admin"],
      },
    },
    async (request, reply) => {
      if (!requireApiKey(request as any)) {
        return reply.status(401).send({ success: false, error: "Unauthorized" });
      }

      try {
        const staleProcessingCutoff = new Date(Date.now() - 10 * 60 * 1000);

        const [
          webhookByStatus,
          paymentRecoveryBacklog,
          deadLetterWebhooks,
        ] = await Promise.all([
          prisma.webhookEvent.groupBy({
            by: ["status"],
            _count: true,
            orderBy: { _count: { status: "desc" } },
          }),
          // Payments in recovery states (needs BullMQ processing)
          prisma.legacyPayment.count({
            where: {
              activationState: {
                in: ["captured_activation_pending", "activation_failed", "reconciliation_required"],
              },
            },
          }),
          // Webhook events stuck in PROCESSING > 10 min
          prisma.webhookEvent.count({
            where: { status: "PROCESSING", lastAttemptAt: { lt: staleProcessingCutoff } },
          }),
        ]);

        const webhookStatusMap: Record<string, number> = {};
        for (const row of webhookByStatus) {
          webhookStatusMap[row.status] = row._count;
        }

        return reply.send({
          success: true,
          data: {
            webhookEvents: webhookStatusMap,
            paymentRecoveryBacklog,
            staleProcessingWebhooks: deadLetterWebhooks,
            redisConfigured: Boolean(process.env.REDIS_URL),
            generatedAt: new Date().toISOString(),
          },
        });
      } catch (err) {
        log.error({ err }, "Queue health ops endpoint failed");
        return reply.status(500).send({ success: false, error: "Failed to fetch queue health" });
      }
    }
  );
}
