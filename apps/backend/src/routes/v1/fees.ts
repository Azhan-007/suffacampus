import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import { createFeeSchema, updateFeeSchema } from "../../schemas/modules.schema";
import { paginationSchema } from "../../utils/pagination";
import {
  createFee,
  getFeesBySchool,
  getFeeById,
  updateFee,
  softDeleteFee,
  getFeeStats,
} from "../../services/fee.service";
import { createNotification } from "../../services/notification.service";
import { prisma } from "../../lib/prisma";
import { authenticate } from "../../middleware/auth";
import { tenantGuard } from "../../middleware/tenant";
import { requirePermission } from "../../middleware/permission";
import { sendSuccess, sendPaginated } from "../../utils/response";
import { Errors } from "../../errors";
import { writeAuditLog } from "../../services/audit.service";

const preHandler = [authenticate, tenantGuard];

const createFeeStructureSchema = z.object({
  name: z.string().min(1, "name is required").trim(),
  amount: z.number().positive("amount must be greater than 0"),
  classId: z.string().min(1, "classId is required"),
});

const assignFeeSchema = z.object({
  studentId: z.string().min(1, "studentId is required"),
  feeStructureId: z.string().min(1, "feeStructureId is required"),
});

const payFeeSchema = z.object({
  studentFeeId: z.string().min(1, "studentFeeId is required"),
  amount: z.number().positive("amount must be greater than 0"),
});

export default async function feeRoutes(server: FastifyInstance) {
  // GET /admin/fee-templates
  server.get(
    "/admin/fee-templates",
    {
      preHandler: [
        ...preHandler,
        requirePermission("FEE_VIEW"),
      ],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const templates = await prisma.feeStructure.findMany({
        where: { schoolId: request.schoolId },
        orderBy: { id: "desc" },
      });

      return sendSuccess(request, reply, templates);
    }
  );

  // POST /admin/fee-templates
  server.post(
    "/admin/fee-templates",
    {
      preHandler: [
        ...preHandler,
        requirePermission("FEE_CREATE"),
      ],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const result = createFeeStructureSchema.safeParse(request.body);
      if (!result.success) {
        throw Errors.validation(result.error.flatten().fieldErrors);
      }

      const cls = await prisma.class.findFirst({
        where: {
          id: result.data.classId,
          schoolId: request.schoolId,
        },
        select: { id: true },
      });

      if (!cls) {
        throw Errors.badRequest("classId does not belong to this school");
      }

      const created = await prisma.feeStructure.create({
        data: {
          schoolId: request.schoolId,
          name: result.data.name,
          amount: result.data.amount,
          classId: result.data.classId,
        },
      });

      return sendSuccess(request, reply, created, 201);
    }
  );

  // POST /fees/structure
  server.post(
    "/fees/structure",
    {
      preHandler: [
        ...preHandler,
        requirePermission("FEE_CREATE"),
      ],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const result = createFeeStructureSchema.safeParse(request.body);
      if (!result.success) {
        throw Errors.validation(result.error.flatten().fieldErrors);
      }

      const schoolId = request.user.schoolId;
      if (typeof schoolId !== "string" || schoolId.trim().length === 0) {
        throw Errors.tenantMissing();
      }

      const cls = await prisma.class.findFirst({
        where: {
          id: result.data.classId,
          schoolId,
        },
        select: { id: true },
      });

      if (!cls) {
        throw Errors.badRequest("classId does not belong to this school");
      }

      const feeStructure = await prisma.feeStructure.create({
        data: {
          name: result.data.name,
          amount: result.data.amount,
          classId: result.data.classId,
          schoolId,
        },
      });

      return sendSuccess(request, reply, feeStructure, 201);
    }
  );

  // POST /fees/assign
  server.post(
    "/fees/assign",
    {
      preHandler: [
        ...preHandler,
        requirePermission("FEE_CREATE"),
      ],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const result = assignFeeSchema.safeParse(request.body);
      if (!result.success) {
        throw Errors.validation(result.error.flatten().fieldErrors);
      }

      const schoolId = request.schoolId;

      const student = await prisma.student.findFirst({
        where: {
          id: result.data.studentId,
          schoolId,
          isDeleted: false,
        },
        select: { id: true },
      });

      if (!student) {
        throw Errors.tenantMismatch();
      }

      const feeStructure = await prisma.feeStructure.findFirst({
        where: {
          id: result.data.feeStructureId,
          schoolId,
        },
        select: {
          id: true,
          amount: true,
        },
      });

      if (!feeStructure) {
        throw Errors.tenantMismatch();
      }

      const studentFee = await prisma.studentFee.create({
        data: {
          studentId: result.data.studentId,
          feeStructureId: result.data.feeStructureId,
          schoolId,
          totalAmount: feeStructure.amount,
        },
      });

      return sendSuccess(request, reply, studentFee, 201);
    }
  );

  // POST /fees/pay
  server.post(
    "/fees/pay",
    {
      preHandler: [
        ...preHandler,
        requirePermission("FEE_PAY"),
      ],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const result = payFeeSchema.safeParse(request.body);
      if (!result.success) {
        throw Errors.validation(result.error.flatten().fieldErrors);
      }

      const schoolId = request.schoolId;

      const studentFee = await prisma.studentFee.findFirst({
        where: {
          id: result.data.studentFeeId,
          schoolId,
        },
        select: {
          id: true,
          studentId: true,
          feeStructureId: true,
          totalAmount: true,
          paidAmount: true,
        },
      });

      if (!studentFee) {
        throw Errors.tenantMismatch();
      }

      const [student, feeStructure] = await Promise.all([
        prisma.student.findFirst({
          where: {
            id: studentFee.studentId,
            schoolId,
            isDeleted: false,
          },
          select: { id: true, firstName: true, lastName: true },
        }),
        prisma.feeStructure.findFirst({
          where: {
            id: studentFee.feeStructureId,
            schoolId,
          },
          select: { id: true },
        }),
      ]);

      if (!student || !feeStructure) {
        throw Errors.tenantMismatch();
      }

      const nextPaidAmount = studentFee.paidAmount + result.data.amount;

      if (nextPaidAmount > studentFee.totalAmount) {
        throw Errors.badRequest("Payment exceeds total fee amount");
      }

      let nextStatus: "PENDING" | "PARTIAL" | "PAID" = "PENDING";
      if (nextPaidAmount === studentFee.totalAmount) {
        nextStatus = "PAID";
      } else if (nextPaidAmount > 0) {
        nextStatus = "PARTIAL";
      }

      const { payment, updatedStudentFee } = await prisma.$transaction(async (tx) => {
        const createdPayment = await tx.payment.create({
          data: {
            studentFeeId: studentFee.id,
            amount: result.data.amount,
            paidAt: new Date(),
            schoolId,
          },
        });

        const paymentOwnedByTenant = await tx.payment.findFirst({
          where: {
            id: createdPayment.id,
            schoolId,
          },
          select: { id: true },
        });

        if (!paymentOwnedByTenant) {
          throw Errors.tenantMismatch();
        }

        const updated = await tx.studentFee.update({
          where: { id: studentFee.id },
          data: {
            paidAmount: nextPaidAmount,
            status: nextStatus,
          },
        });

        return { payment: createdPayment, updatedStudentFee: updated };
      });

      try {
        const parents = await prisma.user.findMany({
          where: {
            schoolId,
            role: "Parent" as any,
            isActive: true,
            studentIds: { has: student.id },
          },
          select: { uid: true },
        });

        if (parents.length > 0) {
          const studentName = `${student.firstName} ${student.lastName}`.trim() || "student";
          const message = `Payment of ₹${payment.amount} received for ${studentName}`;
          const actorRole = request.user.role ?? "Staff";

          for (const parent of parents) {
            const duplicate = await prisma.notification.findFirst({
              where: {
                schoolId,
                type: "INFO" as any,
                targetType: "USER" as any,
                targetId: parent.uid,
                referenceType: "PAYMENT",
                referenceId: payment.id,
              },
              select: { id: true },
            });

            if (duplicate) continue;

            try {
              await createNotification(
                {
                  title: "Payment Received",
                  message,
                  type: "INFO",
                  targetType: "USER",
                  targetId: parent.uid,
                  referenceType: "PAYMENT",
                  referenceId: payment.id,
                },
                {
                  userId: request.user.uid,
                  schoolId,
                  role: actorRole,
                }
              );
            } catch {
              // Continue notifying other parents even if one send fails.
            }
          }
        }
      } catch {
        // Keep payment flow non-blocking if notification side-effect fails.
      }

      return sendSuccess(request, reply, { payment, studentFee: updatedStudentFee }, 201);
    }
  );

  // POST /fees
  server.post(
    "/fees",
    {
      preHandler: [
        ...preHandler,
        requirePermission("FEE_CREATE"),
      ],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const result = createFeeSchema.safeParse(request.body);
      if (!result.success) throw Errors.validation(result.error.flatten().fieldErrors);

      const fee = await createFee(request.schoolId, result.data, request.user.uid);

      await writeAuditLog("FEE_CREATED", request.user.uid, request.schoolId, {
        feeId: fee.id,
        studentId: fee.studentId,
        amount: fee.amount,
        dueDate: fee.dueDate,
        status: fee.status,
      });

      return sendSuccess(request, reply, fee, 201);
    }
  );

  // GET /fees (paginated, filterable)
  server.get<{ Querystring: Record<string, string | undefined> }>(
    "/fees",
    { preHandler: [...preHandler, requirePermission("FEE_VIEW")] },
    async (request, reply) => {
      const pagination = paginationSchema.parse(request.query);
      const filters = {
        studentId: request.query.studentId,
        classId: request.query.classId,
        status: request.query.status,
        feeType: request.query.feeType,
      };

      const result = await getFeesBySchool(request.schoolId, pagination, filters);
      return sendPaginated(request, reply, result.data, result.pagination);
    }
  );

  // GET /fees/stats — fee collection statistics
  server.get(
    "/fees/stats",
    { preHandler: [...preHandler, requirePermission("FEE_VIEW")] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const stats = await getFeeStats(request.schoolId);
      return sendSuccess(request, reply, stats);
    }
  );

  // GET /fees/:id
  server.get<{ Params: { id: string } }>(
    "/fees/:id",
    { preHandler: [...preHandler, requirePermission("FEE_VIEW")] },
    async (request, reply) => {
      const fee = await getFeeById(request.params.id, request.schoolId);
      if (!fee) throw Errors.notFound("Fee", request.params.id);
      return sendSuccess(request, reply, fee);
    }
  );

  // PATCH /fees/:id
  server.patch<{ Params: { id: string } }>(
    "/fees/:id",
    {
      preHandler: [
        ...preHandler,
        requirePermission("FEE_UPDATE"),
      ],
    },
    async (request, reply) => {
      const result = updateFeeSchema.safeParse(request.body);
      if (!result.success) throw Errors.validation(result.error.flatten().fieldErrors);
      if (Object.keys(result.data).length === 0) throw Errors.badRequest("No fields to update");

      const fee = await updateFee(request.params.id, request.schoolId, result.data, request.user.uid);

      await writeAuditLog("FEE_UPDATED", request.user.uid, request.schoolId, {
        feeId: request.params.id,
        updatedFields: Object.keys(result.data),
      });

      return sendSuccess(request, reply, fee);
    }
  );

  // DELETE /fees/:id
  server.delete<{ Params: { id: string } }>(
    "/fees/:id",
    {
      preHandler: [
        ...preHandler,
        requirePermission("FEE_DELETE"),
      ],
    },
    async (request, reply) => {
      const deleted = await softDeleteFee(request.params.id, request.schoolId, request.user.uid);
      if (!deleted) throw Errors.notFound("Fee", request.params.id);

      await writeAuditLog("FEE_DELETED", request.user.uid, request.schoolId, {
        feeId: request.params.id,
      });

      return sendSuccess(request, reply, { message: "Fee deleted" });
    }
  );
}
