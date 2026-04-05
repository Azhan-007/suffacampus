/**
 * Integration tests for search routes.
 *
 * Tests: GET /search, POST /search/reindex/:entity
 */

import Fastify, { type FastifyInstance } from "fastify";
import searchRoutes from "../../src/routes/v1/search";
import {
  auth,
  resetFirestoreMock,
  seedDoc,
} from "../__mocks__/firebase-admin";
import { AppError } from "../../src/errors";

const mockState = {
  students: new Map<string, any>(),
  teachers: new Map<string, any>(),
  books: new Map<string, any>(),
};

jest.mock("../../src/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: jest.fn(async () => null),
    },
    student: {
      findMany: jest.fn(async ({ where, take }) => {
        let rows = [...mockState.students.values()].filter((row) => {
          if (where?.schoolId && row.schoolId !== where.schoolId) return false;
          if (typeof where?.isDeleted !== "undefined" && row.isDeleted !== where.isDeleted) return false;
          if (where?.OR && Array.isArray(where.OR)) {
            const search = String(
              where.OR[0]?.firstName?.contains ??
              where.OR[1]?.lastName?.contains ??
              where.OR[2]?.rollNumber?.contains ??
              where.OR[3]?.guardianName?.contains ??
              ""
            ).toLowerCase();
            if (search) {
              const firstName = String(row.firstName ?? "").toLowerCase();
              const lastName = String(row.lastName ?? "").toLowerCase();
              const rollNumber = String(row.rollNumber ?? "").toLowerCase();
              const guardianName = String(row.guardianName ?? "").toLowerCase();
              if (
                !firstName.includes(search) &&
                !lastName.includes(search) &&
                !rollNumber.includes(search) &&
                !guardianName.includes(search)
              ) {
                return false;
              }
            }
          }
          return true;
        });
        if (typeof take === "number") rows = rows.slice(0, take);
        return rows;
      }),
    },
    teacher: {
      findMany: jest.fn(async ({ where, take }) => {
        let rows = [...mockState.teachers.values()].filter((row) => {
          if (where?.schoolId && row.schoolId !== where.schoolId) return false;
          if (typeof where?.isDeleted !== "undefined" && row.isDeleted !== where.isDeleted) return false;
          if (where?.OR && Array.isArray(where.OR)) {
            const search = String(
              where.OR[0]?.firstName?.contains ??
              where.OR[1]?.lastName?.contains ??
              where.OR[2]?.email?.contains ??
              where.OR[3]?.department?.contains ??
              ""
            ).toLowerCase();
            if (search) {
              const firstName = String(row.firstName ?? "").toLowerCase();
              const lastName = String(row.lastName ?? "").toLowerCase();
              const email = String(row.email ?? "").toLowerCase();
              const department = String(row.department ?? "").toLowerCase();
              if (
                !firstName.includes(search) &&
                !lastName.includes(search) &&
                !email.includes(search) &&
                !department.includes(search)
              ) {
                return false;
              }
            }
          }
          return true;
        });
        if (typeof take === "number") rows = rows.slice(0, take);
        return rows;
      }),
    },
    book: {
      findMany: jest.fn(async ({ where, take }) => {
        let rows = [...mockState.books.values()].filter((row) => {
          if (where?.schoolId && row.schoolId !== where.schoolId) return false;
          if (typeof where?.isActive !== "undefined" && row.isActive !== where.isActive) return false;
          if (where?.OR && Array.isArray(where.OR)) {
            const search = String(
              where.OR[0]?.title?.contains ??
              where.OR[1]?.author?.contains ??
              where.OR[2]?.isbn?.contains ??
              ""
            ).toLowerCase();
            if (search) {
              const title = String(row.title ?? "").toLowerCase();
              const author = String(row.author ?? "").toLowerCase();
              const isbn = String(row.isbn ?? "").toLowerCase();
              if (!title.includes(search) && !author.includes(search) && !isbn.includes(search)) {
                return false;
              }
            }
          }
          return true;
        });
        if (typeof take === "number") rows = rows.slice(0, take);
        return rows;
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

beforeEach(async () => {
  resetFirestoreMock();
  mockState.students.clear();
  mockState.teachers.clear();
  mockState.books.clear();
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
  await server.register(searchRoutes, { prefix: "/" });
  await server.ready();
});

afterEach(async () => { await server.close(); });

// ---------------------------------------------------------------------------
// GET /search
// ---------------------------------------------------------------------------
describe("GET /search", () => {
  it("returns search results", async () => {
    setupAuthUser();
    seedSchool();
    mockState.students.set("s1", {
      id: "s1",
      schoolId: "school_1",
      firstName: "Rahul",
      lastName: "Sharma",
      rollNumber: "10",
      guardianName: "Mr Sharma",
      classId: "10",
      isDeleted: false,
    });
    const res = await server.inject({
      method: "GET", url: "/search?q=Rahul",
      headers: { authorization: "Bearer token" },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
  });

  it("returns 400 when query is missing", async () => {
    setupAuthUser();
    seedSchool();
    const res = await server.inject({
      method: "GET", url: "/search",
      headers: { authorization: "Bearer token" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("returns 400 when query is empty", async () => {
    setupAuthUser();
    seedSchool();
    const res = await server.inject({
      method: "GET", url: "/search?q=",
      headers: { authorization: "Bearer token" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("returns 401 when unauthenticated", async () => {
    const res = await server.inject({ method: "GET", url: "/search?q=test" });
    expect(res.statusCode).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// POST /search/reindex/:entity
// ---------------------------------------------------------------------------
describe("POST /search/reindex/:entity", () => {
  it("reindexes students", async () => {
    setupAuthUser();
    seedSchool();
    mockState.students.set("s1", {
      id: "s1",
      schoolId: "school_1",
      firstName: "Student",
      lastName: "One",
      isDeleted: false,
    });
    const res = await server.inject({
      method: "POST", url: "/search/reindex/students",
      headers: { authorization: "Bearer token" },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.entity).toBe("students");
    expect(body.data.indexed).toBeGreaterThanOrEqual(0);
  });

  it("returns 400 for invalid entity", async () => {
    setupAuthUser();
    seedSchool();
    const res = await server.inject({
      method: "POST", url: "/search/reindex/invalid",
      headers: { authorization: "Bearer token" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("rejects Teacher role", async () => {
    setupAuthUser("Teacher");
    seedSchool();
    const res = await server.inject({
      method: "POST", url: "/search/reindex/students",
      headers: { authorization: "Bearer token" },
    });
    expect(res.statusCode).toBe(403);
  });
});
