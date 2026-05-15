import { bulkImport } from "../../src/services/bulk-import.service";
import { Errors } from "../../src/errors";
import {
  reserveCapacity,
  consumeReservedCapacity,
  releaseReservedCapacity,
} from "../../src/services/quota.service";

const mockState = {
  students: new Map<string, any>(),
  teachers: new Map<string, any>(),
};

jest.mock("../../src/lib/prisma", () => ({
  prisma: {
    student: {
      create: jest.fn(async ({ data }) => {
        const id = `stu_${mockState.students.size + 1}`;
        const row = { id, ...data };
        mockState.students.set(id, row);
        return row;
      }),
    },
    teacher: {
      create: jest.fn(async ({ data }) => {
        const id = `teach_${mockState.teachers.size + 1}`;
        const row = { id, ...data };
        mockState.teachers.set(id, row);
        return row;
      }),
    },
    fee: {
      create: jest.fn(async ({ data }) => ({ id: `fee_${Date.now()}`, ...data })),
    },
    attendance: {
      create: jest.fn(async ({ data }) => ({ id: `att_${Date.now()}`, ...data })),
    },
  },
}));

jest.mock("../../src/services/quota.service", () => ({
  reserveCapacity: jest.fn(),
  consumeReservedCapacity: jest.fn().mockResolvedValue(undefined),
  releaseReservedCapacity: jest.fn().mockResolvedValue(undefined),
  reconcileUsageCounters: jest.fn().mockResolvedValue({ checked: 1, discrepancies: 0 }),
}));

jest.mock("../../src/services/audit.service", () => ({
  writeAuditLog: jest.fn().mockResolvedValue(undefined),
}));

beforeEach(() => {
  mockState.students.clear();
  mockState.teachers.clear();
  (reserveCapacity as jest.Mock).mockReset();
  (consumeReservedCapacity as jest.Mock).mockClear();
  (releaseReservedCapacity as jest.Mock).mockClear();
});

describe("bulkImport", () => {
  it("blocks over-allocation when reservation fails", async () => {
    (reserveCapacity as jest.Mock).mockRejectedValueOnce(
      Errors.subscriptionLimitReached("students", 1)
    );

    await expect(
      bulkImport({
        entityType: "students",
        schoolId: "school_1",
        userId: "user_1",
        rows: [
          { firstName: "A", lastName: "B", dateOfBirth: "2010-01-01", gender: "male", guardianName: "P", guardianPhone: "9999999999" },
          { firstName: "C", lastName: "D", dateOfBirth: "2010-01-01", gender: "male", guardianName: "P", guardianPhone: "9999999999" },
        ],
      })
    ).rejects.toHaveProperty("code", "SUBSCRIPTION_LIMIT_REACHED");

    expect(mockState.students.size).toBe(0);
  });

  it("releases unused reservations on partial failure", async () => {
    (reserveCapacity as jest.Mock).mockResolvedValueOnce({
      mode: "counter",
      schoolId: "school_1",
      resourceType: "students",
      amount: 2,
      limit: 10,
      used: 0,
      reserved: 0,
    });

    const prismaModule = await import("../../src/lib/prisma.js");
    const createMock = prismaModule.prisma.student.create as jest.Mock;
    createMock.mockImplementationOnce(async ({ data }) => ({ id: "stu_1", ...data }));
    createMock.mockImplementationOnce(async () => {
      throw new Error("Insert failed");
    });

    const result = await bulkImport({
      entityType: "students",
      schoolId: "school_1",
      userId: "user_1",
      rows: [
        { firstName: "A", lastName: "B", dateOfBirth: "2010-01-01", gender: "male", guardianName: "P", guardianPhone: "9999999999" },
        { firstName: "C", lastName: "D", dateOfBirth: "2010-01-01", gender: "male", guardianName: "P", guardianPhone: "9999999999" },
      ],
    });

    expect(result.imported).toBe(1);
    expect(result.errors.length).toBe(1);
    expect(consumeReservedCapacity).toHaveBeenCalledWith(
      expect.objectContaining({ schoolId: "school_1", resourceType: "students", amount: 1 })
    );
    expect(releaseReservedCapacity).toHaveBeenCalledWith(
      expect.objectContaining({ schoolId: "school_1", resourceType: "students", amount: 1 })
    );
  });
});
