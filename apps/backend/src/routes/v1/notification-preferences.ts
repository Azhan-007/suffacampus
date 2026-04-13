import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { authenticate } from "../../middleware/auth";
import { tenantGuard } from "../../middleware/tenant";
import { requirePermission } from "../../middleware/permission";
import { sendSuccess } from "../../utils/response";
import { Errors } from "../../errors";
import {
  NotificationPreferenceService,
  type NotificationPreferenceContext,
  type UpdateNotificationPreferenceInput,
} from "../../services/notification-preference.service";

const updateNotificationPreferencesSchema = z.object({
  attendanceEnabled: z.boolean().optional(),
  feesEnabled: z.boolean().optional(),
  resultsEnabled: z.boolean().optional(),
  generalEnabled: z.boolean().optional(),
  inAppEnabled: z.boolean().optional(),
  pushEnabled: z.boolean().optional(),
  emailEnabled: z.boolean().optional(),
}).strict();

type UpdateNotificationPreferencesBody = z.infer<typeof updateNotificationPreferencesSchema>;

function getContext(request: FastifyRequest): NotificationPreferenceContext {
  const userId = request.user?.uid;
  const schoolId = request.schoolId;

  if (!userId) throw Errors.userNotFound();
  if (!schoolId) throw Errors.tenantMissing();

  return { userId, schoolId };
}

export default async function notificationPreferenceRoutes(server: FastifyInstance) {
  const preHandler = [authenticate, tenantGuard, requirePermission("NOTIFICATION_VIEW")];

  // -----------------------------------------------------------------------
  // GET /notifications/preferences
  // -----------------------------------------------------------------------
  server.get(
    "/notifications/preferences",
    { preHandler },
    async (request, reply) => {
      const context = getContext(request);
      const preferences = await NotificationPreferenceService.getPreferences(context);

      return sendSuccess(request, reply, preferences);
    }
  );

  // -----------------------------------------------------------------------
  // PATCH /notifications/preferences
  // -----------------------------------------------------------------------
  server.patch<{ Body: UpdateNotificationPreferencesBody }>(
    "/notifications/preferences",
    { preHandler },
    async (request, reply) => {
      const parsed = updateNotificationPreferencesSchema.safeParse(request.body);
      if (!parsed.success) {
        throw Errors.validation(parsed.error.flatten().fieldErrors);
      }

      const payload = parsed.data as UpdateNotificationPreferenceInput;
      if (Object.keys(payload).length === 0) {
        throw Errors.badRequest("No fields to update");
      }

      const context = getContext(request);
      const preferences = await NotificationPreferenceService.updatePreferences(payload, context);

      return sendSuccess(request, reply, preferences);
    }
  );
}
