/**
 * Queue service unit tests
 *
 * Focus: fallback behavior and stats shape without Redis.
 */

jest.mock("../../src/services/webhook-failure.service", () => ({
  retryWebhookFailure: jest.fn(),
}));

import { getEmailQueueStats } from "../../src/services/email-queue.service";
import {
  enqueueWebhookRetry,
  getWebhookRetryQueueStats,
} from "../../src/services/webhook-retry-queue.service";
import { retryWebhookFailure } from "../../src/services/webhook-failure.service";

describe("queue services fallback behavior", () => {
  const originalRedisUrl = process.env.REDIS_URL;

  beforeEach(() => {
    delete process.env.REDIS_URL;
    jest.clearAllMocks();
  });

  afterAll(() => {
    if (originalRedisUrl) process.env.REDIS_URL = originalRedisUrl;
    else delete process.env.REDIS_URL;
  });

  it("returns zeroed email queue stats when Redis is not configured", async () => {
    const stats = await getEmailQueueStats();

    expect(stats).toEqual({
      enabled: false,
      waiting: 0,
      active: 0,
      completed: 0,
      failed: 0,
      delayed: 0,
      oldestWaitingAgeSeconds: 0,
    });
  });

  it("returns zeroed webhook retry queue stats when Redis is not configured", async () => {
    const stats = await getWebhookRetryQueueStats();

    expect(stats).toEqual({
      enabled: false,
      waiting: 0,
      active: 0,
      completed: 0,
      failed: 0,
      delayed: 0,
      oldestWaitingAgeSeconds: 0,
    });
  });

  it("returns queue unavailable when inline fallback is disabled and Redis is missing", async () => {
    const result = await enqueueWebhookRetry("failure_123", {
      allowInlineFallback: false,
    });

    expect(result.queued).toBe(false);
    if (!result.queued) {
      expect(result.result.success).toBe(false);
      if (!result.result.success) {
        expect(result.result.error).toContain("queue unavailable");
      }
    }

    expect(retryWebhookFailure).not.toHaveBeenCalled();
  });

  it("uses inline retry fallback when Redis is missing and fallback is enabled", async () => {
    (retryWebhookFailure as jest.Mock).mockResolvedValue({
      success: true,
      alreadyResolved: false,
      duplicate: false,
    });

    const result = await enqueueWebhookRetry("failure_456", {
      allowInlineFallback: true,
    });

    expect(result.queued).toBe(false);
    expect(retryWebhookFailure).toHaveBeenCalledWith("failure_456");

    if (!result.queued) {
      expect(result.result.success).toBe(true);
    }
  });
});
