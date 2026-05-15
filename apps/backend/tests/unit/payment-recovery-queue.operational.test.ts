const queueAddMock = jest.fn();
let failedHandler: ((job: any, err: Error) => void) | null = null;
let completedHandler: ((job: any) => void) | null = null;

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
    if (event === "completed") {
      completedHandler = handler as (job: any) => void;
    }
    return this;
  });
}

const redisQuitMock = jest.fn(async () => undefined);

const mockPrisma = {
  legacyPayment: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  notification: {
    findFirst: jest.fn(),
  },
};

const mockProcessProviderPayment = jest.fn();
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

jest.mock("../../src/services/payment.service", () => ({
  processProviderPayment: mockProcessProviderPayment,
}));

jest.mock("../../src/services/error-tracking.service", () => ({
  trackError: mockTrackError,
}));

jest.mock("../../src/services/notification.service", () => ({
  createNotification: mockCreateNotification,
}));

import {
  enqueuePaymentRecovery,
  initPaymentRecoveryQueue,
  shutdownPaymentRecoveryQueue,
} from "../../src/services/payment-recovery-queue.service";

describe("payment recovery queue operational reliability", () => {
  const originalRedis = process.env.REDIS_URL;

  beforeEach(() => {
    jest.clearAllMocks();
    failedHandler = null;
    completedHandler = null;

    process.env.REDIS_URL = "redis://test:6379";

    queueAddMock.mockResolvedValue({ id: "job_1" });
    mockPrisma.legacyPayment.findUnique.mockResolvedValue({
      id: "payment_1",
      schoolId: "school_1",
      gatewayId: "pay_1",
      gatewayOrderId: "order_1",
      amount: 50000,
      currency: "INR",
      status: "completed",
      method: "card",
      paymentMethodDetails: {
        schoolId: "school_1",
        plan: "pro",
        durationDays: "30",
      },
      activationState: "activation_failed",
    });
    mockPrisma.legacyPayment.update.mockResolvedValue({});
    mockPrisma.notification.findFirst.mockResolvedValue(null);
    mockCreateNotification.mockResolvedValue({ id: "notif_1" });
    mockTrackError.mockResolvedValue(undefined);
    mockProcessProviderPayment.mockRejectedValue(new Error("worker crash during activation"));
  });

  afterEach(async () => {
    await shutdownPaymentRecoveryQueue();
  });

  afterAll(() => {
    if (originalRedis !== undefined) {
      process.env.REDIS_URL = originalRedis;
    } else {
      delete process.env.REDIS_URL;
    }
  });

  it("enqueues retry-safe recovery jobs with deterministic dedupe ids", async () => {
    await initPaymentRecoveryQueue();

    const first = await enqueuePaymentRecovery("payment_1", { requestedBy: "test_1" });
    const second = await enqueuePaymentRecovery("payment_1", { requestedBy: "test_2" });

    expect(first).toEqual({ queued: true, jobId: "job_1" });
    expect(second).toEqual({ queued: true, jobId: "job_1" });
    expect(queueAddMock).toHaveBeenNthCalledWith(
      1,
      "recover-payment",
      { paymentId: "payment_1", requestedBy: "test_1" },
      expect.objectContaining({
        jobId: "payment_1",
        attempts: 5,
      })
    );
    expect(queueAddMock).toHaveBeenNthCalledWith(
      2,
      "recover-payment",
      { paymentId: "payment_1", requestedBy: "test_2" },
      expect.objectContaining({
        jobId: "payment_1",
      })
    );
  });

  it("falls back to inline mode when Redis is unavailable", async () => {
    delete process.env.REDIS_URL;
    mockProcessProviderPayment.mockResolvedValue({
      processed: true,
      duplicate: false,
      paymentId: "pay_1",
      orderId: "order_1",
      activationState: "activated",
      activationFailureReason: null,
    });

    const result = await enqueuePaymentRecovery("payment_1", {
      allowInlineFallback: true,
    });

    expect(result).toEqual({ queued: false, inline: true });
  });

  it("tracks dead-letter escalation after repeated worker failure", async () => {
    await initPaymentRecoveryQueue();
    expect(failedHandler).toBeInstanceOf(Function);

    failedHandler?.(
      {
        id: "job_dead_1",
        data: { paymentId: "payment_1" },
        attemptsMade: 5,
        opts: { attempts: 5 },
      },
      new Error("worker crash during activation")
    );

    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(mockPrisma.legacyPayment.update).toHaveBeenCalledWith({
      where: { id: "payment_1" },
      data: expect.objectContaining({
        activationState: "reconciliation_required",
        activationLastError: "worker crash during activation",
      }),
    });
    expect(mockTrackError).toHaveBeenCalledWith({
      error: expect.any(Error),
      schoolId: "school_1",
      metadata: expect.objectContaining({
        context: "payment-recovery-queue:dead-letter",
        paymentId: "payment_1",
      }),
    });
    expect(mockCreateNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Payment Recovery Failed",
      }),
      expect.objectContaining({
        schoolId: "school_1",
      })
    );
  });

  it("avoids duplicate escalation notifications within one hour", async () => {
    await initPaymentRecoveryQueue();
    mockPrisma.notification.findFirst.mockResolvedValue({
      id: "notif_recent_1",
      schoolId: "school_1",
      title: "Payment Recovery Failed",
      createdAt: new Date(),
    });

    failedHandler?.(
      {
        id: "job_dead_2",
        data: { paymentId: "payment_1" },
        attemptsMade: 5,
        opts: { attempts: 5 },
      },
      new Error("worker crash during activation")
    );

    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(mockCreateNotification).not.toHaveBeenCalled();
  });
});
