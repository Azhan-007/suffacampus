import type { FastifyInstance } from "fastify";
import {
  verifyWebhookSignature,
  verifyStripeWebhookSignature,
} from "../services/payment.service";
import { persistWebhookEvent } from "../services/webhook-event.service";
import { enqueueWebhookEventProcessing } from "../services/webhook-event-queue.service";
import { prisma } from "../lib/prisma";

interface RazorpayWebhookPayload {
  created_at?: number | string;
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
  id?: string;
  type?: string;
  created?: number;
  data?: {
    object?: Record<string, unknown>;
  };
}

const RAZORPAY_WEBHOOK_MAX_AGE_MS = 5 * 60 * 1000;

function getRawBody(body: unknown): Buffer {
  if (body instanceof Buffer) return body;
  if (typeof body === "string") return Buffer.from(body);
  return Buffer.from(JSON.stringify(body ?? {}));
}

function normalizeUnixTimestampMs(value: unknown): number | null {
  let raw: string | number | undefined;

  if (Array.isArray(value)) {
    raw = value[0];
  } else if (typeof value === "string" || typeof value === "number") {
    raw = value;
  }

  if (raw === undefined) {
    return null;
  }

  const parsed =
    typeof raw === "number" ? raw : Number.parseInt(raw.trim(), 10);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  // Razorpay commonly sends UNIX seconds in webhook payloads.
  return parsed < 1_000_000_000_000 ? parsed * 1000 : parsed;
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
    const eventIdHeader = request.headers["x-razorpay-event-id"];
    const razorpayEventId =
      typeof eventIdHeader === "string" ? eventIdHeader : undefined;

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

    const eventTimestampMs = normalizeUnixTimestampMs(event.created_at);
    if (!eventTimestampMs) {
      request.log.warn(
        { event: event.event, eventId: razorpayEventId },
        "Razorpay webhook rejected: missing or invalid created_at timestamp"
      );
      return reply
        .status(400)
        .send({ success: false, message: "Missing or invalid webhook timestamp" });
    }

    if (eventTimestampMs < Date.now() - RAZORPAY_WEBHOOK_MAX_AGE_MS) {
      request.log.warn(
        {
          event: event.event,
          eventId: razorpayEventId,
          eventTimestampMs,
        },
        "Razorpay webhook rejected: stale timestamp"
      );
      return reply
        .status(400)
        .send({ success: false, message: "Webhook too old" });
    }

    request.log.info(
      { event: event.event, eventId: razorpayEventId },
      "Razorpay webhook received"
    );

    const paymentEntity = event.payload.payment?.entity;
    const refundEntity = event.payload.refund?.entity;
    const providerPaymentId = paymentEntity?.id ?? refundEntity?.payment_id;
    const providerOrderId = paymentEntity?.order_id;
    const schoolId = paymentEntity?.notes?.schoolId ?? refundEntity?.notes?.schoolId;

    let storedEvent;
    try {
      storedEvent = await persistWebhookEvent({
        provider: "razorpay",
        eventType: event.event,
        providerEventId: razorpayEventId,
        rawBody,
        providerPaymentId: providerPaymentId ?? null,
        providerOrderId: providerOrderId ?? null,
        schoolId: schoolId ?? null,
      });
    } catch (err) {
      request.log.error(
        { err, event: event.event, eventId: razorpayEventId },
        "Razorpay webhook: failed to persist event"
      );
      return reply
        .status(500)
        .send({ success: false, message: "Failed to persist webhook event" });
    }

    if (storedEvent.duplicate) {
      request.log.info(
        {
          eventId: storedEvent.event.eventId,
          status: storedEvent.event.status,
          replayed: storedEvent.replayed,
        },
        "Razorpay webhook duplicate — recorded"
      );

      if (["FAILED", "VERIFIED", "RECEIVED"].includes(storedEvent.event.status)) {
        try {
          await enqueueWebhookEventProcessing(storedEvent.event.id, {
            requestedBy: "system:webhook",
          });
        } catch (err) {
          request.log.error(
            { err, webhookEventId: storedEvent.event.id },
            "Razorpay webhook: failed to re-enqueue processing"
          );
        }
      }

      return reply
        .status(200)
        .send({ success: true, message: "Already received" });
    }

    try {
      await enqueueWebhookEventProcessing(storedEvent.event.id, {
        requestedBy: "system:webhook",
      });
    } catch (err) {
      request.log.error(
        { err, webhookEventId: storedEvent.event.id },
        "Razorpay webhook: failed to enqueue processing"
      );

      await prisma.webhookEvent.update({
        where: { id: storedEvent.event.id },
        data: { status: "FAILED", failureReason: "Failed to enqueue processing" },
      });

      return reply
        .status(500)
        .send({ success: false, message: "Failed to enqueue webhook event" });
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
    const stripeEventId = typeof event.id === "string" ? event.id : undefined;
    request.log.info({ type: eventType, eventId: stripeEventId }, "Stripe webhook received");

    // Timestamp validation — reject stale events (same 5-min window as Razorpay)
    if (typeof event.created === "number" && event.created > 0) {
      const eventMs = event.created < 1_000_000_000_000 ? event.created * 1000 : event.created;
      if (eventMs < Date.now() - RAZORPAY_WEBHOOK_MAX_AGE_MS) {
        request.log.warn(
          { type: eventType, eventId: stripeEventId, created: event.created },
          "Stripe webhook rejected: stale timestamp"
        );
        return reply
          .status(400)
          .send({ success: false, message: "Webhook too old" });
      }
    }

    const charge = event.data?.object ?? {};
    const metadata = (charge.metadata ?? {}) as Record<string, string>;
    const providerPaymentId = charge.id ? String(charge.id) : undefined;

    let storedEvent;
    try {
      storedEvent = await persistWebhookEvent({
        provider: "stripe",
        eventType,
        providerEventId: stripeEventId,
        rawBody,
        providerPaymentId: providerPaymentId ?? null,
        providerOrderId: null,
        schoolId: metadata.schoolId ?? null,
      });
    } catch (err) {
      request.log.error(
        { err, type: eventType, eventId: stripeEventId },
        "Stripe webhook: failed to persist event"
      );
      return reply
        .status(500)
        .send({ success: false, message: "Failed to persist webhook event" });
    }

    if (storedEvent.duplicate) {
      request.log.info(
        {
          eventId: storedEvent.event.eventId,
          status: storedEvent.event.status,
          replayed: storedEvent.replayed,
        },
        "Stripe webhook duplicate — recorded"
      );

      if (["FAILED", "VERIFIED", "RECEIVED"].includes(storedEvent.event.status)) {
        try {
          await enqueueWebhookEventProcessing(storedEvent.event.id, {
            requestedBy: "system:webhook",
          });
        } catch (err) {
          request.log.error(
            { err, webhookEventId: storedEvent.event.id },
            "Stripe webhook: failed to re-enqueue processing"
          );
        }
      }

      return reply
        .status(200)
        .send({ success: true, message: "Already received" });
    }

    try {
      await enqueueWebhookEventProcessing(storedEvent.event.id, {
        requestedBy: "system:webhook",
      });
    } catch (err) {
      request.log.error(
        { err, webhookEventId: storedEvent.event.id },
        "Stripe webhook: failed to enqueue processing"
      );

      await prisma.webhookEvent.update({
        where: { id: storedEvent.event.id },
        data: { status: "FAILED", failureReason: "Failed to enqueue processing" },
      });

      return reply
        .status(500)
        .send({ success: false, message: "Failed to enqueue webhook event" });
    }

    return reply.status(200).send({ success: true });
  });
}
