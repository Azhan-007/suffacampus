/**
 * Search routes — full-text search across students, teachers, books.
 *
 *  GET  /search?q=...&entities=students,teachers&limit=20
 *  POST /search/reindex/:entity  — admin-only reindex trigger
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { authenticate } from "../../middleware/auth.js";
import { tenantGuard } from "../../middleware/tenant.js";
import { roleMiddleware } from "../../middleware/role.js";
import { sendSuccess } from "../../utils/response.js";
import { Errors } from "../../errors/index.js";
import {
  search,
  reindexEntity,
  type SearchableEntity,
} from "../../services/search.service.js";

const VALID_ENTITIES: SearchableEntity[] = ["students", "teachers", "library"];

export default async function searchRoutes(server: FastifyInstance) {
  const preHandler = [authenticate, tenantGuard];

  // -----------------------------------------------------------------
  // GET /search?q=rahul&entities=students,teachers&limit=20
  // -----------------------------------------------------------------
  server.get<{
    Querystring: { q?: string; entities?: string; limit?: string };
  }>(
    "/search",
    { preHandler },
    async (request, reply) => {
      const q = (request.query.q ?? "").trim();
      if (!q) {
        throw Errors.badRequest("Query parameter 'q' is required");
      }
      if (q.length > 100) {
        throw Errors.badRequest("Query too long (max 100 characters)");
      }

      // Parse entity filter
      let entities: SearchableEntity[] | undefined;
      if (request.query.entities) {
        entities = request.query.entities
          .split(",")
          .map((e) => e.trim() as SearchableEntity)
          .filter((e) => VALID_ENTITIES.includes(e));
      }

      const limit = Math.min(
        Math.max(parseInt(request.query.limit ?? "20") || 20, 1),
        50
      );

      const results = await search({
        schoolId: request.schoolId,
        query: q,
        entities,
        limit,
      });

      return sendSuccess(request, reply, results);
    }
  );

  // -----------------------------------------------------------------
  // POST /search/reindex/:entity — rebuild search index for an entity
  // -----------------------------------------------------------------
  server.post<{ Params: { entity: string } }>(
    "/search/reindex/:entity",
    {
      preHandler: [
        ...preHandler,
        roleMiddleware(["Admin", "SuperAdmin"]),
      ],
    },
    async (request, reply) => {
      const entity = request.params.entity as SearchableEntity;

      if (!VALID_ENTITIES.includes(entity)) {
        throw Errors.badRequest(
          `Invalid entity. Must be one of: ${VALID_ENTITIES.join(", ")}`
        );
      }

      const indexed = await reindexEntity(entity, request.schoolId);

      return sendSuccess(request, reply, {
        entity,
        indexed,
        message: `Re-indexed ${indexed} ${entity} documents`,
      });
    }
  );
}
