import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { authenticate } from "../../middleware/auth";
import { tenantGuard } from "../../middleware/tenant";
import { roleMiddleware } from "../../middleware/role";
import { bulkImport, parseCSV, getImportTemplate } from "../../services/bulk-import.service";
import { sendSuccess } from "../../utils/response";
import { Errors } from "../../errors";
import { z } from "zod";

const importBodySchema = z.object({
  entityType: z.enum(["students", "teachers", "fees", "attendance"]),
  /** CSV string content */
  csv: z.string().optional(),
  /** JSON rows (alternative to CSV) */
  rows: z.array(z.record(z.string(), z.unknown())).optional(),
  /** If true, skip invalid rows instead of aborting */
  skipInvalid: z.boolean().optional().default(true),
});

export default async function importRoutes(server: FastifyInstance) {
  const adminChain = [
    authenticate,
    tenantGuard,
    roleMiddleware(["Admin", "SuperAdmin", "Principal"]),
  ];

  // -----------------------------------------------------------------------
  // POST /imports/bulk — bulk import via CSV or JSON
  // -----------------------------------------------------------------------
  server.post(
    "/imports/bulk",
    { preHandler: adminChain },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = importBodySchema.safeParse(request.body);
      if (!parsed.success) {
        throw Errors.validation(parsed.error.format());
      }

      const { entityType, csv, rows: jsonRows, skipInvalid } = parsed.data;
      const schoolId = request.schoolId as string;
      const userId = request.user!.uid;

      // Parse CSV if provided, otherwise use JSON rows
      let rows: Record<string, unknown>[];
      if (csv) {
        rows = parseCSV(csv);
        if (rows.length === 0) {
          throw Errors.badRequest("CSV is empty or has no data rows");
        }
      } else if (jsonRows && jsonRows.length > 0) {
        rows = jsonRows;
      } else {
        throw Errors.badRequest("Either 'csv' or 'rows' must be provided");
      }

      // Enforce a max row limit to prevent abuse
      if (rows.length > 5000) {
        throw Errors.badRequest("Maximum 5000 rows per import. Split your file into smaller batches.");
      }

      const result = await bulkImport({
        entityType,
        schoolId,
        userId,
        rows,
        skipInvalid,
      });

      return sendSuccess(request, reply, result);
    }
  );

  // -----------------------------------------------------------------------
  // GET /imports/template/:entityType — download CSV template
  // -----------------------------------------------------------------------
  server.get<{ Params: { entityType: string } }>(
    "/imports/template/:entityType",
    { preHandler: adminChain },
    async (request, reply) => {
      const { entityType } = request.params;
      const validTypes = ["students", "teachers", "fees", "attendance"] as const;
      type EntityType = typeof validTypes[number];

      if (!validTypes.includes(entityType as EntityType)) {
        throw Errors.badRequest(`Invalid entity type. Must be one of: ${validTypes.join(", ")}`);
      }

      const template = getImportTemplate(entityType as EntityType);

      reply.header("Content-Type", "text/csv");
      reply.header("Content-Disposition", `attachment; filename="${entityType}_template.csv"`);
      return reply.send(template + "\n");
    }
  );
}
