/**
 * Push notification service — Firebase Cloud Messaging (FCM).
 * Device token storage moved to PostgreSQL via Prisma.
 * FCM sending logic remains unchanged (FCM SDK).
 */

import pino from "pino";
import { admin } from "../lib/firebase-admin";
import { prisma } from "../lib/prisma";
import { assertSchoolScope } from "../lib/tenant-scope";

const log = pino({ name: "push-notification" });

export interface PushNotificationPayload {
  title: string;
  body: string;
  imageUrl?: string;
  actionUrl?: string;
  data?: Record<string, string>;
}

export interface SendResult { successCount: number; failureCount: number; invalidTokens: string[]; }

function isInvalidTokenErrorCode(code?: string): boolean {
  return (
    code === "messaging/invalid-registration-token" ||
    code === "messaging/registration-token-not-registered"
  );
}

function normalizeRole(role?: string | null): string | null {
  if (!role) return null;
  const trimmed = role.trim();
  return trimmed.length > 0 ? trimmed : null;
}

// Device token management — Prisma

export async function registerDeviceToken(params: {
  userId: string;
  schoolId: string;
  token: string;
  role?: string;
}) {
  assertSchoolScope(params.schoolId);

  const existing = await prisma.deviceToken.findFirst({
    where: {
      token: params.token,
      userId: params.userId,
      schoolId: params.schoolId,
    },
  });

  const role = normalizeRole(params.role);

  if (existing) {
    try {
      await admin.messaging().subscribeToTopic([params.token], `school_${params.schoolId}`);
      if (role) {
        await admin.messaging().subscribeToTopic(
          [params.token],
          `school_${params.schoolId}_role_${role}`
        );
      }
    } catch (err) {
      log.warn({ err }, "Failed to subscribe existing token to FCM topics");
    }

    return existing;
  }

  const deviceToken = await prisma.deviceToken.create({
    data: { userId: params.userId, schoolId: params.schoolId, token: params.token },
  }).catch(async (err: unknown) => {
    // Handle race on composite unique(token,userId,schoolId) without requiring upsert.
    const known = await prisma.deviceToken.findFirst({
      where: {
        token: params.token,
        userId: params.userId,
        schoolId: params.schoolId,
      },
    });
    if (known) return known;
    throw err;
  });

  try {
    await admin.messaging().subscribeToTopic([params.token], `school_${params.schoolId}`);
    if (role) {
      await admin.messaging().subscribeToTopic(
        [params.token],
        `school_${params.schoolId}_role_${role}`
      );
    }
  } catch (err) {
    log.warn({ err }, "Failed to subscribe token to FCM topics");
  }

  return deviceToken;
}

export async function removeDeviceToken(params: {
  token: string;
  userId?: string;
  schoolId?: string;
  role?: string;
}): Promise<boolean> {
  if (params.schoolId !== undefined) {
    assertSchoolScope(params.schoolId);
  }

  const where = {
    token: params.token,
    ...(params.userId ? { userId: params.userId } : {}),
    ...(params.schoolId ? { schoolId: params.schoolId } : {}),
  };

  const existing = await prisma.deviceToken.findMany({ where, take: 50 });
  if (existing.length === 0) return false;

  await prisma.deviceToken.deleteMany({ where });

  const role = normalizeRole(params.role);
  if (params.schoolId) {
    const remainingInSchool = await prisma.deviceToken.count({
      where: {
        token: params.token,
        schoolId: params.schoolId,
      },
    });

    if (remainingInSchool === 0) {
      try {
        await admin.messaging().unsubscribeFromTopic(
          [params.token],
          `school_${params.schoolId}`
        );
      } catch (_) {}
    }

    if (role) {
      try {
        await admin.messaging().unsubscribeFromTopic(
          [params.token],
          `school_${params.schoolId}_role_${role}`
        );
      } catch (_) {}
    }
  }

  return true;
}

export async function getUserTokens(userId: string) {
  return prisma.deviceToken.findMany({ where: { userId }, take: 1000 });
}

export async function getSchoolTokens(schoolId: string) {
  assertSchoolScope(schoolId);

  return prisma.deviceToken.findMany({ where: { schoolId }, take: 1000 });
}

// Send push notifications

export async function sendToUsers(userIds: string[], payload: PushNotificationPayload): Promise<SendResult> {
  const tokens = await prisma.deviceToken.findMany({ where: { userId: { in: userIds } }, select: { token: true } });
  const uniqueTokens = [...new Set(tokens.map((t: { token: string }) => t.token))];
  if (uniqueTokens.length === 0) return { successCount: 0, failureCount: 0, invalidTokens: [] };
  return sendToTokens(uniqueTokens, payload);
}

export async function sendToUserInSchool(
  userId: string,
  schoolId: string,
  payload: PushNotificationPayload
): Promise<SendResult> {
  assertSchoolScope(schoolId);

  const tokens = await prisma.deviceToken.findMany({
    where: { userId, schoolId },
    select: { token: true },
  });
  const uniqueTokens = [...new Set(tokens.map((t: { token: string }) => t.token))];
  if (uniqueTokens.length === 0) return { successCount: 0, failureCount: 0, invalidTokens: [] };
  return sendToTokens(uniqueTokens, payload);
}

export async function sendToRoleTopic(
  schoolId: string,
  role: string,
  payload: PushNotificationPayload
): Promise<string> {
  assertSchoolScope(schoolId);

  const message: admin.messaging.Message = {
    topic: `school_${schoolId}_role_${role}`,
    notification: { title: payload.title, body: payload.body, imageUrl: payload.imageUrl },
    data: { ...payload.data, actionUrl: payload.actionUrl ?? "" },
    android: { priority: "high", notification: { channelId: "SuffaCampus_default", clickAction: "FLUTTER_NOTIFICATION_CLICK" } },
    apns: { payload: { aps: { badge: 1, sound: "default" } } },
    webpush: { fcmOptions: { link: payload.actionUrl } },
  };

  return admin.messaging().send(message);
}

export async function sendToSchool(schoolId: string, payload: PushNotificationPayload): Promise<string> {
  assertSchoolScope(schoolId);

  const message: admin.messaging.Message = {
    topic: `school_${schoolId}`,
    notification: { title: payload.title, body: payload.body, imageUrl: payload.imageUrl },
    data: { ...payload.data, actionUrl: payload.actionUrl ?? "" },
    android: { priority: "high", notification: { channelId: "SuffaCampus_default", clickAction: "FLUTTER_NOTIFICATION_CLICK" } },
    apns: { payload: { aps: { badge: 1, sound: "default" } } },
    webpush: { fcmOptions: { link: payload.actionUrl } },
  };
  return admin.messaging().send(message);
}

async function sendToTokens(tokens: string[], payload: PushNotificationPayload): Promise<SendResult> {
  if (tokens.length === 0) return { successCount: 0, failureCount: 0, invalidTokens: [] };

  // FCM limits sendEachForMulticast to 500 tokens per call
  const FCM_BATCH_SIZE = 500;
  let totalSuccess = 0;
  let totalFailure = 0;
  const allInvalidTokens: string[] = [];

  for (let i = 0; i < tokens.length; i += FCM_BATCH_SIZE) {
    const batch = tokens.slice(i, i + FCM_BATCH_SIZE);

    const message: admin.messaging.MulticastMessage = {
      tokens: batch,
      notification: { title: payload.title, body: payload.body, imageUrl: payload.imageUrl },
      data: { ...payload.data, actionUrl: payload.actionUrl ?? "" },
      android: { priority: "high", notification: { channelId: "SuffaCampus_default", clickAction: "FLUTTER_NOTIFICATION_CLICK" } },
      apns: { payload: { aps: { badge: 1, sound: "default" } } },
    };

    const response = await admin.messaging().sendEachForMulticast(message);
    totalSuccess += response.successCount;
    totalFailure += response.failureCount;

    response.responses.forEach((res, idx) => {
      if (!res.success) {
        const code = res.error?.code;
        if (isInvalidTokenErrorCode(code)) {
          allInvalidTokens.push(batch[idx]);
        }
      }
    });
  }

  if (allInvalidTokens.length > 0) {
    try {
      await prisma.deviceToken.deleteMany({
        where: { token: { in: allInvalidTokens } },
      });
    } catch (err: unknown) {
      log.error({ err }, "Failed to clean up invalid tokens");
    }
  }

  return { successCount: totalSuccess, failureCount: totalFailure, invalidTokens: allInvalidTokens };
}

// Push notification templates
export const PushTemplates = {
  attendanceMarked: (name: string, status: "present" | "absent" | "late"): PushNotificationPayload => ({ title: "Attendance Update", body: `${name} has been marked ${status} today.`, data: { type: "attendance" }, actionUrl: "/attendance" }),
  feeReminder: (name: string, amount: number, dueDate: string): PushNotificationPayload => ({ title: "Fee Payment Reminder", body: `Fee of ₹${amount.toLocaleString("en-IN")} for ${name} is due on ${dueDate}.`, data: { type: "fee_reminder" }, actionUrl: "/fees" }),
  feeReceived: (name: string, amount: number): PushNotificationPayload => ({ title: "Payment Received", body: `Payment of ₹${amount.toLocaleString("en-IN")} received for ${name}.`, data: { type: "fee_payment" }, actionUrl: "/fees" }),
  examResult: (name: string, examName: string): PushNotificationPayload => ({ title: "Exam Results Published", body: `Results for ${examName} are now available for ${name}.`, data: { type: "result" }, actionUrl: "/results" }),
  eventAnnouncement: (title: string, date: string): PushNotificationPayload => ({ title: "New Event", body: `${title} scheduled for ${date}. Tap to view details.`, data: { type: "event" }, actionUrl: "/events" }),
  schoolAnnouncement: (title: string, message: string): PushNotificationPayload => ({ title, body: message, data: { type: "announcement" } }),
  subscriptionExpiring: (daysLeft: number): PushNotificationPayload => ({ title: "Subscription Expiring", body: `Your subscription expires in ${daysLeft} day(s). Renew now.`, data: { type: "subscription" }, actionUrl: "/settings/subscription" }),
};

