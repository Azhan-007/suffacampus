import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import { authenticate } from "../../middleware/auth";
import { tenantGuard } from "../../middleware/tenant";
import { roleMiddleware } from "../../middleware/role";
import { sendSuccess } from "../../utils/response";
import { firestore } from "../../lib/firebase-admin";
import { Errors } from "../../errors";

const preHandler = [authenticate, tenantGuard];
const COL = "questionBank";

const createQuestionSchema = z
  .object({
    classId: z.string().min(1, "classId is required"),
    subject: z.string().min(1, "subject is required"),
    topic: z.string().min(1, "topic is required"),
    question: z.string().min(1, "question is required"),
    options: z.array(z.string()).min(2).optional(),
    answer: z.string().optional(),
    difficulty: z.string().optional(),
  })
  .passthrough();

const updateQuestionSchema = createQuestionSchema.partial();

export default async function questionBankRoutes(server: FastifyInstance) {
  // GET /question-bank — list questions for the school
  server.get<{ Querystring: Record<string, string | undefined> }>(
    "/question-bank",
    { preHandler },
    async (request, reply) => {
      let q = firestore
        .collection(COL)
        .where("schoolId", "==", request.schoolId)
        .where("isDeleted", "==", false);

      if (request.query.classId || request.query["class"]) {
        q = q.where("classId", "==", request.query.classId || request.query["class"]);
      }
      if (request.query.subject) {
        q = q.where("subject", "==", request.query.subject);
      }

      q = q.orderBy("createdAt", "desc").limit(100);
      const snap = await q.get();
      const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      return sendSuccess(request, reply, data);
    }
  );

  // POST /question-bank — create a question
  server.post(
    "/question-bank",
    { preHandler: [...preHandler, roleMiddleware(["Admin", "SuperAdmin", "Teacher"])] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = createQuestionSchema.safeParse(request.body);
      if (!parsed.success) {
        throw Errors.validation(parsed.error.flatten().fieldErrors);
      }

      const body = parsed.data;
      const now = new Date().toISOString();
      const doc = {
        ...body,
        schoolId: request.schoolId,
        uploadedBy: request.user.uid,
        isDeleted: false,
        createdAt: now,
        updatedAt: now,
      };
      const ref = await firestore.collection(COL).add(doc);
      return sendSuccess(request, reply, { id: ref.id, ...doc }, 201);
    }
  );

  // PATCH /question-bank/:id — update a question
  server.patch<{ Params: { id: string } }>(
    "/question-bank/:id",
    { preHandler: [...preHandler, roleMiddleware(["Admin", "SuperAdmin", "Teacher"])] },
    async (request, reply) => {
      const ref = firestore.collection(COL).doc(request.params.id);
      const snap = await ref.get();
      if (!snap.exists || snap.data()?.schoolId !== request.schoolId || snap.data()?.isDeleted)
        throw Errors.notFound("Question", request.params.id);

      const parsed = updateQuestionSchema.safeParse(request.body);
      if (!parsed.success) {
        throw Errors.validation(parsed.error.flatten().fieldErrors);
      }

      const updates = { ...(parsed.data as object), updatedAt: new Date().toISOString() };
      await ref.update(updates);
      return sendSuccess(request, reply, { id: request.params.id, ...snap.data(), ...updates });
    }
  );

  // DELETE /question-bank/:id — soft delete
  server.delete<{ Params: { id: string } }>(
    "/question-bank/:id",
    { preHandler: [...preHandler, roleMiddleware(["Admin", "SuperAdmin", "Teacher"])] },
    async (request, reply) => {
      const ref = firestore.collection(COL).doc(request.params.id);
      const snap = await ref.get();
      if (!snap.exists || snap.data()?.schoolId !== request.schoolId)
        throw Errors.notFound("Question", request.params.id);

      await ref.update({ isDeleted: true, updatedAt: new Date().toISOString() });
      return sendSuccess(request, reply, null);
    }
  );
}
