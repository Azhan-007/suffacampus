/**
 * Integration tests for timetable routes.
 *
 * Tests: POST /timetable, GET /timetable, GET /timetable/lookup,
 *        GET /timetable/:id, PATCH /timetable/:id, DELETE /timetable/:id
 */

import Fastify, { type FastifyInstance } from "fastify";
import timetableRoutes from "../../src/routes/v1/timetable";
import {
  auth,
  resetFirestoreMock,
  seedDoc,
} from "../__mocks__/firebase-admin";
import { AppError } from "../../src/errors";

const mockState = {
  timetables: new Map<string, any>(),
  periods: new Map<string, any>(),
  users: new Map<string, any>(),
  timetableCounter: 1,
};

jest.mock("../../src/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: jest.fn(async () => null),
    },
    timetable: {
      create: jest.fn(async ({ data, include }) => {
        const id = `tt_${mockState.timetableCounter++}`;
        const row = {
          id,
          createdAt: new Date(),
          updatedAt: new Date(),
          ...data,
        };
        delete row.periods;
        mockState.timetables.set(id, row);

        const createdPeriods = (data.periods?.create ?? []).map((p: any, idx: number) => {
          const pid = `${id}_p_${idx + 1}`;
          const pr = { id: pid, timetableId: id, ...p };
          mockState.periods.set(pid, pr);
          return pr;
        });

        if (include?.periods) return { ...row, periods: createdPeriods };
        return row;
      }),
      findMany: jest.fn(async ({ where, include, orderBy, take }) => {
        let rows = [...mockState.timetables.values()].filter((t) => {
          if (where?.schoolId && t.schoolId !== where.schoolId) return false;
          if (typeof where?.isActive !== "undefined" && t.isActive !== where.isActive) return false;
          if (where?.classId && t.classId !== where.classId) return false;
          if (where?.sectionId && t.sectionId !== where.sectionId) return false;
          if (where?.day && t.day !== where.day) return false;
          return true;
        });

        const sortBy = Object.keys(orderBy ?? {})[0] ?? "day";
        const sortOrder = (orderBy?.[sortBy] ?? "asc") as "asc" | "desc";
        rows = rows.sort((a, b) => {
          const lhs = a[sortBy];
          const rhs = b[sortBy];
          if (lhs === rhs) return 0;
          if (sortOrder === "asc") return lhs > rhs ? 1 : -1;
          return lhs < rhs ? 1 : -1;
        });

        if (typeof take === "number") rows = rows.slice(0, take);

        if (!include?.periods) return rows;
        return rows.map((t) => ({
          ...t,
          periods: [...mockState.periods.values()]
            .filter((p) => p.timetableId === t.id)
            .sort((a, b) => a.periodNumber - b.periodNumber),
        }));
      }),
      findUnique: jest.fn(async ({ where, include }) => {
        let row: any = null;
        if (where?.id) {
          row = mockState.timetables.get(where.id) ?? null;
        } else if (where?.schoolId_classId_sectionId_day) {
          const key = where.schoolId_classId_sectionId_day;
          row = [...mockState.timetables.values()].find(
            (t) =>
              t.schoolId === key.schoolId &&
              t.classId === key.classId &&
              t.sectionId === key.sectionId &&
              t.day === key.day
          ) ?? null;
        }

        if (!row) return null;
        if (!include?.periods) return row;
        return {
          ...row,
          periods: [...mockState.periods.values()]
            .filter((p) => p.timetableId === row.id)
            .sort((a, b) => a.periodNumber - b.periodNumber),
        };
      }),
      update: jest.fn(async ({ where: { id }, data, include }) => {
        const existing = mockState.timetables.get(id);
        if (!existing) throw new Error("Timetable not found");
        const updated = { ...existing, ...data, updatedAt: new Date() };
        mockState.timetables.set(id, updated);
        if (!include?.periods) return updated;
        return {
          ...updated,
          periods: [...mockState.periods.values()]
            .filter((p) => p.timetableId === id)
            .sort((a, b) => a.periodNumber - b.periodNumber),
        };
      }),
    },
    period: {
      deleteMany: jest.fn(async ({ where: { timetableId } }) => {
        for (const [id, row] of mockState.periods.entries()) {
          if (row.timetableId === timetableId) mockState.periods.delete(id);
        }
        return { count: 0 };
      }),
      createMany: jest.fn(async ({ data }) => {
        data.forEach((row: any, idx: number) => {
          const id = `${row.timetableId}_p_new_${idx + 1}`;
          mockState.periods.set(id, { id, ...row });
        });
        return { count: data.length };
      }),
    },
  },
}));

jest.mock("../../src/services/audit.service", () => ({
  writeAuditLog: jest.fn().mockResolvedValue(undefined),
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

function validTimetablePayload(overrides: Record<string, unknown> = {}) {
  return {
    classId: "10",
    sectionId: "A",
    day: "Monday",
    periods: [
      { periodNumber: 1, subject: "Mathematics", teacherId: "t1", startTime: "08:00", endTime: "08:45" },
      { periodNumber: 2, subject: "Science", teacherId: "t2", startTime: "08:45", endTime: "09:30" },
    ],
    ...overrides,
  };
}

function seedTimetable(id: string, schoolId = "school_1", overrides: Record<string, unknown> = {}) {
  const periods = (overrides.periods as Array<Record<string, unknown>> | undefined) ?? [
    { periodNumber: 1, subject: "Mathematics", teacherId: "t1", startTime: "08:00", endTime: "08:45" },
  ];

  const row = {
    id, schoolId,
    classId: "10", sectionId: "A", day: "Monday",
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };

  delete (row as any).periods;
  mockState.timetables.set(id, row);

  periods.forEach((p, idx) => {
    mockState.periods.set(`${id}_p_${idx + 1}`, {
      id: `${id}_p_${idx + 1}`,
      timetableId: id,
      ...p,
    });
  });
}

beforeEach(async () => {
  resetFirestoreMock();
  mockState.timetables.clear();
  mockState.periods.clear();
  mockState.users.clear();
  mockState.timetableCounter = 1;
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
  await server.register(timetableRoutes, { prefix: "/" });
  await server.ready();
});

afterEach(async () => { await server.close(); });

// ---------------------------------------------------------------------------
// POST /timetable
// ---------------------------------------------------------------------------
describe("POST /timetable", () => {
  it("creates a timetable entry and returns 201", async () => {
    setupAuthUser();
    seedSchool();
    const res = await server.inject({
      method: "POST", url: "/timetable",
      headers: { authorization: "Bearer token" },
      payload: validTimetablePayload(),
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data).toHaveProperty("id");
    expect(body.data.day).toBe("Monday");
    expect(body.data.periods.length).toBe(2);
  });

  it("returns 400 for missing required fields", async () => {
    setupAuthUser();
    seedSchool();
    const res = await server.inject({
      method: "POST", url: "/timetable",
      headers: { authorization: "Bearer token" },
      payload: { classId: "10" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("returns 400 for empty periods array", async () => {
    setupAuthUser();
    seedSchool();
    const res = await server.inject({
      method: "POST", url: "/timetable",
      headers: { authorization: "Bearer token" },
      payload: validTimetablePayload({ periods: [] }),
    });
    expect(res.statusCode).toBe(400);
  });

  it("returns 401 when unauthenticated", async () => {
    const res = await server.inject({ method: "POST", url: "/timetable", payload: validTimetablePayload() });
    expect(res.statusCode).toBe(401);
  });

  it("rejects Teacher role", async () => {
    setupAuthUser("Teacher");
    seedSchool();
    const res = await server.inject({
      method: "POST", url: "/timetable",
      headers: { authorization: "Bearer token" },
      payload: validTimetablePayload(),
    });
    expect(res.statusCode).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// GET /timetable
// ---------------------------------------------------------------------------
describe("GET /timetable", () => {
  it("returns a paginated list", async () => {
    setupAuthUser();
    seedSchool();
    seedTimetable("tt_1");
    seedTimetable("tt_2", "school_1", { day: "Tuesday" });
    const res = await server.inject({
      method: "GET", url: "/timetable",
      headers: { authorization: "Bearer token" },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBe(2);
  });

  it("does not return timetables from another school", async () => {
    setupAuthUser();
    seedSchool();
    seedTimetable("tt_other", "school_2");
    const res = await server.inject({
      method: "GET", url: "/timetable",
      headers: { authorization: "Bearer token" },
    });
    expect(JSON.parse(res.body).data.length).toBe(0);
  });

  it("filters by day", async () => {
    setupAuthUser();
    seedSchool();
    seedTimetable("tt_mon", "school_1", { day: "Monday" });
    seedTimetable("tt_tue", "school_1", { day: "Tuesday" });
    const res = await server.inject({
      method: "GET", url: "/timetable?day=Monday",
      headers: { authorization: "Bearer token" },
    });
    const body = JSON.parse(res.body);
    expect(body.data.length).toBe(1);
    expect(body.data[0].day).toBe("Monday");
  });
});

// ---------------------------------------------------------------------------
// GET /timetable/lookup
// ---------------------------------------------------------------------------
describe("GET /timetable/lookup", () => {
  it("finds timetable for class+section+day", async () => {
    setupAuthUser();
    seedSchool();
    seedTimetable("tt_1", "school_1", { classId: "10", sectionId: "A", day: "Monday" });
    const res = await server.inject({
      method: "GET", url: "/timetable/lookup?classId=10&sectionId=A&day=Monday",
      headers: { authorization: "Bearer token" },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).data.day).toBe("Monday");
  });

  it("returns 400 when query params are missing", async () => {
    setupAuthUser();
    seedSchool();
    const res = await server.inject({
      method: "GET", url: "/timetable/lookup?classId=10",
      headers: { authorization: "Bearer token" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("returns 404 when no matching timetable", async () => {
    setupAuthUser();
    seedSchool();
    const res = await server.inject({
      method: "GET", url: "/timetable/lookup?classId=10&sectionId=A&day=Saturday",
      headers: { authorization: "Bearer token" },
    });
    expect(res.statusCode).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// GET /timetable/:id
// ---------------------------------------------------------------------------
describe("GET /timetable/:id", () => {
  it("returns a single timetable", async () => {
    setupAuthUser();
    seedSchool();
    seedTimetable("tt_1");
    const res = await server.inject({
      method: "GET", url: "/timetable/tt_1",
      headers: { authorization: "Bearer token" },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).data.id).toBe("tt_1");
  });

  it("returns 404 for non-existent timetable", async () => {
    setupAuthUser();
    seedSchool();
    const res = await server.inject({
      method: "GET", url: "/timetable/nonexistent",
      headers: { authorization: "Bearer token" },
    });
    expect(res.statusCode).toBe(404);
  });

  it("returns 404 for timetable in different school", async () => {
    setupAuthUser();
    seedSchool();
    seedTimetable("tt_other", "school_2");
    const res = await server.inject({
      method: "GET", url: "/timetable/tt_other",
      headers: { authorization: "Bearer token" },
    });
    expect(res.statusCode).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// PATCH /timetable/:id
// ---------------------------------------------------------------------------
describe("PATCH /timetable/:id", () => {
  it("updates timetable fields", async () => {
    setupAuthUser();
    seedSchool();
    seedTimetable("tt_1");
    const res = await server.inject({
      method: "PATCH", url: "/timetable/tt_1",
      headers: { authorization: "Bearer token" },
      payload: { day: "Wednesday" },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).data.day).toBe("Wednesday");
  });

  it("rejects Teacher role", async () => {
    setupAuthUser("Teacher");
    seedSchool();
    seedTimetable("tt_1");
    const res = await server.inject({
      method: "PATCH", url: "/timetable/tt_1",
      headers: { authorization: "Bearer token" },
      payload: { day: "Friday" },
    });
    expect(res.statusCode).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// DELETE /timetable/:id
// ---------------------------------------------------------------------------
describe("DELETE /timetable/:id", () => {
  it("soft-deletes a timetable", async () => {
    setupAuthUser();
    seedSchool();
    seedTimetable("tt_1");
    const res = await server.inject({
      method: "DELETE", url: "/timetable/tt_1",
      headers: { authorization: "Bearer token" },
    });
    expect(res.statusCode).toBe(200);
    const row = mockState.timetables.get("tt_1");
    expect(row?.isActive).toBe(false);
  });

  it("returns 404 for non-existent timetable", async () => {
    setupAuthUser();
    seedSchool();
    const res = await server.inject({
      method: "DELETE", url: "/timetable/nonexistent",
      headers: { authorization: "Bearer token" },
    });
    expect(res.statusCode).toBe(404);
  });

  it("rejects Teacher role", async () => {
    setupAuthUser("Teacher");
    seedSchool();
    seedTimetable("tt_1");
    const res = await server.inject({
      method: "DELETE", url: "/timetable/tt_1",
      headers: { authorization: "Bearer token" },
    });
    expect(res.statusCode).toBe(403);
  });
});
