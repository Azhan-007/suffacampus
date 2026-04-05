import { prisma } from "../lib/prisma";
import { Errors } from "../errors";

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

export class NotificationPreferenceService {
  static async getPreferences(context: NotificationPreferenceContext) {
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
  }

  static async updatePreferences(
    input: UpdateNotificationPreferenceInput,
    context: NotificationPreferenceContext
  ) {
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

    return prisma.notificationPreference.upsert({
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
  }

  static async shouldSendNotification(
    userId: string,
    schoolId: string,
    type: NotificationPreferenceType,
    channel: NotificationChannelType = "inApp"
  ): Promise<boolean> {
    const preferences = await prisma.notificationPreference.findUnique({
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
