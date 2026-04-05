/**
 * Integration tests for result routes.
 *
 * Tests: POST /results, GET /results, GET /results/student/:studentId,
 *        GET /results/:id, PATCH /results/:id, DELETE /results/:id
 */

import Fastify, { type FastifyInstance } from "fastify";
import resultRoutes from "../../src/routes/v1/results";
import {
  auth,
  resetFirestoreMock,
  seedDoc,
} from "../__mocks__/firebase-admin";
import { AppError } from "../../src/errors";

const mockState = {
  results: new Map<string, any>(),
  counter: 1,
};

jest.mock("../../src/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: jest.fn(async () => null),
    },
    result: {
      create: jest.fn(async ({ data }) => {
        const id = `res_${mockState.counter++}`;
        const row = {
          id,
          createdAt: new Date(),
          updatedAt: new Date(),
          ...data,
        };
        mockState.results.set(id, row);
        return row;
      }),
      findMany: jest.fn(async ({ where, orderBy, take }) => {
        let rows = [...mockState.results.values()].filter((row) => {
          if (where?.schoolId && row.schoolId !== where.schoolId) return false;
          if (where?.studentId && row.studentId !== where.studentId) return false;
          if (where?.classId && row.classId !== where.classId) return false;
          if (where?.sectionId && row.sectionId !== where.sectionId) return false;
          if (where?.examType && row.examType !== where.examType) return false;
          if (where?.examName && row.examName !== where.examName) return false;
          if (where?.subject && row.subject !== where.subject) return false;
          if (typeof where?.isActive !== "undefined" && row.isActive !== where.isActive) return false;
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
      findUnique: jest.fn(async ({ where: { id } }) => mockState.results.get(id) ?? null),
      update: jest.fn(async ({ where: { id }, data }) => {
        const existing = mockState.results.get(id);
        if (!existing) throw new Error("Result not found");
        const updated = { ...existing, ...data, updatedAt: new Date() };
        mockState.results.set(id, updated);
        return updated;
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

function validResultPayload(overrides: Record<string, unknown> = {}) {
  return {
    studentId: "stu_1",
    studentName: "John Doe",
    rollNumber: "001",
    classId: "10",
    sectionId: "A",
    examType: "Final",
    examName: "Annual Examination 2025",
    subject: "Mathematics",
    marksObtained: 85,
    totalMarks: 100,
    ...overrides,
  };
}

function seedResult(id: string, schoolId = "school_1", overrides: Record<string, unknown> = {}) {
  mockState.results.set(id, {
    id, schoolId,
    studentId: "stu_1", studentName: "John Doe", rollNumber: "001",
    classId: "10", sectionId: "A",
    examType: "Final", examName: "Annual Examination 2025",
    subject: "Mathematics", marksObtained: 85, totalMarks: 100,
    percentage: 85, grade: "A", status: "Pass",
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });
}

beforeEach(async () => {
  resetFirestoreMock();
  mockState.results.clear();
  mockState.counter = 1;
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
  await server.register(resultRoutes, { prefix: "/" });
  await server.ready();
});

afterEach(async () => { await server.close(); });

// ---------------------------------------------------------------------------
// POST /results
// ---------------------------------------------------------------------------
describe("POST /results", () => {
  it("creates a result and returns 201", async () => {
    setupAuthUser();
    seedSchool();
    const res = await server.inject({
      method: "POST", url: "/results",
      headers: { authorization: "Bearer token" },
      payload: validResultPayload(),
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data).toHaveProperty("id");
    expect(body.data.marksObtained).toBe(85);
  });

  it("returns 400 for missing required fields", async () => {
    setupAuthUser();
    seedSchool();
    const res = await server.inject({
      method: "POST", url: "/results",
      headers: { authorization: "Bearer token" },
      payload: { studentId: "stu_1" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("returns 400 for negative marks", async () => {
    setupAuthUser();
    seedSchool();
    const res = await server.inject({
      method: "POST", url: "/results",
      headers: { authorization: "Bearer token" },
      payload: validResultPayload({ marksObtained: -5 }),
    });
    expect(res.statusCode).toBe(400);
  });

  it("returns 401 when unauthenticated", async () => {
    const res = await server.inject({ method: "POST", url: "/results", payload: validResultPayload() });
    expect(res.statusCode).toBe(401);
  });

  it("allows Teacher role to create results", async () => {
    setupAuthUser("Teacher");
    seedSchool();
    const res = await server.inject({
      method: "POST", url: "/results",
      headers: { authorization: "Bearer token" },
      payload: validResultPayload(),
    });
    expect(res.statusCode).toBe(201);
  });
});

// ---------------------------------------------------------------------------
// GET /results
// ---------------------------------------------------------------------------
describe("GET /results", () => {
  it("returns a paginated list of results", async () => {
    setupAuthUser();
    seedSchool();
    seedResult("res_1");
    seedResult("res_2", "school_1", { subject: "Science" });
    const res = await server.inject({
      method: "GET", url: "/results",
      headers: { authorization: "Bearer token" },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBe(2);
  });

  it("does not return results from another school", async () => {
    setupAuthUser();
    seedSchool();
    seedResult("res_other", "school_2");
    const res = await server.inject({
      method: "GET", url: "/results",
      headers: { authorization: "Bearer token" },
    });
    expect(JSON.parse(res.body).data.length).toBe(0);
  });

  it("filters by examType", async () => {
    setupAuthUser();
    seedSchool();
    seedResult("res_final", "school_1", { examType: "Final" });
    seedResult("res_mid", "school_1", { examType: "Midterm" });
    const res = await server.inject({
      method: "GET", url: "/results?examType=Final",
      headers: { authorization: "Bearer token" },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.length).toBe(1);
    expect(body.data[0].examType).toBe("Final");
  });

  it("filters by studentId", async () => {
    setupAuthUser();
    seedSchool();
    seedResult("res_1", "school_1", { studentId: "stu_1" });
    seedResult("res_2", "school_1", { studentId: "stu_2" });
    const res = await server.inject({
      method: "GET", url: "/results?studentId=stu_1",
      headers: { authorization: "Bearer token" },
    });
    expect(JSON.parse(res.body).data.length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// GET /results/student/:studentId
// ---------------------------------------------------------------------------
describe("GET /results/student/:studentId", () => {
  it("returns results for a specific student", async () => {
    setupAuthUser();
    seedSchool();
    seedResult("res_1", "school_1", { studentId: "stu_1" });
    seedResult("res_2", "school_1", { studentId: "stu_1", subject: "Science" });
    seedResult("res_3", "school_1", { studentId: "stu_2" });
    const res = await server.inject({
      method: "GET", url: "/results/student/stu_1",
      headers: { authorization: "Bearer token" },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.length).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// GET /results/:id
// ---------------------------------------------------------------------------
describe("GET /results/:id", () => {
  it("returns a single result", async () => {
    setupAuthUser();
    seedSchool();
    seedResult("res_1");
    const res = await server.inject({
      method: "GET", url: "/results/res_1",
      headers: { authorization: "Bearer token" },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).data.id).toBe("res_1");
  });

  it("returns 404 for non-existent result", async () => {
    setupAuthUser();
    seedSchool();
    const res = await server.inject({
      method: "GET", url: "/results/nonexistent",
      headers: { authorization: "Bearer token" },
    });
    expect(res.statusCode).toBe(404);
  });

  it("returns 404 for result in different school", async () => {
    setupAuthUser();
    seedSchool();
    seedResult("res_other", "school_2");
    const res = await server.inject({
      method: "GET", url: "/results/res_other",
      headers: { authorization: "Bearer token" },
    });
    expect(res.statusCode).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// PATCH /results/:id
// ---------------------------------------------------------------------------
describe("PATCH /results/:id", () => {
  it("updates result fields", async () => {
    setupAuthUser();
    seedSchool();
    seedResult("res_1");
    const res = await server.inject({
      method: "PATCH", url: "/results/res_1",
      headers: { authorization: "Bearer token" },
      payload: { marksObtained: 90 },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).data.marksObtained).toBe(90);
  });

  it("allows Teacher role to update results", async () => {
    setupAuthUser("Teacher");
    seedSchool();
    seedResult("res_1");
    const res = await server.inject({
      method: "PATCH", url: "/results/res_1",
      headers: { authorization: "Bearer token" },
      payload: { marksObtained: 92 },
    });
    expect(res.statusCode).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// DELETE /results/:id
// ---------------------------------------------------------------------------
describe("DELETE /results/:id", () => {
  it("soft-deletes a result", async () => {
    setupAuthUser();
    seedSchool();
    seedResult("res_1");
    const res = await server.inject({
      method: "DELETE", url: "/results/res_1",
      headers: { authorization: "Bearer token" },
    });
    expect(res.statusCode).toBe(200);
    const doc = mockState.results.get("res_1");
    expect(doc?.isActive).toBe(false);
  });

  it("returns 404 for non-existent result", async () => {
    setupAuthUser();
    seedSchool();
    const res = await server.inject({
      method: "DELETE", url: "/results/nonexistent",
      headers: { authorization: "Bearer token" },
    });
    expect(res.statusCode).toBe(404);
  });

  it("rejects Teacher role for delete", async () => {
    setupAuthUser("Teacher");
    seedSchool();
    seedResult("res_1");
    const res = await server.inject({
      method: "DELETE", url: "/results/res_1",
      headers: { authorization: "Bearer token" },
    });
    expect(res.statusCode).toBe(403);
  });
});
