import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { AssignmentStatus, type Prisma } from "@prisma/client";
import { z } from "zod";
import { authenticate } from "../../middleware/auth";
import { tenantGuard } from "../../middleware/tenant";
import { roleMiddleware } from "../../middleware/role";
import { sendSuccess } from "../../utils/response";
import { paginationSchema } from "../../utils/pagination";
import { prisma } from "../../lib/prisma";
import { Errors } from "../../errors";
import { validateAssignmentDeadline } from "../../services/validation.service";
import { dateTimeFrom } from "../../utils/safe-fields";

const preHandler = [authenticate, tenantGuard];

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

function resolveAssignmentStatus(status?: string): AssignmentStatus | undefined {
  if (!status) return undefined;

  const normalized = status.trim().toLowerCase();
  if (normalized === "pending") return AssignmentStatus.Pending;
  if (normalized === "submitted") return AssignmentStatus.Submitted;
  if (normalized === "graded") return AssignmentStatus.Graded;

  throw Errors.badRequest("Invalid status. Valid: Pending, Submitted, Graded");
}

function serializeAssignment<T extends { dueDate: Date; teacherId: string; isActive: boolean }>(
  assignment: T
) {
  return {
    ...assignment,
    deadline: assignment.dueDate.toISOString(),
    createdBy: assignment.teacherId,
    isDeleted: !assignment.isActive,
  };
}

export default async function assignmentRoutes(server: FastifyInstance) {
  // ─── Assignments ────────────────────────────────────────────────────────

  // GET /assignments — list assignments for the school
  server.get<{ Querystring: Record<string, string | undefined> }>(
    "/assignments",
    { preHandler },
    async (request, reply) => {
      const pagination = paginationSchema.parse(request.query);
      const where: Prisma.AssignmentWhereInput = {
        schoolId: request.schoolId,
        isActive: true,
      };

      const classId = request.query.classId || request.query["class"];
      if (classId) {
        where.classId = classId;
      }

      if (request.query.status) {
        where.status = resolveAssignmentStatus(request.query.status);
      }

      if (request.query.teacherId) {
        where.teacherId = request.query.teacherId;
      }

      const assignments = await prisma.assignment.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: pagination.limit,
      });

      const data = assignments.map((assignment) => serializeAssignment(assignment));
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

      const dueDate = body.deadline
        ? dateTimeFrom(body.deadline)
        : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      if (!dueDate) {
        throw Errors.badRequest("deadline must be in YYYY-MM-DD or ISO format");
      }

      if (
        request.user.role === "Teacher" &&
        typeof request.user.teacherId === "string" &&
        typeof body.teacherId === "string" &&
        body.teacherId !== request.user.teacherId
      ) {
        throw Errors.insufficientRole(["Teacher can only create assignments for self"]);
      }

      const teacherId =
        typeof body.teacherId === "string" && request.user.role !== "Teacher"
          ? body.teacherId
          : (typeof request.user.teacherId === "string" ? request.user.teacherId : request.user.uid);

      const status = resolveAssignmentStatus(body.status) ?? AssignmentStatus.Pending;

      const assignment = await prisma.assignment.create({
        data: {
          schoolId: request.schoolId,
          title: body.title,
          description: body.description ?? "",
          classId: body.classId,
          sectionId: typeof body.sectionId === "string" ? body.sectionId : "",
          className: typeof body.className === "string" ? body.className : null,
          subject: typeof body.subject === "string" && body.subject.trim().length > 0
            ? body.subject
            : "General",
          teacherId,
          teacherName:
            typeof request.user.displayName === "string"
              ? request.user.displayName
              : typeof request.user.name === "string"
                ? request.user.name
                : null,
          dueDate,
          totalMarks:
            typeof body.totalMarks === "number" && Number.isFinite(body.totalMarks) && body.totalMarks > 0
              ? Math.round(body.totalMarks)
              : 100,
          attachments: Array.isArray(body.attachments)
            ? body.attachments.filter((item): item is string => typeof item === "string")
            : [],
          status,
          isActive: true,
        },
      });

      return sendSuccess(request, reply, serializeAssignment(assignment), 201);
    }
  );

  // PATCH /assignments/:id — update
  server.patch<{ Params: { id: string } }>(
    "/assignments/:id",
    { preHandler: [...preHandler, roleMiddleware(["Admin", "SuperAdmin", "Teacher"])] },
    async (request, reply) => {
      const assignment = await prisma.assignment.findFirst({
        where: {
          id: request.params.id,
          schoolId: request.schoolId,
          isActive: true,
        },
      });
      if (!assignment) throw Errors.notFound("Assignment", request.params.id);

      const parsed = updateAssignmentSchema.safeParse(request.body);
      if (!parsed.success) {
        throw Errors.validation(parsed.error.flatten().fieldErrors);
      }

      const updates = parsed.data as Record<string, unknown>;

      // Validate deadline if being updated
      if (updates.deadline && typeof updates.deadline === 'string') {
        validateAssignmentDeadline(updates.deadline);
      }

      const dueDate =
        typeof updates.deadline === "string" ? dateTimeFrom(updates.deadline) : undefined;
      if (typeof updates.deadline === "string" && !dueDate) {
        throw Errors.badRequest("deadline must be in YYYY-MM-DD or ISO format");
      }

      const status =
        typeof updates.status === "string" ? resolveAssignmentStatus(updates.status) : undefined;

      const updateData: Prisma.AssignmentUpdateInput = {
        ...(typeof updates.title === "string" ? { title: updates.title } : {}),
        ...(typeof updates.description === "string" ? { description: updates.description } : {}),
        ...(typeof updates.subject === "string" ? { subject: updates.subject } : {}),
        ...(typeof updates.classId === "string" ? { classId: updates.classId } : {}),
        ...(typeof updates.sectionId === "string" ? { sectionId: updates.sectionId } : {}),
        ...(typeof updates.className === "string" ? { className: updates.className } : {}),
        ...(typeof updates.totalMarks === "number" && Number.isFinite(updates.totalMarks)
          ? { totalMarks: Math.round(updates.totalMarks) }
          : {}),
        ...(Array.isArray(updates.attachments)
          ? {
              attachments: updates.attachments.filter(
                (item): item is string => typeof item === "string"
              ),
            }
          : {}),
        ...(dueDate ? { dueDate } : {}),
        ...(status ? { status } : {}),
      };

      const updated = await prisma.assignment.update({
        where: { id: assignment.id },
        data: updateData,
      });

      return sendSuccess(request, reply, serializeAssignment(updated));
    }
  );

  // PATCH /assignments/:id/status — toggle status
  server.patch<{ Params: { id: string } }>(
    "/assignments/:id/status",
    { preHandler: [...preHandler, roleMiddleware(["Admin", "SuperAdmin", "Teacher"])] },
    async (request, reply) => {
      const existing = await prisma.assignment.findFirst({
        where: {
          id: request.params.id,
          schoolId: request.schoolId,
          isActive: true,
        },
      });
      if (!existing) throw Errors.notFound("Assignment", request.params.id);

      const { status } = request.body as { status: string };
      const resolvedStatus = resolveAssignmentStatus(status);

      const updated = await prisma.assignment.update({
        where: { id: existing.id },
        data: { status: resolvedStatus },
      });

      return sendSuccess(request, reply, { id: request.params.id, status: updated.status });
    }
  );

  // DELETE /assignments/:id — soft delete
  server.delete<{ Params: { id: string } }>(
    "/assignments/:id",
    { preHandler: [...preHandler, roleMiddleware(["Admin", "SuperAdmin", "Teacher"])] },
    async (request, reply) => {
      const assignment = await prisma.assignment.findFirst({
        where: {
          id: request.params.id,
          schoolId: request.schoolId,
          isActive: true,
        },
      });

      if (!assignment) {
        throw Errors.notFound("Assignment", request.params.id);
      }

      await prisma.assignment.update({
        where: { id: assignment.id },
        data: { isActive: false },
      });

      return sendSuccess(request, reply, { message: "Assignment deleted" });
    }
  );

  // ─── Submissions ────────────────────────────────────────────────────────

  // GET /submissions — list submissions
  server.get<{ Querystring: Record<string, string | undefined> }>(
    "/submissions",
    { preHandler },
    async (request, reply) => {
      const where: Prisma.ActivityWhereInput = {
        schoolId: request.schoolId,
        type: "assignment_submission",
        isDeleted: false,
      };

      if (request.query.studentId) {
        where.studentId = request.query.studentId;
      }

      if (request.query.assignmentId) {
        (where as any).metadata = {
          path: ["assignmentId"],
          equals: request.query.assignmentId,
        };
      }

      const submissions = await prisma.activity.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: 200,
      });

      const data = submissions.map((submission) => {
        const metadata =
          submission.metadata && typeof submission.metadata === "object"
            ? (submission.metadata as Record<string, unknown>)
            : {};

        return {
          id: submission.id,
          schoolId: submission.schoolId,
          assignmentId: typeof metadata.assignmentId === "string" ? metadata.assignmentId : null,
          studentId: submission.studentId,
          answerText: typeof metadata.answerText === "string" ? metadata.answerText : null,
          attachmentUrl: typeof metadata.attachmentUrl === "string" ? metadata.attachmentUrl : null,
          submittedAt:
            typeof metadata.submittedAt === "string"
              ? metadata.submittedAt
              : submission.createdAt.toISOString(),
          createdAt: submission.createdAt.toISOString(),
        };
      });

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

      if (
        request.user.role === "Student" &&
        typeof request.user.studentId === "string" &&
        request.user.studentId !== body.studentId
      ) {
        throw Errors.insufficientRole(["Student can only submit own assignment"]);
      }

      const assignment = await prisma.assignment.findFirst({
        where: {
          id: body.assignmentId,
          schoolId: request.schoolId,
          isActive: true,
        },
        select: { id: true, title: true },
      });

      if (!assignment) {
        throw Errors.notFound("Assignment", body.assignmentId);
      }

      const existingSubmission = await prisma.activity.findFirst({
        where: {
          schoolId: request.schoolId,
          type: "assignment_submission",
          isDeleted: false,
          studentId: body.studentId,
          metadata: {
            path: ["assignmentId"],
            equals: body.assignmentId,
          },
        },
        select: { id: true },
      });

      if (existingSubmission) {
        throw Errors.conflict("Assignment already submitted");
      }

      const submittedAtIso =
        typeof body.submittedAt === "string" && body.submittedAt.trim().length > 0
          ? body.submittedAt
          : new Date().toISOString();

      const created = await prisma.$transaction(async (tx) => {
        const activity = await tx.activity.create({
          data: {
            schoolId: request.schoolId,
            studentId: body.studentId,
            userId: request.user.uid,
            title: "Assignment submitted",
            description: assignment.title,
            type: "assignment_submission",
            metadata: {
              assignmentId: body.assignmentId,
              answerText: body.answerText ?? null,
              attachmentUrl: body.attachmentUrl ?? null,
              submittedAt: submittedAtIso,
            },
          },
        });

        await tx.assignment.update({
          where: { id: assignment.id },
          data: {
            submissionsCount: {
              increment: 1,
            },
          },
        });

        return activity;
      });

      return sendSuccess(
        request,
        reply,
        {
          id: created.id,
          assignmentId: body.assignmentId,
          studentId: body.studentId,
          answerText: body.answerText ?? null,
          attachmentUrl: body.attachmentUrl ?? null,
          submittedAt: submittedAtIso,
        },
        201
      );
    }
  );
}
