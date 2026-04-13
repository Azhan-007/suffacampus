import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { Errors } from "../errors";
import { assertSchoolScope } from "../lib/tenant-scope";

export type NotificationPreferenceContext = {
  userId: string;
  schoolId: string;
};

export type NotificationPreferenceType = "ATTENDANCE" | "FEES" | "RESULTS" | "GENERAL";
export type NotificationChannelType = "inApp" | "push" | "email";

export type UpdateNotificationPreferenceInput = {
  attendanceEnabled?: boolean;
  feesEnabled?: boolean;
  resultsEnabled?: boolean;
  generalEnabled?: boolean;
  inAppEnabled?: boolean;
  pushEnabled?: boolean;
  emailEnabled?: boolean;
};

const UPDATE_FIELDS: Array<keyof UpdateNotificationPreferenceInput> = [
  "attendanceEnabled",
  "feesEnabled",
  "resultsEnabled",
  "generalEnabled",
  "inAppEnabled",
  "pushEnabled",
  "emailEnabled",
];

type NotificationPreferenceRecord = {
  id: string;
  userId: string;
  schoolId: string;
  attendanceEnabled: boolean;
  feesEnabled: boolean;
  resultsEnabled: boolean;
  generalEnabled: boolean;
  inAppEnabled: boolean;
  pushEnabled: boolean;
  emailEnabled: boolean;
  createdAt: Date;
  updatedAt: Date;
};

const DEFAULT_PREFERENCE_FLAGS = {
  attendanceEnabled: true,
  feesEnabled: true,
  resultsEnabled: true,
  generalEnabled: true,
  inAppEnabled: true,
  pushEnabled: true,
  emailEnabled: false,
} as const;

function buildDefaultPreferences(
  context: NotificationPreferenceContext,
  overrides: Partial<UpdateNotificationPreferenceInput> = {}
): NotificationPreferenceRecord {
  const now = new Date();

  return {
    id: `fallback-${context.userId}-${context.schoolId}`,
    userId: context.userId,
    schoolId: context.schoolId,
    ...DEFAULT_PREFERENCE_FLAGS,
    ...overrides,
    createdAt: now,
    updatedAt: now,
  };
}

function isMissingPreferenceTableError(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) {
    return false;
  }

  return error.code === "P2021" || error.code === "P2022";
}

export class NotificationPreferenceService {
  static async getPreferences(context: NotificationPreferenceContext) {
    assertSchoolScope(context.schoolId);

    try {
      let preferences = await prisma.notificationPreference.findUnique({
        where: {
          userId_schoolId: {
            userId: context.userId,
            schoolId: context.schoolId,
          },
        },
      });

      if (!preferences) {
        preferences = await prisma.notificationPreference.create({
          data: {
            userId: context.userId,
            schoolId: context.schoolId,
          },
        });
      }

      return preferences;
    } catch (error) {
      if (isMissingPreferenceTableError(error)) {
        return buildDefaultPreferences(context);
      }

      throw error;
    }
  }

  static async updatePreferences(
    input: UpdateNotificationPreferenceInput,
    context: NotificationPreferenceContext
  ) {
    assertSchoolScope(context.schoolId);

    const data: UpdateNotificationPreferenceInput = {};

    for (const key of UPDATE_FIELDS) {
      const value = input[key];
      if (typeof value === "boolean") {
        data[key] = value;
      }
    }

    if (Object.keys(data).length === 0) {
      throw Errors.badRequest("No fields to update");
    }

    try {
      return await prisma.notificationPreference.upsert({
        where: {
          userId_schoolId: {
            userId: context.userId,
            schoolId: context.schoolId,
          },
        },
        create: {
          userId: context.userId,
          schoolId: context.schoolId,
          ...data,
        },
        update: data,
      });
    } catch (error) {
      if (isMissingPreferenceTableError(error)) {
        return buildDefaultPreferences(context, data);
      }

      throw error;
    }
  }

  static async shouldSendNotification(
    userId: string,
    schoolId: string,
    type: NotificationPreferenceType,
    channel: NotificationChannelType = "inApp"
  ): Promise<boolean> {
    assertSchoolScope(schoolId);

    let preferences:
      | {
          attendanceEnabled: boolean;
          feesEnabled: boolean;
          resultsEnabled: boolean;
          generalEnabled: boolean;
          inAppEnabled: boolean;
          pushEnabled: boolean;
          emailEnabled: boolean;
        }
      | null = null;

    try {
      preferences = await prisma.notificationPreference.findUnique({
        where: {
          userId_schoolId: {
            userId,
            schoolId,
          },
        },
        select: {
          attendanceEnabled: true,
          feesEnabled: true,
          resultsEnabled: true,
          generalEnabled: true,
          inAppEnabled: true,
          pushEnabled: true,
          emailEnabled: true,
        },
      });
    } catch (error) {
      if (isMissingPreferenceTableError(error)) {
        if (channel === "email") return false;
        return true;
      }

      throw error;
    }

    if (!preferences) {
      if (channel === "email") return false;
      return true;
    }

    const channelEnabled =
      channel === "inApp"
        ? preferences.inAppEnabled
        : channel === "push"
          ? preferences.pushEnabled
          : preferences.emailEnabled;

    if (!channelEnabled) return false;

    switch (type) {
      case "ATTENDANCE":
        return preferences.attendanceEnabled ?? true;
      case "FEES":
        return preferences.feesEnabled ?? true;
      case "RESULTS":
        return preferences.resultsEnabled ?? true;
      case "GENERAL":
        return preferences.generalEnabled ?? true;
      default:
        return true;
    }
  }
}
