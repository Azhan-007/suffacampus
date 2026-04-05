import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { createStudentSchema } from "../../schemas/student.schema";
import { updateStudentSchema } from "../../schemas/update.schema";
import { paginationSchema } from "../../utils/pagination";
import { studentFilterSchema } from "../../utils/filters";
import { prisma } from "../../lib/prisma";
import {
  createStudent,
  getStudentsBySchool,
  getStudentById,
  updateStudent,
  softDeleteStudent,
  permanentDeleteStudent,
} from "../../services/student.service";
import { authenticate } from "../../middleware/auth";
import { tenantGuard } from "../../middleware/tenant";
import { enforceSubscription } from "../../middleware/subscription";
import { requirePermission } from "../../middleware/permission";
import { sendSuccess, sendPaginated, sendError } from "../../utils/response";
import { AppError, Errors } from "../../errors";

const preHandler = [authenticate, tenantGuard];

export default async function studentRoutes(server: FastifyInstance) {
  // POST /api/v1/students — create a new student
  server.post(
    "/students",
    {
      preHandler: [
        ...preHandler,
        requirePermission("STUDENT_CREATE"),
        enforceSubscription,
      ],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const result = createStudentSchema.safeParse(request.body);

      if (!result.success) {
        throw Errors.validation(result.error.flatten().fieldErrors);
      }

      const classId = result.data.classId;
      const schoolId = request.schoolId;

      const cls = await prisma.class.findFirst({
        where: {
          id: classId,
          schoolId,
        },
      });

      if (!cls) {
        throw Errors.badRequest("classId does not belong to this school");
      }

      const student = await createStudent(
        request.schoolId,
        result.data,
        request.user.uid
      );

      return sendSuccess(request, reply, student, 201);
    }
  );

  // GET /api/v1/students — list students (paginated, filterable)
  server.get<{ Querystring: Record<string, string | undefined> }>(
    "/students",
    { preHandler: [...preHandler, requirePermission("STUDENT_VIEW")] },
    async (request, reply) => {
      const pagination = paginationSchema.parse(request.query);
      const filters = studentFilterSchema.parse(request.query);

      const result = await getStudentsBySchool(
        request.schoolId,
        pagination,
        filters,
        {
          role: request.user.role,
          uid: request.user.uid,
          studentId: (request.user.studentId as string | undefined) ?? null,
          studentIds: (request.user.studentIds as string[] | undefined) ?? null,
        }
      );

      return sendPaginated(request, reply, result.data, result.pagination);
    }
  );

  // GET /api/v1/students/:id — get a single student
  server.get<{ Params: { id: string } }>(
    "/students/:id",
    { preHandler: [...preHandler, requirePermission("STUDENT_VIEW")] },
    async (request, reply) => {
      const student = await getStudentById(
        request.params.id,
        request.schoolId,
        {
          role: request.user.role,
          uid: request.user.uid,
          studentId: (request.user.studentId as string | undefined) ?? null,
          studentIds: (request.user.studentIds as string[] | undefined) ?? null,
        }
      );

      if (!student) {
        throw Errors.notFound("Student", request.params.id);
      }

      return sendSuccess(request, reply, student);
    }
  );

  // PATCH /api/v1/students/:id — partially update a student
  server.patch<{ Params: { id: string } }>(
    "/students/:id",
    {
      preHandler: [
        ...preHandler,
        requirePermission("STUDENT_UPDATE"),
      ],
    },
    async (request, reply) => {
      const result = updateStudentSchema.safeParse(request.body);

      if (!result.success) {
        throw Errors.validation(result.error.flatten().fieldErrors);
      }

      if (Object.keys(result.data).length === 0) {
        throw Errors.badRequest("No fields to update");
      }

      const student = await updateStudent(
        request.params.id,
        request.schoolId,
        result.data,
        request.user.uid
      );

      return sendSuccess(request, reply, student);
    }
  );

  // DELETE /api/v1/students/:id — soft-delete a student
  server.delete<{ Params: { id: string } }>(
    "/students/:id",
    {
      preHandler: [
        ...preHandler,
        requirePermission("STUDENT_DELETE"),
      ],
    },
    async (request, reply) => {
      const deleted = await softDeleteStudent(
        request.params.id,
        request.schoolId,
        request.user.uid
      );

      if (!deleted) {
        throw Errors.notFound("Student", request.params.id);
      }

      return sendSuccess(request, reply, { message: "Student deleted" });
    }
  );

  // DELETE /api/v1/students/:id/permanent — permanently delete a soft-deleted student
  server.delete<{ Params: { id: string } }>(
    "/students/:id/permanent",
    {
      preHandler: [
        ...preHandler,
        requirePermission("STUDENT_DELETE"),
      ],
    },
    async (request, reply) => {
      const deleted = await permanentDeleteStudent(
        request.params.id,
        request.schoolId,
        request.user.uid
      );

      if (!deleted) {
        throw Errors.notFound("Student", request.params.id);
      }

      return sendSuccess(request, reply, { message: "Student permanently deleted" });
    }
  );
}
