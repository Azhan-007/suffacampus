import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import { authenticate } from "../../middleware/auth";
import { tenantGuard } from "../../middleware/tenant";
import { roleMiddleware } from "../../middleware/role";
import { sendSuccess, sendPaginated } from "../../utils/response";
import { paginationSchema } from "../../utils/pagination";
import { firestore } from "../../lib/firebase-admin";
import { Errors } from "../../errors";
import { validateAssignmentDeadline } from "../../services/validation.service";

const preHandler = [authenticate, tenantGuard];
const COL = "assignments";
const SUB_COL = "submissions";

const createAssignmentSchema = z
  .object({
    classId: z.string().min(1, "classId is required"),
    title: z.string().min(1, "title is required"),
    description: z.string().optional(),
    subject: z.string().optional(),
    deadline: z.string().optional(),
    status: z.string().optional(),
  })
  .passthrough();

const updateAssignmentSchema = createAssignmentSchema.partial();

const createSubmissionSchema = z
  .object({
    assignmentId: z.string().min(1, "assignmentId is required"),
    studentId: z.string().min(1, "studentId is required"),
    answerText: z.string().optional(),
    attachmentUrl: z.string().optional(),
    submittedAt: z.string().optional(),
  })
  .passthrough();

export default async function assignmentRoutes(server: FastifyInstance) {
  // ─── Assignments ────────────────────────────────────────────────────────

  // GET /assignments — list assignments for the school
  server.get<{ Querystring: Record<string, string | undefined> }>(
    "/assignments",
    { preHandler },
    async (request, reply) => {
      const pagination = paginationSchema.parse(request.query);
      let q = firestore
        .collection(COL)
        .where("schoolId", "==", request.schoolId)
        .where("isDeleted", "==", false);

      if (request.query.classId || request.query["class"]) {
        q = q.where("classId", "==", request.query.classId || request.query["class"]);
      }
      if (request.query.status) {
        q = q.where("status", "==", request.query.status);
      }
      if (request.query.teacherId) {
        q = q.where("createdBy", "==", request.query.teacherId);
      }

      q = q.orderBy("createdAt", "desc").limit(pagination.limit);
      const snap = await q.get();
      const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      return sendSuccess(request, reply, data);
    }
  );

  // POST /assignments — create
  server.post(
    "/assignments",
    { preHandler: [...preHandler, roleMiddleware(["Admin", "SuperAdmin", "Teacher"])] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = createAssignmentSchema.safeParse(request.body);
      if (!parsed.success) {
        throw Errors.validation(parsed.error.flatten().fieldErrors);
      }

      const body = parsed.data;

      if (body.deadline && typeof body.deadline === "string") {
        validateAssignmentDeadline(body.deadline);
      }

      const now = new Date().toISOString();
      const doc = {
        ...body,
        schoolId: request.schoolId,
        createdBy: request.user.uid,
        isDeleted: false,
        createdAt: now,
        updatedAt: now,
      };
      const ref = await firestore.collection(COL).add(doc);
      return sendSuccess(request, reply, { id: ref.id, ...doc }, 201);
    }
  );

  // PATCH /assignments/:id — update
  server.patch<{ Params: { id: string } }>(
    "/assignments/:id",
    { preHandler: [...preHandler, roleMiddleware(["Admin", "SuperAdmin", "Teacher"])] },
    async (request, reply) => {
      const ref = firestore.collection(COL).doc(request.params.id);
      const snap = await ref.get();
      if (!snap.exists || snap.data()?.schoolId !== request.schoolId || snap.data()?.isDeleted)
        throw Errors.notFound("Assignment", request.params.id);

      const parsed = updateAssignmentSchema.safeParse(request.body);
      if (!parsed.success) {
        throw Errors.validation(parsed.error.flatten().fieldErrors);
      }

      const updates = parsed.data as Record<string, unknown>;
      
      // Validate deadline if being updated
      if (updates.deadline && typeof updates.deadline === 'string') {
        validateAssignmentDeadline(updates.deadline);
      }

      const updatesWithMeta = { 
        ...updates, 
        updatedAt: new Date().toISOString(), 
        updatedBy: request.user.uid 
      };
      await ref.update(updatesWithMeta);
      return sendSuccess(request, reply, { id: request.params.id, ...snap.data(), ...updatesWithMeta });
    }
  );

  // PATCH /assignments/:id/status — toggle status
  server.patch<{ Params: { id: string } }>(
    "/assignments/:id/status",
    { preHandler: [...preHandler, roleMiddleware(["Admin", "SuperAdmin", "Teacher"])] },
    async (request, reply) => {
      const ref = firestore.collection(COL).doc(request.params.id);
      const snap = await ref.get();
      if (!snap.exists || snap.data()?.schoolId !== request.schoolId)
        throw Errors.notFound("Assignment", request.params.id);

      const { status } = request.body as { status: string };
      await ref.update({ status, updatedAt: new Date().toISOString() });
      return sendSuccess(request, reply, { id: request.params.id, status });
    }
  );

  // DELETE /assignments/:id — soft delete
  server.delete<{ Params: { id: string } }>(
    "/assignments/:id",
    { preHandler: [...preHandler, roleMiddleware(["Admin", "SuperAdmin", "Teacher"])] },
    async (request, reply) => {
      const ref = firestore.collection(COL).doc(request.params.id);
      const snap = await ref.get();
      if (!snap.exists || snap.data()?.schoolId !== request.schoolId)
        throw Errors.notFound("Assignment", request.params.id);

      await ref.update({ isDeleted: true, updatedAt: new Date().toISOString(), updatedBy: request.user.uid });
      return sendSuccess(request, reply, { message: "Assignment deleted" });
    }
  );

  // ─── Submissions ────────────────────────────────────────────────────────

  // GET /submissions — list submissions
  server.get<{ Querystring: Record<string, string | undefined> }>(
    "/submissions",
    { preHandler },
    async (request, reply) => {
      let q = firestore
        .collection(SUB_COL)
        .where("schoolId", "==", request.schoolId);

      if (request.query.studentId) {
        q = q.where("studentId", "==", request.query.studentId);
      }
      if (request.query.assignmentId) {
        q = q.where("assignmentId", "==", request.query.assignmentId);
      }

      const snap = await q.limit(200).get();
      const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      return sendSuccess(request, reply, data);
    }
  );

  // POST /submissions — submit assignment
  server.post(
    "/submissions",
    { preHandler },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = createSubmissionSchema.safeParse(request.body);
      if (!parsed.success) {
        throw Errors.validation(parsed.error.flatten().fieldErrors);
      }

      const body = parsed.data;
      const now = new Date().toISOString();
      const doc = {
        ...body,
        schoolId: request.schoolId,
        submittedAt: body.submittedAt || now,
        createdAt: now,
      };
      const ref = await firestore.collection(SUB_COL).add(doc);
      return sendSuccess(request, reply, { id: ref.id, ...doc }, 201);
    }
  );
}
