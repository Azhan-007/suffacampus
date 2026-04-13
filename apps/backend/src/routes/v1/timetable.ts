import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import {
  createTimetableSchema,
  updateTimetableSchema,
} from "../../schemas/modules.schema";
import { paginationSchema } from "../../utils/pagination";
import {
  createTimetable,
  getTimetablesBySchool,
  getTimetableById,
  getTimetableByClassDay,
  updateTimetable,
  softDeleteTimetable,
} from "../../services/timetable.service";
import { authenticate } from "../../middleware/auth";
import { tenantGuard } from "../../middleware/tenant";
import { roleMiddleware } from "../../middleware/role";
import { sendSuccess, sendPaginated } from "../../utils/response";
import { Errors } from "../../errors";
import { prisma } from "../../lib/prisma";

const preHandler = [authenticate, tenantGuard];

export default async function timetableRoutes(server: FastifyInstance) {
  // POST /timetable
  server.post(
    "/timetable",
    { preHandler: [...preHandler, roleMiddleware(["Admin", "SuperAdmin"])] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const result = createTimetableSchema.safeParse(request.body);
      if (!result.success) throw Errors.validation(result.error.flatten().fieldErrors);

      const doc = await createTimetable(request.schoolId, result.data, request.user.uid);
      return sendSuccess(request, reply, doc, 201);
    }
  );

  // GET /timetable (paginated, filterable by classId, sectionId, day)
  server.get<{ Querystring: Record<string, string | undefined> }>(
    "/timetable",
    { preHandler },
    async (request, reply) => {
      const pagination = paginationSchema.parse(request.query);
      const filters = {
        classId: request.query.classId,
        sectionId: request.query.sectionId,
        day: request.query.day,
      };

      const result = await getTimetablesBySchool(request.schoolId, pagination, filters);
      return sendPaginated(request, reply, result.data, result.pagination);
    }
  );

  // GET /timetable/teacher/:teacherId — timetable entries where teacher has periods
  server.get<{ Params: { teacherId: string }; Querystring: Record<string, string | undefined> }>(
    "/timetable/teacher/:teacherId",
    { preHandler },
    async (request, reply) => {
      const { teacherId } = request.params;
      const { day } = request.query;

      const results = await prisma.timetable.findMany({
        where: {
          schoolId: request.schoolId,
          isActive: true,
          ...(day ? { day } : {}),
          periods: {
            some: { teacherId },
          },
        },
        include: {
          periods: {
            where: { teacherId },
            orderBy: { periodNumber: "asc" },
          },
        },
        orderBy: { day: "asc" },
      });

      return sendSuccess(request, reply, results);
    }
  );

  // GET /timetable/lookup — find timetable for a specific class+section+day
  server.get<{ Querystring: Record<string, string | undefined> }>(
    "/timetable/lookup",
    { preHandler },
    async (request, reply) => {
      const { classId, sectionId, day } = request.query;
      if (!classId || !sectionId || !day) {
        throw Errors.badRequest("classId, sectionId, and day are required query params");
      }

      const doc = await getTimetableByClassDay(request.schoolId, classId, sectionId, day);
      if (!doc) throw Errors.notFound("Timetable");
      return sendSuccess(request, reply, doc);
    }
  );

  // GET /timetable/:id
  server.get<{ Params: { id: string } }>(
    "/timetable/:id",
    { preHandler },
    async (request, reply) => {
      const doc = await getTimetableById(request.params.id, request.schoolId);
      if (!doc) throw Errors.notFound("Timetable", request.params.id);
      return sendSuccess(request, reply, doc);
    }
  );

  // PATCH /timetable/:id
  server.patch<{ Params: { id: string } }>(
    "/timetable/:id",
    { preHandler: [...preHandler, roleMiddleware(["Admin", "SuperAdmin"])] },
    async (request, reply) => {
      const result = updateTimetableSchema.safeParse(request.body);
      if (!result.success) throw Errors.validation(result.error.flatten().fieldErrors);
      if (Object.keys(result.data).length === 0) throw Errors.badRequest("No fields to update");

      const doc = await updateTimetable(request.params.id, request.schoolId, result.data, request.user.uid);
      return sendSuccess(request, reply, doc);
    }
  );

  // DELETE /timetable/:id
  server.delete<{ Params: { id: string } }>(
    "/timetable/:id",
    { preHandler: [...preHandler, roleMiddleware(["Admin", "SuperAdmin"])] },
    async (request, reply) => {
      const deleted = await softDeleteTimetable(request.params.id, request.schoolId, request.user.uid);
      if (!deleted) throw Errors.notFound("Timetable", request.params.id);
      return sendSuccess(request, reply, { message: "Timetable deleted" });
    }
  );
}
