import type { FastifyInstance } from "fastify";
import {
  verifyWebhookSignature,
  handlePaymentCaptured,
  type PaymentCapturedPayload,
  verifyStripeWebhookSignature,
} from "../services/payment.service";
import { reactivateSubscription } from "../services/subscription.service";
import { writeAuditLog } from "../services/audit.service";
import { logWebhookFailure } from "../services/webhook-failure.service";
import { enqueueWebhookRetry } from "../services/webhook-retry-queue.service";
import { prisma } from "../lib/prisma";

interface RazorpayWebhookPayload {
  event: string;
  payload: {
    payment?: {
      entity: {
        id: string;
        order_id: string;
        amount: number;
        currency: string;
        status: string;
        notes: Record<string, string>;
        error_code?: string;
        error_description?: string;
        error_reason?: string;
      };
    };
    refund?: {
      entity: {
        id: string;
        payment_id: string;
        amount: number;
        currency: string;
        notes: Record<string, string>;
      };
    };
  };
}

interface StripeWebhookPayload {
  type?: string;
  data?: {
    object?: Record<string, unknown>;
  };
}

function getRawBody(body: unknown): Buffer {
  if (body instanceof Buffer) return body;
  if (typeof body === "string") return Buffer.from(body);
  return Buffer.from(JSON.stringify(body ?? {}));
}

async function queueWebhookRetry(
  server: FastifyInstance,
  eventType: string,
  rawBody: Buffer,
  error: unknown,
  schoolId?: string | null,
  eventId?: string | null
): Promise<string | null> {
  const failureId = await logWebhookFailure({
    eventType,
    razorpayEventId: eventId ?? null,
    schoolId: schoolId ?? null,
    rawPayload: rawBody.toString("utf-8"),
    error,
  });

  if (!failureId) {
    return null;
  }

  const queued = await enqueueWebhookRetry(failureId, {
    delayMs: 60_000,
    requestedBy: "system:webhook",
    allowInlineFallback: false,
  });

  if (queued.queued) {
    server.log.info(
      { failureId, jobId: queued.jobId },
      "Webhook retry queued"
    );
  } else {
    const queueError = queued.result.success
      ? "Retry executed immediately"
      : queued.result.error;
    server.log.warn(
      { failureId, error: queueError },
      "Webhook retry not queued"
    );
  }

  return failureId;
}

export default async function webhookRoutes(server: FastifyInstance) {
  server.addContentTypeParser(
    "application/json",
    { parseAs: "buffer" },
    (_req, body, done) => {
      done(null, body);
    }
  );

  // POST /webhooks/razorpay
  server.post("/webhooks/razorpay", async (request, reply) => {
    const rawBody = getRawBody(request.body);
    const signature = request.headers["x-razorpay-signature"];

    if (!signature || typeof signature !== "string") {
      request.log.warn("Razorpay webhook: missing x-razorpay-signature header");
      return reply
        .status(400)
        .send({ success: false, message: "Missing signature header" });
    }

    let isValid: boolean;
    try {
      isValid = verifyWebhookSignature(rawBody, signature);
    } catch (err) {
      request.log.error(
        { err },
        "Razorpay webhook: signature verification error"
      );
      return reply
        .status(500)
        .send({ success: false, message: "Internal server error" });
    }

    if (!isValid) {
      request.log.warn("Razorpay webhook: invalid signature");
      return reply
        .status(400)
        .send({ success: false, message: "Invalid signature" });
    }

    let event: RazorpayWebhookPayload;
    try {
      event = JSON.parse(rawBody.toString("utf-8")) as RazorpayWebhookPayload;
    } catch {
      return reply
        .status(400)
        .send({ success: false, message: "Malformed JSON body" });
    }

    request.log.info({ event: event.event }, "Razorpay webhook received");

    try {
      switch (event.event) {
        case "payment.captured": {
          const processed = await handlePaymentCaptured(
            event as PaymentCapturedPayload
          );

          if (processed) {
            request.log.info(
              {
                event: event.event,
                paymentId: event.payload.payment?.entity.id,
                orderId: event.payload.payment?.entity.order_id,
              },
              "Razorpay payment captured processed"
            );
          } else {
            request.log.info(
              { paymentId: event.payload.payment?.entity.id },
              "Razorpay payment captured skipped (duplicate)"
            );
          }
          break;
        }

        case "payment.failed": {
          const payment = event.payload.payment?.entity;
          const schoolId = payment?.notes?.schoolId;

          if (schoolId) {
            await prisma.school.updateMany({
              where: { id: schoolId },
              data: {
                paymentFailureCount: {
                  increment: 1,
                },
              },
            });

            await writeAuditLog("PAYMENT_FAILED", "system", schoolId, {
              razorpayPaymentId: payment?.id,
              errorCode: payment?.error_code,
              errorDescription: payment?.error_description,
              errorReason: payment?.error_reason,
            });
          }

          request.log.warn(
            {
              paymentId: payment?.id,
              schoolId,
              error: payment?.error_description,
            },
            "Razorpay payment failed"
          );
          break;
        }

        case "refund.created": {
          const refund = event.payload.refund?.entity;
          const schoolId = refund?.notes?.schoolId;

          if (schoolId && refund) {
            await writeAuditLog("REFUND_CREATED", "system", schoolId, {
              refundId: refund.id,
              paymentId: refund.payment_id,
              amount: refund.amount,
              currency: refund.currency,
            });

            await prisma.invoice.updateMany({
              where: {
                schoolId,
                razorpayPaymentId: refund.payment_id,
              },
              data: {
                status: "refunded",
              },
            });

            await prisma.legacyPayment.updateMany({
              where: {
                schoolId,
                OR: [
                  { gatewayId: refund.payment_id },
                  { id: refund.payment_id },
                ],
              },
              data: {
                status: "refunded",
                refundedAmount: refund.amount,
              },
            });
          }

          request.log.info(
            { refundId: refund?.id, paymentId: refund?.payment_id },
            "Razorpay refund created processed"
          );
          break;
        }

        default:
          request.log.info(
            { event: event.event },
            "Razorpay webhook event ignored"
          );
      }
    } catch (err) {
      request.log.error(
        { err, event: event.event },
        "Razorpay webhook handler failed"
      );

      const failureId = await queueWebhookRetry(
        server,
        event.event,
        rawBody,
        err,
        event.payload?.payment?.entity?.notes?.schoolId,
        event.payload?.payment?.entity?.id
      );

      return reply
        .status(200)
        .send({ success: false, message: "Handler error — logged", failureId });
    }

    return reply.status(200).send({ success: true });
  });

  // POST /webhooks/stripe
  server.post("/webhooks/stripe", async (request, reply) => {
    const rawBody = getRawBody(request.body);
    const signature = request.headers["stripe-signature"];

    if (!signature || typeof signature !== "string") {
      request.log.warn("Stripe webhook: missing stripe-signature header");
      return reply
        .status(400)
        .send({ success: false, message: "Missing signature header" });
    }

    let isValid: boolean;
    try {
      isValid = verifyStripeWebhookSignature(rawBody, signature);
    } catch (err) {
      request.log.error({ err }, "Stripe webhook: signature verification error");
      return reply
        .status(400)
        .send({ success: false, message: "Signature verification failed" });
    }

    if (!isValid) {
      request.log.warn("Stripe webhook: invalid signature");
      return reply
        .status(400)
        .send({ success: false, message: "Invalid signature" });
    }

    let event: StripeWebhookPayload;
    try {
      event = JSON.parse(rawBody.toString("utf-8")) as StripeWebhookPayload;
    } catch {
      return reply
        .status(400)
        .send({ success: false, message: "Malformed JSON body" });
    }

    const eventType = event.type ?? "unknown";
    request.log.info({ type: eventType }, "Stripe webhook received");

    try {
      switch (eventType) {
        case "charge.succeeded": {
          const charge = event.data?.object ?? {};
          const metadata = (charge.metadata ?? {}) as Record<string, string>;

          if (metadata.schoolId) {
            await writeAuditLog("STRIPE_CHARGE_SUCCEEDED", "system", metadata.schoolId, {
              chargeId: charge.id,
              amount: Number(charge.amount ?? 0) / 100,
              currency: charge.currency,
              plan: metadata.plan,
            });

            await reactivateSubscription(metadata.schoolId, metadata.plan ?? "basic", 30);
          }
          break;
        }

        case "charge.failed": {
          const charge = event.data?.object ?? {};
          const metadata = (charge.metadata ?? {}) as Record<string, string>;

          if (metadata.schoolId) {
            await prisma.school.updateMany({
              where: { id: metadata.schoolId },
              data: {
                paymentFailureCount: {
                  increment: 1,
                },
              },
            });

            await writeAuditLog("PAYMENT_FAILED", "system", metadata.schoolId, {
              stripeChargeId: charge.id,
              failureCode: charge.failure_code,
              failureMessage: charge.failure_message,
            });
          }
          break;
        }

        case "charge.refunded": {
          const charge = event.data?.object ?? {};
          const metadata = (charge.metadata ?? {}) as Record<string, string>;

          if (metadata.schoolId) {
            await writeAuditLog("REFUND_CREATED", "system", metadata.schoolId, {
              chargeId: charge.id,
              amount: Number(charge.amount_refunded ?? 0) / 100,
              currency: String(charge.currency ?? "").toUpperCase(),
            });
          }
          break;
        }

        default:
          request.log.debug({ type: eventType }, "Stripe webhook event ignored");
      }
    } catch (err) {
      request.log.error({ err, type: eventType }, "Stripe webhook handler failed");

      const failureId = await queueWebhookRetry(
        server,
        eventType,
        rawBody,
        err
      );

      return reply
        .status(200)
        .send({ success: false, message: "Handler error — logged", failureId });
    }

    return reply.status(200).send({ success: true });
  });
}
