/**
 * Integration tests for fee routes.
 *
 * Tests: POST /fees, GET /fees, GET /fees/stats, GET /fees/:id,
 *        PATCH /fees/:id, DELETE /fees/:id
 */

import Fastify, { type FastifyInstance } from "fastify";
import feeRoutes from "../../src/routes/v1/fees";
import {
  auth,
  resetFirestoreMock,
  seedDoc,
} from "../__mocks__/firebase-admin";
import { AppError } from "../../src/errors";
import { createNotification } from "../../src/services/notification.service";

jest.mock("../../src/services/session.service", () => ({
  validateSessionAccessToken: jest.fn().mockResolvedValue(null),
}));

const mockState = {
  fees: new Map<string, any>(),
  feeCounter: 1,
  studentFees: new Map<string, any>(),
  studentFeeCounter: 1,
  feeStructures: new Map<string, any>(),
  students: new Map<string, any>(),
  payments: new Map<string, any>(),
  paymentCounter: 1,
  users: new Map<string, any>(),
  notificationDuplicate: false,
};

jest.mock("../../src/lib/prisma", () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { getDoc } = require("../__mocks__/firebase-admin");

  const paymentCreate = jest.fn(async ({ data }) => {
    const id = `pay_${mockState.paymentCounter++}`;
    const payment = { id, ...data };
    mockState.payments.set(id, payment);
    return payment;
  });

  const paymentFindFirst = jest.fn(async ({ where }) => {
    const payment = where?.id ? mockState.payments.get(where.id) : null;
    if (!payment) return null;
    if (where?.schoolId && payment.schoolId !== where.schoolId) return null;
    return payment;
  });

  const studentFeeUpdate = jest.fn(async ({ where: { id }, data }) => {
    const existing = mockState.studentFees.get(id);
    if (!existing) throw new Error("Student fee not found");
    const updated = { ...existing, ...data, updatedAt: new Date() };
    mockState.studentFees.set(id, updated);
    return updated;
  });

  return {
    prisma: {
      user: {
        findUnique: jest.fn(async ({ where: { uid } }: { where: { uid: string } }) => {
          const doc = getDoc("users", uid) as Record<string, unknown> | undefined;
          if (!doc) return null;

          return {
            uid,
            email: (doc.email as string | undefined) ?? "",
            role: (doc.role as string | undefined) ?? null,
            schoolId: (doc.schoolId as string | undefined) ?? null,
            isActive: (doc.isActive as boolean | undefined) ?? true,
            displayName:
              (doc.displayName as string | undefined) ??
              (doc.name as string | undefined) ??
              null,
            studentId: (doc.studentId as string | undefined) ?? null,
            studentIds: (doc.studentIds as string[] | undefined) ?? null,
            teacherId: (doc.teacherId as string | undefined) ?? null,
          };
        }),
        findMany: jest.fn(async ({ where, select }) => {
          const parents = [...mockState.users.values()].filter((user) => {
            if (where?.role && user.role !== where.role) return false;
            if (where?.schoolId && user.schoolId !== where.schoolId) return false;
            if (where?.isActive === true && user.isActive !== true) return false;
            const studentId = where?.studentIds?.has;
            if (studentId && (!Array.isArray(user.studentIds) || !user.studentIds.includes(studentId))) {
              return false;
            }
            return true;
          });

          return select?.uid ? parents.map((parent) => ({ uid: parent.uid })) : parents;
        }),
        findFirst: jest.fn(async ({ where, select }) => {
          if (where?.uid) {
            const actor = mockState.users.get(where.uid);
            if (!actor) return null;
            if (where.schoolId && actor.schoolId !== where.schoolId) return null;
            return select?.role ? { role: actor.role } : actor;
          }

          return null;
        }),
      },
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
        findMany: jest.fn(async ({ where, orderBy, take }) => {
          let rows = [...mockState.fees.values()].filter((f) => {
            if (where?.schoolId && f.schoolId !== where.schoolId) return false;
            if (where?.studentId && f.studentId !== where.studentId) return false;
            if (where?.classId && f.classId !== where.classId) return false;
            if (where?.status && f.status !== where.status) return false;
            if (where?.feeType && f.feeType !== where.feeType) return false;
            return true;
          });

          const sortBy = Object.keys(orderBy ?? {})[0] ?? "createdAt";
          const sortDir = (orderBy?.[sortBy] ?? "desc") as "asc" | "desc";
          rows = rows.sort((a, b) => {
            const lhs = a[sortBy];
            const rhs = b[sortBy];
            if (lhs === rhs) return 0;
            if (sortDir === "asc") return lhs > rhs ? 1 : -1;
            return lhs < rhs ? 1 : -1;
          });

          return typeof take === "number" ? rows.slice(0, take) : rows;
        }),
        findUnique: jest.fn(async ({ where: { id } }) => mockState.fees.get(id) ?? null),
        update: jest.fn(async ({ where: { id }, data }) => {
          const existing = mockState.fees.get(id);
          if (!existing) throw new Error("Fee not found");
          const updated = { ...existing, ...data, updatedAt: new Date() };
          mockState.fees.set(id, updated);
          return updated;
        }),
        delete: jest.fn(async ({ where: { id } }) => {
          const existing = mockState.fees.get(id);
          mockState.fees.delete(id);
          return existing;
        }),
        aggregate: jest.fn(async ({ where }) => {
          const rows = [...mockState.fees.values()].filter((f) => f.schoolId === where.schoolId);
          return {
            _sum: {
              amount: rows.reduce((sum, r) => sum + Number(r.amount ?? 0), 0),
              amountPaid: rows.reduce((sum, r) => sum + Number(r.amountPaid ?? 0), 0),
            },
            _count: rows.length,
          };
        }),
        groupBy: jest.fn(async ({ where }) => {
          const rows = [...mockState.fees.values()].filter((f) => f.schoolId === where.schoolId);
          const grouped = new Map<string, any>();
          for (const row of rows) {
            const key = String(row.status ?? "Pending");
            const current = grouped.get(key) ?? {
              status: key,
              _count: 0,
              _sum: { amount: 0, amountPaid: 0 },
            };
            current._count += 1;
            current._sum.amount += Number(row.amount ?? 0);
            current._sum.amountPaid += Number(row.amountPaid ?? 0);
            grouped.set(key, current);
          }
          return [...grouped.values()];
        }),
      },
      studentFee: {
        findFirst: jest.fn(async ({ where }) => {
          const row = where?.id ? mockState.studentFees.get(where.id) : null;
          if (!row) return null;
          if (where?.schoolId && row.schoolId !== where.schoolId) return null;
          return row;
        }),
        update: studentFeeUpdate,
      },
      student: {
        findFirst: jest.fn(async ({ where }) => {
          const row = where?.id ? mockState.students.get(where.id) : null;
          if (!row) return null;
          if (where?.schoolId && row.schoolId !== where.schoolId) return null;
          if (where?.isDeleted === false && row.isDeleted) return null;
          return row;
        }),
      },
      feeStructure: {
        findFirst: jest.fn(async ({ where }) => {
          const row = where?.id ? mockState.feeStructures.get(where.id) : null;
          if (!row) return null;
          if (where?.schoolId && row.schoolId !== where.schoolId) return null;
          return row;
        }),
      },
      payment: {
        create: paymentCreate,
        findFirst: paymentFindFirst,
      },
      notification: {
        findFirst: jest.fn(async () => (mockState.notificationDuplicate ? { id: "dup" } : null)),
      },
      $transaction: jest.fn(async (fn) =>
        fn({
          payment: { create: paymentCreate, findFirst: paymentFindFirst },
          studentFee: { update: studentFeeUpdate },
        })
      ),
    },
  };
});

jest.mock("../../src/services/audit.service", () => ({
  writeAuditLog: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("../../src/services/notification.service", () => ({
  createNotification: jest.fn(),
}));

let server: FastifyInstance;
const mockVerifyIdToken = auth.verifyIdToken as jest.Mock;
const mockCreateNotification = createNotification as jest.Mock;

function setupAuthUser(role = "Admin", schoolId = "school_1") {
  mockVerifyIdToken.mockResolvedValueOnce({ uid: "user_1", email: "admin@school.com" });
  seedDoc("users", "user_1", { uid: "user_1", email: "admin@school.com", role, schoolId, status: "active" });
}

function seedSchool(schoolId = "school_1") {
  seedDoc("schools", schoolId, {
    name: "Test School",
    subscriptionPlan: "Pro",
    subscriptionStatus: "active",
    limits: { students: 500, maxStudents: 500, maxTeachers: 50, maxClasses: 20 },
  });
}

function validFeePayload(overrides: Record<string, unknown> = {}) {
  return {
    studentId: "stu_1",
    studentName: "John Doe",
    classId: "10",
    sectionId: "A",
    amount: 5000,
    dueDate: "2025-04-30",
    feeType: "Tuition",
    ...overrides,
  };
}

function seedFee(id: string, schoolId = "school_1", overrides: Record<string, unknown> = {}) {
  mockState.fees.set(id, {
    id,
    schoolId,
    studentId: "stu_1",
    studentName: "John Doe",
    classId: "10",
    sectionId: "A",
    amount: 5000,
    dueDate: "2025-04-30",
    feeType: "Tuition",
    status: "Pending",
    amountPaid: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });
}

function seedStudentFee(id: string, schoolId = "school_1", overrides: Record<string, unknown> = {}) {
  mockState.studentFees.set(id, {
    id,
    schoolId,
    studentId: "stu_1",
    feeStructureId: "fs_1",
    totalAmount: 5000,
    paidAmount: 0,
    status: "PENDING",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });
}

function seedStudent(id: string, schoolId = "school_1", overrides: Record<string, unknown> = {}) {
  mockState.students.set(id, {
    id,
    schoolId,
    firstName: "John",
    lastName: "Doe",
    isDeleted: false,
    ...overrides,
  });
}

function seedFeeStructure(id: string, schoolId = "school_1", overrides: Record<string, unknown> = {}) {
  mockState.feeStructures.set(id, {
    id,
    schoolId,
    amount: 5000,
    ...overrides,
  });
}

function seedParentUser(uid: string, schoolId = "school_1", overrides: Record<string, unknown> = {}) {
  mockState.users.set(uid, {
    uid,
    role: "Parent",
    schoolId,
    isActive: true,
    studentIds: ["stu_1"],
    ...overrides,
  });
}

beforeEach(async () => {
  resetFirestoreMock();
  mockState.fees.clear();
  mockState.feeCounter = 1;
  mockState.studentFees.clear();
  mockState.studentFeeCounter = 1;
  mockState.feeStructures.clear();
  mockState.students.clear();
  mockState.payments.clear();
  mockState.paymentCounter = 1;
  mockState.users.clear();
  mockState.notificationDuplicate = false;
  mockVerifyIdToken.mockReset();
  mockCreateNotification.mockReset();
  mockCreateNotification.mockResolvedValue({ id: "notif_1" });

  server = Fastify({ logger: false });
  server.setErrorHandler((error, _request, reply) => {
    if (error instanceof AppError) return reply.status(error.statusCode).send({ success: false, error: error.toJSON() });
    return reply.status(500).send({ success: false, message: error instanceof Error ? error.message : "Unknown error" });
  });
  server.decorateRequest("requestId", "test-request-id");
  server.decorate("cache", {
    get: () => undefined, set: () => true, setWithTTL: () => true,
    del: () => 0, flushNamespace: () => {}, flushAll: () => {},
    stats: () => ({ hits: 0, misses: 0, keys: 0, ksize: 0, vsize: 0 }),
  });
  await server.register(feeRoutes, { prefix: "/" });
  await server.ready();
});

// ---------------------------------------------------------------------------
// POST /fees/pay
// ---------------------------------------------------------------------------
describe("POST /fees/pay", () => {
  it("creates a payment and notifies the parent", async () => {
    setupAuthUser("Admin");
    seedSchool();
    seedStudentFee("sf_1");
    seedStudent("stu_1");
    seedFeeStructure("fs_1");
    seedParentUser("parent_1");

    const res = await server.inject({
      method: "POST",
      url: "/fees/pay",
      headers: { authorization: "Bearer token" },
      payload: { studentFeeId: "sf_1", amount: 500 },
    });

    expect(res.statusCode).toBe(201);
    expect(mockCreateNotification).toHaveBeenCalledTimes(1);
    const [payload, context] = mockCreateNotification.mock.calls[0];
    expect(payload).toMatchObject({
      title: "Payment Received",
      type: "INFO",
      targetType: "USER",
      targetId: "parent_1",
      referenceType: "PAYMENT",
      referenceId: "pay_1",
    });
    expect(payload.message).toEqual(expect.stringContaining("500"));
    expect(payload.message).toEqual(expect.stringContaining("John Doe"));
    expect(payload.message).not.toEqual(expect.stringContaining("[payment:"));
    expect(context).toMatchObject({
      userId: "user_1",
      schoolId: "school_1",
      role: "Admin",
    });
  });

  it("notifies all linked parents", async () => {
    setupAuthUser("Admin");
    seedSchool();
    seedStudentFee("sf_1");
    seedStudent("stu_1");
    seedFeeStructure("fs_1");
    seedParentUser("parent_1");
    seedParentUser("parent_2");

    const res = await server.inject({
      method: "POST",
      url: "/fees/pay",
      headers: { authorization: "Bearer token" },
      payload: { studentFeeId: "sf_1", amount: 500 },
    });

    expect(res.statusCode).toBe(201);
    expect(mockCreateNotification).toHaveBeenCalledTimes(2);
    const parentTargets = mockCreateNotification.mock.calls.map((call) => call[0].targetId);
    expect(parentTargets).toEqual(expect.arrayContaining(["parent_1", "parent_2"]));
  });

  it("skips notification when a duplicate is detected", async () => {
    setupAuthUser("Admin");
    seedSchool();
    seedStudentFee("sf_1");
    seedStudent("stu_1");
    seedFeeStructure("fs_1");
    seedParentUser("parent_1");
    mockState.notificationDuplicate = true;

    const res = await server.inject({
      method: "POST",
      url: "/fees/pay",
      headers: { authorization: "Bearer token" },
      payload: { studentFeeId: "sf_1", amount: 500 },
    });

    expect(res.statusCode).toBe(201);
    expect(mockCreateNotification).not.toHaveBeenCalled();
  });
});

afterEach(async () => { await server.close(); });

// ---------------------------------------------------------------------------
// POST /fees
// ---------------------------------------------------------------------------
describe("POST /fees", () => {
  it("creates a fee record and returns 201", async () => {
    setupAuthUser();
    seedSchool();

    const res = await server.inject({
      method: "POST", url: "/fees",
      headers: { authorization: "Bearer token" },
      payload: validFeePayload(),
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data).toHaveProperty("id");
    expect(Number(body.data.amount)).toBe(5000);
    expect(body.data.feeType).toBe("Tuition");
    expect(body.data.status).toBe("Pending");
  });

  it("returns 400 for missing required fields", async () => {
    setupAuthUser();
    seedSchool();

    const res = await server.inject({
      method: "POST", url: "/fees",
      headers: { authorization: "Bearer token" },
      payload: { studentId: "stu_1" }, // missing many required fields
    });

    expect(res.statusCode).toBe(400);
  });

  it("returns 400 for negative amount", async () => {
    setupAuthUser();
    seedSchool();

    const res = await server.inject({
      method: "POST", url: "/fees",
      headers: { authorization: "Bearer token" },
      payload: validFeePayload({ amount: -100 }),
    });

    expect(res.statusCode).toBe(400);
  });

  it("returns 401 when unauthenticated", async () => {
    const res = await server.inject({ method: "POST", url: "/fees", payload: validFeePayload() });
    expect(res.statusCode).toBe(401);
  });

  it("rejects Teacher role", async () => {
    setupAuthUser("Teacher");
    seedSchool();

    const res = await server.inject({
      method: "POST", url: "/fees",
      headers: { authorization: "Bearer token" },
      payload: validFeePayload(),
    });

    expect(res.statusCode).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// GET /fees
// ---------------------------------------------------------------------------
describe("GET /fees", () => {
  it("returns a paginated list of fees", async () => {
    setupAuthUser();
    seedSchool();
    seedFee("fee_1");
    seedFee("fee_2", "school_1", { studentId: "stu_2", studentName: "Jane Doe" });

    const res = await server.inject({
      method: "GET", url: "/fees",
      headers: { authorization: "Bearer token" },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBe(2);
  });

  it("does not return fees from another school", async () => {
    setupAuthUser();
    seedSchool();
    seedFee("fee_other", "school_2");

    const res = await server.inject({
      method: "GET", url: "/fees",
      headers: { authorization: "Bearer token" },
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).data.length).toBe(0);
  });

  it("filters by studentId", async () => {
    setupAuthUser();
    seedSchool();
    seedFee("fee_1", "school_1", { studentId: "stu_1" });
    seedFee("fee_2", "school_1", { studentId: "stu_2" });

    const res = await server.inject({
      method: "GET", url: "/fees?studentId=stu_1",
      headers: { authorization: "Bearer token" },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.length).toBe(1);
    expect(body.data[0].studentId).toBe("stu_1");
  });

  it("filters by status", async () => {
    setupAuthUser();
    seedSchool();
    seedFee("fee_pending", "school_1", { status: "Pending" });
    seedFee("fee_paid", "school_1", { status: "Paid" });

    const res = await server.inject({
      method: "GET", url: "/fees?status=Paid",
      headers: { authorization: "Bearer token" },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.length).toBe(1);
    expect(body.data[0].status).toBe("Paid");
  });
});

// ---------------------------------------------------------------------------
// GET /fees/stats
// ---------------------------------------------------------------------------
describe("GET /fees/stats", () => {
  it("returns fee statistics", async () => {
    setupAuthUser();
    seedSchool();
    seedFee("fee_1", "school_1", { amount: 5000, status: "Paid" });
    seedFee("fee_2", "school_1", { amount: 3000, status: "Pending" });

    const res = await server.inject({
      method: "GET", url: "/fees/stats",
      headers: { authorization: "Bearer token" },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data).toHaveProperty("totalFees");
    expect(body.data).toHaveProperty("collectedAmount");
    expect(body.data).toHaveProperty("pendingAmount");
  });

  it("returns zero stats when no fees", async () => {
    setupAuthUser();
    seedSchool();

    const res = await server.inject({
      method: "GET", url: "/fees/stats",
      headers: { authorization: "Bearer token" },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.totalFees).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// GET /fees/:id
// ---------------------------------------------------------------------------
describe("GET /fees/:id", () => {
  it("returns a single fee", async () => {
    setupAuthUser();
    seedSchool();
    seedFee("fee_1");

    const res = await server.inject({
      method: "GET", url: "/fees/fee_1",
      headers: { authorization: "Bearer token" },
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).data.id).toBe("fee_1");
  });

  it("returns 404 for non-existent fee", async () => {
    setupAuthUser();
    seedSchool();

    const res = await server.inject({
      method: "GET", url: "/fees/nonexistent",
      headers: { authorization: "Bearer token" },
    });

    expect(res.statusCode).toBe(404);
  });

  it("returns 404 for fee in different school", async () => {
    setupAuthUser();
    seedSchool();
    seedFee("fee_other", "school_2");

    const res = await server.inject({
      method: "GET", url: "/fees/fee_other",
      headers: { authorization: "Bearer token" },
    });

    expect(res.statusCode).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// PATCH /fees/:id
// ---------------------------------------------------------------------------
describe("PATCH /fees/:id", () => {
  it("updates fee fields", async () => {
    setupAuthUser();
    seedSchool();
    seedFee("fee_1");

    const res = await server.inject({
      method: "PATCH", url: "/fees/fee_1",
      headers: { authorization: "Bearer token" },
      payload: { status: "Paid", paidDate: "2025-03-15" },
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).data.status).toBe("Paid");
  });

  it("applies status default when body is empty (schema has default)", async () => {
    setupAuthUser();
    seedSchool();
    seedFee("fee_1");

    const res = await server.inject({
      method: "PATCH", url: "/fees/fee_1",
      headers: { authorization: "Bearer token" },
      payload: {},
    });

    // {} parses to { status: "Pending" } due to schema default
    expect(res.statusCode).toBe(200);
  });

  it("rejects Teacher role", async () => {
    setupAuthUser("Teacher");
    seedSchool();
    seedFee("fee_1");

    const res = await server.inject({
      method: "PATCH", url: "/fees/fee_1",
      headers: { authorization: "Bearer token" },
      payload: { status: "Paid" },
    });

    expect(res.statusCode).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// DELETE /fees/:id
// ---------------------------------------------------------------------------
describe("DELETE /fees/:id", () => {
  it("soft-deletes a fee", async () => {
    setupAuthUser();
    seedSchool();
    seedFee("fee_1");

    const res = await server.inject({
      method: "DELETE", url: "/fees/fee_1",
      headers: { authorization: "Bearer token" },
    });

    expect(res.statusCode).toBe(200);
    expect(mockState.fees.has("fee_1")).toBe(false);
  });

  it("returns 404 for non-existent fee", async () => {
    setupAuthUser();
    seedSchool();

    const res = await server.inject({
      method: "DELETE", url: "/fees/nonexistent",
      headers: { authorization: "Bearer token" },
    });

    expect(res.statusCode).toBe(404);
  });

  it("rejects Teacher role", async () => {
    setupAuthUser("Teacher");
    seedSchool();
    seedFee("fee_1");

    const res = await server.inject({
      method: "DELETE", url: "/fees/fee_1",
      headers: { authorization: "Bearer token" },
    });

    expect(res.statusCode).toBe(403);
  });
});
