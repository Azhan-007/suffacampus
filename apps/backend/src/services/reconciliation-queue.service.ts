import { Queue, Worker } from "bullmq";
import { createLogger } from "../utils/logger";
import { trackError } from "./error-tracking.service";
import {
  runFullReconciliation,
  runRepairSweep,
  detectCapturedNotActivated,
  detectStalePendingPayments,
  detectRefundMismatches,
} from "./reconciliation.service";
import { isRedisConfigured, getRedisConnection, closeRedisConnection } from "../lib/redis-connection";

const log = createLogger("reconciliation-queue");
const QUEUE_NAME = "reconciliation-jobs";
const QUEUE_CONN_NAME = "reconciliation-queue";
const WORKER_CONN_NAME = "reconciliation-worker";

type ReconciliationJobType =
  | "full-reconciliation"
  | "repair-sweep"
  | "detect-captured-not-activated"
  | "detect-stale-pending"
  | "detect-refund-mismatches";

interface ReconciliationJobData {
  type: ReconciliationJobType;
  requestedBy?: string;
}

let queue: Queue<ReconciliationJobData> | null = null;
let worker: Worker<ReconciliationJobData> | null = null;
let initialized = false;

async function processJob(type: ReconciliationJobType): Promise<void> {
  switch (type) {
    case "full-reconciliation":
      await runFullReconciliation();
      break;
    case "repair-sweep":
      await runRepairSweep();
      break;
    case "detect-captured-not-activated":
      await detectCapturedNotActivated();
      break;
    case "detect-stale-pending":
      await detectStalePendingPayments();
      break;
    case "detect-refund-mismatches":
      await detectRefundMismatches();
      break;
    default:
      log.warn({ type }, "Unknown reconciliation job type");
  }
}

export async function initReconciliationQueue(): Promise<void> {
  if (initialized) return;

  if (!isRedisConfigured()) {
    log.warn("REDIS_URL not set — reconciliation queue disabled; reconciliation runs inline via cron.");
    initialized = true;
    return;
  }

  const queueConn = getRedisConnection(QUEUE_CONN_NAME);
  const workerConn = getRedisConnection(WORKER_CONN_NAME);

  queue = new Queue<ReconciliationJobData>(QUEUE_NAME, { connection: queueConn });
  worker = new Worker<ReconciliationJobData>(
    QUEUE_NAME,
    async (job) => {
      log.info({ jobId: job.id, type: job.data.type }, "Processing reconciliation job");
      await processJob(job.data.type);
    },
    { connection: workerConn, concurrency: 1 }
  );

  worker.on("failed", (job, err) => {
    const isDeadLetter = Boolean(job && job.opts.attempts && job.attemptsMade >= job.opts.attempts);
    log.error({
      jobId: job?.id,
      type: job?.data?.type,
      attemptsMade: job?.attemptsMade,
      deadLetter: isDeadLetter,
      err,
    }, "Reconciliation job failed");

    if (isDeadLetter) {
      trackError({
        error: err,
        metadata: {
          context: "reconciliation-queue:dead-letter",
          queue: QUEUE_NAME,
          jobId: job?.id,
          type: job?.data?.type,
        },
      });
    }
  });

  worker.on("completed", (job) => {
    log.debug({ jobId: job.id, type: job.data.type }, "Reconciliation job completed");
  });

  initialized = true;
  log.info("BullMQ reconciliation queue initialized");
}

export async function shutdownReconciliationQueue(): Promise<void> {
  if (!initialized) return;
  await worker?.close();
  await queue?.close();
  await closeRedisConnection(QUEUE_CONN_NAME);
  await closeRedisConnection(WORKER_CONN_NAME);
  worker = null;
  queue = null;
  initialized = false;
  log.info("BullMQ reconciliation queue shut down");
}

export async function enqueueReconciliationJob(
  type: ReconciliationJobType,
  options?: { delayMs?: number; requestedBy?: string }
): Promise<{ queued: boolean }> {
  if (!isRedisConfigured()) {
    // Run inline as fallback
    setImmediate(() => {
      void processJob(type).catch((err) => {
        log.error({ err, type }, "Inline reconciliation job failed");
      });
    });
    return { queued: false };
  }

  if (!queue) await initReconciliationQueue();
  if (!queue) throw new Error("Reconciliation queue was not initialized");

  await queue.add(
    type,
    { type, requestedBy: options?.requestedBy },
    {
      jobId: `${type}-${Date.now()}`,
      attempts: 3,
      backoff: { type: "exponential", delay: 5000 },
      delay: options?.delayMs ?? 0,
      removeOnComplete: 50,
      removeOnFail: 200,
    }
  );

  return { queued: true };
}
