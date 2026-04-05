/**
 * Integration tests for student routes.
 *
 * Tests: POST /students, GET /students, GET /students/:id,
 *        PATCH /students/:id, DELETE /students/:id
 */

import Fastify, { type FastifyInstance } from "fastify";
import studentRoutes from "../../src/routes/v1/students";
import {
  auth,
  resetFirestoreMock,
  seedDoc,
} from "../__mocks__/firebase-admin";
import { AppError } from "../../src/errors";

const mockState = {
  schools: new Map<string, any>(),
  students: new Map<string, any>(),
  users: new Map<string, any>(),
  studentCounter: 1,
};

jest.mock("../../src/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: jest.fn(async () => null),
      upsert: jest.fn(async ({ where: { uid }, update, create }) => {
        const existing = mockState.users.get(uid);
        const user = existing ? { ...existing, ...update } : create;
        mockState.users.set(uid, user);
        return user;
      }),
      create: jest.fn(async ({ data }) => {
        mockState.users.set(data.uid, data);
        return data;
      }),
    },
    school: {
      findUnique: jest.fn(async ({ where: { id }, select }) => {
        const school = mockState.schools.get(id) ?? null;
        if (!school || !select) return school;
        const selected: Record<string, unknown> = {};
        for (const key of Object.keys(select)) {
          if (select[key]) selected[key] = school[key];
        }
        return selected;
      }),
    },
    class: {
      findFirst: jest.fn(async ({ where }) => {
        if (!where?.id || !where?.schoolId) return null;
        return { id: where.id, schoolId: where.schoolId };
      }),
    },
    student: {
      create: jest.fn(async ({ data }) => {
        const id = `stu_${mockState.studentCounter++}`;
        const student = {
          id,
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
          ...data,
        };
        mockState.students.set(id, student);
        return student;
      }),
      findMany: jest.fn(async ({ where, orderBy, take }) => {
        let rows = [...mockState.students.values()].filter((s) => {
          if (where?.schoolId && s.schoolId !== where.schoolId) return false;
          if (typeof where?.isDeleted !== "undefined" && s.isDeleted !== where.isDeleted) return false;
          if (where?.id) {
            if (typeof where.id === "string" && s.id !== where.id) return false;
            if (
              typeof where.id === "object" &&
              where.id !== null &&
              Array.isArray(where.id.in) &&
              !where.id.in.includes(s.id)
            ) {
              return false;
            }
          }
          if (where?.classId && s.classId !== where.classId) return false;
          if (where?.sectionId && s.sectionId !== where.sectionId) return false;
          if (where?.gender && s.gender !== where.gender) return false;
          if (typeof where?.isActive !== "undefined" && s.isActive !== where.isActive) return false;
          if (where?.OR && Array.isArray(where.OR)) {
            const search = String(where.OR[0]?.firstName?.contains ?? "").toLowerCase();
            if (search) {
              const fn = String(s.firstName ?? "").toLowerCase();
              const ln = String(s.lastName ?? "").toLowerCase();
              if (!fn.includes(search) && !ln.includes(search)) return false;
            }
          }
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

        return typeof take === "number" ? rows.slice(0, take) : rows;
      }),
      findUnique: jest.fn(async ({ where: { id } }) => mockState.students.get(id) ?? null),
      update: jest.fn(async ({ where: { id }, data }) => {
        const existing = mockState.students.get(id);
        if (!existing) throw new Error("Student not found");
        const updated = { ...existing, ...data, updatedAt: new Date() };
        mockState.students.set(id, updated);
        return updated;
      }),
      delete: jest.fn(async ({ where: { id } }) => {
        const existing = mockState.students.get(id);
        mockState.students.delete(id);
        return existing;
      }),
      count: jest.fn(async ({ where }) => {
        return [...mockState.students.values()].filter((s) => {
          if (where?.schoolId && s.schoolId !== where.schoolId) return false;
          if (typeof where?.isDeleted !== "undefined" && s.isDeleted !== where.isDeleted) return false;
          return true;
        }).length;
      }),
    },
  },
}));

// Mock audit service
jest.mock("../../src/services/audit.service", () => ({
  writeAuditLog: jest.fn().mockResolvedValue(undefined),
}));

let server: FastifyInstance;
const mockVerifyIdToken = auth.verifyIdToken as jest.Mock;
const mockCreateUser = auth.createUser as jest.Mock;
const mockGetUserByEmail = auth.getUserByEmail as jest.Mock;

// ---- helpers ----

function setupAuthUser(
  role = "Admin",
  schoolId = "school_1",
  overrides: Record<string, unknown> = {}
) {
  mockVerifyIdToken.mockResolvedValueOnce({
    uid: "user_1",
    email: "admin@school.com",
  });
  seedDoc("users", "user_1", {
    uid: "user_1",
    email: "admin@school.com",
    role,
    schoolId,
    status: "active",
    ...overrides,
  });
}

function seedSchool(schoolId = "school_1", overrides: Record<string, unknown> = {}) {
  const limits =
    (overrides.limits as Record<string, unknown> | undefined) ??
    { students: 500, maxStudents: 500, maxTeachers: 50, maxClasses: 20 };

  mockState.schools.set(schoolId, {
    id: schoolId,
    name: "Test School",
    subscriptionPlan: "pro",
    maxStudents: Number(limits.maxStudents ?? limits.students ?? 500),
    maxTeachers: Number(limits.maxTeachers ?? 50),
  });

  seedDoc("schools", schoolId, {
    name: "Test School",
    subscriptionPlan: "Pro",
    subscriptionStatus: "active",
    autoRenew: true,
    trialEndDate: null,
    currentPeriodStart: { toMillis: () => Date.now() - 15 * 86400000 },
    currentPeriodEnd: { toMillis: () => Date.now() + 15 * 86400000 },
    paymentFailureCount: 0,
    limits: { students: 500, maxStudents: 500, maxTeachers: 50, maxClasses: 20 },
    ...overrides,
  });
}

function validStudentPayload(overrides: Record<string, unknown> = {}) {
  return {
    firstName: "John",
    lastName: "Doe",
    classId: "10",
    sectionId: "A",
    rollNumber: "001",
    parentPhone: "+919876543210",
    gender: "Male",
    ...overrides,
  };
}

function seedStudent(
  id: string,
  schoolId = "school_1",
  overrides: Record<string, unknown> = {}
) {
  mockState.students.set(id, {
    id,
    schoolId,
    firstName: "Existing",
    lastName: "Student",
    classId: "10",
    sectionId: "A",
    rollNumber: "002",
    parentPhone: "+919876543211",
    gender: "Female",
    isActive: true,
    isDeleted: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });
}

// ---- setup / teardown ----

beforeEach(async () => {
  resetFirestoreMock();
  mockState.schools.clear();
  mockState.students.clear();
  mockState.users.clear();
  mockState.studentCounter = 1;
  mockVerifyIdToken.mockReset();
  mockCreateUser.mockReset();
  mockGetUserByEmail.mockReset();

  // Default: createUser returns a uid
  mockCreateUser.mockResolvedValue({ uid: "firebase_uid_1" });

  server = Fastify({ logger: false });

  server.setErrorHandler((error, _request, reply) => {
    if (error instanceof AppError) {
      return reply.status(error.statusCode).send({ success: false, error: error.toJSON() });
    }
    const msg = error instanceof Error ? error.message : "Unknown error";
    return reply.status(500).send({ success: false, message: msg });
  });

  server.decorateRequest("requestId", "test-request-id");

  // No-op cache
  server.decorate("cache", {
    get: () => undefined,
    set: () => true,
    setWithTTL: () => true,
    del: () => 0,
    flushNamespace: () => {},
    flushAll: () => {},
    stats: () => ({ hits: 0, misses: 0, keys: 0, ksize: 0, vsize: 0 }),
  });

  await server.register(studentRoutes, { prefix: "/" });
  await server.ready();
});

afterEach(async () => {
  await server.close();
});

// ---------------------------------------------------------------------------
// POST /students
// ---------------------------------------------------------------------------

describe("POST /students", () => {
  it("creates a student and returns 201", async () => {
    setupAuthUser();
    seedSchool();

    const res = await server.inject({
      method: "POST",
      url: "/students",
      headers: { authorization: "Bearer token" },
      payload: validStudentPayload(),
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data).toHaveProperty("id");
    expect(body.data.firstName).toBe("John");
    expect(body.data.lastName).toBe("Doe");
    expect(body.data.schoolId).toBe("school_1");
    expect(body.data.credentials).toBeDefined();
  });

  it("returns 422 for missing required fields", async () => {
    setupAuthUser();
    seedSchool();

    const res = await server.inject({
      method: "POST",
      url: "/students",
      headers: { authorization: "Bearer token" },
      payload: { firstName: "Only" }, // missing required fields
    });

    expect(res.statusCode).toBe(400);
  });

  it("returns 401 when unauthenticated", async () => {
    const res = await server.inject({
      method: "POST",
      url: "/students",
      payload: validStudentPayload(),
    });

    expect(res.statusCode).toBe(401);
  });

  it("rejects Teacher role (requires Admin)", async () => {
    setupAuthUser("Teacher");
    seedSchool();

    const res = await server.inject({
      method: "POST",
      url: "/students",
      headers: { authorization: "Bearer token" },
      payload: validStudentPayload(),
    });

    expect(res.statusCode).toBe(403);
  });

  it("returns 403 when subscription student limit reached", async () => {
    setupAuthUser();
    seedSchool("school_1", { limits: { students: 0, maxStudents: 0, maxTeachers: 50, maxClasses: 20 } });

    const res = await server.inject({
      method: "POST",
      url: "/students",
      headers: { authorization: "Bearer token" },
      payload: validStudentPayload(),
    });

    expect(res.statusCode).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// GET /students
// ---------------------------------------------------------------------------

describe("GET /students", () => {
  it("returns a paginated list of students", async () => {
    setupAuthUser();
    seedSchool();
    seedStudent("stu_1");
    seedStudent("stu_2", "school_1", { firstName: "Another", rollNumber: "003" });

    const res = await server.inject({
      method: "GET",
      url: "/students",
      headers: { authorization: "Bearer token" },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBe(2);
    expect(body).toHaveProperty("pagination");
  });

  it("returns empty list when no students exist", async () => {
    setupAuthUser();
    seedSchool();

    const res = await server.inject({
      method: "GET",
      url: "/students",
      headers: { authorization: "Bearer token" },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data).toEqual([]);
  });

  it("does not return students from another school", async () => {
    setupAuthUser();
    seedSchool();
    seedStudent("stu_other", "school_2"); // different school

    const res = await server.inject({
      method: "GET",
      url: "/students",
      headers: { authorization: "Bearer token" },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.length).toBe(0);
  });

  it("filters by classId", async () => {
    setupAuthUser();
    seedSchool();
    seedStudent("stu_10a", "school_1", { classId: "10" });
    seedStudent("stu_9b", "school_1", { classId: "9" });

    const res = await server.inject({
      method: "GET",
      url: "/students?classId=10",
      headers: { authorization: "Bearer token" },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.length).toBe(1);
    expect(body.data[0].classId).toBe("10");
  });

  it("restricts Parent list to linked students only", async () => {
    setupAuthUser("Parent", "school_1", { studentIds: ["stu_1"] });
    seedSchool();
    seedStudent("stu_1", "school_1", { firstName: "Linked" });
    seedStudent("stu_2", "school_1", { firstName: "Unlinked" });

    const res = await server.inject({
      method: "GET",
      url: "/students",
      headers: { authorization: "Bearer token" },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.length).toBe(1);
    expect(body.data[0].id).toBe("stu_1");
  });

  it("restricts Student list to self only", async () => {
    setupAuthUser("Student", "school_1", { studentId: "stu_2" });
    seedSchool();
    seedStudent("stu_1", "school_1", { firstName: "Other" });
    seedStudent("stu_2", "school_1", { firstName: "Self" });

    const res = await server.inject({
      method: "GET",
      url: "/students",
      headers: { authorization: "Bearer token" },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.length).toBe(1);
    expect(body.data[0].id).toBe("stu_2");
  });
});

// ---------------------------------------------------------------------------
// GET /students/:id
// ---------------------------------------------------------------------------

describe("GET /students/:id", () => {
  it("returns a single student", async () => {
    setupAuthUser();
    seedSchool();
    seedStudent("stu_1");

    const res = await server.inject({
      method: "GET",
      url: "/students/stu_1",
      headers: { authorization: "Bearer token" },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.id).toBe("stu_1");
  });

  it("returns 404 for non-existent student", async () => {
    setupAuthUser();
    seedSchool();

    const res = await server.inject({
      method: "GET",
      url: "/students/nonexistent",
      headers: { authorization: "Bearer token" },
    });

    expect(res.statusCode).toBe(404);
  });

  it("returns 404 for student in different school (tenant isolation)", async () => {
    setupAuthUser();
    seedSchool();
    seedStudent("stu_other", "school_2");

    const res = await server.inject({
      method: "GET",
      url: "/students/stu_other",
      headers: { authorization: "Bearer token" },
    });

    expect(res.statusCode).toBe(404);
  });

  it("rejects Parent for unlinked student", async () => {
    setupAuthUser("Parent", "school_1", { studentIds: ["stu_1"] });
    seedSchool();
    seedStudent("stu_2", "school_1");

    const res = await server.inject({
      method: "GET",
      url: "/students/stu_2",
      headers: { authorization: "Bearer token" },
    });

    expect(res.statusCode).toBe(403);
    const body = JSON.parse(res.body);
    expect(body.error.code).toBe("ROLE_UNAUTHORIZED");
  });

  it("rejects Student for another student record", async () => {
    setupAuthUser("Student", "school_1", { studentId: "stu_1" });
    seedSchool();
    seedStudent("stu_2", "school_1");

    const res = await server.inject({
      method: "GET",
      url: "/students/stu_2",
      headers: { authorization: "Bearer token" },
    });

    expect(res.statusCode).toBe(403);
    const body = JSON.parse(res.body);
    expect(body.error.code).toBe("ROLE_UNAUTHORIZED");
  });
});

// ---------------------------------------------------------------------------
// PATCH /students/:id
// ---------------------------------------------------------------------------

describe("PATCH /students/:id", () => {
  it("updates student fields", async () => {
    setupAuthUser();
    seedSchool();
    seedStudent("stu_1");

    const res = await server.inject({
      method: "PATCH",
      url: "/students/stu_1",
      headers: { authorization: "Bearer token" },
      payload: { firstName: "Updated" },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.firstName).toBe("Updated");
  });

  it("returns 400 for empty update body", async () => {
    setupAuthUser();
    seedSchool();
    seedStudent("stu_1");

    const res = await server.inject({
      method: "PATCH",
      url: "/students/stu_1",
      headers: { authorization: "Bearer token" },
      payload: {},
    });

    expect(res.statusCode).toBe(400);
  });

  it("rejects Teacher role", async () => {
    setupAuthUser("Teacher");
    seedSchool();
    seedStudent("stu_1");

    const res = await server.inject({
      method: "PATCH",
      url: "/students/stu_1",
      headers: { authorization: "Bearer token" },
      payload: { firstName: "Updated" },
    });

    expect(res.statusCode).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// DELETE /students/:id
// ---------------------------------------------------------------------------

describe("DELETE /students/:id", () => {
  it("soft-deletes a student", async () => {
    setupAuthUser();
    seedSchool();
    seedStudent("stu_1");

    const res = await server.inject({
      method: "DELETE",
      url: "/students/stu_1",
      headers: { authorization: "Bearer token" },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);

    // Verify the student is marked as deleted in the store
    const student = mockState.students.get("stu_1");
    expect(student?.isDeleted).toBe(true);
  });

  it("returns 404 for non-existent student", async () => {
    setupAuthUser();
    seedSchool();

    const res = await server.inject({
      method: "DELETE",
      url: "/students/nonexistent",
      headers: { authorization: "Bearer token" },
    });

    expect(res.statusCode).toBe(404);
  });

  it("rejects Teacher role", async () => {
    setupAuthUser("Teacher");
    seedSchool();
    seedStudent("stu_1");

    const res = await server.inject({
      method: "DELETE",
      url: "/students/stu_1",
      headers: { authorization: "Bearer token" },
    });

    expect(res.statusCode).toBe(403);
  });
});
