/**
 * Integration tests for audit routes.
 *
 * Tests: GET /audit-logs
 */

import Fastify, { type FastifyInstance } from "fastify";
import auditRoutes from "../../src/routes/v1/audit";
import {
  auth,
  resetFirestoreMock,
  seedDoc,
} from "../__mocks__/firebase-admin";
import { AppError } from "../../src/errors";

const mockState = {
  auditLogs: new Map<string, any>(),
};

jest.mock("../../src/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: jest.fn(async () => null),
    },
    auditLog: {
      findMany: jest.fn(async ({ where, orderBy, take }) => {
        let rows = [...mockState.auditLogs.values()].filter((row) => {
          if (where?.schoolId && row.schoolId !== where.schoolId) return false;
          if (where?.action && row.action !== where.action) return false;
          if (where?.userId && row.userId !== where.userId) return false;
          if (where?.resource && row.resource !== where.resource) return false;
          return true;
        });

        const sortBy = Object.keys(orderBy ?? {})[0] ?? "createdAt";
        const sortOrder = (orderBy?.[sortBy] ?? "desc") as "asc" | "desc";
        rows = rows.sort((a, b) => {
          const lhs = a[sortBy];
          const rhs = b[sortBy];
          if (lhs === rhs) return 0;
          if (sortOrder === "asc") return lhs > rhs ? 1 : -1;
          return lhs < rhs ? 1 : -1;
        });

        if (typeof take === "number") rows = rows.slice(0, take);
        return rows;
      }),
      create: jest.fn(async ({ data }) => {
        const id = `a_${mockState.auditLogs.size + 1}`;
        const row = { id, createdAt: new Date(), ...data };
        mockState.auditLogs.set(id, row);
        return row;
      }),
    },
  },
}));

let server: FastifyInstance;
const mockVerifyIdToken = auth.verifyIdToken as jest.Mock;

function setupAuthUser(role = "Admin", schoolId = "school_1") {
  mockVerifyIdToken.mockResolvedValueOnce({ uid: "user_1", email: "admin@school.com" });
  seedDoc("users", "user_1", { uid: "user_1", email: "admin@school.com", role, schoolId, status: "active" });
}

function seedSchool(schoolId = "school_1") {
  seedDoc("schools", schoolId, {
    name: "Test School", subscriptionPlan: "Pro", subscriptionStatus: "active",
    limits: { students: 500, maxStudents: 500, maxTeachers: 50, maxClasses: 20 },
  });
}

function seedAuditLog(id: string, schoolId = "school_1", overrides: Record<string, unknown> = {}) {
  mockState.auditLogs.set(id, {
    id, schoolId,
    action: "CREATE_STUDENT",
    userId: "user_1",
    metadata: { studentId: "s1" },
    createdAt: new Date(),
    ...overrides,
  });
}

beforeEach(async () => {
  resetFirestoreMock();
  mockState.auditLogs.clear();
  mockVerifyIdToken.mockReset();
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
  await server.register(auditRoutes, { prefix: "/" });
  await server.ready();
});

afterEach(async () => { await server.close(); });

// ---------------------------------------------------------------------------
// GET /audit-logs
// ---------------------------------------------------------------------------
describe("GET /audit-logs", () => {
  it("returns audit logs for the school", async () => {
    setupAuthUser();
    seedSchool();
    seedAuditLog("a1");
    seedAuditLog("a2", "school_1", { action: "UPDATE_SETTINGS" });
    const res = await server.inject({
      method: "GET", url: "/audit-logs",
      headers: { authorization: "Bearer token" },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBe(2);
  });

  it("does not return logs from another school", async () => {
    setupAuthUser();
    seedSchool();
    seedAuditLog("a_other", "school_2");
    const res = await server.inject({
      method: "GET", url: "/audit-logs",
      headers: { authorization: "Bearer token" },
    });
    expect(JSON.parse(res.body).data.length).toBe(0);
  });

  it("respects limit query param", async () => {
    setupAuthUser();
    seedSchool();
    seedAuditLog("a1");
    seedAuditLog("a2");
    seedAuditLog("a3");
    const res = await server.inject({
      method: "GET", url: "/audit-logs?limit=2",
      headers: { authorization: "Bearer token" },
    });
    expect(JSON.parse(res.body).data.length).toBe(2);
  });

  it("returns 401 when unauthenticated", async () => {
    const res = await server.inject({ method: "GET", url: "/audit-logs" });
    expect(res.statusCode).toBe(401);
  });

  it("rejects Teacher role", async () => {
    setupAuthUser("Teacher");
    seedSchool();
    const res = await server.inject({
      method: "GET", url: "/audit-logs",
      headers: { authorization: "Bearer token" },
    });
    expect(res.statusCode).toBe(403);
  });

  it("allows Principal role", async () => {
    setupAuthUser("Principal");
    seedSchool();
    seedAuditLog("a1");
    const res = await server.inject({
      method: "GET", url: "/audit-logs",
      headers: { authorization: "Bearer token" },
    });
    expect(res.statusCode).toBe(200);
  });
});
