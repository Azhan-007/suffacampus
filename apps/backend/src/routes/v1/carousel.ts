import type { FastifyInstance } from "fastify";
import { authenticate } from "../../middleware/auth";
import { tenantGuard } from "../../middleware/tenant";
import { roleMiddleware } from "../../middleware/role";
import { sendSuccess } from "../../utils/response";
import { Errors } from "../../errors";
import { prisma } from "../../lib/prisma";

/**
 * Carousel CRUD routes.
 * Mobile sends/expects: { id, uri, title, subtitle, order }
 * DB stores:            { id, schoolId, imageURL, title, description, order, isActive }
 */

function toApiShape(row: {
  id: string;
  imageURL: string;
  title: string;
  description: string | null;
  order: number;
}) {
  return {
    id: row.id,
    uri: row.imageURL,
    title: row.title,
    subtitle: row.description ?? "",
    order: row.order,
  };
}

export default async function carouselRoutes(server: FastifyInstance) {
  const preHandler = [authenticate, tenantGuard];

  // GET /carousel — list active carousel items ordered by order asc
  server.get("/carousel", { preHandler }, async (request, reply) => {
    const items = await prisma.carousel.findMany({
      where: { schoolId: request.schoolId, isActive: true },
      orderBy: { order: "asc" },
      select: { id: true, imageURL: true, title: true, description: true, order: true },
    });
    return sendSuccess(request, reply, items.map(toApiShape));
  });

  // POST /carousel — create a carousel item (admin)
  server.post(
    "/carousel",
    { preHandler: [...preHandler, roleMiddleware(["Admin", "SuperAdmin"])] },
    async (request, reply) => {
      const body = request.body as { uri?: string; title?: string; subtitle?: string; order?: number };
      if (!body.uri || !body.title) {
        throw Errors.badRequest("uri and title are required");
      }

      const item = await prisma.carousel.create({
        data: {
          schoolId: request.schoolId,
          imageURL: body.uri,
          title: body.title,
          description: body.subtitle ?? "",
          order: body.order ?? 0,
        },
        select: { id: true, imageURL: true, title: true, description: true, order: true },
      });
      return sendSuccess(request, reply, toApiShape(item), 201);
    }
  );

  // PATCH /carousel/:id — update a carousel item (admin)
  server.patch<{ Params: { id: string } }>(
    "/carousel/:id",
    { preHandler: [...preHandler, roleMiddleware(["Admin", "SuperAdmin"])] },
    async (request, reply) => {
      const body = request.body as { uri?: string; title?: string; subtitle?: string; order?: number };

      const existing = await prisma.carousel.findFirst({
        where: { id: request.params.id, schoolId: request.schoolId },
      });
      if (!existing) throw Errors.notFound("Carousel item", request.params.id);

      const item = await prisma.carousel.update({
        where: { id: request.params.id },
        data: {
          ...(body.uri !== undefined ? { imageURL: body.uri } : {}),
          ...(body.title !== undefined ? { title: body.title } : {}),
          ...(body.subtitle !== undefined ? { description: body.subtitle } : {}),
          ...(body.order !== undefined ? { order: body.order } : {}),
        },
        select: { id: true, imageURL: true, title: true, description: true, order: true },
      });
      return sendSuccess(request, reply, toApiShape(item));
    }
  );

  // DELETE /carousel/:id — delete a carousel item (admin)
  server.delete<{ Params: { id: string } }>(
    "/carousel/:id",
    { preHandler: [...preHandler, roleMiddleware(["Admin", "SuperAdmin"])] },
    async (request, reply) => {
      const existing = await prisma.carousel.findFirst({
        where: { id: request.params.id, schoolId: request.schoolId },
      });
      if (!existing) throw Errors.notFound("Carousel item", request.params.id);

      await prisma.carousel.delete({ where: { id: request.params.id } });
      return sendSuccess(request, reply, null);
    }
  );
}
