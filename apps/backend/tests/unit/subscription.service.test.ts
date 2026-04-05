/**
 * Unit tests for subscription.service.ts
 *
 * Tests the subscription state machine — valid transitions, invalid
 * transitions, batch workers (trial expiry, overdue, grace period),
 * cancellation logic, and reactivation.
 */

import {
  transitionStatus,
  processExpiredTrials,
  processOverdueSubscriptions,
  processExpiredGrace,
  cancelSubscription,
  reactivateSubscription,
  type SubStatus,
} from "../../src/services/subscription.service";
import { resetIdCounter } from "../helpers";

const mockState = {
  schools: new Map<string, any>(),
};

jest.mock("../../src/lib/prisma", () => ({
  prisma: {
    school: {
      findUnique: jest.fn(async ({ where: { id } }) => mockState.schools.get(id) ?? null),
      findMany: jest.fn(async ({ where }) => {
        let records = [...mockState.schools.values()];
        if (where.subscriptionStatus) {
          records = records.filter((s) => s.subscriptionStatus === where.subscriptionStatus);
        }
        if (where.trialEndDate?.lte) {
          records = records.filter(
            (s) => typeof s.trialEndDate === "string" && s.trialEndDate <= where.trialEndDate.lte
          );
        }
        if (where.currentPeriodEnd?.lte) {
          records = records.filter(
            (s) => s.currentPeriodEnd instanceof Date && s.currentPeriodEnd <= where.currentPeriodEnd.lte
          );
        }
        return records;
      }),
      update: jest.fn(async ({ where: { id }, data }) => {
        const existing = mockState.schools.get(id);
        if (!existing) throw new Error("School not found");
        const updated = { ...existing, ...data, updatedAt: new Date() };
        mockState.schools.set(id, updated);
        return updated;
      }),
    },
  },
}));

function seedSchool(id: string, data: Record<string, unknown>) {
  mockState.schools.set(id, {
    id,
    name: "Test School",
    code: `CODE_${id}`,
    city: "City",
    email: `${id}@example.com`,
    subscriptionStatus: "trial",
    autoRenew: false,
    ...data,
  });
}

function getSchool(id: string) {
  return mockState.schools.get(id);
}

// Mock audit service to prevent side effects
jest.mock("../../src/services/audit.service", () => ({
  writeAuditLog: jest.fn().mockResolvedValue(undefined),
}));

beforeEach(() => {
  mockState.schools.clear();
  resetIdCounter();
  jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// State machine — valid transitions
// ---------------------------------------------------------------------------

describe("transitionStatus", () => {
  const validTransitions: Array<[SubStatus, SubStatus]> = [
    ["trial", "active"],
    ["trial", "expired"],
    ["active", "past_due"],
    ["active", "cancelled"],
    ["past_due", "active"],
    ["past_due", "expired"],
    ["expired", "active"],
    ["expired", "trial"],
    ["cancelled", "active"],
  ];

  test.each(validTransitions)(
    "allows %s → %s",
    async (from, to) => {
      seedSchool("s1", { subscriptionStatus: from });

      const result = await transitionStatus("s1", to);
      expect(result).toBe(true);

      const updated = getSchool("s1");
      expect(updated?.subscriptionStatus).toBe(to);
    }
  );

  const invalidTransitions: Array<[SubStatus, SubStatus]> = [
    ["trial", "past_due"],
    ["trial", "cancelled"],
    ["active", "trial"],
    ["active", "expired"],
    ["past_due", "cancelled"],
    ["past_due", "trial"],
    ["expired", "past_due"],
    ["expired", "cancelled"],
    ["cancelled", "trial"],
    ["cancelled", "expired"],
    ["cancelled", "past_due"],
  ];

  test.each(invalidTransitions)(
    "rejects %s → %s",
    async (from, to) => {
      seedSchool("s1", { subscriptionStatus: from });

      const result = await transitionStatus("s1", to);
      expect(result).toBe(false);

      const unchanged = getSchool("s1");
      expect(unchanged?.subscriptionStatus).toBe(from);
    }
  );

  it("returns false for non-existent school", async () => {
    const result = await transitionStatus("does_not_exist", "active");
    expect(result).toBe(false);
  });

  it("defaults to 'trial' when subscriptionStatus is missing", async () => {
    seedSchool("s1", { name: "No Status School", subscriptionStatus: undefined });

    // trial → active should work
    const result = await transitionStatus("s1", "active");
    expect(result).toBe(true);

    const updated = getSchool("s1");
    expect(updated?.subscriptionStatus).toBe("active");
  });

  it("persists metadata alongside the status change", async () => {
    seedSchool("s1", { subscriptionStatus: "trial" });

    await transitionStatus("s1", "active", {
      subscriptionPlan: "Pro",
      autoRenew: true,
    });

    const updated = getSchool("s1");
    expect(updated?.subscriptionPlan).toBe("Pro");
    expect(updated?.autoRenew).toBe(true);
  });

  it("sets updatedAt timestamp", async () => {
    seedSchool("s1", { subscriptionStatus: "trial" });

    await transitionStatus("s1", "active");

    const updated = getSchool("s1");
    expect(updated?.updatedAt).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Worker: processExpiredTrials
// ---------------------------------------------------------------------------

describe("processExpiredTrials", () => {
  it("expires trials past their trialEndDate", async () => {
    const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0];
    seedSchool("s1", {
      subscriptionStatus: "trial",
      trialEndDate: yesterday,
    });
    seedSchool("s2", {
      subscriptionStatus: "trial",
      trialEndDate: yesterday,
    });

    const count = await processExpiredTrials();
    expect(count).toBe(2);

    expect(getSchool("s1")?.subscriptionStatus).toBe("expired");
    expect(getSchool("s2")?.subscriptionStatus).toBe("expired");
  });

  it("does not expire trials with future trialEndDate", async () => {
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split("T")[0];
    seedSchool("s1", {
      subscriptionStatus: "trial",
      trialEndDate: tomorrow,
    });

    const count = await processExpiredTrials();
    expect(count).toBe(0);

    expect(getSchool("s1")?.subscriptionStatus).toBe("trial");
  });

  it("does not touch non-trial subscriptions", async () => {
    const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0];
    seedSchool("s1", {
      subscriptionStatus: "active",
      trialEndDate: yesterday,
    });

    const count = await processExpiredTrials();
    expect(count).toBe(0);

    expect(getSchool("s1")?.subscriptionStatus).toBe("active");
  });

  it("returns 0 when there are no trials", async () => {
    const count = await processExpiredTrials();
    expect(count).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Worker: processOverdueSubscriptions
// ---------------------------------------------------------------------------

describe("processOverdueSubscriptions", () => {
  it("moves active subscriptions past period end to past_due (non-autorenew)", async () => {
    const pastEnd = new Date(Date.now() - 86400000);
    seedSchool("s1", {
      subscriptionStatus: "active",
      currentPeriodEnd: pastEnd,
      autoRenew: false,
    });

    const count = await processOverdueSubscriptions();
    expect(count).toBe(1);

    expect(getSchool("s1")?.subscriptionStatus).toBe("past_due");
  });

  it("skips auto-renew subscriptions", async () => {
    const pastEnd = new Date(Date.now() - 86400000);
    seedSchool("s1", {
      subscriptionStatus: "active",
      currentPeriodEnd: pastEnd,
      autoRenew: true,
    });

    const count = await processOverdueSubscriptions();
    expect(count).toBe(0);

    expect(getSchool("s1")?.subscriptionStatus).toBe("active");
  });

  it("does not touch subscriptions with future period end", async () => {
    const futureEnd = new Date(Date.now() + 30 * 86400000);
    seedSchool("s1", {
      subscriptionStatus: "active",
      currentPeriodEnd: futureEnd,
      autoRenew: false,
    });

    const count = await processOverdueSubscriptions();
    expect(count).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Worker: processExpiredGrace
// ---------------------------------------------------------------------------

describe("processExpiredGrace", () => {
  it("expires past_due subscriptions after 7-day grace period", async () => {
    const eightDaysAgo = new Date(Date.now() - 8 * 86400000);
    seedSchool("s1", {
      subscriptionStatus: "past_due",
      currentPeriodEnd: eightDaysAgo,
    });

    const count = await processExpiredGrace();
    expect(count).toBe(1);

    expect(getSchool("s1")?.subscriptionStatus).toBe("expired");
  });

  it("does not expire past_due within the grace period", async () => {
    const threeDaysAgo = new Date(Date.now() - 3 * 86400000);
    seedSchool("s1", {
      subscriptionStatus: "past_due",
      currentPeriodEnd: threeDaysAgo,
    });

    const count = await processExpiredGrace();
    expect(count).toBe(0);

    expect(getSchool("s1")?.subscriptionStatus).toBe("past_due");
  });
});

// ---------------------------------------------------------------------------
// cancelSubscription
// ---------------------------------------------------------------------------

describe("cancelSubscription", () => {
  it("cancels an active subscription and returns effective date", async () => {
    const futureEnd = new Date(Date.now() + 15 * 86400000);
    seedSchool("s1", {
      subscriptionStatus: "active",
      currentPeriodEnd: futureEnd,
    });

    const result = await cancelSubscription("s1", "user_1");
    expect(result).toHaveProperty("cancelEffectiveDate");
    expect(typeof result.cancelEffectiveDate).toBe("string");

    const updated = getSchool("s1");
    expect(updated?.subscriptionStatus).toBe("cancelled");
    expect(updated?.autoRenew).toBe(false);
  });

  it("throws if school does not exist", async () => {
    await expect(cancelSubscription("nonexistent", "user_1")).rejects.toThrow(
      "School not found"
    );
  });

  it("throws if subscription is not active", async () => {
    seedSchool("s1", { subscriptionStatus: "trial" });

    await expect(cancelSubscription("s1", "user_1")).rejects.toThrow(
      /Cannot cancel/
    );
  });

  it("throws if subscription is already cancelled", async () => {
    seedSchool("s1", { subscriptionStatus: "cancelled" });

    await expect(cancelSubscription("s1", "user_1")).rejects.toThrow(
      /Cannot cancel/
    );
  });
});

// ---------------------------------------------------------------------------
// reactivateSubscription
// ---------------------------------------------------------------------------

describe("reactivateSubscription", () => {
  it("reactivates an expired subscription", async () => {
    seedSchool("s1", { subscriptionStatus: "expired" });

    await reactivateSubscription("s1", "Pro", 30);

    const updated = getSchool("s1");
    expect(updated?.subscriptionStatus).toBe("active");
    expect(updated?.subscriptionPlan).toBe("Pro");
    expect(updated?.autoRenew).toBe(true);
    expect(updated?.paymentFailureCount).toBe(0);
  });

  it("reactivates a cancelled subscription", async () => {
    seedSchool("s1", { subscriptionStatus: "cancelled" });

    await reactivateSubscription("s1", "Basic", 365);

    const updated = getSchool("s1");
    expect(updated?.subscriptionStatus).toBe("active");
    expect(updated?.subscriptionPlan).toBe("Basic");
  });

  it("sets currentPeriodStart and currentPeriodEnd", async () => {
    seedSchool("s1", { subscriptionStatus: "expired" });

    const before = Date.now();
    await reactivateSubscription("s1", "Pro", 30);
    const after = Date.now();

    const updated = getSchool("s1");
    const start = (updated?.currentPeriodStart as Date | undefined)?.getTime();
    const end = (updated?.currentPeriodEnd as Date | undefined)?.getTime();

    // start should be around now
    expect(start).toBeGreaterThanOrEqual(before - 1000);
    expect(start).toBeLessThanOrEqual(after + 1000);

    // end should be ~30 days from now
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
    expect(end).toBeGreaterThanOrEqual(before + thirtyDaysMs - 2000);
    expect(end).toBeLessThanOrEqual(after + thirtyDaysMs + 2000);
  });
});
