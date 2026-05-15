const queueAddMock = jest.fn();
let failedHandler: ((job: any, err: Error) => void) | null = null;

class MockQueue {
  add = queueAddMock;
  close = jest.fn(async () => undefined);
}

class MockWorker {
  close = jest.fn(async () => undefined);
  on = jest.fn((event: string, handler: (...args: any[]) => void) => {
    if (event === "failed") {
      failedHandler = handler as (job: any, err: Error) => void;
    }
    return this;
  });
}

const redisQuitMock = jest.fn(async () => undefined);

const mockPrisma = {
  webhookEvent: {
    findUnique: jest.fn(),
    updateMany: jest.fn(),
  },
  notification: {
    findFirst: jest.fn(),
  },
};

const mockProcessWebhookEventById = jest.fn();
const mockTrackError = jest.fn();
const mockCreateNotification = jest.fn();

jest.mock("bullmq", () => ({
  Queue: jest.fn(() => new MockQueue()),
  Worker: jest.fn(() => new MockWorker()),
}));

jest.mock("ioredis", () =>
  jest.fn().mockImplementation(() => ({
    quit: redisQuitMock,
  }))
);

jest.mock("../../src/lib/prisma", () => ({
  prisma: mockPrisma,
}));

jest.mock("../../src/services/webhook-event.service", () => ({
  processWebhookEventById: mockProcessWebhookEventById,
}));

jest.mock("../../src/services/error-tracking.service", () => ({
  trackError: mockTrackError,
}));

jest.mock("../../src/services/notification.service", () => ({
  createNotification: mockCreateNotification,
}));

import {
  enqueueWebhookEventProcessing,
  initWebhookEventQueue,
  shutdownWebhookEventQueue,
} from "../../src/services/webhook-event-queue.service";

describe("webhook event queue operational reliability", () => {
  const originalRedis = process.env.REDIS_URL;

  beforeEach(() => {
    jest.clearAllMocks();
    failedHandler = null;

    process.env.REDIS_URL = "redis://test:6379";
    queueAddMock.mockResolvedValue({ id: "event_job_1" });
    mockProcessWebhookEventById.mockResolvedValue({ success: true });
    mockPrisma.webhookEvent.findUnique.mockResolvedValue({
      id: "evt_1",
      schoolId: "school_1",
      eventType: "payment.captured",
      provider: "razorpay",
    });
    mockPrisma.webhookEvent.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.notification.findFirst.mockResolvedValue(null);
    mockTrackError.mockResolvedValue(undefined);
    mockCreateNotification.mockResolvedValue({ id: "notif_1" });
  });

  afterEach(async () => {
    await shutdownWebhookEventQueue();
  });

  afterAll(() => {
    if (originalRedis !== undefined) {
      process.env.REDIS_URL = originalRedis;
    } else {
      delete process.env.REDIS_URL;
    }
  });

  it("enqueues webhook jobs with deterministic dedupe id", async () => {
    await initWebhookEventQueue();

    const first = await enqueueWebhookEventProcessing("evt_1", {
      requestedBy: "system:webhook",
    });
    const second = await enqueueWebhookEventProcessing("evt_1", {
      requestedBy: "manual:retry",
    });

    expect(first).toEqual({ queued: true, jobId: "event_job_1" });
    expect(second).toEqual({ queued: true, jobId: "event_job_1" });
    expect(queueAddMock).toHaveBeenNthCalledWith(
      1,
      "process-webhook-event",
      { webhookEventId: "evt_1", requestedBy: "system:webhook" },
      expect.objectContaining({
        jobId: "evt_1",
        attempts: 5,
      })
    );
    expect(queueAddMock).toHaveBeenNthCalledWith(
      2,
      "process-webhook-event",
      { webhookEventId: "evt_1", requestedBy: "manual:retry" },
      expect.objectContaining({
        jobId: "evt_1",
      })
    );
  });

  it("marks webhook events dead-letter after repeated failures", async () => {
    await initWebhookEventQueue();

    failedHandler?.(
      {
        id: "event_job_dead_1",
        data: { webhookEventId: "evt_1" },
        attemptsMade: 5,
        opts: { attempts: 5 },
      },
      new Error("worker failed to process webhook")
    );

    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(mockPrisma.webhookEvent.updateMany).toHaveBeenCalledWith({
      where: { id: "evt_1" },
      data: expect.objectContaining({
        status: "DEAD_LETTER",
        failureReason: "worker failed to process webhook",
      }),
    });
    expect(mockTrackError).toHaveBeenCalledWith({
      error: expect.any(Error),
      schoolId: "school_1",
      metadata: expect.objectContaining({
        context: "webhook-event-queue:dead-letter",
        webhookEventId: "evt_1",
      }),
    });
    expect(mockCreateNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Webhook Processing Failed",
      }),
      expect.objectContaining({
        schoolId: "school_1",
      })
    );
  });

  it("supports deterministic fallback behavior when Redis is unavailable", async () => {
    delete process.env.REDIS_URL;

    const queueUnavailable = await enqueueWebhookEventProcessing("evt_2", {
      allowInlineFallback: false,
    });
    const inlineFallback = await enqueueWebhookEventProcessing("evt_2", {
      allowInlineFallback: true,
    });

    expect(queueUnavailable).toEqual({
      queued: false,
      inline: false,
      error: "Webhook event queue unavailable (REDIS_URL not configured)",
    });
    expect(inlineFallback).toEqual({
      queued: false,
      inline: true,
    });
  });
});
