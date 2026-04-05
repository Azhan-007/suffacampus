import { Queue, Worker } from "bullmq";
import IORedis from "ioredis";
import pino from "pino";
import { sendEmail, type EmailPayload } from "./notification.service";
import { trackError } from "./error-tracking.service";

const log = pino({ name: "email-queue" });
const EMAIL_QUEUE_NAME = "email-jobs";

let queue: Queue<EmailPayload> | null = null;
let worker: Worker<EmailPayload> | null = null;
let connection: IORedis | null = null;
let initialized = false;

function hasRedis(): boolean {
  return Boolean(process.env.REDIS_URL);
}

function getConnection(): IORedis {
  if (connection) return connection;

  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    throw new Error("REDIS_URL is required for BullMQ email queue.");
  }

  connection = new IORedis(redisUrl, {
    maxRetriesPerRequest: null,
  });

  return connection;
}

export function isEmailQueueEnabled(): boolean {
  return hasRedis();
}

export async function getEmailQueueStats(): Promise<{
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

export async function initEmailQueue(): Promise<void> {
  if (initialized) return;

  if (!hasRedis()) {
    log.warn("REDIS_URL not set — email queue disabled; using inline email sending.");
    initialized = true;
    return;
  }

  const redis = getConnection();
  queue = new Queue<EmailPayload>(EMAIL_QUEUE_NAME, { connection: redis });
  worker = new Worker<EmailPayload>(
    EMAIL_QUEUE_NAME,
    async (job) => {
      const ok = await sendEmail(job.data);
      if (!ok) {
        throw new Error(`Email delivery failed for ${job.data.to}`);
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
        attemptsMade: job?.attemptsMade,
        maxAttempts: job?.opts?.attempts,
        deadLetter: isDeadLetter,
        recipient: job?.data?.to,
        err,
      },
      "Email queue job failed"
    );

    if (isDeadLetter) {
      void trackError({
        error: err,
        metadata: {
          context: "email-queue:dead-letter",
          queue: EMAIL_QUEUE_NAME,
          jobId: job?.id,
          recipient: job?.data?.to,
          attemptsMade: job?.attemptsMade,
        },
      });
    }
  });

  worker.on("completed", (job) => {
    log.debug({ jobId: job.id, recipient: job.data.to }, "Email queue job completed");
  });

  initialized = true;
  log.info("BullMQ email queue initialized");
}

export async function shutdownEmailQueue(): Promise<void> {
  if (!initialized) return;

  await worker?.close();
  await queue?.close();
  await connection?.quit();

  worker = null;
  queue = null;
  connection = null;
  initialized = false;

  log.info("BullMQ email queue shut down");
}

export async function enqueueEmail(payload: EmailPayload): Promise<void> {
  if (!hasRedis()) {
    // Fallback mode for local/single-instance setups without Redis.
    await sendEmail(payload);
    return;
  }

  if (!queue) {
    await initEmailQueue();
  }

  if (!queue) {
    throw new Error("Email queue was not initialized");
  }

  await queue.add("send-email", payload, {
    attempts: 5,
    backoff: {
      type: "exponential",
      delay: 1000,
    },
    removeOnComplete: 100,
    removeOnFail: 500,
  });
}
