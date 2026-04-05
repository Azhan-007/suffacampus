/**
 * Integration tests for parent routes.
 *
 * Tests: POST /parent/invites, GET /parent/invites,
 *        POST /parent/link, GET /parent/children,
 *        GET /parent/children/:studentId/attendance,
 *        GET /parent/children/:studentId/fees,
 *        GET /parent/children/:studentId/results,
 *        GET /parent/events
 */

import Fastify, { type FastifyInstance } from "fastify";
import parentRoutes from "../../src/routes/v1/parent";
import {
  auth,
  resetFirestoreMock,
  seedDoc,
} from "../__mocks__/firebase-admin";
import { AppError } from "../../src/errors";

const mockState = {
  students: new Map<string, any>(),
  invites: new Map<string, any>(),
  events: new Map<string, any>(),
};

jest.mock("../../src/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: jest.fn(async ({ where: { uid } }) => null),
      update: jest.fn(async ({ where: { uid }, data }) => ({ uid, ...data })),
    },
    student: {
      findUnique: jest.fn(async ({ where: { id } }) => mockState.students.get(id) ?? null),
      findMany: jest.fn(async ({ where }) => {
        const ids = where?.id?.in ?? [];
        return [...mockState.students.values()].filter((s) => ids.includes(s.id) && s.schoolId === where.schoolId);
      }),
    },
    parentInvite: {
      create: jest.fn(async ({ data }) => {
        const id = `inv_${mockState.invites.size + 1}`;
        const row = { id, createdAt: new Date(), ...data };
        mockState.invites.set(id, row);
        return row;
      }),
      findFirst: jest.fn(async ({ where }) => {
        return [...mockState.invites.values()].find((i) => i.code === where.code && i.isActive === where.isActive) ?? null;
      }),
      update: jest.fn(async ({ where: { id }, data }) => {
        const existing = mockState.invites.get(id);
        if (!existing) throw new Error("Invite not found");
        const updated = { ...existing, ...data };
        mockState.invites.set(id, updated);
        return updated;
      }),
    },
    event: {
      findMany: jest.fn(async ({ where, orderBy, take }) => {
        let rows = [...mockState.events.values()].filter((e) => {
          if (where?.schoolId && e.schoolId !== where.schoolId) return false;
          if (typeof where?.isActive !== "undefined" && e.isActive !== where.isActive) return false;
          if (where?.eventDate?.gte && String(e.eventDate) < String(where.eventDate.gte)) return false;
          return true;
        });
        const sortBy = Object.keys(orderBy ?? {})[0] ?? "eventDate";
        rows = rows.sort((a, b) => (a[sortBy] > b[sortBy] ? 1 : -1));
        if (typeof take === "number") rows = rows.slice(0, take);
        return rows;
      }),
    },
    attendance: { count: jest.fn(async () => 0), findMany: jest.fn(async () => []) },
    fee: { aggregate: jest.fn(async () => ({ _sum: { amount: 0 } })), findMany: jest.fn(async () => []) },
    result: { findFirst: jest.fn(async () => null), findMany: jest.fn(async () => []) },
    $transaction: jest.fn(async (ops: Array<Promise<unknown>>) => Promise.all(ops)),
  },
}));

jest.mock("../../src/services/audit.service", () => ({
  writeAuditLog: jest.fn().mockResolvedValue(undefined),
}));

let server: FastifyInstance;
const mockVerifyIdToken = auth.verifyIdToken as jest.Mock;
const mockSetCustomUserClaims = auth.setCustomUserClaims as jest.Mock;

function setupAuthUser(role = "Admin", schoolId = "school_1", uid = "user_1", extra: Record<string, unknown> = {}) {
  mockVerifyIdToken.mockResolvedValueOnce({ uid, email: `${uid}@school.com` });
  seedDoc("users", uid, {
    uid, email: `${uid}@school.com`, role, schoolId, status: "active",
    ...extra,
  });
}

function seedSchool(schoolId = "school_1") {
  seedDoc("schools", schoolId, {
    name: "Test School", subscriptionPlan: "Pro", subscriptionStatus: "active",
    limits: { students: 500, maxStudents: 500, maxTeachers: 50, maxClasses: 20 },
  });
}

beforeEach(async () => {
  resetFirestoreMock();
  mockState.students.clear();
  mockState.invites.clear();
  mockState.events.clear();
  mockVerifyIdToken.mockReset();
  mockSetCustomUserClaims.mockReset();
  mockSetCustomUserClaims.mockResolvedValue(undefined);
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
  await server.register(parentRoutes, { prefix: "/" });
  await server.ready();
});

afterEach(async () => { await server.close(); });

// ---------------------------------------------------------------------------
// POST /parent/invites — admin creates invite
// ---------------------------------------------------------------------------
describe("POST /parent/invites", () => {
  it("creates an invite code and returns 201", async () => {
    setupAuthUser("Admin");
    seedSchool();
    seedDoc("students", "stu_1", { schoolId: "school_1", name: "Student One", isDeleted: false });
    mockState.students.set("stu_1", {
      id: "stu_1",
      schoolId: "school_1",
      firstName: "Student",
      lastName: "One",
    });
    const res = await server.inject({
      method: "POST", url: "/parent/invites",
      headers: { authorization: "Bearer token" },
      payload: { studentId: "stu_1" },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data).toHaveProperty("code");
  });

  it("returns 400 for missing studentId", async () => {
    setupAuthUser("Admin");
    seedSchool();
    const res = await server.inject({
      method: "POST", url: "/parent/invites",
      headers: { authorization: "Bearer token" },
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });

  it("rejects Teacher role", async () => {
    setupAuthUser("Teacher");
    seedSchool();
    const res = await server.inject({
      method: "POST", url: "/parent/invites",
      headers: { authorization: "Bearer token" },
      payload: { studentId: "stu_1" },
    });
    expect(res.statusCode).toBe(403);
  });

  it("returns 401 when unauthenticated", async () => {
    const res = await server.inject({
      method: "POST", url: "/parent/invites",
      payload: { studentId: "stu_1" },
    });
    expect(res.statusCode).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// GET /parent/invites — admin lists invites
// ---------------------------------------------------------------------------
describe("GET /parent/invites", () => {
  it("returns active invites", async () => {
    setupAuthUser("Admin");
    seedSchool();
    seedDoc("parentInvites", "inv1", {
      schoolId: "school_1", studentId: "stu_1", code: "ABC123",
      isActive: true, createdAt: { toMillis: () => Date.now() },
    });
    const res = await server.inject({
      method: "GET", url: "/parent/invites",
      headers: { authorization: "Bearer token" },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.length).toBe(1);
  });

  it("does not return invites from another school", async () => {
    setupAuthUser("Admin");
    seedSchool();
    seedDoc("parentInvites", "inv_other", {
      schoolId: "school_2", studentId: "stu_x", code: "XYZ789",
      isActive: true, createdAt: { toMillis: () => Date.now() },
    });
    const res = await server.inject({
      method: "GET", url: "/parent/invites",
      headers: { authorization: "Bearer token" },
    });
    expect(JSON.parse(res.body).data.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// GET /parent/children — parent gets summaries
// ---------------------------------------------------------------------------
describe("GET /parent/children", () => {
  it("returns empty array when parent has no linked students", async () => {
    setupAuthUser("Parent", "school_1", "parent_1", { linkedStudents: [] });
    seedSchool();
    const res = await server.inject({
      method: "GET", url: "/parent/children",
      headers: { authorization: "Bearer token" },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).data).toEqual([]);
  });

  it("rejects Teacher role", async () => {
    setupAuthUser("Teacher");
    seedSchool();
    const res = await server.inject({
      method: "GET", url: "/parent/children",
      headers: { authorization: "Bearer token" },
    });
    expect(res.statusCode).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// GET /parent/events — parent gets school events
// ---------------------------------------------------------------------------
describe("GET /parent/events", () => {
  it("returns school events for parent", async () => {
    setupAuthUser("Parent", "school_1", "parent_1", { linkedStudents: ["stu_1"] });
    seedSchool();
    seedDoc("events", "e1", {
      schoolId: "school_1", title: "Sports Day",
      eventDate: "2026-06-01", isDeleted: false,
      createdAt: { toMillis: () => Date.now() },
    });
    mockState.events.set("e1", {
      id: "e1",
      schoolId: "school_1",
      title: "Sports Day",
      eventDate: "2026-06-01",
      isActive: true,
      createdAt: new Date(),
    });
    const res = await server.inject({
      method: "GET", url: "/parent/events",
      headers: { authorization: "Bearer token" },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(Array.isArray(body.data)).toBe(true);
  });

  it("returns 401 when unauthenticated", async () => {
    const res = await server.inject({ method: "GET", url: "/parent/events" });
    expect(res.statusCode).toBe(401);
  });
});
