import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { authenticate } from "../../middleware/auth";
import { tenantGuard } from "../../middleware/tenant";
import { requirePermission } from "../../middleware/permission";
import { sendSuccess } from "../../utils/response";
import { Errors } from "../../errors";
import {
  createNotification,
  getNotificationsForUser,
  markAsRead,
  markAllAsRead,
  getUnreadCount,
  type NotificationContext,
} from "../../services/notification.service";
import {
  registerDeviceToken,
  removeDeviceToken,
} from "../../services/push-notification.service";
import { createNotificationSchema } from "../../schemas/notification.schema";

const listNotificationsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional(),
  unreadOnly: z.coerce.boolean().optional(),
});

const notificationIdParamsSchema = z.object({
  id: z.string().min(1, "Notification id is required"),
});

const registerPushTokenBodySchema = z.object({
  token: z.string().min(1, "Token is required"),
}).strict();

const unregisterPushTokenBodySchema = z.object({
  token: z.string().min(1, "Token is required"),
}).strict();

type CreateNotificationBody = z.infer<typeof createNotificationSchema>;
type ListNotificationsQuery = z.infer<typeof listNotificationsQuerySchema>;
type NotificationIdParams = z.infer<typeof notificationIdParamsSchema>;
type RegisterPushTokenBody = z.infer<typeof registerPushTokenBodySchema>;
type UnregisterPushTokenBody = z.infer<typeof unregisterPushTokenBodySchema>;

function getContext(request: FastifyRequest): NotificationContext {
  const userId = request.user?.uid;
  const schoolId = request.schoolId;

  if (!userId) throw Errors.userNotFound();
  if (!schoolId) throw Errors.tenantMissing();

  return {
    userId,
    schoolId,
    role: request.user?.role ?? "",
  };
}

export default async function notificationRoutes(server: FastifyInstance) {
  const authChain = [authenticate, tenantGuard];

  // -----------------------------------------------------------------------
  // POST /notifications — create a notification
  // -----------------------------------------------------------------------
  server.post<{ Body: CreateNotificationBody }>(
    "/notifications",
    {
      preHandler: [
        ...authChain,
        requirePermission("NOTIFICATION_CREATE"),
      ],
    },
    async (request, reply) => {
      const parsed = createNotificationSchema.safeParse(request.body);
      if (!parsed.success) {
        throw Errors.validation(parsed.error.flatten().fieldErrors);
      }

      const context = getContext(request);
      const notification = await createNotification(parsed.data, context);

      return sendSuccess(request, reply, notification, 201);
    }
  );

  // -----------------------------------------------------------------------
  // GET /notifications — list notifications for current user
  // -----------------------------------------------------------------------
  server.get<{ Querystring: ListNotificationsQuery }>(
    "/notifications",
    { preHandler: [...authChain, requirePermission("NOTIFICATION_VIEW")] },
    async (request, reply) => {
      const queryParsed = listNotificationsQuerySchema.safeParse(request.query);
      if (!queryParsed.success) {
        throw Errors.validation(queryParsed.error.flatten().fieldErrors);
      }

      const context = getContext(request);
      const notifications = await getNotificationsForUser(context);

      const unreadOnly = queryParsed.data.unreadOnly ?? false;
      const filtered = unreadOnly
        ? notifications.filter((item) => !item.isRead)
        : notifications;

      const limit = queryParsed.data.limit ?? 50;
      const data = filtered.slice(0, limit);

      return sendSuccess(request, reply, {
        notifications: data,
        count: data.length,
      });
    }
  );

  // -----------------------------------------------------------------------
  // PATCH /notifications/:id/read — mark as read
  // -----------------------------------------------------------------------
  server.patch<{ Params: NotificationIdParams }>(
    "/notifications/:id/read",
    { preHandler: [...authChain, requirePermission("NOTIFICATION_VIEW")] },
    async (request, reply) => {
      const paramsParsed = notificationIdParamsSchema.safeParse(request.params);
      if (!paramsParsed.success) {
        throw Errors.validation(paramsParsed.error.flatten().fieldErrors);
      }

      const context = getContext(request);
      const marked = await markAsRead(paramsParsed.data.id, context);

      if (!marked) {
        throw Errors.notFound("Notification", paramsParsed.data.id);
      }

      return sendSuccess(request, reply, { marked: true });
    }
  );

  // -----------------------------------------------------------------------
  // POST /notifications/read-all — mark all notifications for user as read
  // -----------------------------------------------------------------------
  server.post(
    "/notifications/read-all",
    { preHandler: [...authChain, requirePermission("NOTIFICATION_VIEW")] },
    async (request, reply) => {
      const context = getContext(request);
      const count = await markAllAsRead(context);

      return sendSuccess(request, reply, { marked: true, count });
    }
  );

  // -----------------------------------------------------------------------
  // GET /notifications/unread-count
  // -----------------------------------------------------------------------
  server.get(
    "/notifications/unread-count",
    { preHandler: [...authChain, requirePermission("NOTIFICATION_VIEW")] },
    async (request, reply) => {
      const context = getContext(request);
      const count = await getUnreadCount(context);

      return sendSuccess(request, reply, { unreadCount: count });
    }
  );

  // -----------------------------------------------------------------------
  // POST /notifications/push/register — register device token
  // -----------------------------------------------------------------------
  server.post<{ Body: RegisterPushTokenBody }>(
    "/notifications/push/register",
    { preHandler: [...authChain, requirePermission("NOTIFICATION_VIEW")] },
    async (request, reply) => {
      const parsed = registerPushTokenBodySchema.safeParse(request.body);
      if (!parsed.success) {
        throw Errors.validation(parsed.error.flatten().fieldErrors);
      }

      const context = getContext(request);
      const deviceToken = await registerDeviceToken({
        userId: context.userId,
        schoolId: context.schoolId,
        role: context.role,
        token: parsed.data.token,
      });

      return sendSuccess(request, reply, deviceToken);
    }
  );

  // -----------------------------------------------------------------------
  // DELETE /notifications/push/unregister — unregister device token
  // -----------------------------------------------------------------------
  server.delete<{ Body: UnregisterPushTokenBody }>(
    "/notifications/push/unregister",
    { preHandler: [...authChain, requirePermission("NOTIFICATION_VIEW")] },
    async (request, reply) => {
      const parsed = unregisterPushTokenBodySchema.safeParse(request.body);
      if (!parsed.success) {
        throw Errors.validation(parsed.error.flatten().fieldErrors);
      }

      const context = getContext(request);
      const removed = await removeDeviceToken({
        token: parsed.data.token,
        userId: context.userId,
        schoolId: context.schoolId,
        role: context.role,
      });

      return sendSuccess(request, reply, { removed });
    }
  );
}
