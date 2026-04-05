import type { FastifyInstance } from "fastify";
import { authenticate } from "../../middleware/auth";
import { tenantGuard } from "../../middleware/tenant";
import { sendSuccess } from "../../utils/response";

/**
 * Teacher tasks & activities stub routes.
 * Returns empty arrays so the mobile dashboard doesn't error out.
 * Replace with real implementations when the feature is built.
 */
export default async function teacherExtrasRoutes(server: FastifyInstance) {
  const preHandler = [authenticate, tenantGuard];

  /** Pending tasks for a teacher (assignments to grade, attendance to mark, etc.) */
  server.get("/teacher-tasks", { preHandler }, async (request, reply) => {
    return sendSuccess(request, reply, []);
  });

  /** Recent activity log for a teacher */
  server.get("/teacher-activities", { preHandler }, async (request, reply) => {
    return sendSuccess(request, reply, []);
  });
}
