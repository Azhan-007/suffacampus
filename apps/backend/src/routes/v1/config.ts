import type { FastifyInstance } from "fastify";
import { authenticate } from "../../middleware/auth";
import { tenantGuard } from "../../middleware/tenant";
import { roleMiddleware } from "../../middleware/role";
import { sendSuccess } from "../../utils/response";
import { SchoolConfigService } from "../../services/school-config.service";

const preHandler = [authenticate, tenantGuard];

/**
 * Config routes — school-level configuration (summary card, etc.)
 */
export default async function configRoutes(server: FastifyInstance) {
  // GET /config/summary-card — get summary card configuration
  server.get(
    "/config/summary-card",
    { preHandler },
    async (request, reply) => {
      const config = await SchoolConfigService.getSummaryCard(request.schoolId);
      return sendSuccess(request, reply, config);
    }
  );

  // PATCH /config/summary-card — save summary card configuration (admin)
  server.patch(
    "/config/summary-card",
    { preHandler: [...preHandler, roleMiddleware(["Admin", "SuperAdmin"])] },
    async (request, reply) => {
      const body = request.body as Record<string, unknown>;
      const updated = await SchoolConfigService.updateSummaryCard(request.schoolId, body);
      return sendSuccess(request, reply, updated.summaryCard);
    }
  );
}
