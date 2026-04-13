import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import { authenticate } from "../../middleware/auth";
import { tenantGuard } from "../../middleware/tenant";
import { roleMiddleware } from "../../middleware/role";
import { enforceSubscription } from "../../middleware/subscription";
import { prisma } from "../../lib/prisma";
import {
  cancelSubscription,
} from "../../services/subscription.service";
import {
  getInvoicesBySchool,
  getInvoiceById,
} from "../../services/invoice.service";
import {
  previewPlanChange,
  executePlanChange,
  listPlans,
} from "../../services/plan-change.service";
import { sendSuccess } from "../../utils/response";
import { AppError, Errors } from "../../errors";
import { writeAuditLog } from "../../services/audit.service";

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const cancelSubscriptionSchema = z.object({
  reason: z.string().max(500).optional(),
}).strict();

const changePlanSchema = z.object({
  newPlan: z.enum(["free", "basic", "pro", "enterprise"]),
  billingCycle: z.enum(["monthly", "yearly"]).default("monthly"),
}).strict();

const previewPlanSchema = z.object({
  newPlan: z.enum(["free", "basic", "pro", "enterprise"]),
  billingCycle: z.enum(["monthly", "yearly"]).default("monthly"),
}).strict();

// ---------------------------------------------------------------------------
// Route plugin
// ---------------------------------------------------------------------------

export default async function subscriptionRoutes(server: FastifyInstance) {
  const authChain = [
    authenticate,
    tenantGuard,
    roleMiddleware(["Admin", "SuperAdmin"]),
  ];

  // -----------------------------------------------------------------------
  // GET /subscriptions/status — current subscription state
  // -----------------------------------------------------------------------
  server.get(
    "/subscriptions/status",
    { preHandler: authChain },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const schoolId = request.schoolId as string;

      const school = await prisma.school.findUnique({
        where: { id: schoolId },
        select: {
          id: true,
          subscriptionPlan: true,
          subscriptionStatus: true,
          autoRenew: true,
          trialEndDate: true,
          currentPeriodStart: true,
          currentPeriodEnd: true,
          cancelledAt: true,
          cancelEffectiveDate: true,
          paymentFailureCount: true,
          maxStudents: true,
          maxTeachers: true,
          maxStorage: true,
          currentStudents: true,
          currentTeachers: true,
          currentStorage: true,
        },
      });

      if (!school) {
        return reply.status(404).send({
          success: false,
          error: { code: "SCHOOL_NOT_FOUND", message: "School not found" },
        });
      }

      const status: Record<string, unknown> = {
        schoolId,
        subscriptionPlan: school.subscriptionPlan ?? "free",
        subscriptionStatus: school.subscriptionStatus ?? "trial",
        autoRenew: school.autoRenew ?? false,
        trialEndDate: school.trialEndDate ?? null,
        currentPeriodStart: school.currentPeriodStart ?? null,
        currentPeriodEnd: school.currentPeriodEnd ?? null,
        cancelledAt: school.cancelledAt ?? null,
        cancelEffectiveDate: school.cancelEffectiveDate ?? null,
        paymentFailureCount: school.paymentFailureCount ?? 0,
        limits: {
          maxStudents: school.maxStudents ?? null,
          maxTeachers: school.maxTeachers ?? null,
          maxStorage: school.maxStorage ?? null,
        },
        usage: {
          students: school.currentStudents ?? 0,
          teachers: school.currentTeachers ?? 0,
          storage: school.currentStorage ?? 0,
        },
      };

      return sendSuccess(request, reply, status);
    }
  );

  // -----------------------------------------------------------------------
  // POST /subscriptions/cancel — cancel at end of period
  // -----------------------------------------------------------------------
  server.post(
    "/subscriptions/cancel",
    { preHandler: authChain },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const schoolId = request.schoolId as string;
      const uid = request.user!.uid;

      const body = cancelSubscriptionSchema.parse(request.body ?? {});

      const result = await cancelSubscription(schoolId, uid);

      await writeAuditLog("SUBSCRIPTION_CANCEL_REQUESTED", uid, schoolId, {
        cancelEffectiveDate: result.cancelEffectiveDate,
        reason: body.reason ?? null,
      });

      // Invalidate school cache after status change
      server.cache.del("school", schoolId);

      return sendSuccess(request, reply, {
        cancelEffectiveDate: result.cancelEffectiveDate,
        message:
          "Subscription will be cancelled at the end of the current billing period",
        reason: body.reason,
      });
    }
  );

  // -----------------------------------------------------------------------
  // GET /subscriptions/invoices — list invoices for current school
  // -----------------------------------------------------------------------
  server.get(
    "/subscriptions/invoices",
    { preHandler: authChain },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const schoolId = request.schoolId as string;
      const { limit } = (request.query as Record<string, string>) ?? {};
      const parsedLimit = Math.min(Math.max(parseInt(limit) || 50, 1), 200);

      const invoices = await getInvoicesBySchool(schoolId, parsedLimit);

      return sendSuccess(request, reply, { invoices, count: invoices.length });
    }
  );

  // -----------------------------------------------------------------------
  // GET /subscriptions/invoices/:invoiceId — single invoice detail
  // -----------------------------------------------------------------------
  server.get<{ Params: { invoiceId: string } }>(
    "/subscriptions/invoices/:invoiceId",
    { preHandler: authChain },
    async (request, reply) => {
      const schoolId = request.schoolId as string;
      const { invoiceId } = request.params;

      const invoice = await getInvoiceById(invoiceId, schoolId);

      if (!invoice) {
        return reply.status(404).send({
          success: false,
          error: { code: "INVOICE_NOT_FOUND", message: "Invoice not found" },
        });
      }

      return sendSuccess(request, reply, { invoice });
    }
  );

  // -----------------------------------------------------------------------
  // GET /subscriptions/usage — current usage vs limits
  // -----------------------------------------------------------------------
  server.get(
    "/subscriptions/usage",
    { preHandler: [...authChain, enforceSubscription] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const schoolId = request.schoolId as string;

      const school = await prisma.school.findUnique({
        where: { id: schoolId },
        select: {
          id: true,
          maxStudents: true,
          maxTeachers: true,
          maxStorage: true,
          currentStorage: true,
          subscriptionPlan: true,
          subscriptionStatus: true,
        },
      });

      if (!school) {
        return reply.status(404).send({
          success: false,
          error: { code: "SCHOOL_NOT_FOUND", message: "School not found" },
        });
      }

      // Count actual usage from PostgreSQL.
      const [studentCount, teacherCount, classCount] = await Promise.all([
        prisma.student.count({
          where: {
            schoolId,
            isDeleted: false,
          },
        }),
        prisma.teacher.count({
          where: {
            schoolId,
            isDeleted: false,
          },
        }),
        prisma.class.count({
          where: {
            schoolId,
            isActive: true,
          },
        }),
      ]);

      // Keep denormalized counters in sync for admin dashboards.
      await prisma.school.update({
        where: { id: schoolId },
        data: {
          currentStudents: studentCount,
          currentTeachers: teacherCount,
        },
      });

      const usage = {
        students: {
          current: studentCount,
          limit: school.maxStudents ?? null,
          remaining:
            school.maxStudents != null
              ? Math.max(0, school.maxStudents - studentCount)
              : null,
        },
        teachers: {
          current: teacherCount,
          limit: school.maxTeachers ?? null,
          remaining:
            school.maxTeachers != null
              ? Math.max(0, school.maxTeachers - teacherCount)
              : null,
        },
        storage: {
          current: school.currentStorage ?? 0,
          limit: school.maxStorage ?? null,
          remaining:
            school.maxStorage != null
              ? Math.max(0, school.maxStorage - (school.currentStorage ?? 0))
              : null,
        },
        classes: {
          current: classCount,
          limit: null,
          remaining: null,
        },
        plan: school.subscriptionPlan ?? "free",
        status: school.subscriptionStatus ?? "trial",
      };

      return sendSuccess(request, reply, usage);
    }
  );

  // -----------------------------------------------------------------------
  // GET /subscriptions/plans — list all available plans
  // -----------------------------------------------------------------------
  server.get(
    "/subscriptions/plans",
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const plans = listPlans();
      return reply.status(200).send({ success: true, data: plans });
    }
  );

  // -----------------------------------------------------------------------
  // POST /subscriptions/change-plan/preview — dry-run proration preview
  // -----------------------------------------------------------------------
  server.post(
    "/subscriptions/change-plan/preview",
    { preHandler: authChain },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const schoolId = request.schoolId as string;

      const parsed = previewPlanSchema.safeParse(request.body);
      if (!parsed.success) {
        throw Errors.validation(parsed.error.flatten().fieldErrors);
      }

      const preview = await previewPlanChange(
        schoolId,
        parsed.data.newPlan,
        parsed.data.billingCycle
      );

      return sendSuccess(request, reply, preview);
    }
  );

  // -----------------------------------------------------------------------
  // POST /subscriptions/change-plan — execute plan upgrade or downgrade
  // -----------------------------------------------------------------------
  server.post(
    "/subscriptions/change-plan",
    { preHandler: authChain },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const schoolId = request.schoolId as string;
      const uid = request.user!.uid;

      const parsed = changePlanSchema.safeParse(request.body);
      if (!parsed.success) {
        throw Errors.validation(parsed.error.flatten().fieldErrors);
      }

      try {
        const result = await executePlanChange(
          schoolId,
          parsed.data.newPlan,
          parsed.data.billingCycle,
          uid
        );

        await writeAuditLog("SUBSCRIPTION_PLAN_CHANGE", uid, schoolId, {
          newPlan: parsed.data.newPlan,
          billingCycle: parsed.data.billingCycle,
          hasImmediateOrder: Boolean(result.order),
        });

        // Invalidate school cache after plan change
        server.cache.del("school", schoolId);

        return sendSuccess(request, reply, result, result.order ? 201 : 200);
      } catch (err) {
        if (err instanceof AppError) {
          throw err;
        }

        throw Errors.internal();
      }
    }
  );
}
