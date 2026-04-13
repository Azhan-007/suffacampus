import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import {
  createOrder,
  normalizePlanCode,
  resolveSubscriptionAmountPaise,
  verifyPaymentAndPersist,
} from "../../services/payment.service";
import { prisma } from "../../lib/prisma";
import { authenticate } from "../../middleware/auth";
import { tenantGuard } from "../../middleware/tenant";
import { roleMiddleware } from "../../middleware/role";
import { sendSuccess } from "../../utils/response";
import { Errors } from "../../errors";
import { writeAuditLog } from "../../services/audit.service";

const createOrderSchema = z.object({
  amount: z
    .number()
    .int()
    .positive("Amount must be a positive integer (in paise)")
    .optional(),
  currency: z.string().trim().length(3).default("INR"),
  plan: z.string().min(1, "Plan is required"),
  billingCycle: z.enum(["monthly", "yearly"]).default("monthly"),
  durationDays: z.number().int().positive().optional(),
  description: z.string().max(300).optional(),
}).strict();

const verifyPaymentSchema = z.object({
  razorpay_payment_id: z.string().min(1),
  razorpay_order_id: z.string().min(1),
  razorpay_signature: z.string().min(1),
}).strict();

const refundPaymentSchema = z.object({
  paymentId: z.string().min(1),
  amount: z.number().positive().optional(),
  reason: z.string().max(300).optional(),
}).strict();

const recordPaymentSchema = z.object({
  studentId: z.string().min(1).optional(),
  feeId: z.string().min(1).optional(),
  amount: z.number().positive(),
  method: z.enum(["card", "upi", "netbanking", "wallet"]),
  receiptId: z.string().min(1).optional(),
  status: z.enum(["Paid", "Pending", "Failed"]).default("Paid"),
}).strict();

const preHandler = [
  authenticate,
  tenantGuard,
  roleMiddleware(["Admin", "SuperAdmin"]),
];

export default async function paymentRoutes(server: FastifyInstance) {
  // POST /api/v1/payments/create-order
  server.post(
    "/payments/create-order",
    { preHandler },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const result = createOrderSchema.safeParse(request.body);

      if (!result.success) {
        throw Errors.validation(result.error.flatten().fieldErrors);
      }

      const normalizedPlan = normalizePlanCode(result.data.plan);
      if (!normalizedPlan) {
        throw Errors.badRequest(
          "Unsupported plan. Allowed values: free, basic, pro, enterprise"
        );
      }

      const serverAmount = resolveSubscriptionAmountPaise(
        normalizedPlan,
        result.data.billingCycle,
        result.data.durationDays
      );

      if (serverAmount <= 0) {
        throw Errors.badRequest(
          "Selected plan does not require payment order creation"
        );
      }

      if (
        result.data.amount !== undefined &&
        Math.trunc(result.data.amount) !== serverAmount
      ) {
        throw Errors.badRequest("Amount mismatch. Use backend-computed order amount.");
      }

      const idempotencyHeader = request.headers["idempotency-key"];
      const idempotencyKey =
        typeof idempotencyHeader === "string"
          ? idempotencyHeader
          : Array.isArray(idempotencyHeader)
            ? idempotencyHeader[0]
            : undefined;

      const order = await createOrder({
        amount: serverAmount,
        currency: result.data.currency,
        schoolId: request.schoolId,
        plan: normalizedPlan,
        durationDays: result.data.durationDays,
        billingCycle: result.data.billingCycle,
        idempotencyKey,
        initiatedBy: request.user.uid,
        description: result.data.description,
      });

      return sendSuccess(
        request,
        reply,
        {
          order,
          id: order.id,
          amount: order.amount,
          currency: order.currency,
          receipt: order.receipt,
        },
        201
      );
    }
  );

  // POST /api/v1/payments/verify
  server.post(
    "/payments/verify",
    { preHandler },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = verifyPaymentSchema.safeParse(request.body);
      if (!parsed.success) {
        throw Errors.validation(parsed.error.flatten().fieldErrors);
      }

      const verification = await verifyPaymentAndPersist({
        schoolId: request.schoolId,
        razorpayOrderId: parsed.data.razorpay_order_id,
        razorpayPaymentId: parsed.data.razorpay_payment_id,
        razorpaySignature: parsed.data.razorpay_signature,
        performedBy: request.user.uid,
      });

      return sendSuccess(request, reply, verification);
    }
  );

  // POST /api/v1/payments/refund
  server.post(
    "/payments/refund",
    { preHandler },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = refundPaymentSchema.safeParse(request.body);
      if (!parsed.success) {
        throw Errors.validation(parsed.error.flatten().fieldErrors);
      }

      const payment = await prisma.legacyPayment.findFirst({
        where: {
          schoolId: request.schoolId,
          OR: [
            { id: parsed.data.paymentId },
            { gatewayId: parsed.data.paymentId },
          ],
        },
      });

      if (!payment) {
        throw Errors.notFound("Payment", parsed.data.paymentId);
      }

      const refundId = `rfnd_${payment.id}`;
      await prisma.legacyPayment.update({
        where: { id: payment.id },
        data: {
          status: "refunded",
          refundedAmount: parsed.data.amount ?? payment.amount,
          failureReason: parsed.data.reason ?? null,
        },
      });

      await writeAuditLog("PAYMENT_REFUNDED", request.user.uid, request.schoolId, {
        paymentId: payment.id,
        refundId,
        amount: parsed.data.amount ?? payment.amount,
      });

      return sendSuccess(request, reply, { success: true, refundId });
    }
  );

  // GET /api/v1/payments/history
  server.get<{ Querystring: { page?: string; limit?: string; status?: string } }>(
    "/payments/history",
    { preHandler },
    async (request, reply) => {
      const page = Math.max(parseInt(request.query.page ?? "1", 10) || 1, 1);
      const limit = Math.min(Math.max(parseInt(request.query.limit ?? "20", 10) || 20, 1), 100);
      const skip = (page - 1) * limit;

      const where = {
        schoolId: request.schoolId,
        ...(request.query.status ? { status: request.query.status.toLowerCase() as any } : {}),
      };

      const items = await prisma.legacyPayment.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      });

      return sendSuccess(request, reply, items);
    }
  );

  // POST /api/v1/payments
  server.post(
    "/payments",
    {
      preHandler: [authenticate, tenantGuard],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = recordPaymentSchema.safeParse(request.body);
      if (!parsed.success) {
        throw Errors.validation(parsed.error.flatten().fieldErrors);
      }

      const payment = await prisma.legacyPayment.create({
        data: {
          schoolId: request.schoolId,
          amount: parsed.data.amount,
          currency: "INR",
          method: parsed.data.method,
          status:
            parsed.data.status === "Paid"
              ? "completed"
              : parsed.data.status === "Failed"
                ? "failed"
                : "pending",
          gatewayId: parsed.data.receiptId ?? null,
          description: parsed.data.feeId
            ? `Fee payment for feeId ${parsed.data.feeId}`
            : "Generic payment record",
        },
      });

      try {
        await writeAuditLog("PAYMENT_CREATED", request.user.uid, request.schoolId, {
          paymentId: payment.id,
          amount: payment.amount,
          method: payment.method,
          status: payment.status,
        });
      } catch (error) {
        request.log.error(
          { err: error, paymentId: payment.id, schoolId: request.schoolId },
          "Failed to write PAYMENT_CREATED audit log"
        );
      }

      return sendSuccess(request, reply, payment, 201);
    }
  );
}
