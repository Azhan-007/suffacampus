/**
 * Notification queue service unit tests
 *
 * Focus: job enqueueing, worker processing, retry config, and failure handling.
 */

const logMock = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
};

const workerEvents: Record<string, (job?: MockJob, err?: Error) => void> = {};
let workerProcessor: ((job: { data: unknown }) => Promise<void>) | null = null;

const mockQueueAdd = jest.fn();
const mockNotificationDeliveryFindFirst = jest.fn();
const mockNotificationDeliveryCreate = jest.fn();

jest.mock("pino", () => jest.fn(() => logMock));

jest.mock("ioredis", () =>
  jest.fn().mockImplementation(() => ({}))
);

jest.mock("bullmq", () => {
  const Worker = jest
    .fn()
    .mockImplementation(
      (_name: string, processor: (job: { data: unknown }) => Promise<void>) => {
        workerProcessor = processor;
        return {
          on: jest.fn((event: string, cb: (job?: MockJob, err?: Error) => void) => {
            workerEvents[event] = cb;
            return this;
          }),
          close: jest.fn(),
        };
      }
    );

  const Queue = jest.fn().mockImplementation(() => ({
    name: "notificationQueue",
    add: mockQueueAdd,
  }));

  return { Worker, Queue };
});

jest.mock("../../src/services/push-notification.service", () => ({
  sendToUserInSchool: jest.fn().mockResolvedValue({
    successCount: 1,
    failureCount: 0,
    invalidTokens: [],
  }),
  sendToRoleTopic: jest.fn(),
  sendToSchool: jest.fn(),
}));

jest.mock("../../src/services/notification.service", () => ({
  sendEmail: jest.fn().mockResolvedValue(true),
}));

jest.mock("../../src/services/notification-preference.service", () => ({
  NotificationPreferenceService: {
    shouldSendNotification: jest.fn().mockResolvedValue(true),
  },
}));

jest.mock("../../src/lib/prisma", () => ({
  prisma: {
    notificationDelivery: {
      findFirst: mockNotificationDeliveryFindFirst,
      create: mockNotificationDeliveryCreate,
    },
    user: {
      findFirst: jest.fn(async (args: { where: { uid?: string } }) => {
        if (args.where.uid === "user_1") {
          return { uid: "user_1", email: "user_1@example.com" };
        }
        return null;
      }),
      findMany: jest.fn(async () => []),
    },
  },
}));

import {
  enqueueNotificationJob,
  initNotificationQueueWorker,
  NOTIFICATION_JOB_NAME,
  shutdownNotificationQueueWorker,
  type NotificationJobData,
} from "../../src/services/notification-queue.service";
import { sendToUserInSchool } from "../../src/services/push-notification.service";
import { sendEmail } from "../../src/services/notification.service";

type MockJob = {
  id?: string | number;
  data: NotificationJobData;
  attemptsMade?: number;
  opts?: { attempts?: number };
};

const sampleJob: NotificationJobData = {
  notificationId: "notif_1",
  schoolId: "school_1",
  targetType: "USER",
  targetId: "user_1",
  title: "Hello",
  message: "World",
};

describe("notification queue service", () => {
  const originalRedisUrl = process.env.REDIS_URL;

  beforeEach(async () => {
    await shutdownNotificationQueueWorker();
    process.env.REDIS_URL = "redis://localhost:6379";
    mockQueueAdd.mockResolvedValue({ id: "job_1" });
    mockNotificationDeliveryFindFirst.mockResolvedValue(null);
    mockNotificationDeliveryCreate.mockResolvedValue({ id: "delivery_1" });
    Object.keys(workerEvents).forEach((key) => delete workerEvents[key]);
    workerProcessor = null;
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await shutdownNotificationQueueWorker();
    if (originalRedisUrl) process.env.REDIS_URL = originalRedisUrl;
    else delete process.env.REDIS_URL;
  });

  it("adds a notification job to the queue", async () => {
    const jobId = await enqueueNotificationJob(sampleJob);

    expect(jobId).toBe("job_1");
    expect(mockQueueAdd).toHaveBeenCalledWith(
      NOTIFICATION_JOB_NAME,
      sampleJob,
      expect.objectContaining({
        attempts: 3,
        backoff: { type: "exponential", delay: 1000 },
        jobId: "notif_1",
      })
    );
  });

  it("worker processes a notification job", async () => {
    await initNotificationQueueWorker();

    expect(workerProcessor).not.toBeNull();

    await (workerProcessor as (job: { data: NotificationJobData }) => Promise<void>)({
      data: sampleJob,
    });

    expect(sendToUserInSchool).toHaveBeenCalledWith(
      "user_1",
      "school_1",
      expect.objectContaining({
        title: "Hello",
        body: "World",
      })
    );

    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "user_1@example.com",
        subject: "Hello",
      })
    );

    expect(mockNotificationDeliveryCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ notificationId: "notif_1" }),
      })
    );
  });

  it("skips duplicate sends when channel delivery already exists", async () => {
    await initNotificationQueueWorker();

    mockNotificationDeliveryFindFirst.mockImplementation(
      async (args: { where: { channel: "PUSH" | "EMAIL" } }) => {
        if (args.where.channel === "PUSH") return { id: "delivery_push" };
        if (args.where.channel === "EMAIL") return { id: "delivery_email" };
        return null;
      }
    );

    await (workerProcessor as (job: { data: NotificationJobData }) => Promise<void>)(
      {
        data: sampleJob,
      }
    );

    expect(sendToUserInSchool).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
    expect(mockNotificationDeliveryCreate).not.toHaveBeenCalled();
  });

  it("continues email processing when push fails", async () => {
    await initNotificationQueueWorker();

    (sendToUserInSchool as unknown as { mockRejectedValueOnce: (value: Error) => void })
      .mockRejectedValueOnce(new Error("push down"));

    await expect(
      (workerProcessor as (job: { data: NotificationJobData }) => Promise<void>)({
        data: sampleJob,
      })
    ).rejects.toThrow("push: push down");

    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "user_1@example.com",
        subject: "Hello",
      })
    );
  });

  it("configures retries via enqueue options", async () => {
    await enqueueNotificationJob(sampleJob);

    const options = mockQueueAdd.mock.calls[0][2] as {
      attempts?: number;
      backoff?: unknown;
      jobId?: string;
    };
    expect(options.attempts).toBe(3);
    expect(options.backoff).toEqual({ type: "exponential", delay: 1000 });
    expect(options.jobId).toBe("notif_1");
  });

  it("skips enqueue when redis is not configured", async () => {
    delete process.env.REDIS_URL;

    const jobId = await enqueueNotificationJob(sampleJob);

    expect(jobId).toBe("notif_1");
    expect(mockQueueAdd).not.toHaveBeenCalled();
    expect(logMock.warn).toHaveBeenCalledWith(
      expect.objectContaining({ notificationId: "notif_1" }),
      "REDIS_URL not set - notification job not enqueued"
    );
  });

  it("logs failed jobs when retries are exhausted", async () => {
    await initNotificationQueueWorker();

    const failedHandler = workerEvents.failed;
    expect(failedHandler).toBeDefined();

    failedHandler?.(
      {
        id: "job_1",
        data: sampleJob,
        attemptsMade: 3,
        opts: { attempts: 3 },
      },
      new Error("boom")
    );

    expect(logMock.error).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: "job_1",
        notificationId: "notif_1",
        deadLetter: true,
      }),
      "Notification queue job failed"
    );
  });
});
