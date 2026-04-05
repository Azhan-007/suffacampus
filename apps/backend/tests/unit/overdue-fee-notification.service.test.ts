/**
 * Unit tests for overdue-fee-notification.service.ts
 */

import { processOverdueFeeNotifications } from "../../src/services/overdue-fee-notification.service";
import { createNotification } from "../../src/services/notification.service";

type FeeRecord = {
  id: string;
  schoolId: string;
  studentId: string;
  studentName?: string;
  amount: number;
  dueDate: string;
  status: string;
};

type ParentRecord = {
  uid: string;
  schoolId: string;
  role: string;
  isActive: boolean;
  studentIds: string[];
};

const mockState: {
  fees: Map<string, FeeRecord>;
  parents: Map<string, ParentRecord>;
  existingNotificationKeys: Set<string>;
} = {
  fees: new Map<string, FeeRecord>(),
  parents: new Map<string, ParentRecord>(),
  existingNotificationKeys: new Set<string>(),
};

function buildNotificationKey(input: {
  schoolId: string;
  targetId: string;
  referenceType?: string;
  referenceId?: string;
}) {
  return `${input.schoolId}|${input.targetId}|${input.referenceType ?? ""}|${input.referenceId ?? ""}`;
}

jest.mock("../../src/lib/prisma", () => ({
  prisma: {
    fee: {
      findMany: jest.fn(async ({ where, select }) => {
        const rows = [...mockState.fees.values()].filter((fee) => {
          if (where?.dueDate?.lt && fee.dueDate >= where.dueDate.lt) return false;
          if (where?.status?.in && !where.status.in.includes(fee.status)) return false;
          return true;
        });

        if (!select) return rows;

        return rows.map((row) => ({
          id: row.id,
          schoolId: row.schoolId,
          studentId: row.studentId,
          studentName: row.studentName,
          amount: row.amount,
          dueDate: row.dueDate,
        }));
      }),
    },
    user: {
      findMany: jest.fn(async ({ where, select }) => {
        const rows = [...mockState.parents.values()].filter((parent) => {
          if (where?.schoolId && parent.schoolId !== where.schoolId) return false;
          if (where?.role && parent.role !== where.role) return false;
          if (where?.isActive === true && parent.isActive !== true) return false;
          const studentId = where?.studentIds?.has;
          if (studentId && !parent.studentIds.includes(studentId)) return false;
          return true;
        });

        return select?.uid ? rows.map((row) => ({ uid: row.uid })) : rows;
      }),
    },
    notification: {
      findFirst: jest.fn(async ({ where }) => {
        const key = buildNotificationKey({
          schoolId: where.schoolId,
          targetId: where.targetId,
          referenceType: where.referenceType,
          referenceId: where.referenceId,
        });
        return mockState.existingNotificationKeys.has(key) ? { id: "dup_1" } : null;
      }),
    },
  },
}));

jest.mock("../../src/services/audit.service", () => ({
  writeAuditLog: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("../../src/services/notification.service", () => ({
  createNotification: jest.fn(),
}));

const mockCreateNotification = createNotification as jest.Mock;

function seedFee(overrides: Partial<FeeRecord> = {}) {
  const fee: FeeRecord = {
    id: "fee_1",
    schoolId: "school_1",
    studentId: "stu_1",
    studentName: "John Doe",
    amount: 5000,
    dueDate: "2026-04-01",
    status: "Pending",
    ...overrides,
  };
  mockState.fees.set(fee.id, fee);
}

function seedParent(overrides: Partial<ParentRecord> = {}) {
  const parent: ParentRecord = {
    uid: "parent_1",
    schoolId: "school_1",
    role: "Parent",
    isActive: true,
    studentIds: ["stu_1"],
    ...overrides,
  };
  mockState.parents.set(parent.uid, parent);
}

beforeEach(() => {
  mockState.fees.clear();
  mockState.parents.clear();
  mockState.existingNotificationKeys.clear();
  jest.clearAllMocks();

  mockCreateNotification.mockImplementation(async (input, context) => {
    const key = buildNotificationKey({
      schoolId: context.schoolId,
      targetId: input.targetId,
      referenceType: input.referenceType,
      referenceId: input.referenceId,
    });
    mockState.existingNotificationKeys.add(key);
    return { id: `notif_${mockState.existingNotificationKeys.size}` };
  });
});

describe("processOverdueFeeNotifications", () => {
  const runDate = new Date("2026-04-03T08:00:00.000Z");

  it("sends reminders to all linked parents for overdue unpaid fees", async () => {
    seedFee();
    seedParent({ uid: "parent_1" });
    seedParent({ uid: "parent_2" });

    const result = await processOverdueFeeNotifications(runDate);

    expect(result).toMatchObject({
      overdueFees: 1,
      notificationsCreated: 2,
      skippedDuplicates: 0,
      failed: 0,
    });

    expect(mockCreateNotification).toHaveBeenCalledTimes(2);
    const targets = mockCreateNotification.mock.calls.map((call) => call[0].targetId);
    expect(targets).toEqual(expect.arrayContaining(["parent_1", "parent_2"]));

    const [payload, context] = mockCreateNotification.mock.calls[0];
    expect(payload.title).toBe("Fee Overdue Reminder");
    expect(payload.referenceType).toBe("FEE");
    expect(payload.referenceId).toBe("fee_1:2026-04-03");
    expect(payload.message).toEqual(expect.stringContaining("overdue since 2026-04-01"));
    expect(context).toMatchObject({
      userId: "system",
      schoolId: "school_1",
      role: "Admin",
    });
  });

  it("skips non-overdue and paid fees", async () => {
    seedFee({ id: "fee_today", dueDate: "2026-04-03", status: "Pending" });
    seedFee({ id: "fee_paid", dueDate: "2026-04-01", status: "Paid" });
    seedParent();

    const result = await processOverdueFeeNotifications(runDate);

    expect(result).toMatchObject({
      overdueFees: 0,
      notificationsCreated: 0,
      skippedDuplicates: 0,
      failed: 0,
    });
    expect(mockCreateNotification).not.toHaveBeenCalled();
  });

  it("dedupes reminders when worker reruns on the same day", async () => {
    seedFee();
    seedParent();

    const firstRun = await processOverdueFeeNotifications(runDate);
    const secondRun = await processOverdueFeeNotifications(runDate);

    expect(firstRun.notificationsCreated).toBe(1);
    expect(secondRun.notificationsCreated).toBe(0);
    expect(secondRun.skippedDuplicates).toBe(1);
    expect(mockCreateNotification).toHaveBeenCalledTimes(1);
  });

  it("continues fanout when one parent notification fails", async () => {
    seedFee();
    seedParent({ uid: "parent_1" });
    seedParent({ uid: "parent_2" });

    mockCreateNotification
      .mockRejectedValueOnce(new Error("send failed"))
      .mockImplementationOnce(async (input, context) => {
        const key = buildNotificationKey({
          schoolId: context.schoolId,
          targetId: input.targetId,
          referenceType: input.referenceType,
          referenceId: input.referenceId,
        });
        mockState.existingNotificationKeys.add(key);
        return { id: "notif_success" };
      });

    const result = await processOverdueFeeNotifications(runDate);

    expect(result.notificationsCreated).toBe(1);
    expect(result.failed).toBe(1);
    expect(mockCreateNotification).toHaveBeenCalledTimes(2);
  });

  it("enforces tenant safety by not notifying parents from another school", async () => {
    seedFee({ schoolId: "school_1", studentId: "stu_1" });
    seedParent({ uid: "parent_ok", schoolId: "school_1", studentIds: ["stu_1"] });
    seedParent({ uid: "parent_other_school", schoolId: "school_2", studentIds: ["stu_1"] });

    const result = await processOverdueFeeNotifications(runDate);

    expect(result.notificationsCreated).toBe(1);
    expect(mockCreateNotification).toHaveBeenCalledTimes(1);
    expect(mockCreateNotification.mock.calls[0][0].targetId).toBe("parent_ok");
  });
});
