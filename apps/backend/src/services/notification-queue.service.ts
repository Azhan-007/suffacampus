import { Worker, type JobsOptions } from "bullmq";
import pino from "pino";
import { prisma } from "../lib/prisma";
import {
  NotificationPreferenceService,
  type NotificationPreferenceType,
} from "./notification-preference.service";
import { sendEmail } from "./notification.service";
import {
  sendToRoleTopic,
  sendToSchool,
  sendToUserInSchool,
  type PushNotificationPayload,
} from "./push-notification.service";
import { getNotificationQueue, getNotificationQueueConnection } from "./queue";

const log = pino({ name: "notification-queue" });

export const NOTIFICATION_JOB_NAME = "notifications.send";

export interface NotificationJobData {
  notificationId: string;
  schoolId: string;
  targetType: "USER" | "ROLE" | "SCHOOL";
  targetId?: string | null;
  title: string;
  message: string;
  referenceId?: string | null;
  referenceType?: string | null;
}

type DeliveryChannel = "PUSH" | "EMAIL";

type NotificationDeliveryDelegateCompat = {
  findFirst?: (args: {
    where: { notificationId: string; channel: DeliveryChannel };
  }) => Promise<unknown>;
  create?: (args: {
    data: { notificationId: string; channel: DeliveryChannel };
  }) => Promise<unknown>;
};

const NOTIFICATION_JOB_OPTIONS: JobsOptions = {
  attempts: 3,
  backoff: {
    type: "exponential",
    delay: 1000,
  },
  removeOnComplete: 100,
  removeOnFail: 500,
};

let worker: Worker<NotificationJobData> | null = null;
let initialized = false;

function hasRedis(): boolean {
  return Boolean(process.env.REDIS_URL);
}

export function isNotificationQueueEnabled(): boolean {
  return hasRedis();
}

function getNotificationDeliveryDelegate(): NotificationDeliveryDelegateCompat | undefined {
  return (prisma as unknown as { notificationDelivery?: NotificationDeliveryDelegateCompat })
    .notificationDelivery;
}

function deliveryKey(notificationId: string, channel: DeliveryChannel): string {
  return `${notificationId}:${channel}`;
}

async function hasChannelDelivery(
  notificationId: string,
  channel: DeliveryChannel
): Promise<boolean> {
  const deliveryDelegate = getNotificationDeliveryDelegate();

  const existing = await deliveryDelegate?.findFirst?.({
    where: { notificationId, channel },
  });

  return Boolean(existing);
}

async function markChannelDelivered(
  notificationId: string,
  channel: DeliveryChannel
): Promise<void> {
  const deliveryDelegate = getNotificationDeliveryDelegate();
  if (!deliveryDelegate?.create) return;

  try {
    await deliveryDelegate.create({
      data: { notificationId, channel },
    });
  } catch (error: unknown) {
    const code =
      typeof error === "object" && error !== null && "code" in error
        ? (error as { code?: string }).code
        : undefined;

    // Unique(notificationId, channel): another attempt already recorded delivery.
    if (code === "P2002") return;
    throw error;
  }
}

function resolvePreferenceType(referenceType?: string | null): NotificationPreferenceType {
  if (referenceType === "ATTENDANCE") return "ATTENDANCE";
  if (referenceType === "FEE" || referenceType === "PAYMENT") return "FEES";
  if (referenceType === "RESULTS") return "RESULTS";
  return "GENERAL";
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildEmailHtml(data: NotificationJobData): string {
  const safeTitle = escapeHtml(data.title);
  const safeMessage = escapeHtml(data.message).replace(/\n/g, "<br />");
  return `<h3>${safeTitle}</h3><p>${safeMessage}</p>`;
}

async function processPush(data: NotificationJobData): Promise<void> {
  if (await hasChannelDelivery(data.notificationId, "PUSH")) {
    log.debug(
      {
        deliveryKey: deliveryKey(data.notificationId, "PUSH"),
      },
      "Skipping PUSH channel: already delivered"
    );
    return;
  }

  const payload: PushNotificationPayload = {
    title: data.title,
    body: data.message,
    data: {
      notificationId: data.notificationId,
      ...(data.referenceId ? { referenceId: data.referenceId } : {}),
      ...(data.referenceType ? { referenceType: data.referenceType } : {}),
    },
  };

  if (data.targetType === "USER" && data.targetId) {
    const result = await sendToUserInSchool(data.targetId, data.schoolId, payload);
    if (result.invalidTokens.length > 0) {
      log.warn(
        {
          notificationId: data.notificationId,
          schoolId: data.schoolId,
          invalidTokens: result.invalidTokens.length,
        },
        "Invalid FCM tokens cleaned up"
      );
    }
    return;
  }

  if (data.targetType === "ROLE" && data.targetId) {
    await sendToRoleTopic(data.schoolId, data.targetId, payload);
    await markChannelDelivered(data.notificationId, "PUSH");
    return;
  }

  await sendToSchool(data.schoolId, payload);
  await markChannelDelivered(data.notificationId, "PUSH");
}

type EmailRecipient = {
  uid: string;
  email: string;
};

async function resolveEmailRecipients(data: NotificationJobData): Promise<EmailRecipient[]> {
  if (data.targetType === "USER") {
    if (!data.targetId) return [];

    const user = await prisma.user.findFirst({
      where: {
        uid: data.targetId,
        schoolId: data.schoolId,
        isActive: true,
      },
      select: {
        uid: true,
        email: true,
      },
    });

    return user && user.email ? [user] : [];
  }

  if (data.targetType === "ROLE") {
    if (!data.targetId) return [];

    return prisma.user.findMany({
      where: {
        schoolId: data.schoolId,
        role: data.targetId as any,
        isActive: true,
      },
      select: {
        uid: true,
        email: true,
      },
    }).then((rows) => rows.filter((row) => Boolean(row.email)) as EmailRecipient[]);
  }

  return prisma.user.findMany({
    where: {
      schoolId: data.schoolId,
      isActive: true,
    },
    select: {
      uid: true,
      email: true,
    },
  }).then((rows) => rows.filter((row) => Boolean(row.email)) as EmailRecipient[]);
}

async function processEmail(data: NotificationJobData): Promise<void> {
  if (await hasChannelDelivery(data.notificationId, "EMAIL")) {
    log.debug(
      {
        deliveryKey: deliveryKey(data.notificationId, "EMAIL"),
      },
      "Skipping EMAIL channel: already delivered"
    );
    return;
  }

  const recipients = await resolveEmailRecipients(data);
  if (recipients.length === 0) return;

  const preferenceType = resolvePreferenceType(data.referenceType);

  for (const recipient of recipients) {
    const emailEnabled = await NotificationPreferenceService.shouldSendNotification(
      recipient.uid,
      data.schoolId,
      preferenceType,
      "email"
    );

    if (!emailEnabled) continue;

    const sent = await sendEmail({
      to: recipient.email,
      subject: data.title,
      html: buildEmailHtml(data),
      text: data.message,
    });

    if (!sent) {
      throw new Error(`Failed to send email for notification ${data.notificationId}`);
    }
  }

  await markChannelDelivered(data.notificationId, "EMAIL");
}

async function processNotificationJob(data: NotificationJobData): Promise<void> {
  const [pushResult, emailResult] = await Promise.allSettled([
    processPush(data),
    processEmail(data),
  ]);

  const failures: string[] = [];

  if (pushResult.status === "rejected") {
    const message =
      pushResult.reason instanceof Error
        ? pushResult.reason.message
        : String(pushResult.reason);
    failures.push(`push: ${message}`);
  }

  if (emailResult.status === "rejected") {
    const message =
      emailResult.reason instanceof Error
        ? emailResult.reason.message
        : String(emailResult.reason);
    failures.push(`email: ${message}`);
  }

  if (failures.length > 0) {
    throw new Error(
      `Notification delivery failed for ${data.notificationId} (${failures.join(" | ")})`
    );
  }
}

export async function enqueueNotificationJob(data: NotificationJobData): Promise<string> {
  if (!hasRedis()) {
    log.warn(
      { notificationId: data.notificationId },
      "REDIS_URL not set - notification job not enqueued"
    );
    return data.notificationId;
  }

  const queue = getNotificationQueue();
  if (!queue) {
    log.warn(
      { notificationId: data.notificationId },
      "Notification queue unavailable - job not enqueued"
    );
    return data.notificationId;
  }

  const job = await queue.add(
    NOTIFICATION_JOB_NAME,
    data,
    {
      ...NOTIFICATION_JOB_OPTIONS,
      jobId: data.notificationId,
    }
  );

  return String(job.id);
}

export async function initNotificationQueueWorker(): Promise<void> {
  if (initialized) return;

  if (!hasRedis()) {
    log.warn("REDIS_URL not set - notification queue worker disabled.");
    initialized = true;
    return;
  }

  const queue = getNotificationQueue();
  const connection = getNotificationQueueConnection();

  if (!queue || !connection) {
    log.warn("Notification queue worker disabled - queue connection unavailable.");
    initialized = true;
    return;
  }

  worker = new Worker<NotificationJobData>(
    queue.name,
    async (job) => {
      await processNotificationJob(job.data);
    },
    {
      connection,
      concurrency: 5,
      limiter: {
        max: 100,
        duration: 1000,
      },
    }
  );

  worker.on("failed", (job, err) => {
    const isDeadLetter = Boolean(
      job && job.opts.attempts && job.attemptsMade >= job.opts.attempts
    );
    log.error(
      {
        jobId: job?.id,
        notificationId: job?.data?.notificationId,
        attemptsMade: job?.attemptsMade,
        maxAttempts: job?.opts?.attempts,
        deadLetter: isDeadLetter,
        error: err?.message,
        stack: err?.stack,
        err,
      },
      "Notification queue job failed"
    );
  });

  worker.on("completed", (job) => {
    log.debug(
      {
        jobId: job.id,
        notificationId: job.data.notificationId,
      },
      "Notification queue job completed"
    );
  });

  initialized = true;
  log.info("BullMQ notification queue worker initialized");
}

export async function shutdownNotificationQueueWorker(): Promise<void> {
  if (!initialized) return;

  await worker?.close();
  worker = null;
  initialized = false;

  log.info("BullMQ notification queue worker shut down");
}
