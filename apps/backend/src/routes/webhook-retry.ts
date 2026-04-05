import type { FastifyInstance } from "fastify";
import { authenticate } from "../middleware/auth";
import { roleMiddleware } from "../middleware/role";
import { enqueueWebhookRetry, getWebhookRetryQueueStats } from "../services/webhook-retry-queue.service";
import { getEmailQueueStats } from "../services/email-queue.service";
import { writeAuditLog } from "../services/audit.service";

export default async function webhookRetryRoutes(server: FastifyInstance) {
  /**
   * POST /webhooks/retry/:failureId
   *
   * Manually re-process a stored webhook failure.
   * Restricted to SuperAdmin — this is a platform-level operation.
   * No tenantGuard: failures are cross-tenant and owned by the platform.
   */
  server.post<{ Params: { failureId: string } }>(
    "/webhooks/retry/:failureId",
    { preHandler: [authenticate, roleMiddleware(["SuperAdmin"])] },
    async (request, reply) => {
      const { failureId } = request.params;

      request.log.info(
        { failureId, uid: request.user.uid },
        "POST /webhooks/retry/:failureId — retrying webhook failure"
      );

      const enqueueResult = await enqueueWebhookRetry(failureId, {
        requestedBy: request.user.uid,
      });

      if (enqueueResult.queued) {
        await writeAuditLog("WEBHOOK_RETRY_QUEUED", request.user.uid, "platform", {
          failureId,
          jobId: enqueueResult.jobId,
        });

        return reply.status(202).send({
          success: true,
          message: "Webhook retry queued successfully",
          jobId: enqueueResult.jobId,
        });
      }

      const result = enqueueResult.result;

      // Audit regardless of outcome so there is a trail for every retry attempt
      await writeAuditLog("WEBHOOK_RETRY", request.user.uid, "platform", {
        failureId,
        result,
      });

      if (!result.success) {
        request.log.error(
          { failureId, error: result.error },
          "POST /webhooks/retry/:failureId — retry failed"
        );
        return reply.status(422).send({
          success: false,
          message: result.error,
        });
      }

      if (result.alreadyResolved) {
        request.log.info(
          { failureId },
          "POST /webhooks/retry/:failureId — already resolved, skipped"
        );
        return reply.status(200).send({
          success: true,
          message: "Failure already resolved — no action taken",
        });
      }

      if (result.duplicate) {
        request.log.info(
          { failureId },
          "POST /webhooks/retry/:failureId — resolved as duplicate payment"
        );
        return reply.status(200).send({
          success: true,
          message: "Payment was already processed — failure marked resolved",
        });
      }

      request.log.info(
        { failureId },
        "POST /webhooks/retry/:failureId — retry successful"
      );

      return reply.status(200).send({
        success: true,
        message: "Webhook failure re-processed successfully",
      });
    }
  );

  /**
   * GET /webhooks/retry/queue-health
   *
   * Queue health for webhook retries and email jobs.
   * SuperAdmin-only operational endpoint.
   */
  server.get(
    "/webhooks/retry/queue-health",
    { preHandler: [authenticate, roleMiddleware(["SuperAdmin"])] },
    async (_request, reply) => {
      const [webhookRetry, email] = await Promise.all([
        getWebhookRetryQueueStats(),
        getEmailQueueStats(),
      ]);

      return reply.status(200).send({
        success: true,
        data: {
          webhookRetry,
          email,
        },
      });
    }
  );
}
