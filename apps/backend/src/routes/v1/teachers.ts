import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { createTeacherSchema } from "../../schemas/teacher.schema";
import { updateTeacherSchema } from "../../schemas/update.schema";
import { paginationSchema } from "../../utils/pagination";
import { teacherFilterSchema } from "../../utils/filters";
import {
  createTeacher,
  getTeachersBySchool,
  getTeacherById,
  updateTeacher,
  softDeleteTeacher,
  permanentDeleteTeacher,
} from "../../services/teacher.service";
import { authenticate } from "../../middleware/auth";
import { tenantGuard } from "../../middleware/tenant";
import { roleMiddleware } from "../../middleware/role";
import { sendSuccess, sendPaginated } from "../../utils/response";
import { Errors } from "../../errors";

const preHandler = [authenticate, tenantGuard];

export default async function teacherRoutes(server: FastifyInstance) {
  // POST /api/v1/teachers — create a new teacher
  server.post(
    "/teachers",
    {
      preHandler: [...preHandler, roleMiddleware(["Admin", "SuperAdmin"])],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const result = createTeacherSchema.safeParse(request.body);

      if (!result.success) {
        throw Errors.validation(result.error.flatten().fieldErrors);
      }

      const teacher = await createTeacher(
        request.schoolId,
        result.data,
        request.user.uid
      );

      return sendSuccess(request, reply, teacher, 201);
    }
  );

  // GET /api/v1/teachers — list teachers (paginated, filterable)
  server.get<{ Querystring: Record<string, string | undefined> }>(
    "/teachers",
    { preHandler },
    async (request, reply) => {
      const pagination = paginationSchema.parse(request.query);
      const filters = teacherFilterSchema.parse(request.query);

      const result = await getTeachersBySchool(
        request.schoolId,
        pagination,
        filters
      );

      return sendPaginated(request, reply, result.data, result.pagination);
    }
  );

  // GET /api/v1/teachers/:id — get a single teacher
  server.get<{ Params: { id: string } }>(
    "/teachers/:id",
    { preHandler },
    async (request, reply) => {
      const teacher = await getTeacherById(
        request.params.id,
        request.schoolId
      );

      if (!teacher) {
        throw Errors.notFound("Teacher", request.params.id);
      }

      return sendSuccess(request, reply, teacher);
    }
  );

  // PATCH /api/v1/teachers/:id — partially update a teacher
  server.patch<{ Params: { id: string } }>(
    "/teachers/:id",
    {
      preHandler: [...preHandler, roleMiddleware(["Admin", "SuperAdmin"])],
    },
    async (request, reply) => {
      const result = updateTeacherSchema.safeParse(request.body);

      if (!result.success) {
        throw Errors.validation(result.error.flatten().fieldErrors);
      }

      if (Object.keys(result.data).length === 0) {
        throw Errors.badRequest("No fields to update");
      }

      const teacher = await updateTeacher(
        request.params.id,
        request.schoolId,
        result.data,
        request.user.uid
      );

      return sendSuccess(request, reply, teacher);
    }
  );

  // DELETE /api/v1/teachers/:id — soft-delete a teacher
  server.delete<{ Params: { id: string } }>(
    "/teachers/:id",
    {
      preHandler: [...preHandler, roleMiddleware(["Admin", "SuperAdmin"])],
    },
    async (request, reply) => {
      const deleted = await softDeleteTeacher(
        request.params.id,
        request.schoolId,
        request.user.uid
      );

      if (!deleted) {
        throw Errors.notFound("Teacher", request.params.id);
      }

      return sendSuccess(request, reply, { message: "Teacher deleted" });
    }
  );

  // DELETE /api/v1/teachers/:id/permanent — permanently delete a soft-deleted teacher
  server.delete<{ Params: { id: string } }>(
    "/teachers/:id/permanent",
    {
      preHandler: [...preHandler, roleMiddleware(["SuperAdmin"])],
    },
    async (request, reply) => {
      const deleted = await permanentDeleteTeacher(
        request.params.id,
        request.schoolId,
        request.user.uid
      );

      if (!deleted) {
        throw Errors.notFound("Teacher", request.params.id);
      }

      return sendSuccess(request, reply, { message: "Teacher permanently deleted" });
    }
  );
}
