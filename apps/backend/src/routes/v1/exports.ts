import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { authenticate } from "../../middleware/auth";
import { tenantGuard } from "../../middleware/tenant";
import { roleMiddleware } from "../../middleware/role";
import { enforceSubscription } from "../../middleware/subscription";
import {
  exportByTemplate,
  EXPORT_TEMPLATES,
} from "../../services/export.service";

const VALID_TEMPLATES = Object.keys(EXPORT_TEMPLATES);

export default async function exportRoutes(server: FastifyInstance) {
  const authChain = [
    authenticate,
    tenantGuard,
    roleMiddleware(["Admin", "Teacher", "SuperAdmin"]),
    enforceSubscription,
  ];

  // -----------------------------------------------------------------------
  // GET /exports/:template — download CSV export
  //   Params: template (students, teachers, fees, attendance, results)
  //   Query:  limit, class, section, status, etc. (passed as filters)
  // -----------------------------------------------------------------------
  server.get<{ Params: { template: string } }>(
    "/exports/:template",
    { preHandler: authChain },
    async (request, reply) => {
      const { template } = request.params;
      const schoolId = request.schoolId as string;

      if (!VALID_TEMPLATES.includes(template)) {
        return reply.status(400).send({
          success: false,
          error: {
            code: "INVALID_TEMPLATE",
            message: `Invalid export template. Valid: ${VALID_TEMPLATES.join(", ")}`,
          },
        });
      }

      const query = request.query as Record<string, string>;
      const limit = Math.min(parseInt(query.limit) || 10000, 50000);

      // Extract filter params (everything except 'limit')
      const filters: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(query)) {
        if (key !== "limit" && value) {
          filters[key] = value;
        }
      }

      const csv = await exportByTemplate(
        template,
        schoolId,
        Object.keys(filters).length > 0 ? filters : undefined,
        limit
      );

      const filename = `${template}_export_${new Date().toISOString().split("T")[0]}.csv`;

      return reply
        .status(200)
        .header("Content-Type", "text/csv; charset=utf-8")
        .header("Content-Disposition", `attachment; filename="${filename}"`)
        .send(csv);
    }
  );

  // -----------------------------------------------------------------------
  // GET /exports — list available export templates
  // -----------------------------------------------------------------------
  server.get(
    "/exports",
    { preHandler: [authenticate, tenantGuard] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      return reply.status(200).send({
        success: true,
        data: {
          templates: VALID_TEMPLATES.map((t) => ({
            name: t,
            columns: EXPORT_TEMPLATES[t].map((c) => c.header),
          })),
        },
      });
    }
  );
}
