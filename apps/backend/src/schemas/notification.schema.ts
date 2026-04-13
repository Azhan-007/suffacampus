import { z } from "zod";

export const NotificationType = z.enum(["INFO", "ALERT", "REMINDER"]);
export type NotificationType = z.infer<typeof NotificationType>;

export const NotificationTargetType = z.enum(["USER", "ROLE", "SCHOOL"]);
export type NotificationTargetType = z.infer<typeof NotificationTargetType>;

export const NotificationReferenceType = z.enum(["FEE", "PAYMENT", "ATTENDANCE", "RESULTS"]);
export type NotificationReferenceType = z.infer<typeof NotificationReferenceType>;

export const CreateNotificationSchema = z
  .object({
    title: z.string().trim().min(1, "Title is required"),
    message: z.string().trim().min(1, "Message is required"),
    type: NotificationType,
    targetType: NotificationTargetType,
    targetId: z
      .string()
      .trim()
      .min(1, "Target id cannot be empty")
      .optional(),
    referenceId: z.string().trim().min(1, "Reference id cannot be empty").optional(),
    referenceType: NotificationReferenceType.optional(),
  })
  .strict()
  .superRefine((data, ctx) => {
    if ((data.targetType === "USER" || data.targetType === "ROLE") && !data.targetId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["targetId"],
        message: `Target id is required when targetType is ${data.targetType}`,
      });
    }

    if (data.targetType === "SCHOOL" && data.targetId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["targetId"],
        message: "Target id is not allowed when targetType is SCHOOL",
      });
    }

    if ((data.referenceId && !data.referenceType) || (!data.referenceId && data.referenceType)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["referenceId"],
        message: "referenceId and referenceType must be provided together",
      });
    }
  });

export const MarkAsReadSchema = z.object({
  notificationId: z.string().trim().min(1, "Notification id is required"),
}).strict();

export const UpdateNotificationPreferencesSchema = z.object({
  attendanceEnabled: z.boolean().optional(),
  feesEnabled: z.boolean().optional(),
  resultsEnabled: z.boolean().optional(),
  generalEnabled: z.boolean().optional(),
  inAppEnabled: z.boolean().optional(),
  pushEnabled: z.boolean().optional(),
  emailEnabled: z.boolean().optional(),
}).strict();

export const createNotificationSchema = CreateNotificationSchema;
export const markAsReadSchema = MarkAsReadSchema;
export const updateNotificationPreferencesSchema = UpdateNotificationPreferencesSchema;

export type CreateNotificationInput = z.infer<typeof CreateNotificationSchema>;
export type MarkAsReadInput = z.infer<typeof MarkAsReadSchema>;
export type UpdateNotificationPreferencesInput = z.infer<typeof UpdateNotificationPreferencesSchema>;
