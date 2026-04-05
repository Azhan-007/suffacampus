/**
 * Integration tests for class routes.
 *
 * Tests: POST /classes, GET /classes, GET /classes/all, GET /classes/:id,
 *        PATCH /classes/:id, DELETE /classes/:id,
 *        POST /classes/:id/sections, DELETE /classes/:id/sections/:sectionId
 */

import Fastify, { type FastifyInstance } from "fastify";
import classRoutes from "../../src/routes/v1/classes";
import {
  auth,
  resetFirestoreMock,
  seedDoc,
} from "../__mocks__/firebase-admin";
import { AppError } from "../../src/errors";

const mockState = {
  classes: new Map<string, any>(),
  sections: new Map<string, any>(),
  classCounter: 1,
  sectionCounter: 1,
};

jest.mock("../../src/middleware/subscription", () => ({
  enforceSubscription: async () => undefined,
}));

jest.mock("../../src/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: jest.fn(async () => null),
    },
    class: {
      create: jest.fn(async ({ data, include }) => {
        const id = `cls_${mockState.classCounter++}`;
        const classRecord = {
          id,
          schoolId: data.schoolId,
          className: data.className,
          grade: data.grade,
          capacity: data.capacity,
          isActive: data.isActive ?? true,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        mockState.classes.set(id, classRecord);

        const sections = (data.sections?.create ?? []).map((section: any) => {
          const sectionId = `sec_${mockState.sectionCounter++}`;
          const row = { id: sectionId, classId: id, ...section };
          mockState.sections.set(sectionId, row);
          return row;
        });

        return include?.sections ? { ...classRecord, sections } : classRecord;
      }),
      findMany: jest.fn(async ({ where, include, orderBy, take }) => {
        let records = [...mockState.classes.values()].filter((c) => {
          if (where?.schoolId && c.schoolId !== where.schoolId) return false;
          if (typeof where?.isActive !== "undefined" && c.isActive !== where.isActive) return false;
          return true;
        });

        if (orderBy?.grade === "asc") {
          records = records.sort((a, b) => a.grade - b.grade);
        }

        if (typeof take === "number") {
          records = records.slice(0, take);
        }

        if (!include?.sections) return records;
        return records.map((c) => ({
          ...c,
          sections: [...mockState.sections.values()].filter((s) => s.classId === c.id),
        }));
      }),
      findUnique: jest.fn(async ({ where: { id }, include }) => {
        const classRecord = mockState.classes.get(id);
        if (!classRecord) return null;
        if (!include?.sections) return classRecord;
        return {
          ...classRecord,
          sections: [...mockState.sections.values()].filter((s) => s.classId === id),
        };
      }),
      update: jest.fn(async ({ where: { id }, data, include }) => {
        const existing = mockState.classes.get(id);
        if (!existing) throw new Error("Class not found");
        const updated = { ...existing, ...data, updatedAt: new Date() };
        mockState.classes.set(id, updated);
        if (!include?.sections) return updated;
        return {
          ...updated,
          sections: [...mockState.sections.values()].filter((s) => s.classId === id),
        };
      }),
    },
    section: {
      create: jest.fn(async ({ data }) => {
        const sectionId = `sec_${mockState.sectionCounter++}`;
        const section = { id: sectionId, ...data };
        mockState.sections.set(sectionId, section);
        return section;
      }),
      findUnique: jest.fn(async ({ where: { id } }) => mockState.sections.get(id) ?? null),
      delete: jest.fn(async ({ where: { id } }) => {
        const section = mockState.sections.get(id);
        mockState.sections.delete(id);
        return section;
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

function seedSchool(schoolId = "school_1", overrides: Record<string, unknown> = {}) {
  seedDoc("schools", schoolId, {
    name: "Test School",
    subscriptionPlan: "Pro",
    subscriptionStatus: "active",
    limits: { students: 500, maxStudents: 500, maxTeachers: 50, maxClasses: 20 },
    ...overrides,
  });
}

function validClassPayload(overrides: Record<string, unknown> = {}) {
  return {
    className: "Class 10",
    grade: 10,
    sections: [{ sectionName: "A", capacity: 40 }],
    capacity: 40,
    ...overrides,
  };
}

function seedClass(id: string, schoolId = "school_1", overrides: Record<string, unknown> = {}) {
  mockState.classes.set(id, {
    id,
    schoolId,
    className: "Class 10",
    grade: 10,
    capacity: 40,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });

  const sectionId = overrides.sections && Array.isArray(overrides.sections)
    ? (overrides.sections[0] as any).id ?? `sec_${mockState.sectionCounter++}`
    : `sec_${mockState.sectionCounter++}`;
  mockState.sections.set(sectionId, {
    id: sectionId,
    classId: id,
    sectionName: "A",
    capacity: 40,
  });
}

beforeEach(async () => {
  resetFirestoreMock();
  mockState.classes.clear();
  mockState.sections.clear();
  mockState.classCounter = 1;
  mockState.sectionCounter = 1;
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
  await server.register(classRoutes, { prefix: "/" });
  await server.ready();
});

afterEach(async () => { await server.close(); });

// ---------------------------------------------------------------------------
// POST /classes
// ---------------------------------------------------------------------------
describe("POST /classes", () => {
  it("creates a class and returns 201", async () => {
    setupAuthUser();
    seedSchool();

    const res = await server.inject({
      method: "POST", url: "/classes",
      headers: { authorization: "Bearer token" },
      payload: validClassPayload(),
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data).toHaveProperty("id");
    expect(body.data.className).toBe("Class 10");
    expect(body.data.grade).toBe(10);
  });

  it("returns 400 for missing required fields", async () => {
    setupAuthUser();
    seedSchool();

    const res = await server.inject({
      method: "POST", url: "/classes",
      headers: { authorization: "Bearer token" },
      payload: { className: "Class 10" },
    });

    expect(res.statusCode).toBe(400);
  });

  it("returns 401 when unauthenticated", async () => {
    const res = await server.inject({ method: "POST", url: "/classes", payload: validClassPayload() });
    expect(res.statusCode).toBe(401);
  });

  it("rejects Teacher role", async () => {
    setupAuthUser("Teacher");
    seedSchool();

    const res = await server.inject({
      method: "POST", url: "/classes",
      headers: { authorization: "Bearer token" },
      payload: validClassPayload(),
    });

    expect(res.statusCode).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// GET /classes
// ---------------------------------------------------------------------------
describe("GET /classes", () => {
  it("returns a paginated list", async () => {
    setupAuthUser();
    seedSchool();
    seedClass("cls_1");
    seedClass("cls_2", "school_1", { className: "Class 9", grade: 9 });

    const res = await server.inject({
      method: "GET", url: "/classes",
      headers: { authorization: "Bearer token" },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBe(2);
  });

  it("does not return classes from another school", async () => {
    setupAuthUser();
    seedSchool();
    seedClass("cls_other", "school_2");

    const res = await server.inject({
      method: "GET", url: "/classes",
      headers: { authorization: "Bearer token" },
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).data.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// GET /classes/all
// ---------------------------------------------------------------------------
describe("GET /classes/all", () => {
  it("returns all classes unpaginated", async () => {
    setupAuthUser();
    seedSchool();
    seedClass("cls_1");

    const res = await server.inject({
      method: "GET", url: "/classes/all",
      headers: { authorization: "Bearer token" },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// GET /classes/:id
// ---------------------------------------------------------------------------
describe("GET /classes/:id", () => {
  it("returns a single class", async () => {
    setupAuthUser();
    seedSchool();
    seedClass("cls_1");

    const res = await server.inject({
      method: "GET", url: "/classes/cls_1",
      headers: { authorization: "Bearer token" },
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).data.id).toBe("cls_1");
  });

  it("returns 404 for non-existent class", async () => {
    setupAuthUser();
    seedSchool();

    const res = await server.inject({
      method: "GET", url: "/classes/nonexistent",
      headers: { authorization: "Bearer token" },
    });

    expect(res.statusCode).toBe(404);
  });

  it("returns 404 for class in different school", async () => {
    setupAuthUser();
    seedSchool();
    seedClass("cls_other", "school_2");

    const res = await server.inject({
      method: "GET", url: "/classes/cls_other",
      headers: { authorization: "Bearer token" },
    });

    expect(res.statusCode).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// PATCH /classes/:id
// ---------------------------------------------------------------------------
describe("PATCH /classes/:id", () => {
  it("updates class fields", async () => {
    setupAuthUser();
    seedSchool();
    seedClass("cls_1");

    const res = await server.inject({
      method: "PATCH", url: "/classes/cls_1",
      headers: { authorization: "Bearer token" },
      payload: { className: "Updated Class" },
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).data.className).toBe("Updated Class");
  });

  it("rejects Teacher role", async () => {
    setupAuthUser("Teacher");
    seedSchool();
    seedClass("cls_1");

    const res = await server.inject({
      method: "PATCH", url: "/classes/cls_1",
      headers: { authorization: "Bearer token" },
      payload: { className: "Updated" },
    });

    expect(res.statusCode).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// DELETE /classes/:id
// ---------------------------------------------------------------------------
describe("DELETE /classes/:id", () => {
  it("soft-deletes a class", async () => {
    setupAuthUser();
    seedSchool();
    seedClass("cls_1");

    const res = await server.inject({
      method: "DELETE", url: "/classes/cls_1",
      headers: { authorization: "Bearer token" },
    });

    expect(res.statusCode).toBe(200);
    const classDoc = mockState.classes.get("cls_1");
    expect(classDoc?.isActive).toBe(false);
  });

  it("returns 404 for non-existent class", async () => {
    setupAuthUser();
    seedSchool();

    const res = await server.inject({
      method: "DELETE", url: "/classes/nonexistent",
      headers: { authorization: "Bearer token" },
    });

    expect(res.statusCode).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// POST /classes/:id/sections
// ---------------------------------------------------------------------------
describe("POST /classes/:id/sections", () => {
  it("adds a section to an existing class", async () => {
    setupAuthUser();
    seedSchool();
    seedClass("cls_1");

    const res = await server.inject({
      method: "POST", url: "/classes/cls_1/sections",
      headers: { authorization: "Bearer token" },
      payload: { sectionName: "B", capacity: 35 },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
  });

  it("returns 400 for missing sectionName", async () => {
    setupAuthUser();
    seedSchool();
    seedClass("cls_1");

    const res = await server.inject({
      method: "POST", url: "/classes/cls_1/sections",
      headers: { authorization: "Bearer token" },
      payload: { capacity: 35 },
    });

    expect(res.statusCode).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// DELETE /classes/:id/sections/:sectionId
// ---------------------------------------------------------------------------
describe("DELETE /classes/:id/sections/:sectionId", () => {
  it("removes a section from a class", async () => {
    setupAuthUser();
    seedSchool();
    seedClass("cls_1");

    const res = await server.inject({
      method: "DELETE", url: "/classes/cls_1/sections/sec_1",
      headers: { authorization: "Bearer token" },
    });

    expect(res.statusCode).toBe(200);
  });
});
