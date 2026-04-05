/**
 * Unit tests for plan-change.service.ts
 *
 * Covers:
 * - getPlanDefinition / getPlanTier / listPlans
 * - previewPlanChange (upgrade, downgrade, same-plan, limit violations)
 * - executePlanChange (free switch, downgrade scheduling, upgrade order)
 */

const mockState = {
  schools: new Map<string, any>(),
  students: [] as Array<{ schoolId: string; isDeleted?: boolean }>,
  teachers: [] as Array<{ schoolId: string; isDeleted?: boolean }>,
  classes: [] as Array<{ schoolId: string; isActive?: boolean }>,
};

jest.mock("../../src/lib/prisma", () => ({
  prisma: {
    school: {
      findUnique: jest.fn(async ({ where: { id } }) => mockState.schools.get(id) ?? null),
      update: jest.fn(async ({ where: { id }, data }) => {
        const existing = mockState.schools.get(id);
        if (!existing) throw new Error("School not found");
        const updated = { ...existing, ...data };
        mockState.schools.set(id, updated);
        return updated;
      }),
    },
    student: {
      count: jest.fn(async ({ where }) =>
        mockState.students.filter(
          (s) => s.schoolId === where.schoolId && s.isDeleted === where.isDeleted
        ).length
      ),
    },
    teacher: {
      count: jest.fn(async ({ where }) =>
        mockState.teachers.filter(
          (t) => t.schoolId === where.schoolId && t.isDeleted === where.isDeleted
        ).length
      ),
    },
    class: {
      count: jest.fn(async ({ where }) =>
        mockState.classes.filter(
          (c) => c.schoolId === where.schoolId && c.isActive === where.isActive
        ).length
      ),
    },
  },
}));

jest.mock("../../src/services/audit.service", () => ({
  writeAuditLog: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("../../src/services/notification.service", () => ({
  createNotification: jest.fn().mockResolvedValue({ id: "notif_1" }),
}));
jest.mock("../../src/services/payment.service", () => ({
  createOrder: jest.fn().mockResolvedValue({
    id: "order_test123",
    amount: 250000,
    currency: "INR",
  }),
}));
jest.mock("../../src/services/invoice.service", () => ({
  createCreditNote: jest.fn().mockResolvedValue({ id: "cn_test123" }),
}));

import {
  getPlanDefinition,
  getPlanTier,
  listPlans,
  previewPlanChange,
  executePlanChange,
  PLAN_CATALOG,
} from "../../src/services/plan-change.service";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function seedSchool(
  schoolId: string,
  plan: string,
  status: string = "active",
  overrides: Record<string, unknown> = {}
) {
  const now = Date.now();
  mockState.schools.set(schoolId, {
    id: schoolId,
    name: "Test School",
    subscriptionPlan: plan,
    subscriptionStatus: status,
    autoRenew: true,
    currentPeriodStart: new Date(now - 15 * 86400000), // 15 days ago
    currentPeriodEnd: new Date(now + 15 * 86400000),   // 15 days from now
    paymentFailureCount: 0,
    maxStudents: PLAN_CATALOG[plan.toLowerCase()]?.limits.maxStudents ?? 50,
    maxTeachers: PLAN_CATALOG[plan.toLowerCase()]?.limits.maxTeachers ?? 5,
    ...overrides,
  });
}

function seedUsage(schoolId: string, students: number, teachers: number, classes: number) {
  for (let i = 0; i < students; i++) {
    mockState.students.push({ schoolId, isDeleted: false });
  }
  for (let i = 0; i < teachers; i++) {
    mockState.teachers.push({ schoolId, isDeleted: false });
  }
  for (let i = 0; i < classes; i++) {
    mockState.classes.push({ schoolId, isActive: true });
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  mockState.schools.clear();
  mockState.students = [];
  mockState.teachers = [];
  mockState.classes = [];
  jest.clearAllMocks();
});

describe("getPlanDefinition", () => {
  it("returns a valid plan by name", () => {
    const plan = getPlanDefinition("pro");
    expect(plan).not.toBeNull();
    expect(plan!.name).toBe("pro");
    expect(plan!.displayName).toBe("Pro");
    expect(plan!.monthlyPricePaise).toBe(249900);
  });

  it("returns null for unknown plan", () => {
    expect(getPlanDefinition("platinum")).toBeNull();
  });

  it("is case-insensitive", () => {
    expect(getPlanDefinition("PRO")).not.toBeNull();
    expect(getPlanDefinition("Basic")).not.toBeNull();
  });
});

describe("getPlanTier", () => {
  it("returns correct tier indices", () => {
    expect(getPlanTier("free")).toBe(0);
    expect(getPlanTier("basic")).toBe(1);
    expect(getPlanTier("pro")).toBe(2);
    expect(getPlanTier("enterprise")).toBe(3);
  });

  it("returns -1 for unknown plan", () => {
    expect(getPlanTier("unknown")).toBe(-1);
  });
});

describe("listPlans", () => {
  it("returns all 4 plans", () => {
    const plans = listPlans();
    expect(plans).toHaveLength(4);
    expect(plans.map((p) => p.name)).toEqual(
      expect.arrayContaining(["free", "basic", "pro", "enterprise"])
    );
  });

  it("every plan has required fields", () => {
    for (const plan of listPlans()) {
      expect(plan.name).toBeTruthy();
      expect(plan.displayName).toBeTruthy();
      expect(typeof plan.monthlyPricePaise).toBe("number");
      expect(typeof plan.yearlyPricePaise).toBe("number");
      expect(plan.limits).toBeDefined();
      expect(Array.isArray(plan.features)).toBe(true);
    }
  });
});

describe("previewPlanChange", () => {
  it("rejects if school not found", async () => {
    await expect(previewPlanChange("nonexistent", "pro")).rejects.toThrow(
      "School not found"
    );
  });

  it("returns canProceed=false when already on same plan", async () => {
    seedSchool("s1", "pro");
    const preview = await previewPlanChange("s1", "pro");
    expect(preview.canProceed).toBe(false);
    expect(preview.isUpgrade).toBe(false);
    expect(preview.isDowngrade).toBe(false);
    expect(preview.message).toContain("already on this plan");
  });

  it("rejects unknown target plan", async () => {
    seedSchool("s1", "basic");
    await expect(previewPlanChange("s1", "platinum")).rejects.toThrow(
      "Unknown plan"
    );
  });

  it("detects an upgrade (basic → pro)", async () => {
    seedSchool("s1", "basic");
    seedUsage("s1", 10, 5, 3);

    const preview = await previewPlanChange("s1", "pro");

    expect(preview.isUpgrade).toBe(true);
    expect(preview.isDowngrade).toBe(false);
    expect(preview.canProceed).toBe(true);
    expect(preview.proration).not.toBeNull();
    expect(preview.effectiveDate).toBe(
      new Date().toISOString().split("T")[0]
    ); // immediate
  });

  it("detects a downgrade (pro → basic)", async () => {
    seedSchool("s1", "pro");
    seedUsage("s1", 10, 5, 3); // usage within basic limits

    const preview = await previewPlanChange("s1", "basic");

    expect(preview.isUpgrade).toBe(false);
    expect(preview.isDowngrade).toBe(true);
    expect(preview.canProceed).toBe(true);
    expect(preview.limitViolations).toHaveLength(0);
  });

  it("shows limit violations when usage exceeds target plan", async () => {
    seedSchool("s1", "pro");
    seedUsage("s1", 300, 25, 5); // 300 students > basic's 200

    const preview = await previewPlanChange("s1", "basic");

    expect(preview.isDowngrade).toBe(true);
    expect(preview.canProceed).toBe(false);
    expect(preview.limitViolations.length).toBeGreaterThan(0);
    expect(preview.limitViolations[0].resource).toBe("students");
    expect(preview.limitViolations[0].current).toBe(300);
    expect(preview.limitViolations[0].newLimit).toBe(200);
  });

  it("shows multiple limit violations", async () => {
    seedSchool("s1", "enterprise");
    seedUsage("s1", 300, 30, 25); // exceeds free limits on all resources

    const preview = await previewPlanChange("s1", "free");

    expect(preview.canProceed).toBe(false);
    expect(preview.limitViolations.length).toBe(3);
    expect(preview.limitViolations.map((v) => v.resource)).toEqual(
      expect.arrayContaining(["students", "teachers", "classes"])
    );
  });

  it("calculates proration for upgrade", async () => {
    seedSchool("s1", "basic");
    const preview = await previewPlanChange("s1", "pro", "monthly");

    expect(preview.proration).not.toBeNull();
    expect(preview.proration!.remainingDays).toBeGreaterThanOrEqual(0);
    expect(preview.proration!.totalDays).toBeGreaterThan(0);
    expect(preview.proration!.creditAmountPaise).toBeGreaterThanOrEqual(0);
    expect(preview.proration!.newChargePaise).toBeGreaterThan(0);
    expect(preview.proration!.netChargePaise).toBeGreaterThanOrEqual(0);
  });
});

describe("executePlanChange", () => {
  it("throws if school not found", async () => {
    await expect(
      executePlanChange("nonexistent", "pro", "monthly", "user1")
    ).rejects.toThrow();
  });

  it("throws if changing to same plan", async () => {
    seedSchool("s1", "pro");
    await expect(
      executePlanChange("s1", "pro", "monthly", "user1")
    ).rejects.toThrow("already on this plan");
  });

  it("handles free downgrade immediately", async () => {
    seedSchool("s1", "basic");
    seedUsage("s1", 5, 2, 2); // within free limits

    const result = await executePlanChange("s1", "free", "monthly", "user1");

    expect(result.type).toBe("free_switch");
    expect(result.newPlan).toBe("free");
    expect(result.message).toContain("Free");

    // Verify Firestore was updated
    const school = mockState.schools.get("s1");
    expect(school?.subscriptionPlan).toBe("free");
    expect(school?.subscriptionStatus).toBe("active");
  });

  it("schedules downgrade for end of period", async () => {
    seedSchool("s1", "pro");
    seedUsage("s1", 10, 5, 3); // within basic limits

    const result = await executePlanChange("s1", "basic", "monthly", "user1");

    expect(result.type).toBe("downgrade");
    expect(result.newPlan).toBe("basic");

    // Verify pending downgrade was written
    const school = mockState.schools.get("s1");
    expect(school?.pendingDowngrade).toBeDefined();
    expect((school?.pendingDowngrade as any).newPlan).toBe("basic");
  });

  it("rejects downgrade when usage exceeds limits", async () => {
    seedSchool("s1", "pro");
    seedUsage("s1", 300, 25, 5); // 300 students > basic's 200

    await expect(
      executePlanChange("s1", "basic", "monthly", "user1")
    ).rejects.toThrow("Cannot downgrade");
  });

  it("creates a Razorpay order for paid upgrade", async () => {
    seedSchool("s1", "basic");
    seedUsage("s1", 10, 5, 3);

    const result = await executePlanChange("s1", "pro", "monthly", "user1");

    expect(result.type).toBe("upgrade");
    expect(result.newPlan).toBe("pro");
    expect(result.order).toBeDefined();
    expect(result.order!.id).toBe("order_test123");
    expect(result.order!.currency).toBe("INR");
  });

  it("creates a credit note for prorated upgrade", async () => {
    seedSchool("s1", "basic");
    const result = await executePlanChange("s1", "pro", "monthly", "user1");

    expect(result.creditNoteId).toBe("cn_test123");
  });

  it("writes audit log on plan change", async () => {
    const { writeAuditLog } = require("../../src/services/audit.service");
    seedSchool("s1", "basic");
    seedUsage("s1", 5, 2, 2);

    await executePlanChange("s1", "free", "monthly", "user1");

    expect(writeAuditLog).toHaveBeenCalledWith(
      "PLAN_CHANGED",
      "user1",
      "s1",
      expect.objectContaining({ type: "downgrade", from: "basic", to: "free" })
    );
  });

  it("sends notification on plan change", async () => {
    const { createNotification } = require("../../src/services/notification.service");
    seedSchool("s1", "basic");
    seedUsage("s1", 5, 2, 2);

    await executePlanChange("s1", "free", "monthly", "user1");

    expect(createNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Plan Changed",
        type: "INFO",
        targetType: "SCHOOL",
      }),
      expect.objectContaining({
        userId: "user1",
        schoolId: "s1",
      })
    );
  });
});
