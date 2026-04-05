/**
 * Integration tests for teacher routes.
 *
 * Tests: POST /teachers, GET /teachers, GET /teachers/:id,
 *        PATCH /teachers/:id, DELETE /teachers/:id
 */

import Fastify, { type FastifyInstance } from "fastify";
import teacherRoutes from "../../src/routes/v1/teachers";
import {
  auth,
  resetFirestoreMock,
  seedDoc,
} from "../__mocks__/firebase-admin";
import { AppError } from "../../src/errors";

const mockState = {
  teachers: new Map<string, any>(),
  users: new Map<string, any>(),
  assignments: new Map<string, any>(),
  teacherCounter: 1,
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
    teacher: {
      create: jest.fn(async ({ data, include }) => {
        const id = `teach_${mockState.teacherCounter++}`;
        const teacher = {
          id,
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
          ...data,
        };

        // service passes assignedClasses in nested create syntax
        const classCreates = data.assignedClasses?.create ?? [];
        const assignments = classCreates.map((ac: any, idx: number) => {
          const aid = `${id}_a_${idx + 1}`;
          const row = { id: aid, teacherId: id, ...ac };
          mockState.assignments.set(aid, row);
          return row;
        });

        delete teacher.assignedClasses;
        mockState.teachers.set(id, teacher);

        if (include?.assignedClasses) return { ...teacher, assignedClasses: assignments };
        return teacher;
      }),
      findMany: jest.fn(async ({ where, include, orderBy, take }) => {
        let rows = [...mockState.teachers.values()].filter((t) => {
          if (where?.schoolId && t.schoolId !== where.schoolId) return false;
          if (typeof where?.isDeleted !== "undefined" && t.isDeleted !== where.isDeleted) return false;
          if (where?.department && t.department !== where.department) return false;
          if (typeof where?.isActive !== "undefined" && t.isActive !== where.isActive) return false;
          if (where?.OR && Array.isArray(where.OR)) {
            const search = String(
              where.OR[0]?.firstName?.contains ?? where.OR[1]?.lastName?.contains ?? where.OR[2]?.email?.contains ?? ""
            ).toLowerCase();
            if (search) {
              const fn = String(t.firstName ?? "").toLowerCase();
              const ln = String(t.lastName ?? "").toLowerCase();
              const em = String(t.email ?? "").toLowerCase();
              if (!fn.includes(search) && !ln.includes(search) && !em.includes(search)) return false;
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

        if (typeof take === "number") rows = rows.slice(0, take);

        if (!include?.assignedClasses) return rows;
        return rows.map((t) => ({
          ...t,
          assignedClasses: [...mockState.assignments.values()].filter((a) => a.teacherId === t.id),
        }));
      }),
      findUnique: jest.fn(async ({ where: { id }, include }) => {
        const teacher = mockState.teachers.get(id) ?? null;
        if (!teacher) return null;
        if (!include?.assignedClasses) return teacher;
        return {
          ...teacher,
          assignedClasses: [...mockState.assignments.values()].filter((a) => a.teacherId === id),
        };
      }),
      update: jest.fn(async ({ where: { id }, data, include }) => {
        const existing = mockState.teachers.get(id);
        if (!existing) throw new Error("Teacher not found");
        const updated = { ...existing, ...data, updatedAt: new Date() };
        mockState.teachers.set(id, updated);
        if (!include?.assignedClasses) return updated;
        return {
          ...updated,
          assignedClasses: [...mockState.assignments.values()].filter((a) => a.teacherId === id),
        };
      }),
      delete: jest.fn(async ({ where: { id } }) => {
        const existing = mockState.teachers.get(id);
        mockState.teachers.delete(id);
        return existing;
      }),
    },
    teacherClassAssignment: {
      deleteMany: jest.fn(async ({ where: { teacherId } }) => {
        for (const [id, row] of mockState.assignments.entries()) {
          if (row.teacherId === teacherId) mockState.assignments.delete(id);
        }
        return { count: 0 };
      }),
      createMany: jest.fn(async ({ data }) => {
        for (const row of data) {
          const id = `${row.teacherId}_a_${mockState.assignments.size + 1}`;
          mockState.assignments.set(id, { id, ...row });
        }
        return { count: data.length };
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
const mockSetCustomUserClaims = auth.setCustomUserClaims as jest.Mock;

// ---- helpers ----

function setupAuthUser(role = "Admin", schoolId = "school_1") {
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
  });
}

function seedSchool(schoolId = "school_1", overrides: Record<string, unknown> = {}) {
  seedDoc("schools", schoolId, {
    name: "Test School",
    subscriptionPlan: "Pro",
    subscriptionStatus: "active",
    limits: { students: 500, maxStudents: 500, maxTeachers: 50, maxClasses: 20 },
    ...overrides,
  });
}

function validTeacherPayload(overrides: Record<string, unknown> = {}) {
  return {
    firstName: "Jane",
    lastName: "Smith",
    email: "jane.smith@school.com",
    department: "Mathematics",
    subjects: ["Algebra", "Geometry"],
    ...overrides,
  };
}

function seedTeacher(
  id: string,
  schoolId = "school_1",
  overrides: Record<string, unknown> = {}
) {
  mockState.teachers.set(id, {
    id,
    schoolId,
    firstName: "Existing",
    lastName: "Teacher",
    email: "existing@school.com",
    department: "Science",
    subjects: ["Physics"],
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
  mockState.teachers.clear();
  mockState.users.clear();
  mockState.assignments.clear();
  mockState.teacherCounter = 1;
  mockVerifyIdToken.mockReset();
  mockCreateUser.mockReset();
  mockSetCustomUserClaims.mockReset();

  // Default: auth.createUser returns a uid, setCustomUserClaims resolves
  mockCreateUser.mockResolvedValue({ uid: "teacher_auth_uid_1" });
  mockSetCustomUserClaims.mockResolvedValue(undefined);

  server = Fastify({ logger: false });

  server.setErrorHandler((error, _request, reply) => {
    if (error instanceof AppError) {
      return reply.status(error.statusCode).send({ success: false, error: error.toJSON() });
    }
    const msg = error instanceof Error ? error.message : "Unknown error";
    return reply.status(500).send({ success: false, message: msg });
  });

  server.decorateRequest("requestId", "test-request-id");

  server.decorate("cache", {
    get: () => undefined,
    set: () => true,
    setWithTTL: () => true,
    del: () => 0,
    flushNamespace: () => {},
    flushAll: () => {},
    stats: () => ({ hits: 0, misses: 0, keys: 0, ksize: 0, vsize: 0 }),
  });

  await server.register(teacherRoutes, { prefix: "/" });
  await server.ready();
});

afterEach(async () => {
  await server.close();
});

// ---------------------------------------------------------------------------
// POST /teachers
// ---------------------------------------------------------------------------

describe("POST /teachers", () => {
  it("creates a teacher and returns 201", async () => {
    setupAuthUser();
    seedSchool();

    const res = await server.inject({
      method: "POST",
      url: "/teachers",
      headers: { authorization: "Bearer token" },
      payload: validTeacherPayload(),
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data).toHaveProperty("id");
    expect(body.data.firstName).toBe("Jane");
    expect(body.data.lastName).toBe("Smith");
    expect(body.data.schoolId).toBe("school_1");
    // Verify auto-generated credentials are returned
    expect(body.data).toHaveProperty("credentials");
    expect(body.data.credentials).toHaveProperty("email");
    expect(body.data.credentials).toHaveProperty("password");
  });

  it("returns 400 for missing required fields", async () => {
    setupAuthUser();
    seedSchool();

    const res = await server.inject({
      method: "POST",
      url: "/teachers",
      headers: { authorization: "Bearer token" },
      payload: { firstName: "Only" }, // missing lastName, email, department, subjects
    });

    expect(res.statusCode).toBe(400);
  });

  it("returns 400 for invalid email", async () => {
    setupAuthUser();
    seedSchool();

    const res = await server.inject({
      method: "POST",
      url: "/teachers",
      headers: { authorization: "Bearer token" },
      payload: validTeacherPayload({ email: "not-an-email" }),
    });

    expect(res.statusCode).toBe(400);
  });

  it("returns 401 when unauthenticated", async () => {
    const res = await server.inject({
      method: "POST",
      url: "/teachers",
      payload: validTeacherPayload(),
    });

    expect(res.statusCode).toBe(401);
  });

  it("rejects Teacher role (requires Admin)", async () => {
    setupAuthUser("Teacher");
    seedSchool();

    const res = await server.inject({
      method: "POST",
      url: "/teachers",
      headers: { authorization: "Bearer token" },
      payload: validTeacherPayload(),
    });

    expect(res.statusCode).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// GET /teachers
// ---------------------------------------------------------------------------

describe("GET /teachers", () => {
  it("returns a paginated list of teachers", async () => {
    setupAuthUser();
    seedSchool();
    seedTeacher("teach_1");
    seedTeacher("teach_2", "school_1", { firstName: "Another", email: "another@school.com" });

    const res = await server.inject({
      method: "GET",
      url: "/teachers",
      headers: { authorization: "Bearer token" },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBe(2);
    expect(body).toHaveProperty("pagination");
  });

  it("returns empty list when no teachers exist", async () => {
    setupAuthUser();
    seedSchool();

    const res = await server.inject({
      method: "GET",
      url: "/teachers",
      headers: { authorization: "Bearer token" },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data).toEqual([]);
  });

  it("does not return teachers from another school", async () => {
    setupAuthUser();
    seedSchool();
    seedTeacher("teach_other", "school_2");

    const res = await server.inject({
      method: "GET",
      url: "/teachers",
      headers: { authorization: "Bearer token" },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.length).toBe(0);
  });

  it("filters by department", async () => {
    setupAuthUser();
    seedSchool();
    seedTeacher("teach_math", "school_1", { department: "Mathematics" });
    seedTeacher("teach_sci", "school_1", { department: "Science" });

    const res = await server.inject({
      method: "GET",
      url: "/teachers?department=Mathematics",
      headers: { authorization: "Bearer token" },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.length).toBe(1);
    expect(body.data[0].department).toBe("Mathematics");
  });
});

// ---------------------------------------------------------------------------
// GET /teachers/:id
// ---------------------------------------------------------------------------

describe("GET /teachers/:id", () => {
  it("returns a single teacher", async () => {
    setupAuthUser();
    seedSchool();
    seedTeacher("teach_1");

    const res = await server.inject({
      method: "GET",
      url: "/teachers/teach_1",
      headers: { authorization: "Bearer token" },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.id).toBe("teach_1");
  });

  it("returns 404 for non-existent teacher", async () => {
    setupAuthUser();
    seedSchool();

    const res = await server.inject({
      method: "GET",
      url: "/teachers/nonexistent",
      headers: { authorization: "Bearer token" },
    });

    expect(res.statusCode).toBe(404);
  });

  it("returns 404 for teacher in different school (tenant isolation)", async () => {
    setupAuthUser();
    seedSchool();
    seedTeacher("teach_other", "school_2");

    const res = await server.inject({
      method: "GET",
      url: "/teachers/teach_other",
      headers: { authorization: "Bearer token" },
    });

    expect(res.statusCode).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// PATCH /teachers/:id
// ---------------------------------------------------------------------------

describe("PATCH /teachers/:id", () => {
  it("updates teacher fields", async () => {
    setupAuthUser();
    seedSchool();
    seedTeacher("teach_1");

    const res = await server.inject({
      method: "PATCH",
      url: "/teachers/teach_1",
      headers: { authorization: "Bearer token" },
      payload: { firstName: "Updated" },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.firstName).toBe("Updated");
  });

  it("applies isActive default when body is empty (schema has default)", async () => {
    setupAuthUser();
    seedSchool();
    seedTeacher("teach_1");

    // {} parses to { isActive: true } due to schema default, so it updates
    const res = await server.inject({
      method: "PATCH",
      url: "/teachers/teach_1",
      headers: { authorization: "Bearer token" },
      payload: {},
    });

    expect(res.statusCode).toBe(200);
  });

  it("rejects Teacher role", async () => {
    setupAuthUser("Teacher");
    seedSchool();
    seedTeacher("teach_1");

    const res = await server.inject({
      method: "PATCH",
      url: "/teachers/teach_1",
      headers: { authorization: "Bearer token" },
      payload: { firstName: "Updated" },
    });

    expect(res.statusCode).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// DELETE /teachers/:id
// ---------------------------------------------------------------------------

describe("DELETE /teachers/:id", () => {
  it("soft-deletes a teacher", async () => {
    setupAuthUser();
    seedSchool();
    seedTeacher("teach_1");

    const res = await server.inject({
      method: "DELETE",
      url: "/teachers/teach_1",
      headers: { authorization: "Bearer token" },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);

    const teacher = mockState.teachers.get("teach_1");
    expect(teacher?.isDeleted).toBe(true);
  });

  it("returns 404 for non-existent teacher", async () => {
    setupAuthUser();
    seedSchool();

    const res = await server.inject({
      method: "DELETE",
      url: "/teachers/nonexistent",
      headers: { authorization: "Bearer token" },
    });

    expect(res.statusCode).toBe(404);
  });

  it("rejects Teacher role", async () => {
    setupAuthUser("Teacher");
    seedSchool();
    seedTeacher("teach_1");

    const res = await server.inject({
      method: "DELETE",
      url: "/teachers/teach_1",
      headers: { authorization: "Bearer token" },
    });

    expect(res.statusCode).toBe(403);
  });
});
