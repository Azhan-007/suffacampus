import { Queue, Worker } from "bullmq";
import IORedis from "ioredis";
import pino from "pino";
import { retryWebhookFailure, type RetryResult } from "./webhook-failure.service";
import { trackError } from "./error-tracking.service";
import { createNotification } from "./notification.service";
import { prisma } from "../lib/prisma";

const log = pino({ name: "webhook-retry-queue" });
const WEBHOOK_RETRY_QUEUE_NAME = "webhook-retry-jobs";

type WebhookRetryJob = {
  failureId: string;
  requestedBy?: string;
};

let queue: Queue<WebhookRetryJob> | null = null;
let worker: Worker<WebhookRetryJob> | null = null;
let connection: IORedis | null = null;
let initialized = false;

function hasRedis(): boolean {
  return Boolean(process.env.REDIS_URL);
}

function getConnection(): IORedis {
  if (connection) return connection;

  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    throw new Error("REDIS_URL is required for webhook retry queue.");
  }

  connection = new IORedis(redisUrl, {
    maxRetriesPerRequest: null,
  });

  return connection;
}

export function isWebhookRetryQueueEnabled(): boolean {
  return hasRedis();
}

export async function initWebhookRetryQueue(): Promise<void> {
  if (initialized) return;

  if (!hasRedis()) {
    log.warn("REDIS_URL not set — webhook retry queue disabled; using inline retry.");
    initialized = true;
    return;
  }

  const redis = getConnection();
  queue = new Queue<WebhookRetryJob>(WEBHOOK_RETRY_QUEUE_NAME, { connection: redis });
  worker = new Worker<WebhookRetryJob>(
    WEBHOOK_RETRY_QUEUE_NAME,
    async (job) => {
      const result = await retryWebhookFailure(job.data.failureId);
      if (!result.success) {
        throw new Error(result.error);
      }
    },
    {
      connection: redis,
      concurrency: 5,
    }
  );

  worker.on("failed", (job, err) => {
    const isDeadLetter = Boolean(job && job.opts.attempts && job.attemptsMade >= job.opts.attempts);

    log.error(
      {
        jobId: job?.id,
        failureId: job?.data?.failureId,
        attemptsMade: job?.attemptsMade,
        maxAttempts: job?.opts?.attempts,
        deadLetter: isDeadLetter,
        err,
      },
      "Webhook retry queue job failed"
    );

    if (isDeadLetter) {
      void (async () => {
        const failureId = job?.data?.failureId;
        const failure = failureId
          ? await prisma.webhookFailure.findUnique({ where: { id: failureId } })
          : null;

        await trackError({
          error: err,
          schoolId: failure?.schoolId ?? undefined,
          metadata: {
            context: "webhook-retry-queue:dead-letter",
            queue: WEBHOOK_RETRY_QUEUE_NAME,
            jobId: job?.id,
            failureId,
            attemptsMade: job?.attemptsMade,
            eventType: failure?.eventType,
          },
        });

        if (failure?.schoolId) {
          const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
          const recentEscalation = await prisma.notification.findFirst({
            where: {
              schoolId: failure.schoolId,
              title: "Webhook Retry Failed",
              createdAt: { gte: oneHourAgo },
            },
            orderBy: { createdAt: "desc" },
          });

          if (!recentEscalation) {
            await createNotification(
              {
                title: "Webhook Retry Failed",
                message: "Automatic webhook retries exhausted. Please review payment/webhook logs.",
                type: "ALERT",
                targetType: "SCHOOL",
              },
              {
                userId: "system",
                schoolId: failure.schoolId,
                role: "Admin",
              }
            );
          }
        }
      })().catch((notifyErr) => {
        log.error({ err: notifyErr, jobId: job?.id }, "Failed to process webhook dead-letter escalation");
      });
    }
  });

  worker.on("completed", (job) => {
    log.debug({ jobId: job.id, failureId: job.data.failureId }, "Webhook retry queue job completed");
  });

  initialized = true;
  log.info("BullMQ webhook retry queue initialized");
}

export async function shutdownWebhookRetryQueue(): Promise<void> {
  if (!initialized) return;

  await worker?.close();
  await queue?.close();
  await connection?.quit();

  worker = null;
  queue = null;
  connection = null;
  initialized = false;

  log.info("BullMQ webhook retry queue shut down");
}

export async function getWebhookRetryQueueStats(): Promise<{
  enabled: boolean;
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  oldestWaitingAgeSeconds: number;
}> {
  if (!hasRedis() || !queue) {
    return {
      enabled: hasRedis(),
      waiting: 0,
      active: 0,
      completed: 0,
      failed: 0,
      delayed: 0,
      oldestWaitingAgeSeconds: 0,
    };
  }

  const counts = await queue.getJobCounts(
    "waiting",
    "active",
    "completed",
    "failed",
    "delayed"
  );

  const waitingJobs = await queue.getJobs(["waiting"], 0, 0, true);
  const oldestWaitingAgeSeconds = waitingJobs[0]
    ? Math.max(0, Math.floor((Date.now() - waitingJobs[0].timestamp) / 1000))
    : 0;

  return {
    enabled: true,
    waiting: counts.waiting ?? 0,
    active: counts.active ?? 0,
    completed: counts.completed ?? 0,
    failed: counts.failed ?? 0,
    delayed: counts.delayed ?? 0,
    oldestWaitingAgeSeconds,
  };
}

export async function enqueueWebhookRetry(
  failureId: string,
  options?: { delayMs?: number; requestedBy?: string; allowInlineFallback?: boolean }
): Promise<{ queued: true; jobId: string } | { queued: false; result: RetryResult }> {
  const allowInlineFallback = options?.allowInlineFallback ?? true;

  if (!hasRedis()) {
    if (!allowInlineFallback) {
      return {
        queued: false,
        result: {
          success: false,
          error: "Webhook retry queue unavailable (REDIS_URL not configured)",
        },
      };
    }

    const result = await retryWebhookFailure(failureId);
    return { queued: false, result };
  }

  if (!queue) {
    await initWebhookRetryQueue();
  }

  if (!queue) {
    throw new Error("Webhook retry queue was not initialized");
  }

  const job = await queue.add(
    "retry-webhook",
    { failureId, requestedBy: options?.requestedBy },
    {
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
