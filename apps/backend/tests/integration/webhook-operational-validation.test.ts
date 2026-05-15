import Fastify, { type FastifyInstance } from "fastify";

const mockVerifyWebhookSignature = jest.fn();
const mockVerifyStripeWebhookSignature = jest.fn();
const mockPersistWebhookEvent = jest.fn();
const mockEnqueueWebhookEventProcessing = jest.fn();
const mockWebhookEventUpdate = jest.fn();

jest.mock("../../src/services/payment.service", () => ({
  verifyWebhookSignature: mockVerifyWebhookSignature,
  verifyStripeWebhookSignature: mockVerifyStripeWebhookSignature,
}));

jest.mock("../../src/services/webhook-event.service", () => ({
  persistWebhookEvent: mockPersistWebhookEvent,
}));

jest.mock("../../src/services/webhook-event-queue.service", () => ({
  enqueueWebhookEventProcessing: mockEnqueueWebhookEventProcessing,
}));

jest.mock("../../src/lib/prisma", () => ({
  prisma: {
    webhookEvent: {
      update: mockWebhookEventUpdate,
    },
  },
}));

// Load route module after mocks are registered.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const webhookRoutes = require("../../src/routes/webhooks").default as (
  server: FastifyInstance
) => Promise<void>;

function buildRazorpayPayload(event: string, createdAtSeconds: number, overrides?: Record<string, unknown>) {
  return {
    created_at: createdAtSeconds,
    event,
    payload: {
      payment: {
        entity: {
          id: "pay_1",
          order_id: "order_1",
          amount: 50000,
          currency: "INR",
          status: "captured",
          notes: {
            schoolId: "school_1",
            plan: "pro",
            durationDays: "30",
          },
        },
      },
      ...(overrides ?? {}),
    },
  };
}

describe("webhook operational validation (integration)", () => {
  let server: FastifyInstance;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockVerifyWebhookSignature.mockReturnValue(true);
    mockVerifyStripeWebhookSignature.mockReturnValue(true);
    mockEnqueueWebhookEventProcessing.mockResolvedValue({ queued: true, jobId: "job_1" });
    mockWebhookEventUpdate.mockResolvedValue({});

    server = Fastify({ logger: false });
    await server.register(webhookRoutes);
    await server.ready();
  });

  afterEach(async () => {
    await server.close();
  });

  it("accepts duplicate webhook delivery and re-enqueues failed event processing", async () => {
    mockPersistWebhookEvent.mockResolvedValue({
      event: {
        id: "evt_1",
        eventId: "rp_evt_1",
        status: "FAILED",
        processedAt: null,
      },
      duplicate: true,
      replayed: false,
    });

    const payload = buildRazorpayPayload(
      "payment.captured",
      Math.floor(Date.now() / 1000)
    );

    const res = await server.inject({
      method: "POST",
      url: "/webhooks/razorpay",
      headers: {
        "content-type": "application/json",
        "x-razorpay-signature": "sig_1",
        "x-razorpay-event-id": "rp_evt_1",
      },
      payload: JSON.stringify(payload),
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual(
      expect.objectContaining({ success: true, message: "Already received" })
    );
    expect(mockEnqueueWebhookEventProcessing).toHaveBeenCalledWith("evt_1", {
      requestedBy: "system:webhook",
    });
  });

  it("treats replayed webhook payload hashes as durable duplicates", async () => {
    mockPersistWebhookEvent.mockResolvedValue({
      event: {
        id: "evt_replay_1",
        eventId: "hash:abc123",
        status: "VERIFIED",
        processedAt: null,
      },
      duplicate: true,
      replayed: true,
    });

    const payload = buildRazorpayPayload(
      "payment.captured",
      Math.floor(Date.now() / 1000)
    );

    const res = await server.inject({
      method: "POST",
      url: "/webhooks/razorpay",
      headers: {
        "content-type": "application/json",
        "x-razorpay-signature": "sig_2",
      },
      payload: JSON.stringify(payload),
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).success).toBe(true);
    expect(mockEnqueueWebhookEventProcessing).toHaveBeenCalledWith("evt_replay_1", {
      requestedBy: "system:webhook",
    });
  });

  it("supports out-of-order delivery (refund before capture) by persisting and queueing both", async () => {
    mockPersistWebhookEvent
      .mockResolvedValueOnce({
        event: { id: "evt_refund_1", eventId: "rp_refund_1", status: "VERIFIED", processedAt: null },
        duplicate: false,
        replayed: false,
      })
      .mockResolvedValueOnce({
        event: { id: "evt_capture_1", eventId: "rp_capture_1", status: "VERIFIED", processedAt: null },
        duplicate: false,
        replayed: false,
      });

    const nowSeconds = Math.floor(Date.now() / 1000);
    const refundPayload = {
      created_at: nowSeconds,
      event: "refund.created",
      payload: {
        refund: {
          entity: {
            id: "rfnd_1",
            payment_id: "pay_1",
            amount: 50000,
            currency: "INR",
            notes: { schoolId: "school_1" },
          },
        },
      },
    };
    const capturePayload = buildRazorpayPayload("payment.captured", nowSeconds);

    const refundRes = await server.inject({
      method: "POST",
      url: "/webhooks/razorpay",
      headers: {
        "content-type": "application/json",
        "x-razorpay-signature": "sig_refund",
        "x-razorpay-event-id": "rp_refund_1",
      },
      payload: JSON.stringify(refundPayload),
    });

    const captureRes = await server.inject({
      method: "POST",
      url: "/webhooks/razorpay",
      headers: {
        "content-type": "application/json",
        "x-razorpay-signature": "sig_capture",
        "x-razorpay-event-id": "rp_capture_1",
      },
      payload: JSON.stringify(capturePayload),
    });

    expect(refundRes.statusCode).toBe(200);
    expect(captureRes.statusCode).toBe(200);
    expect(mockEnqueueWebhookEventProcessing).toHaveBeenNthCalledWith(1, "evt_refund_1", {
      requestedBy: "system:webhook",
    });
    expect(mockEnqueueWebhookEventProcessing).toHaveBeenNthCalledWith(2, "evt_capture_1", {
      requestedBy: "system:webhook",
    });
  });

  it("marks event as failed when queue enqueue fails", async () => {
    mockPersistWebhookEvent.mockResolvedValue({
      event: {
        id: "evt_fail_1",
        eventId: "rp_evt_fail_1",
        status: "VERIFIED",
        processedAt: null,
      },
      duplicate: false,
      replayed: false,
    });
    mockEnqueueWebhookEventProcessing.mockRejectedValue(new Error("queue enqueue failure"));

    const payload = buildRazorpayPayload(
      "payment.captured",
      Math.floor(Date.now() / 1000)
    );

    const res = await server.inject({
      method: "POST",
      url: "/webhooks/razorpay",
      headers: {
        "content-type": "application/json",
        "x-razorpay-signature": "sig_fail",
        "x-razorpay-event-id": "rp_evt_fail_1",
      },
      payload: JSON.stringify(payload),
    });

    expect(res.statusCode).toBe(500);
    expect(mockWebhookEventUpdate).toHaveBeenCalledWith({
      where: { id: "evt_fail_1" },
      data: { status: "FAILED", failureReason: "Failed to enqueue processing" },
    });
  });

  it("rejects delayed webhook deliveries older than the allowed window", async () => {
    const tooOld = Math.floor((Date.now() - 6 * 60 * 1000) / 1000);
    const payload = buildRazorpayPayload("payment.captured", tooOld);

    const res = await server.inject({
      method: "POST",
      url: "/webhooks/razorpay",
      headers: {
        "content-type": "application/json",
        "x-razorpay-signature": "sig_old",
        "x-razorpay-event-id": "rp_evt_old",
      },
      payload: JSON.stringify(payload),
    });

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).message).toBe("Webhook too old");
    expect(mockPersistWebhookEvent).not.toHaveBeenCalled();
  });

  it("rejects webhook with missing timestamp", async () => {
    const payload = {
      event: "payment.captured",
      payload: {
        payment: {
          entity: {
            id: "pay_missing_ts",
            order_id: "order_missing_ts",
            amount: 50000,
            currency: "INR",
            status: "captured",
            notes: { schoolId: "school_1" },
          },
        },
      },
    };

    const res = await server.inject({
      method: "POST",
      url: "/webhooks/razorpay",
      headers: {
        "content-type": "application/json",
        "x-razorpay-signature": "sig_missing_ts",
      },
      payload: JSON.stringify(payload),
    });

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).message).toBe("Missing or invalid webhook timestamp");
    expect(mockPersistWebhookEvent).not.toHaveBeenCalled();
  });
});
