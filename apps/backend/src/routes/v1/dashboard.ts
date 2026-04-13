import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import {
  getDashboardStats,
  getRecentActivity,
  getUpcomingEvents,
} from "../../services/dashboard.service";
import { enterCriticalLaneOrReplyOverloaded } from "../../lib/overload";
import { apiKeyOrUserAuth } from "../../middleware/apiKey";
import { analyticsRateLimitProfile } from "../../plugins/rateLimit";
import { sendSuccess } from "../../utils/response";

const preHandler = [
  apiKeyOrUserAuth({
    requiredPermission: "analytics:read",
  }),
];

export default async function dashboardRoutes(server: FastifyInstance) {
  // GET /dashboard/stats — overview metrics
  server.get(
    "/dashboard/stats",
    {
      config: { rateLimit: analyticsRateLimitProfile },
      preHandler,
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const release = enterCriticalLaneOrReplyOverloaded(
        request,
        reply,
        "dashboard"
      );
      if (!release) return;

      try {
        const stats = await getDashboardStats(request.schoolId);
        return sendSuccess(request, reply, stats);
      } finally {
        release();
      }
    }
  );

  // GET /dashboard/activity — recent audit log entries
  server.get<{ Querystring: Record<string, string | undefined> }>(
    "/dashboard/activity",
    {
      config: { rateLimit: analyticsRateLimitProfile },
      preHandler,
    },
    async (request, reply) => {
      const release = enterCriticalLaneOrReplyOverloaded(
        request,
        reply,
        "dashboard"
      );
      if (!release) return;

      try {
        const limit = Math.min(Number(request.query.limit) || 20, 50);
        const activity = await getRecentActivity(request.schoolId, limit);
        return sendSuccess(request, reply, activity);
      } finally {
        release();
      }
    }
  );

  // GET /dashboard/upcoming-events
  server.get<{ Querystring: Record<string, string | undefined> }>(
    "/dashboard/upcoming-events",
    {
      config: { rateLimit: analyticsRateLimitProfile },
      preHandler,
    },
    async (request, reply) => {
      const release = enterCriticalLaneOrReplyOverloaded(
        request,
        reply,
        "dashboard"
      );
      if (!release) return;

      try {
        const limit = Math.min(Number(request.query.limit) || 5, 20);
        const events = await getUpcomingEvents(request.schoolId, limit);
        return sendSuccess(request, reply, events);
      } finally {
        release();
      }
    }
  );
}
