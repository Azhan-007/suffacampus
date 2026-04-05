/**
 * Audit log routes — admin-only read access to activity logs.
 *
 *  GET    /audit-logs         — paginated list of audit entries
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { authenticate } from "../../middleware/auth.js";
import { tenantGuard } from "../../middleware/tenant.js";
import { roleMiddleware } from "../../middleware/role.js";
import { sendPaginated } from "../../utils/response.js";
import { getAuditLogs } from "../../services/audit.service.js";

export default async function auditRoutes(server: FastifyInstance) {
  const adminChain = [
    authenticate,
    tenantGuard,
    roleMiddleware(["Admin", "SuperAdmin", "Principal"]),
  ];

  // ===================================================================
  //  GET /audit-logs — paginated audit trail
  // ===================================================================

  server.get(
    "/audit-logs",
    { preHandler: adminChain },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const {
        limit = "50",
        action,
        entity,
        resource,
        cursor,
      } = request.query as Record<string, string | undefined>;

      const parsedLimit = Math.min(Number(limit) || 50, 100);

      const result = await getAuditLogs(request.schoolId, {
        limit: parsedLimit,
        cursor,
        action,
        entity,
        resource,
      });

      return sendPaginated(request, reply, result.data, result.pagination);
    }
  );
}
