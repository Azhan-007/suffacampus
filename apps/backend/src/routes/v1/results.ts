import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { createResultSchema, updateResultSchema } from "../../schemas/modules.schema";
import { paginationSchema } from "../../utils/pagination";
import {
  createResult,
  getResultsBySchool,
  getResultById,
  getResultsByStudent,
  updateResult,
  softDeleteResult,
} from "../../services/result.service";
import { authenticate } from "../../middleware/auth";
import { tenantGuard } from "../../middleware/tenant";
import { roleMiddleware } from "../../middleware/role";
import { sendSuccess, sendPaginated } from "../../utils/response";
import { Errors } from "../../errors";
import { firestore } from "../../lib/firebase-admin";

const preHandler = [authenticate, tenantGuard];

export default async function resultRoutes(server: FastifyInstance) {
  // POST /results
  server.post(
    "/results",
    { preHandler: [...preHandler, roleMiddleware(["Admin", "SuperAdmin", "Teacher"])] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const result = createResultSchema.safeParse(request.body);
      if (!result.success) throw Errors.validation(result.error.flatten().fieldErrors);

      const doc = await createResult(request.schoolId, result.data, request.user.uid);
      return sendSuccess(request, reply, doc, 201);
    }
  );

  // GET /results (paginated, filterable)
  server.get<{ Querystring: Record<string, string | undefined> }>(
    "/results",
    { preHandler },
    async (request, reply) => {
      const pagination = paginationSchema.parse(request.query);
      const filters = {
        studentId: request.query.studentId,
        classId: request.query.classId,
        sectionId: request.query.sectionId,
        examType: request.query.examType,
        examName: request.query.examName,
        subject: request.query.subject,
      };

      const result = await getResultsBySchool(request.schoolId, pagination, filters);
      return sendPaginated(request, reply, result.data, result.pagination);
    }
  );

  // GET /results/student/:studentId — all results for a student
  server.get<{ Params: { studentId: string }; Querystring: Record<string, string | undefined> }>(
    "/results/student/:studentId",
    { preHandler },
    async (request, reply) => {
      const pagination = paginationSchema.parse(request.query);
      const result = await getResultsByStudent(
        request.params.studentId,
        request.schoolId,
        pagination
      );
      return sendPaginated(request, reply, result.data, result.pagination);
    }
  );

  // PATCH /results/bulk-publish — publish all draft results for a teacher
  server.patch(
    "/results/bulk-publish",
    { preHandler: [...preHandler, roleMiddleware(["Admin", "SuperAdmin", "Teacher"])] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { teacherId } = request.body as { teacherId?: string };
      if (!teacherId) throw Errors.badRequest("teacherId is required");

      const snap = await firestore
        .collection("results")
        .where("schoolId", "==", request.schoolId)
        .where("teacherId", "==", teacherId)
        .where("published", "==", false)
        .where("isDeleted", "==", false)
        .get();

      const batch = firestore.batch();
      snap.docs.forEach((doc) => batch.update(doc.ref, { published: true, updatedAt: new Date().toISOString(), updatedBy: request.user.uid }));
      await batch.commit();

      return sendSuccess(request, reply, { updated: snap.size });
    }
  );

  // GET /results/:id
  server.get<{ Params: { id: string } }>(
    "/results/:id",
    { preHandler },
    async (request, reply) => {
      const doc = await getResultById(request.params.id, request.schoolId);
      if (!doc) throw Errors.notFound("Result", request.params.id);
      return sendSuccess(request, reply, doc);
    }
  );

  // PATCH /results/:id
  server.patch<{ Params: { id: string } }>(
    "/results/:id",
    { preHandler: [...preHandler, roleMiddleware(["Admin", "SuperAdmin", "Teacher"])] },
    async (request, reply) => {
      const result = updateResultSchema.safeParse(request.body);
      if (!result.success) throw Errors.validation(result.error.flatten().fieldErrors);
      if (Object.keys(result.data).length === 0) throw Errors.badRequest("No fields to update");

      const doc = await updateResult(request.params.id, request.schoolId, result.data, request.user.uid);
      return sendSuccess(request, reply, doc);
    }
  );

  // DELETE /results/:id
  server.delete<{ Params: { id: string } }>(
    "/results/:id",
    { preHandler: [...preHandler, roleMiddleware(["Admin", "SuperAdmin"])] },
    async (request, reply) => {
      const deleted = await softDeleteResult(request.params.id, request.schoolId, request.user.uid);
      if (!deleted) throw Errors.notFound("Result", request.params.id);
      return sendSuccess(request, reply, { message: "Result deleted" });
    }
  );

  // PATCH /results/:id/publish — toggle published status
  server.patch<{ Params: { id: string } }>(
    "/results/:id/publish",
    { preHandler: [...preHandler, roleMiddleware(["Admin", "SuperAdmin", "Teacher"])] },
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const { published } = request.body as { published?: boolean };
      if (typeof published !== "boolean") throw Errors.badRequest("published (boolean) is required");

      const doc = await updateResult(request.params.id, request.schoolId, { published }, request.user.uid);
      return sendSuccess(request, reply, doc);
    }
  );
}
