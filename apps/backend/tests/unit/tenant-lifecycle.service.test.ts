/**
 * Unit tests for tenant-lifecycle.service.ts
 */

import {
  transitionTenantLifecycle,
  suspendTenant,
  reactivateTenant,
  resolveTenantAccessState,
  isAccessExpiredSnapshot,
  resetTenantAccessCompatibilityCache,
  type TenantAccessSnapshot,
} from "../../src/services/tenant-lifecycle.service";

const mockState = {
  access: new Map<string, any>(),
  schools: new Map<string, any>(),
};

let idCounter = 1;

function seedSchool(schoolId: string, overrides: Record<string, unknown> = {}) {
  mockState.schools.set(schoolId, {
    id: schoolId,
    subscriptionStatus: "trial",
    isActive: true,
    trialEndDate: null,
    currentPeriodEnd: null,
    cancelEffectiveDate: null,
    ...overrides,
  });
}

function seedAccess(schoolId: string, overrides: Record<string, unknown> = {}) {
  const row = {
    id: `tas_${idCounter++}`,
    schoolId,
    accessState: "active",
    lifecycleState: "trial",
    reason: null,
    effectiveUntil: null,
    sourceSubscriptionId: null,
    accessVersion: 0,
    version: 1,
    lastTransitionAt: new Date(),
    ...overrides,
  };
  mockState.access.set(schoolId, row);
  return row;
}

jest.mock("../../src/lib/prisma", () => ({
  prisma: {
    tenantAccessState: {
      findUnique: jest.fn(async ({ where: { schoolId } }) =>
        mockState.access.get(schoolId) ?? null
      ),
      create: jest.fn(async ({ data }) => {
        const row = {
          id: `tas_${idCounter++}`,
          lastTransitionAt: new Date(),
          ...data,
        };
        mockState.access.set(data.schoolId, row);
        return row;
      }),
      updateMany: jest.fn(async ({ where, data }) => {
        const row = mockState.access.get(where.id ? where.id : where.schoolId);
        if (!row) return { count: 0 };
        if (typeof where.version === "number" && row.version !== where.version) {
          return { count: 0 };
        }
        const updated = { ...row, ...data };
        mockState.access.set(updated.schoolId, updated);
        return { count: 1 };
      }),
    },
    school: {
      findUnique: jest.fn(async ({ where: { id } }) =>
        mockState.schools.get(id) ?? null
      ),
      updateMany: jest.fn(async ({ where: { id }, data }) => {
        const row = mockState.schools.get(id);
        if (!row) return { count: 0 };
        mockState.schools.set(id, { ...row, ...data });
        return { count: 1 };
      }),
    },
  },
}));

jest.mock("../../src/services/audit.service", () => ({
  writeAuditLog: jest.fn().mockResolvedValue(undefined),
}));

beforeEach(() => {
  mockState.access.clear();
  mockState.schools.clear();
  idCounter = 1;
  resetTenantAccessCompatibilityCache();
  jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Transition validation & optimistic locking
// ---------------------------------------------------------------------------

describe("transitionTenantLifecycle", () => {
  it("applies valid transitions", async () => {
    seedSchool("s1", { subscriptionStatus: "trial" });
    seedAccess("s1", { lifecycleState: "trial" });

    const result = await transitionTenantLifecycle({
      schoolId: "s1",
      targetLifecycle: "active",
      reason: "payment_received",
    });

    expect(result.status).toBe("applied");
    const updated = mockState.access.get("s1");
    expect(updated.lifecycleState).toBe("active");
    expect(updated.version).toBe(2);
  });

  it("rejects invalid transitions", async () => {
    seedSchool("s1", { subscriptionStatus: "active" });
    seedAccess("s1", { lifecycleState: "active" });

    const result = await transitionTenantLifecycle({
      schoolId: "s1",
      targetLifecycle: "trial",
    });

    expect(result.status).toBe("invalid");
  });

  it("returns noop when state already matches", async () => {
    seedSchool("s1", { subscriptionStatus: "active" });
    seedAccess("s1", { lifecycleState: "active", accessState: "active" });

    const result = await transitionTenantLifecycle({
      schoolId: "s1",
      targetLifecycle: "active",
    });

    expect(result.status).toBe("noop");
  });

  it("detects optimistic lock conflicts", async () => {
    seedSchool("s1", { subscriptionStatus: "trial" });
    seedAccess("s1", { lifecycleState: "trial", version: 5 });

    const prisma = require("../../src/lib/prisma").prisma;
    prisma.tenantAccessState.updateMany = jest.fn(async () => ({ count: 0 }));

    const result = await transitionTenantLifecycle({
      schoolId: "s1",
      targetLifecycle: "active",
    });

    expect(result.status).toBe("conflict");
  });
});

// ---------------------------------------------------------------------------
// Access version + expiry checks
// ---------------------------------------------------------------------------

describe("access version and expiry", () => {
  it("increments accessVersion on suspension and reactivation", async () => {
    seedSchool("s1", { subscriptionStatus: "active" });
    seedAccess("s1", { lifecycleState: "active", accessVersion: 1 });

    const suspended = await suspendTenant({ schoolId: "s1" });
    expect(suspended.status).toBe("applied");
    expect(mockState.access.get("s1").accessVersion).toBe(2);

    const reactivated = await reactivateTenant({ schoolId: "s1" });
    expect(reactivated.status).toBe("applied");
    expect(mockState.access.get("s1").accessVersion).toBe(3);
  });

  it("flags expired snapshots past effectiveUntil", () => {
    const now = new Date();
    const expired = new Date(now.getTime() - 60_000);
    const snapshot: TenantAccessSnapshot = {
      schoolId: "s1",
      accessState: "active",
      lifecycleState: "trial",
      effectiveUntil: expired,
      accessVersion: 0,
      version: 1,
      exists: true,
    };

    expect(isAccessExpiredSnapshot(snapshot, now)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Compatibility fallback
// ---------------------------------------------------------------------------

describe("resolveTenantAccessState", () => {
  it("falls back to school status when access table is missing", async () => {
    seedSchool("s1", { subscriptionStatus: "past_due" });

    const prisma = require("../../src/lib/prisma").prisma;
    const original = prisma.tenantAccessState;
    prisma.tenantAccessState = undefined;
    resetTenantAccessCompatibilityCache();

    const snapshot = await resolveTenantAccessState("s1");

    expect(snapshot?.lifecycleState).toBe("past_due");
    expect(snapshot?.exists).toBe(false);

    prisma.tenantAccessState = original;
  });
});
