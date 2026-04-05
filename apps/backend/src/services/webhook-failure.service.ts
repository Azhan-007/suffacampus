import pino from "pino";
import { prisma } from "../lib/prisma";
import { handlePaymentCaptured, type PaymentCapturedPayload } from "./payment.service";

const log = pino({ name: "webhook-failure" });

export type WebhookFailureStatus = "failed" | "retrying" | "resolved";

export interface LogWebhookFailureOptions {
  eventType: string;
  razorpayEventId?: string | null;
  schoolId?: string | null;
  rawPayload: string;
  error: unknown;
}

/**
 * Persist a webhook processing failure. Never throws.
 */
export async function logWebhookFailure(options: LogWebhookFailureOptions): Promise<string | null> {
  try {
    const errorMessage = options.error instanceof Error ? options.error.message : String(options.error);
    const errorStack = options.error instanceof Error ? (options.error.stack ?? null) : null;

    const record = await prisma.webhookFailure.create({
      data: {
        eventType: options.eventType,
        razorpayEventId: options.razorpayEventId ?? null,
        schoolId: options.schoolId ?? null,
        rawPayload: options.rawPayload,
        errorMessage,
        errorStack,
        retryCount: 0,
        status: "failed",
      },
    });

    return record.id;
  } catch (loggingErr) {
    log.error({ err: loggingErr }, "Failed to log webhook failure");
    return null;
  }
}

export type RetryResult =
  | { success: true; alreadyResolved: boolean; duplicate: boolean }
  | { success: false; error: string };

export async function retryWebhookFailure(failureId: string): Promise<RetryResult> {
  const failure = await prisma.webhookFailure.findUnique({ where: { id: failureId } });
  if (!failure) return { success: false, error: "Webhook failure record not found" };

  if (failure.status === "resolved") return { success: true, alreadyResolved: true, duplicate: false };

  const now = new Date();
  await prisma.webhookFailure.update({ where: { id: failureId }, data: { status: "retrying", lastRetriedAt: now } });

  try {
    let payload: PaymentCapturedPayload;
    try {
      payload = JSON.parse(failure.rawPayload) as PaymentCapturedPayload;
    } catch {
      await prisma.webhookFailure.update({
        where: { id: failureId },
        data: { status: "failed", retryCount: { increment: 1 }, lastRetriedAt: now, errorMessage: "rawPayload is not valid JSON" },
      });
      return { success: false, error: "rawPayload is not valid JSON" };
    }

    if (failure.eventType === "payment.captured") {
      const processed = await handlePaymentCaptured(payload);

      await prisma.webhookFailure.update({
        where: { id: failureId },
        data: {
          status: "resolved", retryCount: { increment: 1 }, lastRetriedAt: now, resolvedAt: now,
          errorMessage: processed ? failure.errorMessage : "Resolved as duplicate — payment already processed",
        },
      });

      return { success: true, alreadyResolved: false, duplicate: !processed };
    }

    // Unsupported event type — mark resolved
    await prisma.webhookFailure.update({
      where: { id: failureId },
      data: { status: "resolved", retryCount: { increment: 1 }, lastRetriedAt: now, resolvedAt: now, errorMessage: `Event type "${failure.eventType}" has no retry handler — marked resolved` },
    });

    return { success: true, alreadyResolved: false, duplicate: false };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    await prisma.webhookFailure.update({
      where: { id: failureId },
      data: { status: "failed", retryCount: { increment: 1 }, lastRetriedAt: now, errorMessage, errorStack: err instanceof Error ? (err.stack ?? null) : null },
    });
    return { success: false, error: errorMessage };
  }
}
