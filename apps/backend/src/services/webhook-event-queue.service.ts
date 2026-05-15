import { Queue, Worker } from "bullmq";
import { processWebhookEventById } from "./webhook-event.service";
import { trackError } from "./error-tracking.service";
import { createNotification } from "./notification.service";
import { prisma } from "../lib/prisma";
import { createLogger } from "../utils/logger";
import { isRedisConfigured, getRedisConnection, closeRedisConnection } from "../lib/redis-connection";

const log = createLogger("webhook-event-queue");
const WEBHOOK_EVENT_QUEUE_NAME = "webhook-event-jobs";
const QUEUE_CONN_NAME = "webhook-event-queue";
const WORKER_CONN_NAME = "webhook-event-worker";

type WebhookEventJob = {
  webhookEventId: string;
  requestedBy?: string;
};

let queue: Queue<WebhookEventJob> | null = null;
let worker: Worker<WebhookEventJob> | null = null;
let initialized = false;

export function isWebhookEventQueueEnabled(): boolean {
  return isRedisConfigured();
}

export async function initWebhookEventQueue(): Promise<void> {
  if (initialized) return;

  if (!isRedisConfigured()) {
    log.warn("REDIS_URL not set — webhook event queue disabled; using inline processing.");
    initialized = true;
    return;
  }

  const queueConn = getRedisConnection(QUEUE_CONN_NAME);
  const workerConn = getRedisConnection(WORKER_CONN_NAME);

  queue = new Queue<WebhookEventJob>(WEBHOOK_EVENT_QUEUE_NAME, { connection: queueConn });
  worker = new Worker<WebhookEventJob>(
    WEBHOOK_EVENT_QUEUE_NAME,
    async (job) => {
      log.debug({ jobId: job.id, webhookEventId: job.data.webhookEventId, attempt: job.attemptsMade + 1 }, "Processing webhook event job");
      const result = await processWebhookEventById(job.data.webhookEventId);
      if (!result.success) {
        throw new Error(result.error ?? "Webhook event processing failed");
      }
    },
    {
      connection: workerConn,
      concurrency: 5,
    }
  );

  worker.on("failed", (job, err) => {
    const isDeadLetter = Boolean(job && job.opts.attempts && job.attemptsMade >= job.opts.attempts);

    log.error(
      {
        jobId: job?.id,
        webhookEventId: job?.data?.webhookEventId,
        attemptsMade: job?.attemptsMade,
        maxAttempts: job?.opts?.attempts,
        deadLetter: isDeadLetter,
        err,
      },
      "Webhook event queue job failed"
    );

    if (isDeadLetter) {
      void (async () => {
        const eventId = job?.data?.webhookEventId;
        const event = eventId
          ? await prisma.webhookEvent.findUnique({ where: { id: eventId } })
          : null;

        if (eventId) {
          await prisma.webhookEvent.updateMany({
            where: { id: eventId },
            data: {
              status: "DEAD_LETTER",
              deadLetteredAt: new Date(),
              failureReason: err instanceof Error ? err.message : String(err),
            },
          });
        }

        await trackError({
          error: err,
          schoolId: event?.schoolId ?? undefined,
          metadata: {
            context: "webhook-event-queue:dead-letter",
            queue: WEBHOOK_EVENT_QUEUE_NAME,
            jobId: job?.id,
            webhookEventId: eventId,
            attemptsMade: job?.attemptsMade,
            eventType: event?.eventType,
            provider: event?.provider,
          },
        });

        if (event?.schoolId) {
          const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
          const recentEscalation = await prisma.notification.findFirst({
            where: {
              schoolId: event.schoolId,
              title: "Webhook Processing Failed",
              createdAt: { gte: oneHourAgo },
            },
            orderBy: { createdAt: "desc" },
          });

          if (!recentEscalation) {
            await createNotification(
              {
                title: "Webhook Processing Failed",
                message: "Payment webhook retries exhausted. Please review payment/webhook logs.",
                type: "ALERT",
                targetType: "SCHOOL",
              },
              {
                userId: "system",
                schoolId: event.schoolId,
                role: "Admin",
              }
            );
          }
        }
      })().catch((notifyErr) => {
        log.error({ err: notifyErr, jobId: job?.id }, "Failed to process webhook event dead-letter escalation");
      });
    }
  });

  worker.on("completed", (job) => {
    log.debug({ jobId: job.id, webhookEventId: job.data.webhookEventId }, "Webhook event queue job completed");
  });

  initialized = true;
  log.info("BullMQ webhook event queue initialized");
}

export async function shutdownWebhookEventQueue(): Promise<void> {
  if (!initialized) return;

  await worker?.close();
  await queue?.close();
  await closeRedisConnection(QUEUE_CONN_NAME);
  await closeRedisConnection(WORKER_CONN_NAME);

  worker = null;
  queue = null;
  initialized = false;

  log.info("BullMQ webhook event queue shut down");
}

export async function enqueueWebhookEventProcessing(
  webhookEventId: string,
  options?: { delayMs?: number; requestedBy?: string; allowInlineFallback?: boolean }
): Promise<
  | { queued: true; jobId: string }
  | { queued: false; inline: boolean; error?: string }
> {
  const allowInlineFallback = options?.allowInlineFallback ?? true;

  if (!isRedisConfigured()) {
    if (!allowInlineFallback) {
      return {
        queued: false,
        inline: false,
        error: "Webhook event queue unavailable (REDIS_URL not configured)",
      };
    }

    setImmediate(() => {
      void processWebhookEventById(webhookEventId).catch((err) => {
        log.error({ err, webhookEventId }, "Inline webhook event processing failed");
      });
    });

    return { queued: false, inline: true };
  }

  if (!queue) {
    await initWebhookEventQueue();
  }

  if (!queue) {
    throw new Error("Webhook event queue was not initialized");
  }

  const job = await queue.add(
    "process-webhook-event",
    { webhookEventId, requestedBy: options?.requestedBy },
    {
      jobId: webhookEventId,
      attempts: 5,
      backoff: {
        type: "exponential",
        delay: 1000,
      },
      delay: options?.delayMs ?? 0,
      removeOnComplete: 100,
      removeOnFail: 500,
    }
  );

  return { queued: true, jobId: String(job.id) };
}
