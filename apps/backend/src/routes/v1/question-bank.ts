import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { Difficulty, type Prisma } from "@prisma/client";
import { z } from "zod";
import { authenticate } from "../../middleware/auth";
import { tenantGuard } from "../../middleware/tenant";
import { roleMiddleware } from "../../middleware/role";
import { sendSuccess } from "../../utils/response";
import { prisma } from "../../lib/prisma";
import { Errors } from "../../errors";

const preHandler = [authenticate, tenantGuard];

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

function resolveDifficulty(value?: string): Difficulty {
  if (!value) return Difficulty.Medium;

  const normalized = value.trim().toLowerCase();
  if (normalized === "easy") return Difficulty.Easy;
  if (normalized === "medium") return Difficulty.Medium;
  if (normalized === "hard") return Difficulty.Hard;

  throw Errors.badRequest("Invalid difficulty. Valid: Easy, Medium, Hard");
}

export default async function questionBankRoutes(server: FastifyInstance) {
  // GET /question-bank — list questions for the school
  server.get<{ Querystring: Record<string, string | undefined> }>(
    "/question-bank",
    { preHandler },
    async (request, reply) => {
      const where: Prisma.QuestionBankWhereInput = {
        schoolId: request.schoolId,
      };

      const classId = request.query.classId || request.query["class"];
      if (classId) {
        where.classId = classId;
      }
      if (request.query.subject) {
        where.subject = request.query.subject;
      }

      const data = await prisma.questionBank.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: 100,
      });

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

      const question = await prisma.questionBank.create({
        data: {
          schoolId: request.schoolId,
          classId: body.classId,
          subject: body.subject,
          topic: body.topic,
          question: body.question,
          options: Array.isArray(body.options)
            ? body.options.filter((option): option is string => typeof option === "string")
            : [],
          answer: typeof body.answer === "string" ? body.answer : "",
          difficulty: resolveDifficulty(body.difficulty),
          createdBy: request.user.uid,
        },
      });

      return sendSuccess(request, reply, question, 201);
    }
  );

  // PATCH /question-bank/:id — update a question
  server.patch<{ Params: { id: string } }>(
    "/question-bank/:id",
    { preHandler: [...preHandler, roleMiddleware(["Admin", "SuperAdmin", "Teacher"])] },
    async (request, reply) => {
      const existing = await prisma.questionBank.findFirst({
        where: {
          id: request.params.id,
          schoolId: request.schoolId,
        },
      });
      if (!existing) {
        throw Errors.notFound("Question", request.params.id);
      }

      const parsed = updateQuestionSchema.safeParse(request.body);
      if (!parsed.success) {
        throw Errors.validation(parsed.error.flatten().fieldErrors);
      }

      const body = parsed.data;

      const updated = await prisma.questionBank.update({
        where: { id: existing.id },
        data: {
          ...(typeof body.classId === "string" ? { classId: body.classId } : {}),
          ...(typeof body.subject === "string" ? { subject: body.subject } : {}),
          ...(typeof body.topic === "string" ? { topic: body.topic } : {}),
          ...(typeof body.question === "string" ? { question: body.question } : {}),
          ...(Array.isArray(body.options)
            ? {
                options: body.options.filter(
                  (option): option is string => typeof option === "string"
                ),
              }
            : {}),
          ...(typeof body.answer === "string" ? { answer: body.answer } : {}),
          ...(typeof body.difficulty === "string"
            ? { difficulty: resolveDifficulty(body.difficulty) }
            : {}),
        },
      });

      return sendSuccess(request, reply, updated);
    }
  );

  // DELETE /question-bank/:id — soft delete
  server.delete<{ Params: { id: string } }>(
    "/question-bank/:id",
    { preHandler: [...preHandler, roleMiddleware(["Admin", "SuperAdmin", "Teacher"])] },
    async (request, reply) => {
      const existing = await prisma.questionBank.findFirst({
        where: {
          id: request.params.id,
          schoolId: request.schoolId,
        },
      });
      if (!existing) {
        throw Errors.notFound("Question", request.params.id);
      }

      await prisma.questionBank.delete({ where: { id: existing.id } });

      return sendSuccess(request, reply, null);
    }
  );
}
