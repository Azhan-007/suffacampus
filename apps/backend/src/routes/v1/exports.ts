import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { apiKeyOrUserAuth } from "../../middleware/apiKey";
import { exportsRateLimitProfile } from "../../plugins/rateLimit";
import {
  exportByTemplateStream,
  EXPORT_TEMPLATES,
} from "../../services/export.service";

const VALID_TEMPLATES = Object.keys(EXPORT_TEMPLATES);

export default async function exportRoutes(server: FastifyInstance) {
  const exportAccess = apiKeyOrUserAuth({
    requiredPermission: "exports:read",
    allowedRoles: ["Admin", "Teacher", "SuperAdmin"],
    requireSubscription: true,
  });

  const exportListAccess = apiKeyOrUserAuth({
    requiredPermission: "exports:read",
  });

  // -----------------------------------------------------------------------
  // GET /exports/:template — download CSV export
  //   Params: template (students, teachers, fees, attendance, results)
  //   Query:  limit, class, section, status, etc. (passed as filters)
  // -----------------------------------------------------------------------
  server.get<{ Params: { template: string } }>(
    "/exports/:template",
    {
      config: { rateLimit: exportsRateLimitProfile },
      preHandler: [exportAccess],
    },
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

      // SECURITY: Allowlist of safe filter keys per entity.
      // NEVER spread raw query params into Prisma where — prevents
      // tenant bypass via ?schoolId=OTHER_SCHOOL_ID
      const SAFE_FILTER_KEYS: Record<string, string[]> = {
        students: ["classId", "sectionId", "gender", "status"],
        teachers: ["department", "status"],
        fees: ["status", "feeType", "classId", "sectionId", "studentId"],
        attendance: ["classId", "sectionId", "date", "status", "session"],
        results: ["examId", "classId", "sectionId", "subject"],
      };

      const allowedKeys = SAFE_FILTER_KEYS[template] ?? [];
      const filters: Record<string, unknown> = {};
      for (const key of allowedKeys) {
        if (query[key]) {
          filters[key] = query[key];
        }
      }

      // Stream CSV rows directly — O(batch) memory, never buffers full dataset
      const csvStream = exportByTemplateStream(
        template,
        schoolId,
        Object.keys(filters).length > 0 ? filters : undefined,
        limit
      );

      const filename = `${template}_export_${new Date().toISOString().split("T")[0]}.csv`;

      reply
        .status(200)
        .header("Content-Type", "text/csv; charset=utf-8")
        .header("Content-Disposition", `attachment; filename="${filename}"`);

      // Use raw response to pipe async generator chunks
      const raw = reply.raw;
      for await (const chunk of csvStream) {
        const canContinue = raw.write(chunk);
        if (!canContinue) {
          await new Promise<void>((resolve) => raw.once("drain", resolve));
        }
      }
      raw.end();
      return reply;
    }
  );

  // -----------------------------------------------------------------------
  // GET /exports — list available export templates
  // -----------------------------------------------------------------------
  server.get(
    "/exports",
    {
      config: { rateLimit: exportsRateLimitProfile },
      preHandler: [exportListAccess],
    },
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
