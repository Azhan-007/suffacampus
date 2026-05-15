import {
  reserveCapacity,
  releaseReservedCapacity,
  validateQuota,
  reconcileUsageCounters,
  resetUsageCounterCompatibilityCache,
} from "../../src/services/quota.service";
import { writeAuditLog } from "../../src/services/audit.service";

type CounterRow = {
  id: string;
  schoolId: string;
  resourceType: string;
  used: number;
  reserved: number;
  limitSnapshot: number | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
};

type SchoolRow = {
  id: string;
  subscriptionPlan: string;
  maxStudents: number;
  maxTeachers: number;
  maxStorage: number;
  currentStudents: number;
  currentTeachers: number;
  currentStorage: number;
};

type StudentRow = { id: string; schoolId: string; isDeleted: boolean };

type TeacherRow = { id: string; schoolId: string; isDeleted: boolean };

const mockState = {
  schools: new Map<string, SchoolRow>(),
  counters: new Map<string, CounterRow>(),
  students: new Map<string, StudentRow>(),
  teachers: new Map<string, TeacherRow>(),
  counterSeq: 1,
};

let updateFailures = 0;

function counterKey(schoolId: string, resourceType: string) {
  return `${schoolId}:${resourceType}`;
}

function applyNumericUpdate(current: number, update: unknown): number {
  if (typeof update === "number") return update;
  if (update && typeof update === "object") {
    const value = update as { increment?: number; decrement?: number };
    if (typeof value.increment === "number") return current + value.increment;
    if (typeof value.decrement === "number") return current - value.decrement;
  }
  return current;
}

function seedSchool(id: string, overrides: Partial<SchoolRow> = {}) {
  const row: SchoolRow = {
    id,
    subscriptionPlan: "pro",
    maxStudents: 2,
    maxTeachers: 2,
    maxStorage: 500,
    currentStudents: 0,
    currentTeachers: 0,
    currentStorage: 0,
    ...overrides,
  };
  mockState.schools.set(id, row);
  return row;
}

function seedCounter(schoolId: string, resourceType: string, overrides: Partial<CounterRow> = {}) {
  const now = new Date();
  const row: CounterRow = {
    id: `tuc_${mockState.counterSeq++}`,
    schoolId,
    resourceType,
    used: 0,
    reserved: 0,
    limitSnapshot: null,
    version: 1,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
  mockState.counters.set(counterKey(schoolId, resourceType), row);
  return row;
}

function seedStudent(id: string, schoolId: string, isDeleted = false) {
  mockState.students.set(id, { id, schoolId, isDeleted });
}

function seedTeacher(id: string, schoolId: string, isDeleted = false) {
  mockState.teachers.set(id, { id, schoolId, isDeleted });
}

jest.mock("../../src/lib/prisma", () => {
  const prisma = {
    school: {
      findUnique: jest.fn(async ({ where: { id } }) => mockState.schools.get(id) ?? null),
      updateMany: jest.fn(async ({ where: { id }, data }) => {
        const row = mockState.schools.get(id);
        if (!row) return { count: 0 };
        const updated: SchoolRow = {
          ...row,
          currentStudents: applyNumericUpdate(row.currentStudents, data.currentStudents),
          currentTeachers: applyNumericUpdate(row.currentTeachers, data.currentTeachers),
        };
        mockState.schools.set(id, updated);
        return { count: 1 };
      }),
    },
    tenantUsageCounter: {
      findUnique: jest.fn(async ({ where: { schoolId_resourceType } }) =>
        mockState.counters.get(counterKey(schoolId_resourceType.schoolId, schoolId_resourceType.resourceType)) ?? null
      ),
      create: jest.fn(async ({ data }) => {
        const now = new Date();
        const row: CounterRow = {
          id: `tuc_${mockState.counterSeq++}`,
          schoolId: data.schoolId,
          resourceType: data.resourceType,
          used: data.used ?? 0,
          reserved: data.reserved ?? 0,
          limitSnapshot: data.limitSnapshot ?? null,
          version: data.version ?? 1,
          createdAt: now,
          updatedAt: now,
        };
        mockState.counters.set(counterKey(data.schoolId, data.resourceType), row);
        return row;
      }),
      updateMany: jest.fn(async ({ where, data }) => {
        if (updateFailures > 0) {
          updateFailures -= 1;
          return { count: 0 };
        }

        const counter = [...mockState.counters.values()].find((row) => row.id === where.id);
        if (!counter) return { count: 0 };
        if (typeof where.version === "number" && counter.version !== where.version) {
          return { count: 0 };
        }

        const updated: CounterRow = {
          ...counter,
          used: applyNumericUpdate(counter.used, data.used),
          reserved: applyNumericUpdate(counter.reserved, data.reserved),
          limitSnapshot:
            typeof data.limitSnapshot === "number" || data.limitSnapshot === null
              ? data.limitSnapshot
              : counter.limitSnapshot,
          version: typeof data.version === "number" ? data.version : counter.version,
          updatedAt: new Date(),
        };

        mockState.counters.set(counterKey(counter.schoolId, counter.resourceType), updated);
        return { count: 1 };
      }),
      findMany: jest.fn(async ({ where }) => {
        const allowedSchools = new Set(where?.schoolId?.in ?? []);
        const allowedTypes = new Set(where?.resourceType?.in ?? []);
        return [...mockState.counters.values()].filter((row) => {
          if (allowedSchools.size && !allowedSchools.has(row.schoolId)) return false;
          if (allowedTypes.size && !allowedTypes.has(row.resourceType)) return false;
          return true;
        });
      }),
      update: jest.fn(async ({ where: { id }, data }) => {
        const counter = [...mockState.counters.values()].find((row) => row.id === id);
        if (!counter) throw new Error("Counter not found");
        const updated: CounterRow = {
          ...counter,
          used: typeof data.used === "number" ? data.used : counter.used,
          reserved: typeof data.reserved === "number" ? data.reserved : counter.reserved,
          limitSnapshot:
            typeof data.limitSnapshot === "number" || data.limitSnapshot === null
              ? data.limitSnapshot
              : counter.limitSnapshot,
          updatedAt: new Date(),
        };
        mockState.counters.set(counterKey(counter.schoolId, counter.resourceType), updated);
        return updated;
      }),
    },
    student: {
      count: jest.fn(async ({ where }) =>
        [...mockState.students.values()].filter((row) => {
          if (where?.schoolId && row.schoolId !== where.schoolId) return false;
          if (typeof where?.isDeleted !== "undefined" && row.isDeleted !== where.isDeleted) return false;
          return true;
        }).length
      ),
      groupBy: jest.fn(async ({ where }) => {
        const allowedSchools = new Set(where?.schoolId?.in ?? []);
        const counts = new Map<string, number>();
        for (const row of mockState.students.values()) {
          if (allowedSchools.size && !allowedSchools.has(row.schoolId)) continue;
          if (where?.isDeleted !== undefined && row.isDeleted !== where.isDeleted) continue;
          counts.set(row.schoolId, (counts.get(row.schoolId) ?? 0) + 1);
        }
        return [...counts.entries()].map(([schoolId, _count]) => ({ schoolId, _count }));
      }),
    },
    teacher: {
      count: jest.fn(async ({ where }) =>
        [...mockState.teachers.values()].filter((row) => {
          if (where?.schoolId && row.schoolId !== where.schoolId) return false;
          if (typeof where?.isDeleted !== "undefined" && row.isDeleted !== where.isDeleted) return false;
          return true;
        }).length
      ),
      groupBy: jest.fn(async ({ where }) => {
        const allowedSchools = new Set(where?.schoolId?.in ?? []);
        const counts = new Map<string, number>();
        for (const row of mockState.teachers.values()) {
          if (allowedSchools.size && !allowedSchools.has(row.schoolId)) continue;
          if (where?.isDeleted !== undefined && row.isDeleted !== where.isDeleted) continue;
          counts.set(row.schoolId, (counts.get(row.schoolId) ?? 0) + 1);
        }
        return [...counts.entries()].map(([schoolId, _count]) => ({ schoolId, _count }));
      }),
    },
  };

  return { prisma };
});

jest.mock("../../src/services/audit.service", () => ({
  writeAuditLog: jest.fn().mockResolvedValue(undefined),
}));

beforeEach(() => {
  resetUsageCounterCompatibilityCache();
  mockState.schools.clear();
  mockState.counters.clear();
  mockState.students.clear();
  mockState.teachers.clear();
  mockState.counterSeq = 1;
  updateFailures = 0;
  jest.clearAllMocks();
});

describe("quota.service", () => {
  it("retries on optimistic locking conflicts", async () => {
    seedSchool("s1", { maxStudents: 5 });
    seedCounter("s1", "students", { used: 1, reserved: 0, version: 1 });
    updateFailures = 1;

    const result = await reserveCapacity({
      schoolId: "s1",
      resourceType: "students",
      amount: 1,
    });

    const counter = mockState.counters.get("s1:students");
    expect(result.mode).toBe("counter");
    expect(counter?.reserved).toBe(1);
    expect(counter?.version).toBe(2);
  });

  it("blocks reservations that exceed limit", async () => {
    seedSchool("s1", { maxStudents: 1 });
    seedCounter("s1", "students", { used: 1, reserved: 0, version: 1 });

    await expect(
      reserveCapacity({ schoolId: "s1", resourceType: "students", amount: 1 })
    ).rejects.toHaveProperty("code", "SUBSCRIPTION_LIMIT_REACHED");
  });

  it("releases reserved capacity", async () => {
    seedSchool("s1", { maxStudents: 5 });
    seedCounter("s1", "students", { used: 0, reserved: 2, version: 1 });

    await releaseReservedCapacity({ schoolId: "s1", resourceType: "students", amount: 1 });

    const counter = mockState.counters.get("s1:students");
    expect(counter?.reserved).toBe(1);
  });

  it("falls back when usage counters are unavailable", async () => {
    seedSchool("s1", { maxStudents: 1 });
    seedStudent("stu1", "s1");

    const prismaModule = await import("../../src/lib/prisma.js");
    const prismaAny = prismaModule.prisma as any;
    const original = prismaAny.tenantUsageCounter;
    prismaAny.tenantUsageCounter = undefined;
    resetUsageCounterCompatibilityCache();

    await expect(
      validateQuota({ schoolId: "s1", resourceType: "students", incoming: 1 })
    ).rejects.toThrow(/SUBSCRIPTION_LIMIT_REACHED/);

    prismaAny.tenantUsageCounter = original;
  });

  it("detects reconciliation drift and logs audit entry", async () => {
    seedSchool("s1", { maxStudents: 10, maxTeachers: 5 });
    seedStudent("stu1", "s1");
    seedStudent("stu2", "s1");
    seedTeacher("teach1", "s1");

    seedCounter("s1", "students", { used: 1, reserved: 0, version: 1 });
    seedCounter("s1", "teachers", { used: 0, reserved: 0, version: 1 });

    const result = await reconcileUsageCounters({ schoolIds: ["s1"], mode: "report" });

    expect(result.checked).toBe(1);
    expect(result.discrepancies).toBe(1);
    expect(writeAuditLog).toHaveBeenCalledWith(
      "QUOTA_RECONCILE",
      "system",
      "s1",
      expect.objectContaining({
        studentDiff: 1,
        teacherDiff: 1,
        mode: "report",
      })
    );
  });

  it("throws conflict after repeated optimistic failures", async () => {
    seedSchool("s1", { maxStudents: 5 });
    seedCounter("s1", "students", { used: 0, reserved: 0, version: 1 });
    updateFailures = 10;

    await expect(
      reserveCapacity({ schoolId: "s1", resourceType: "students", amount: 1 })
    ).rejects.toHaveProperty("code", "CONFLICT");
  });
});
