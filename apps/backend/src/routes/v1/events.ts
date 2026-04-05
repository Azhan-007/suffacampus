import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { createEventSchema, updateEventSchema } from "../../schemas/modules.schema";
import { paginationSchema } from "../../utils/pagination";
import {
  createEvent,
  getEventsBySchool,
  getEventById,
  updateEvent,
  softDeleteEvent,
} from "../../services/event.service";
import { authenticate } from "../../middleware/auth";
import { tenantGuard } from "../../middleware/tenant";
import { roleMiddleware } from "../../middleware/role";
import { sendSuccess, sendPaginated } from "../../utils/response";
import { Errors } from "../../errors";

const preHandler = [authenticate, tenantGuard];

export default async function eventRoutes(server: FastifyInstance) {
  // POST /events
  server.post(
    "/events",
    { preHandler: [...preHandler, roleMiddleware(["Admin", "SuperAdmin"])] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const result = createEventSchema.safeParse(request.body);
      if (!result.success) throw Errors.validation(result.error.flatten().fieldErrors);

      const event = await createEvent(request.schoolId, result.data, request.user.uid);
      return sendSuccess(request, reply, event, 201);
    }
  );

  // GET /events (paginated, filterable by eventType, upcoming)
  server.get<{ Querystring: Record<string, string | undefined> }>(
    "/events",
    { preHandler },
    async (request, reply) => {
      const pagination = paginationSchema.parse(request.query);
      const filters = {
        eventType: request.query.eventType,
        upcoming: request.query.upcoming === "true",
      };

      const result = await getEventsBySchool(request.schoolId, pagination, filters);
      return sendPaginated(request, reply, result.data, result.pagination);
    }
  );

  // GET /events/:id
  server.get<{ Params: { id: string } }>(
    "/events/:id",
    { preHandler },
    async (request, reply) => {
      const event = await getEventById(request.params.id, request.schoolId);
      if (!event) throw Errors.notFound("Event", request.params.id);
      return sendSuccess(request, reply, event);
    }
  );

  // PATCH /events/:id
  server.patch<{ Params: { id: string } }>(
    "/events/:id",
    { preHandler: [...preHandler, roleMiddleware(["Admin", "SuperAdmin"])] },
    async (request, reply) => {
      const result = updateEventSchema.safeParse(request.body);
      if (!result.success) throw Errors.validation(result.error.flatten().fieldErrors);
      if (Object.keys(result.data).length === 0) throw Errors.badRequest("No fields to update");

      const event = await updateEvent(request.params.id, request.schoolId, result.data, request.user.uid);
      return sendSuccess(request, reply, event);
    }
  );

  // DELETE /events/:id
  server.delete<{ Params: { id: string } }>(
    "/events/:id",
    { preHandler: [...preHandler, roleMiddleware(["Admin", "SuperAdmin"])] },
    async (request, reply) => {
      const deleted = await softDeleteEvent(request.params.id, request.schoolId, request.user.uid);
      if (!deleted) throw Errors.notFound("Event", request.params.id);
      return sendSuccess(request, reply, { message: "Event deleted" });
    }
  );
}
