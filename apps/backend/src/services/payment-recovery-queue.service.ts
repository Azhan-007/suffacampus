import { Queue, Worker } from "bullmq";
import { prisma } from "../lib/prisma";
import { processProviderPayment } from "./payment.service";
import { trackError } from "./error-tracking.service";
import { createNotification } from "./notification.service";
import { createLogger } from "../utils/logger";
import { isRedisConfigured, getRedisConnection, closeRedisConnection } from "../lib/redis-connection";

const log = createLogger("payment-recovery-queue");
const PAYMENT_RECOVERY_QUEUE_NAME = "payment-recovery-jobs";
const QUEUE_CONN_NAME = "payment-recovery-queue";
const WORKER_CONN_NAME = "payment-recovery-worker";

type PaymentRecoveryJob = {
  paymentId: string;
  requestedBy?: string;
};

let queue: Queue<PaymentRecoveryJob> | null = null;
let worker: Worker<PaymentRecoveryJob> | null = null;
let initialized = false;

export function isPaymentRecoveryQueueEnabled(): boolean {
  return isRedisConfigured();
}

async function recoverPayment(paymentId: string): Promise<void> {
  const payment = await prisma.legacyPayment.findUnique({
    where: { id: paymentId },
    select: {
      id: true,
      schoolId: true,
      gatewayId: true,
      gatewayOrderId: true,
      amount: true,
      currency: true,
      status: true,
      method: true,
      paymentMethodDetails: true,
      activationState: true,
    },
  });

  if (!payment || !payment.gatewayId) {
    return;
  }

  const notes =
    payment.paymentMethodDetails && typeof payment.paymentMethodDetails === "object"
      ? (payment.paymentMethodDetails as Record<string, unknown>)
      : {};

  const result = await processProviderPayment(payment.gatewayId, payment.gatewayOrderId ?? null, {
    source: "reconcile",
    paymentData: {
      status: "captured",
      amount: Number(payment.amount),
      currency: payment.currency,
      method: payment.method ?? undefined,
      notes: Object.fromEntries(
        Object.entries(notes).map(([key, value]) => [key, String(value)])
      ),
      orderId: payment.gatewayOrderId,
    },
  });

  if (result.activationState !== "activated") {
    throw new Error(result.activationFailureReason ?? "Payment activation still requires reconciliation");
  }
}

export async function initPaymentRecoveryQueue(): Promise<void> {
  if (initialized) return;

  if (!isRedisConfigured()) {
    log.warn("REDIS_URL not set — payment recovery queue disabled; using inline recovery.");
    initialized = true;
    return;
  }

  const queueConn = getRedisConnection(QUEUE_CONN_NAME);
  const workerConn = getRedisConnection(WORKER_CONN_NAME);

  queue = new Queue<PaymentRecoveryJob>(PAYMENT_RECOVERY_QUEUE_NAME, { connection: queueConn });
  worker = new Worker<PaymentRecoveryJob>(
    PAYMENT_RECOVERY_QUEUE_NAME,
    async (job) => {
      log.debug({ jobId: job.id, paymentId: job.data.paymentId, attempt: job.attemptsMade + 1 }, "Processing payment recovery job");
      await recoverPayment(job.data.paymentId);
    },
    { connection: workerConn, concurrency: 3 }
  );

  worker.on("failed", (job, err) => {
    const isDeadLetter = Boolean(job && job.opts.attempts && job.attemptsMade >= job.opts.attempts);
    log.error(
      {
        jobId: job?.id,
        paymentId: job?.data?.paymentId,
        attemptsMade: job?.attemptsMade,
        maxAttempts: job?.opts?.attempts,
        deadLetter: isDeadLetter,
        err,
      },
      "Payment recovery job failed"
    );

    if (isDeadLetter) {
      void (async () => {
        const payment = job?.data?.paymentId
          ? await prisma.legacyPayment.findUnique({ where: { id: job.data.paymentId } })
          : null;

        if (payment?.id) {
          await prisma.legacyPayment.update({
            where: { id: payment.id },
            data: {
              activationState: "reconciliation_required",
              activationLastError: err instanceof Error ? err.message : String(err),
              reconciliationRequiredAt: new Date(),
              reconciliationMarker: `${payment.gatewayId ?? payment.id}:reconciliation_required:${job?.attemptsMade ?? 0}`,
            },
          });
        }

        await trackError({
          error: err,
          schoolId: payment?.schoolId ?? undefined,
          metadata: {
            context: "payment-recovery-queue:dead-letter",
            queue: PAYMENT_RECOVERY_QUEUE_NAME,
            jobId: job?.id,
            paymentId: job?.data?.paymentId,
            attemptsMade: job?.attemptsMade,
            activationState: payment?.activationState,
          },
        });

        if (payment?.schoolId) {
          const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
          const recentEscalation = await prisma.notification.findFirst({
            where: {
              schoolId: payment.schoolId,
              title: "Payment Recovery Failed",
              createdAt: { gte: oneHourAgo },
            },
            orderBy: { createdAt: "desc" },
          });

          if (!recentEscalation) {
            await createNotification(
              {
                title: "Payment Recovery Failed",
                message: "Captured payment recovery retries exhausted. Manual reconciliation is required.",
                type: "ALERT",
                targetType: "SCHOOL",
              },
              {
                userId: "system",
                schoolId: payment.schoolId,
                role: "Admin",
              }
            );
          }
        }
      })().catch((notifyErr) => {
        log.error({ err: notifyErr, jobId: job?.id }, "Failed to process payment recovery dead-letter escalation");
      });
    }
  });

  worker.on("completed", (job) => {
    log.debug({ jobId: job.id, paymentId: job.data.paymentId }, "Payment recovery job completed");
  });

  initialized = true;
  log.info("BullMQ payment recovery queue initialized");
}

export async function shutdownPaymentRecoveryQueue(): Promise<void> {
  if (!initialized) return;

  await worker?.close();
  await queue?.close();
  await closeRedisConnection(QUEUE_CONN_NAME);
  await closeRedisConnection(WORKER_CONN_NAME);

  worker = null;
  queue = null;
  initialized = false;

  log.info("BullMQ payment recovery queue shut down");
}

export async function enqueuePaymentRecovery(
  paymentId: string,
  options?: { delayMs?: number; requestedBy?: string; allowInlineFallback?: boolean }
): Promise<{ queued: true; jobId: string } | { queued: false; inline: boolean; error?: string }> {
  const allowInlineFallback = options?.allowInlineFallback ?? true;

  if (!isRedisConfigured()) {
    if (!allowInlineFallback) {
      return {
        queued: false,
        inline: false,
        error: "Payment recovery queue unavailable (REDIS_URL not configured)",
      };
    }

    setImmediate(() => {
      void recoverPayment(paymentId).catch((err) => {
        log.error({ err, paymentId }, "Inline payment recovery failed");
      });
    });

    return { queued: false, inline: true };
  }

  if (!queue) {
    await initPaymentRecoveryQueue();
  }

  if (!queue) {
    throw new Error("Payment recovery queue was not initialized");
  }

  const job = await queue.add(
    "recover-payment",
    { paymentId, requestedBy: options?.requestedBy },
    {
      jobId: paymentId,
      attempts: 5,
      backoff: { type: "exponential", delay: 1000 },
      delay: options?.delayMs ?? 0,
      removeOnComplete: 100,
      removeOnFail: 500,
    }
  );

  return { queued: true, jobId: String(job.id) };
}
