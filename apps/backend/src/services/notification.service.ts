import pino from "pino";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { Errors } from "../errors";
import { writeAuditLog } from "./audit.service";
import type { CreateNotificationInput } from "../schemas/notification.schema";
import {
  NotificationPreferenceService,
  type NotificationPreferenceType,
} from "./notification-preference.service";
import { assertSchoolScope } from "../lib/tenant-scope";

const log = pino({ name: "notification" });

type NotificationQueueModule = {
  enqueueNotificationJob: (payload: {
    notificationId: string;
    schoolId: string;
    targetType: "USER" | "ROLE" | "SCHOOL";
    targetId: string | null;
    title: string;
    message: string;
    referenceId: string | null;
    referenceType: string | null;
  }) => Promise<string>;
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface NotificationContext {
  userId: string;
  schoolId: string;
  role: string;
}

const CREATE_ALLOWED_ROLES = ["Admin", "Staff"] as const;

function assertCreateRole(role: string): void {
  if (!CREATE_ALLOWED_ROLES.includes(role as any)) {
    throw Errors.insufficientRole([...CREATE_ALLOWED_ROLES]);
  }
}

function resolveTargetId(
  input: Pick<CreateNotificationInput, "targetType" | "targetId">,
  context: NotificationContext
): string | null {
  if (input.targetType === "USER") {
    if (!input.targetId) {
      throw Errors.badRequest("Target user is required for USER notifications");
    }
    return input.targetId;
  }

  if (input.targetType === "ROLE") {
    if (!input.targetId) {
      throw Errors.badRequest("Target role is required for ROLE notifications");
    }
    return input.targetId;
  }

  if (input.targetType === "SCHOOL") {
    if (input.targetId) {
      throw Errors.badRequest("Target id is not allowed for SCHOOL notifications");
    }
    return null;
  }

  throw Errors.badRequest("Invalid target type");
}

const KNOWN_REFERENCE_TYPES = ["ATTENDANCE", "FEE", "PAYMENT", "RESULTS"] as const;

function resolvePreferenceType(referenceType?: string | null): NotificationPreferenceType {
  if (referenceType === "ATTENDANCE") return "ATTENDANCE";
  if (referenceType === "FEE" || referenceType === "PAYMENT") return "FEES";
  if (referenceType === "RESULTS") return "RESULTS";
  return "GENERAL";
}

function isPreferenceEnabled(
  preferences: {
    attendanceEnabled: boolean;
    feesEnabled: boolean;
    resultsEnabled: boolean;
    generalEnabled: boolean;
  },
  preferenceType: NotificationPreferenceType
): boolean {
  switch (preferenceType) {
    case "ATTENDANCE":
      return preferences.attendanceEnabled;
    case "FEES":
      return preferences.feesEnabled;
    case "RESULTS":
      return preferences.resultsEnabled;
    case "GENERAL":
    default:
      return preferences.generalEnabled;
  }
}

function shouldEnqueueNotificationJobs(): boolean {
  if (process.env.NODE_ENV !== "test") {
    return true;
  }

  return process.env.NOTIFICATION_QUEUE_ENABLED === "true";
}

function isSchemaCompatibilityError(error: unknown, identifiers: string[]): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) {
    return false;
  }

  if (error.code !== "P2021" && error.code !== "P2022") {
    return false;
  }

  const table = String((error.meta as { table?: unknown } | undefined)?.table ?? "");
  const column = String((error.meta as { column?: unknown } | undefined)?.column ?? "");

  if (!table && !column) {
    return true;
  }

  return identifiers.some(
    (identifier) => table.includes(identifier) || column.includes(identifier)
  );
}

// ---------------------------------------------------------------------------
// In-app notifications
// ---------------------------------------------------------------------------

export async function createNotification(
  input: CreateNotificationInput,
  context: NotificationContext
) {
  assertSchoolScope(context.schoolId);

  assertCreateRole(context.role);

  const targetId = resolveTargetId(input, context);

  if (input.targetType === "USER" && targetId) {
    const preferenceType = resolvePreferenceType(input.referenceType);
    const shouldSend = await NotificationPreferenceService.shouldSendNotification(
      targetId,
      context.schoolId,
      preferenceType,
      "inApp"
    );

    if (!shouldSend) {
      return null;
    }
  }

  const notification = await prisma.notification.create({
    data: {
      schoolId: context.schoolId,
      title: input.title,
      message: input.message,
      type: input.type as any,
      targetType: input.targetType as any,
      targetId,
      referenceId: input.referenceId ?? null,
      referenceType: input.referenceType ?? null,
      createdBy: context.userId,
    },
  });

  await writeAuditLog("CREATE_NOTIFICATION", context.userId, context.schoolId, {
    notificationId: notification.id,
    targetType: notification.targetType,
    targetId: notification.targetId ?? null,
    referenceId: notification.referenceId ?? null,
    referenceType: notification.referenceType ?? null,
  });

  if (shouldEnqueueNotificationJobs()) {
    try {
      const queueModule = require("./notification-queue.service") as NotificationQueueModule;
      void queueModule
        .enqueueNotificationJob({
          notificationId: notification.id,
          schoolId: notification.schoolId,
          targetType: notification.targetType as "USER" | "ROLE" | "SCHOOL",
          targetId: notification.targetId ?? null,
          title: notification.title,
          message: notification.message,
          referenceId: notification.referenceId ?? null,
          referenceType: notification.referenceType ?? null,
        })
        .catch((error: unknown) => {
          const message = error instanceof Error ? error.message : String(error);
          log.warn(
            { notificationId: notification.id, err: message },
            "Notification job enqueue failed"
          );
        });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      log.warn(
        { notificationId: notification.id, err: message },
        "Notification queue module unavailable"
      );
    }
  }

  return notification;
}

export async function getNotificationsForUser(
  context: NotificationContext,
  options: { limit?: number; cursor?: string } = {}
) {
  assertSchoolScope(context.schoolId);

  const preferences = await NotificationPreferenceService.getPreferences({
    userId: context.userId,
    schoolId: context.schoolId,
  });

  if (!preferences.inAppEnabled) {
    return { data: [], pagination: { cursor: null, hasMore: false } };
  }

  const limit = Math.min(options.limit ?? 50, 200);
  let notifications: Array<
    Prisma.NotificationGetPayload<{
      include: { reads: { where: { userId: string }; select: { readAt: true } } };
    }>
  > = [];

  const cursorArgs = options.cursor
    ? { cursor: { id: options.cursor }, skip: 1 }
    : {};

  // Build excluded referenceTypes from disabled preferences
  // This moves preference filtering to the DB for consistent page sizes
  const excludedReferenceTypes: string[] = [];
  if (!preferences.attendanceEnabled) excludedReferenceTypes.push("ATTENDANCE");
  if (!preferences.feesEnabled) {
    excludedReferenceTypes.push("FEE", "PAYMENT");
  }
  if (!preferences.resultsEnabled) excludedReferenceTypes.push("RESULTS");

  // Build the WHERE clause with optional referenceType exclusion
  const whereClause: Record<string, unknown> = {
    schoolId: context.schoolId,
    OR: [
      { targetType: "USER", targetId: context.userId },
      { targetType: "ROLE", targetId: context.role },
      { targetType: "SCHOOL" },
    ],
  };

  if (excludedReferenceTypes.length > 0) {
    // Exclude disabled types. Notifications with null referenceType (GENERAL)
    // are only excluded if generalEnabled is false.
    whereClause.NOT = {
      referenceType: { in: excludedReferenceTypes },
    };
  }

  // If general notifications are disabled, also exclude null/empty referenceType
  if (!preferences.generalEnabled) {
    // Use AND to combine with existing NOT clause
    const existingNot = whereClause.NOT;
    whereClause.AND = [
      ...(existingNot ? [{ NOT: existingNot }] : []),
      { NOT: { referenceType: null } },
    ];
    // Only keep the NOT that was moved into AND
    if (existingNot) delete whereClause.NOT;
  }

  try {
    notifications = await prisma.notification.findMany({
      where: whereClause as any,
      include: {
        reads: {
          where: { userId: context.userId },
          select: { readAt: true },
        },
      },
      orderBy: { createdAt: "desc" },
      take: limit + 1,
      ...cursorArgs,
    });
  } catch (error) {
    if (isSchemaCompatibilityError(error, ["NotificationRead"])) {
      try {
        const fallbackNotifications = await prisma.notification.findMany({
          where: {
            schoolId: context.schoolId,
            OR: [
              { targetType: "USER", targetId: context.userId },
              { targetType: "ROLE", targetId: context.role },
              { targetType: "SCHOOL" },
            ],
          },
          orderBy: { createdAt: "desc" },
          take: limit + 1,
          ...cursorArgs,
        });

        notifications = fallbackNotifications.map((notification) => ({
          ...notification,
          reads: [],
        })) as typeof notifications;
      } catch (fallbackError) {
        if (isSchemaCompatibilityError(fallbackError, ["Notification", "NotificationRead"])) {
          return { data: [], pagination: { cursor: null, hasMore: false } };
        }

        throw fallbackError;
      }
    } else if (isSchemaCompatibilityError(error, ["Notification"])) {
      return { data: [], pagination: { cursor: null, hasMore: false } };
    } else {
      throw error;
    }
  }

  const hasMore = notifications.length > limit;
  const sliced = hasMore ? notifications.slice(0, limit) : notifications;

  // Preference filtering is now done at the DB level via the WHERE clause
  // above, so we don't need to post-filter here. Just map to response shape.
  const data = sliced.map((notification) => {
    const readAt = notification.reads[0]?.readAt ?? null;
    const { reads, ...rest } = notification;
    return {
      ...rest,
      isRead: readAt !== null,
      readAt,
    };
  });

  const nextCursor = sliced.length > 0 ? sliced[sliced.length - 1].id : null;

  return {
    data,
    pagination: { cursor: nextCursor, hasMore },
  };
}

export async function markAsRead(
  notificationId: string,
  context: NotificationContext
): Promise<boolean> {
  assertSchoolScope(context.schoolId);

  let notification: {
    id: string;
    targetType: "USER" | "ROLE" | "SCHOOL";
    targetId: string | null;
  } | null = null;

  try {
    notification = await prisma.notification.findFirst({
      where: { id: notificationId, schoolId: context.schoolId },
      select: { id: true, targetType: true, targetId: true },
    });
  } catch (error) {
    if (isSchemaCompatibilityError(error, ["Notification"])) {
      return false;
    }

    throw error;
  }

  if (!notification) {
    throw Errors.notFound("Notification", notificationId);
  }

  const isRecipient =
    notification.targetType === "SCHOOL" ||
    (notification.targetType === "USER" && notification.targetId === context.userId) ||
    (notification.targetType === "ROLE" && notification.targetId === context.role);

  if (!isRecipient) {
    throw Errors.notFound("Notification", notificationId);
  }

  try {
    await prisma.notificationRead.upsert({
      where: {
        notificationId_userId: {
          notificationId,
          userId: context.userId,
        },
      },
      update: {},
      create: {
        notificationId,
        userId: context.userId,
      },
    });
  } catch (error) {
    if (!isSchemaCompatibilityError(error, ["NotificationRead"])) {
      throw error;
    }
  }

  return true;
}

export async function markAllAsRead(context: NotificationContext): Promise<number> {
  assertSchoolScope(context.schoolId);

  // Use raw SQL INSERT...SELECT to avoid loading all notification IDs into memory.
  // This handles dedup via ON CONFLICT and runs entirely on the DB.
  try {
    const result = await prisma.$executeRaw`
      INSERT INTO "NotificationRead" ("id", "notificationId", "userId", "readAt")
      SELECT gen_random_uuid(), n."id", ${context.userId}, NOW()
      FROM "Notification" n
      WHERE n."schoolId" = ${context.schoolId}
        AND (
          (n."targetType" = 'SCHOOL')
          OR (n."targetType" = 'USER' AND n."targetId" = ${context.userId})
          OR (n."targetType" = 'ROLE' AND n."targetId" = ${context.role})
        )
        AND NOT EXISTS (
          SELECT 1 FROM "NotificationRead" nr
          WHERE nr."notificationId" = n."id" AND nr."userId" = ${context.userId}
        )
    `;
    return result;
  } catch (error) {
    if (isSchemaCompatibilityError(error, ["NotificationRead"])) {
      // Legacy DBs without NotificationRead — fall back to counting
      try {
        const count = await prisma.notification.count({
          where: {
            schoolId: context.schoolId,
            OR: [
              { targetType: "USER", targetId: context.userId },
              { targetType: "ROLE", targetId: context.role },
              { targetType: "SCHOOL" },
            ],
          },
        });
        return count;
      } catch (fallbackError) {
        if (isSchemaCompatibilityError(fallbackError, ["Notification"])) {
          return 0;
        }
        throw fallbackError;
      }
    }

    if (!isSchemaCompatibilityError(error, ["Notification"])) {
      throw error;
    }
    return 0;
  }
}

export async function getUnreadCount(context: NotificationContext): Promise<number> {
  assertSchoolScope(context.schoolId);

  const preferences = await NotificationPreferenceService.getPreferences({
    userId: context.userId,
    schoolId: context.schoolId,
  });

  if (!preferences.inAppEnabled) {
    return 0;
  }

  if (
    !preferences.attendanceEnabled &&
    !preferences.feesEnabled &&
    !preferences.resultsEnabled &&
    !preferences.generalEnabled
  ) {
    return 0;
  }

  const referenceFilters: Array<Record<string, unknown>> = [];
  if (preferences.attendanceEnabled) {
    referenceFilters.push({ referenceType: "ATTENDANCE" });
  }
  if (preferences.feesEnabled) {
    referenceFilters.push({ referenceType: { in: ["FEE", "PAYMENT"] } });
  }
  if (preferences.resultsEnabled) {
    referenceFilters.push({ referenceType: "RESULTS" });
  }
  if (preferences.generalEnabled) {
    referenceFilters.push({ referenceType: null });
    referenceFilters.push({ referenceType: { notIn: [...KNOWN_REFERENCE_TYPES] } });
  }

  const targetClauses: Prisma.NotificationWhereInput[] = [
    { targetType: "SCHOOL" },
    { targetType: "USER", targetId: context.userId },
  ];

  if (context.role) {
    targetClauses.push({ targetType: "ROLE", targetId: context.role });
  }

  const baseWhere: Prisma.NotificationWhereInput = {
    schoolId: context.schoolId,
    OR: targetClauses,
    ...(referenceFilters.length > 0 ? { AND: [{ OR: referenceFilters }] } : {}),
  };

  try {
    return await prisma.notification.count({
      where: {
        ...baseWhere,
        NOT: {
          reads: {
            some: { userId: context.userId },
          },
        },
      },
    });
  } catch (error) {
    if (isSchemaCompatibilityError(error, ["Notification"])) {
      return 0;
    }

    if (!isSchemaCompatibilityError(error, ["NotificationRead"])) {
      throw error;
    }

    // Legacy DBs without NotificationRead: report total matching notifications.
    try {
      return await prisma.notification.count({ where: baseWhere });
    } catch (fallbackError) {
      if (isSchemaCompatibilityError(fallbackError, ["Notification"])) {
        return 0;
      }

      throw fallbackError;
    }
  }
}

// ---------------------------------------------------------------------------
// Email (SendGrid)
// ---------------------------------------------------------------------------

import sgMail from "@sendgrid/mail";

const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;
const EMAIL_FROM = process.env.EMAIL_FROM || "noreply@SuffaCampus.app";
const EMAIL_FROM_NAME = process.env.EMAIL_FROM_NAME || "SuffaCampus";

if (SENDGRID_API_KEY) {
  sgMail.setApiKey(SENDGRID_API_KEY);
}

export interface EmailPayload {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export async function sendEmail(payload: EmailPayload): Promise<boolean> {
  if (!SENDGRID_API_KEY) {
    log.info({ to: payload.to, subject: payload.subject }, "Email dry-run (no SENDGRID_API_KEY)");
    return true;
  }

  try {
    await sgMail.send({
      to: payload.to,
      from: { email: EMAIL_FROM, name: EMAIL_FROM_NAME },
      subject: payload.subject,
      html: payload.html,
      text: payload.text ?? payload.html.replace(/<[^>]*>/g, ""),
    });
    log.info({ to: payload.to, subject: payload.subject }, "Email sent");
    return true;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    log.error({ to: payload.to, subject: payload.subject, err: message }, "Email send failed");
    return false;
  }
}

