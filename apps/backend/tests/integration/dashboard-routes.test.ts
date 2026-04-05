/**
 * Integration tests for dashboard routes.
 *
 * Tests: GET /dashboard/stats, GET /dashboard/activity, GET /dashboard/upcoming-events
 */

import Fastify, { type FastifyInstance } from "fastify";
import dashboardRoutes from "../../src/routes/v1/dashboard";
import {
  auth,
  resetFirestoreMock,
  seedDoc,
} from "../__mocks__/firebase-admin";
import { AppError } from "../../src/errors";

const mockState = {
  students: new Map<string, any>(),
  teachers: new Map<string, any>(),
  classes: new Map<string, any>(),
  events: new Map<string, any>(),
  books: new Map<string, any>(),
  fees: new Map<string, any>(),
  auditLogs: new Map<string, any>(),
};

jest.mock("../../src/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: jest.fn(async () => null),
    },
    student: {
      count: jest.fn(async ({ where }) =>
        [...mockState.students.values()].filter((row) => {
          if (where?.schoolId && row.schoolId !== where.schoolId) return false;
          if (typeof where?.isDeleted !== "undefined" && row.isDeleted !== where.isDeleted) return false;
          return true;
        }).length
      ),
    },
    teacher: {
      count: jest.fn(async ({ where }) =>
        [...mockState.teachers.values()].filter((row) => {
          if (where?.schoolId && row.schoolId !== where.schoolId) return false;
          if (typeof where?.isDeleted !== "undefined" && row.isDeleted !== where.isDeleted) return false;
          return true;
        }).length
      ),
    },
    class: {
      count: jest.fn(async ({ where }) =>
        [...mockState.classes.values()].filter((row) => {
          if (where?.schoolId && row.schoolId !== where.schoolId) return false;
          if (typeof where?.isActive !== "undefined" && row.isActive !== where.isActive) return false;
          return true;
        }).length
      ),
    },
    event: {
      count: jest.fn(async ({ where }) =>
        [...mockState.events.values()].filter((row) => {
          if (where?.schoolId && row.schoolId !== where.schoolId) return false;
          if (typeof where?.isActive !== "undefined" && row.isActive !== where.isActive) return false;
          return true;
        }).length
      ),
      findMany: jest.fn(async ({ where, orderBy, take }) => {
        let rows = [...mockState.events.values()].filter((row) => {
          if (where?.schoolId && row.schoolId !== where.schoolId) return false;
          if (typeof where?.isActive !== "undefined" && row.isActive !== where.isActive) return false;
          if (where?.eventDate?.gte && String(row.eventDate) < String(where.eventDate.gte)) return false;
          return true;
        });

        const sortBy = Object.keys(orderBy ?? {})[0] ?? "eventDate";
        const sortOrder = (orderBy?.[sortBy] ?? "asc") as "asc" | "desc";
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
    },
    book: {
      count: jest.fn(async ({ where }) =>
        [...mockState.books.values()].filter((row) => {
          if (where?.schoolId && row.schoolId !== where.schoolId) return false;
          if (typeof where?.isActive !== "undefined" && row.isActive !== where.isActive) return false;
          return true;
        }).length
      ),
    },
    fee: {
      aggregate: jest.fn(async ({ where, _sum }) => {
        void _sum;
        const rows = [...mockState.fees.values()].filter((row) => {
          if (where?.schoolId && row.schoolId !== where.schoolId) return false;
          return true;
        });

        return {
          _sum: {
            amount: rows.reduce((acc, row) => acc + Number(row.amount ?? 0), 0),
            amountPaid: rows.reduce((acc, row) => acc + Number(row.amountPaid ?? 0), 0),
          },
        };
      }),
    },
    auditLog: {
      findMany: jest.fn(async ({ where, orderBy, take }) => {
        let rows = [...mockState.auditLogs.values()].filter((row) => {
          if (where?.schoolId && row.schoolId !== where.schoolId) return false;
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

beforeEach(async () => {
  resetFirestoreMock();
  mockState.students.clear();
  mockState.teachers.clear();
  mockState.classes.clear();
  mockState.events.clear();
  mockState.books.clear();
  mockState.fees.clear();
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
  await server.register(dashboardRoutes, { prefix: "/" });
  await server.ready();
});

afterEach(async () => { await server.close(); });

// ---------------------------------------------------------------------------
// GET /dashboard/stats
// ---------------------------------------------------------------------------
describe("GET /dashboard/stats", () => {
  it("returns dashboard stats with all counts", async () => {
    setupAuthUser();
    seedSchool();
    mockState.students.set("s1", { schoolId: "school_1", isDeleted: false });
    mockState.students.set("s2", { schoolId: "school_1", isDeleted: false });
    mockState.teachers.set("t1", { schoolId: "school_1", isDeleted: false });
    mockState.classes.set("c1", { schoolId: "school_1", isActive: true });
    mockState.events.set("e1", { schoolId: "school_1", isActive: true, eventDate: "2099-01-01" });
    mockState.books.set("b1", { schoolId: "school_1", isActive: true });

    const res = await server.inject({
      method: "GET", url: "/dashboard/stats",
      headers: { authorization: "Bearer token" },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data).toHaveProperty("totalStudents");
    expect(body.data).toHaveProperty("totalTeachers");
    expect(body.data).toHaveProperty("totalClasses");
    expect(body.data).toHaveProperty("totalEvents");
    expect(body.data).toHaveProperty("totalBooks");
    expect(body.data).toHaveProperty("totalFees");
  });

  it("returns zeros when no data", async () => {
    setupAuthUser();
    seedSchool();
    const res = await server.inject({
      method: "GET", url: "/dashboard/stats",
      headers: { authorization: "Bearer token" },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.totalStudents).toBe(0);
    expect(body.data.totalTeachers).toBe(0);
  });

  it("does not count data from another school", async () => {
    setupAuthUser();
    seedSchool();
    mockState.students.set("s_other", { schoolId: "school_2", isDeleted: false });
    const res = await server.inject({
      method: "GET", url: "/dashboard/stats",
      headers: { authorization: "Bearer token" },
    });
    expect(JSON.parse(res.body).data.totalStudents).toBe(0);
  });

  it("returns 401 when unauthenticated", async () => {
    const res = await server.inject({ method: "GET", url: "/dashboard/stats" });
    expect(res.statusCode).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// GET /dashboard/activity
// ---------------------------------------------------------------------------
describe("GET /dashboard/activity", () => {
  it("returns recent audit log entries", async () => {
    setupAuthUser();
    seedSchool();
    mockState.auditLogs.set("a1", {
      schoolId: "school_1", action: "CREATE_STUDENT",
      performedBy: "user_1", createdAt: new Date(),
      metadata: {},
    });
    mockState.auditLogs.set("a2", {
      schoolId: "school_1", action: "UPDATE_SETTINGS",
      performedBy: "user_1", createdAt: new Date(Date.now() - 60000),
      metadata: {},
    });
    const res = await server.inject({
      method: "GET", url: "/dashboard/activity",
      headers: { authorization: "Bearer token" },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBe(2);
  });

  it("respects limit query param", async () => {
    setupAuthUser();
    seedSchool();
    mockState.auditLogs.set("a1", { schoolId: "school_1", action: "A", performedBy: "u", createdAt: new Date(3000), metadata: {} });
    mockState.auditLogs.set("a2", { schoolId: "school_1", action: "B", performedBy: "u", createdAt: new Date(2000), metadata: {} });
    mockState.auditLogs.set("a3", { schoolId: "school_1", action: "C", performedBy: "u", createdAt: new Date(1000), metadata: {} });
    const res = await server.inject({
      method: "GET", url: "/dashboard/activity?limit=2",
      headers: { authorization: "Bearer token" },
    });
    expect(JSON.parse(res.body).data.length).toBe(2);
  });

  it("does not return logs from another school", async () => {
    setupAuthUser();
    seedSchool();
    mockState.auditLogs.set("a_other", {
      schoolId: "school_2", action: "X", performedBy: "u",
      createdAt: new Date(), metadata: {},
    });
    const res = await server.inject({
      method: "GET", url: "/dashboard/activity",
      headers: { authorization: "Bearer token" },
    });
    expect(JSON.parse(res.body).data.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// GET /dashboard/upcoming-events
// ---------------------------------------------------------------------------
describe("GET /dashboard/upcoming-events", () => {
  it("returns upcoming events", async () => {
    setupAuthUser();
    seedSchool();
    const futureDate = new Date(Date.now() + 86400000 * 5).toISOString().split("T")[0];
    mockState.events.set("e1", {
      schoolId: "school_1", title: "Sports Day", eventDate: futureDate,
      isActive: true,
    });
    const res = await server.inject({
      method: "GET", url: "/dashboard/upcoming-events",
      headers: { authorization: "Bearer token" },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(Array.isArray(body.data)).toBe(true);
  });

  it("does not return past events", async () => {
    setupAuthUser();
    seedSchool();
    mockState.events.set("e_past", {
      schoolId: "school_1", title: "Past Event", eventDate: "2020-01-01",
      isActive: true,
    });
    const res = await server.inject({
      method: "GET", url: "/dashboard/upcoming-events",
      headers: { authorization: "Bearer token" },
    });
    expect(JSON.parse(res.body).data.length).toBe(0);
  });

  it("does not return deleted events", async () => {
    setupAuthUser();
    seedSchool();
    const futureDate = new Date(Date.now() + 86400000 * 5).toISOString().split("T")[0];
    mockState.events.set("e_del", {
      schoolId: "school_1", title: "Deleted", eventDate: futureDate,
      isActive: false,
    });
    const res = await server.inject({
      method: "GET", url: "/dashboard/upcoming-events",
      headers: { authorization: "Bearer token" },
    });
    expect(JSON.parse(res.body).data.length).toBe(0);
  });

  it("returns 401 when unauthenticated", async () => {
    const res = await server.inject({ method: "GET", url: "/dashboard/upcoming-events" });
    expect(res.statusCode).toBe(401);
  });
});
