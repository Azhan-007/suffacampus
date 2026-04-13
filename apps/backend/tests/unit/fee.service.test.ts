/**
 * Unit tests for fee.service.ts
 *
 * Focus on fee assignment notification side effects.
 */

import { createFee } from "../../src/services/fee.service";
import { createNotification } from "../../src/services/notification.service";

type MockUser = {
  uid: string;
  schoolId: string;
  role: string;
  isActive?: boolean;
  studentIds?: string[];
};

const mockState: {
  fees: Map<string, any>;
  feeCounter: number;
  parentUsers: MockUser[];
  actorUser: MockUser | null;
  duplicateNotification: boolean;
} = {
  fees: new Map<string, any>(),
  feeCounter: 1,
  parentUsers: [],
  actorUser: null,
  duplicateNotification: false,
};

jest.mock("../../src/lib/prisma", () => ({
  prisma: {
    fee: {
      create: jest.fn(async ({ data }) => {
        const id = `fee_${mockState.feeCounter++}`;
        const fee = {
          id,
          createdAt: new Date(),
          updatedAt: new Date(),
          ...data,
        };
        mockState.fees.set(id, fee);
        return fee;
      }),
    },
    user: {
      findMany: jest.fn(async ({ where, select }) => {
        const parents = mockState.parentUsers.filter((parent) => {
          if (where?.schoolId && parent.schoolId !== where.schoolId) return false;
          if (where?.role && parent.role !== where.role) return false;
          if (where?.isActive === true && parent.isActive !== true) return false;
          const studentId = where?.studentIds?.has;
          if (studentId && !parent.studentIds?.includes(studentId)) return false;
          return true;
        });

        return select?.uid ? parents.map((parent) => ({ uid: parent.uid })) : parents;
      }),
      findFirst: jest.fn(async ({ where, select }) => {
        if (where?.uid) {
          const actor = mockState.actorUser;
          if (!actor) return null;
          if (actor.uid !== where.uid) return null;
          if (where.schoolId && actor.schoolId !== where.schoolId) return null;
          return select?.role ? { role: actor.role } : actor;
        }

        return null;
      }),
    },
    notification: {
      findFirst: jest.fn(async () => (mockState.duplicateNotification ? { id: "dup" } : null)),
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

const validPayload = {
  studentId: "stu_1",
  studentName: "John Doe",
  classId: "10",
  sectionId: "A",
  amount: 5000,
  dueDate: "2025-04-30",
  status: "Pending" as const,
  feeType: "Tuition",
};

function seedParent(overrides: Partial<MockUser> = {}) {
  mockState.parentUsers.push({
    uid: "parent_1",
    schoolId: "school_1",
    role: "Parent",
    isActive: true,
    studentIds: ["stu_1"],
    ...overrides,
  });
}

function seedActor(overrides: Partial<MockUser> = {}) {
  mockState.actorUser = {
    uid: "actor_1",
    schoolId: "school_1",
    role: "Admin",
    ...overrides,
  };
}

beforeEach(() => {
  mockState.fees.clear();
  mockState.feeCounter = 1;
  mockState.parentUsers = [];
  mockState.actorUser = null;
  mockState.duplicateNotification = false;
  jest.clearAllMocks();
  mockCreateNotification.mockResolvedValue({ id: "notif_1" });
});

// ---------------------------------------------------------------------------
// createFee notifications
// ---------------------------------------------------------------------------

describe("createFee notifications", () => {
  it("notifies the parent when actor is admin", async () => {
    seedParent();
    seedActor({ role: "Admin" });

    const fee = await createFee("school_1", validPayload, "actor_1");

    expect(fee).toHaveProperty("id");
    expect(mockCreateNotification).toHaveBeenCalledTimes(1);
    const [payload, context] = mockCreateNotification.mock.calls[0];
    expect(payload).toMatchObject({
      title: "Fee Assigned",
      type: "REMINDER",
      targetType: "USER",
      targetId: "parent_1",
    });
    expect(payload.message).toEqual(expect.stringContaining("Fee of"));
    expect(payload.message).toEqual(expect.stringContaining("5,000.00"));
    expect(payload.message).toEqual(expect.stringContaining("John Doe"));
    expect(payload.referenceType).toBe("FEE");
    expect(payload.referenceId).toBe("fee_1");
    expect(context).toMatchObject({
      userId: "actor_1",
      schoolId: "school_1",
      role: "Admin",
    });
  });

  it("notifies all linked parents", async () => {
    seedParent({ uid: "parent_1" });
    seedParent({ uid: "parent_2" });
    seedActor({ role: "Admin" });

    await createFee("school_1", validPayload, "actor_1");

    expect(mockCreateNotification).toHaveBeenCalledTimes(2);
    const parentTargets = mockCreateNotification.mock.calls.map((call) => call[0].targetId);
    expect(parentTargets).toEqual(expect.arrayContaining(["parent_1", "parent_2"]));
    const referenceIds = mockCreateNotification.mock.calls.map((call) => call[0].referenceId);
    expect(referenceIds).toEqual(expect.arrayContaining(["fee_1"]));
  });

  it("skips notification when duplicate exists", async () => {
    seedParent();
    seedActor();
    mockState.duplicateNotification = true;

    await createFee("school_1", validPayload, "actor_1");

    expect(mockCreateNotification).not.toHaveBeenCalled();
  });

  it("keeps fee creation non-blocking when service rejects actor role", async () => {
    seedParent();
    seedActor({ role: "Teacher" });
    mockCreateNotification.mockRejectedValueOnce(
      Object.assign(new Error("forbidden"), { code: "ROLE_UNAUTHORIZED" })
    );

    const fee = await createFee("school_1", validPayload, "actor_1");

    expect(fee).toHaveProperty("id");
    expect(mockCreateNotification).toHaveBeenCalledTimes(1);
  });

  it("skips notification when parent is not found", async () => {
    seedActor();

    await createFee("school_1", validPayload, "actor_1");

    expect(mockCreateNotification).not.toHaveBeenCalled();
  });

  it("returns the fee even if notification fails", async () => {
    seedParent();
    seedActor();
    mockCreateNotification.mockRejectedValueOnce(new Error("boom"));

    const fee = await createFee("school_1", validPayload, "actor_1");

    expect(fee).toHaveProperty("id");
  });
});
