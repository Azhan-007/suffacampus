import type { FastifyInstance } from "fastify";
import type { RawData } from "ws";
import { authenticate } from "../../middleware/auth";
import { tenantGuard } from "../../middleware/tenant";
import { roleMiddleware } from "../../middleware/role";
import { sendSuccess } from "../../utils/response";
import { ActivityService } from "../../services/activity.service";
import {
  registerRealtimeClient,
  unregisterRealtimeClient,
} from "../../lib/realtime";

const preHandler = [authenticate, tenantGuard];

/**
 * Student activity feed routes.
 * Queries the activities table filtered by schoolId and optional studentId.
 */
export default async function activityRoutes(server: FastifyInstance) {
  server.post<{ Body: Record<string, unknown> }>(
    "/activities",
    { preHandler: [...preHandler, roleMiddleware(["Admin", "SuperAdmin", "Teacher"])] },
    async (request, reply) => {
      const body = request.body ?? {};

      const activity = await ActivityService.createActivity({
        schoolId: request.schoolId,
        userId: request.user.uid,
        studentId: typeof body.studentId === "string" ? body.studentId : undefined,
        teacherId: typeof body.teacherId === "string" ? body.teacherId : undefined,
        title: typeof body.title === "string" ? body.title : "Activity",
        description:
          typeof body.description === "string" ? body.description : undefined,
        type: typeof body.type === "string" ? body.type : "general",
        actionUrl: typeof body.actionUrl === "string" ? body.actionUrl : undefined,
        metadata:
          body.metadata && typeof body.metadata === "object"
            ? (body.metadata as Record<string, unknown>)
            : undefined,
      });

      return sendSuccess(request, reply, activity, 201);
    }
  );

  server.get<{ Querystring: Record<string, string | undefined> }>(
    "/activities",
    { preHandler },
    async (request, reply) => {
      const studentId = request.query.studentId;
      const limit = Math.min(parseInt(request.query.limit || "20", 10) || 20, 100);
      const skip = Math.max(parseInt(request.query.skip || "0", 10) || 0, 0);

      const result = await ActivityService.getActivities({
        schoolId: request.schoolId,
        studentId,
        limit,
        skip,
      });

      return sendSuccess(request, reply, {
        data: result.data,
        pagination: {
          total: result.pagination.total,
          limit: result.pagination.limit,
          skip: result.pagination.skip,
          hasMore: result.pagination.hasMore,
        },
      });
    }
  );

  server.get<{ Querystring: { studentId?: string; token?: string } }>(
    "/activities/stream",
    { websocket: true, preHandler },
    (socket, request) => {
      const studentId = request.query.studentId;
      const clientId = registerRealtimeClient({
        socket,
        schoolId: request.schoolId,
        studentId,
      });

      socket.send(
        JSON.stringify({
          type: "activity.connected",
          data: {
            schoolId: request.schoolId,
            studentId: studentId ?? null,
          },
        })
      );

      socket.on("message", (raw: RawData) => {
        const msg = raw.toString();
        if (msg === "ping") {
          socket.send("pong");
        }
      });

      socket.on("close", () => {
        unregisterRealtimeClient(clientId);
      });

      socket.on("error", () => {
        unregisterRealtimeClient(clientId);
      });
    }
  );
}
