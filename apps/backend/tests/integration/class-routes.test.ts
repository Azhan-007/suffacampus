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
    school: {
      findUnique: jest.fn(async ({ where: { id }, select }) => {
        if (!id) return null;
        const school = {
          id,
          subscriptionPlan: "free",
          maxStudents: 200,
          maxTeachers: 20,
        };
        if (!select) return school;
        const selected: Record<string, unknown> = {};
        for (const key of Object.keys(select)) {
          if (select[key]) selected[key] = school[key as keyof typeof school];
        }
        return selected;
      }),
    },
    class: {
      count: jest.fn(async ({ where }) =>
        [...mockState.classes.values()].filter((c) => {
          if (where?.schoolId && c.schoolId !== where.schoolId) return false;
          if (typeof where?.isActive !== "undefined" && c.isActive !== where.isActive) return false;
          return true;
        }).length
      ),
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
      update: jest.fn(async ({ where: { id }, data }) => {
        const existing = mockState.sections.get(id);
        if (!existing) throw new Error("Section not found");
        const updated = { ...existing, ...data };
        mockState.sections.set(id, updated);
        return updated;
      }),
      findUnique: jest.fn(async ({ where: { id } }) => mockState.sections.get(id) ?? null),
      findFirst: jest.fn(async ({ where }) => {
        return (
          [...mockState.sections.values()].find((section) => {
            if (where?.id && section.id !== where.id) return false;
            if (where?.classId && section.classId !== where.classId) return false;
            if (where?.class?.schoolId) {
              const classRecord = mockState.classes.get(section.classId);
              if (!classRecord || classRecord.schoolId !== where.class.schoolId) return false;
            }
            return true;
          }) ?? null
        );
      }),
      delete: jest.fn(async ({ where: { id } }) => {
        const section = mockState.sections.get(id);
        mockState.sections.delete(id);
        return section;
      }),
      deleteMany: jest.fn(async ({ where }) => {
        let count = 0;
        for (const [id, section] of mockState.sections.entries()) {
          const idFilter = where?.id;
          if (typeof idFilter === "string" && section.id !== idFilter) continue;
          if (idFilter?.in && Array.isArray(idFilter.in) && !idFilter.in.includes(section.id)) continue;
          if (where?.classId && section.classId !== where.classId) continue;
          if (where?.class?.schoolId) {
            const classRecord = mockState.classes.get(section.classId);
            if (!classRecord || classRecord.schoolId !== where.class.schoolId) continue;
          }
          mockState.sections.delete(id);
          count += 1;
        }
        return { count };
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
  const sectionOverrides = Array.isArray((overrides as { sections?: unknown }).sections)
    ? ((overrides as { sections?: unknown[] }).sections ?? [])
    : [];
  const { sections: _sections, ...classOverrides } = overrides as Record<string, unknown> & {
    sections?: unknown[];
  };

  mockState.classes.set(id, {
    id,
    schoolId,
    className: "Class 10",
    grade: 10,
    capacity: 40,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...classOverrides,
  });

  const firstSection = (sectionOverrides[0] ?? {}) as Record<string, unknown>;
  const sectionId = typeof firstSection.id === "string"
    ? firstSection.id
    : `sec_${mockState.sectionCounter++}`;

  mockState.sections.set(sectionId, {
    id: sectionId,
    classId: id,
    sectionName: typeof firstSection.sectionName === "string" ? firstSection.sectionName : "A",
    capacity: typeof firstSection.capacity === "number" ? firstSection.capacity : 40,
    studentsCount: typeof firstSection.studentsCount === "number" ? firstSection.studentsCount : 0,
    teacherId: typeof firstSection.teacherId === "string" ? firstSection.teacherId : undefined,
    teacherName: typeof firstSection.teacherName === "string" ? firstSection.teacherName : undefined,
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

  it("accepts legacy string sections payload and normalizes it", async () => {
    setupAuthUser();
    seedSchool();

    const res = await server.inject({
      method: "POST", url: "/classes",
      headers: { authorization: "Bearer token" },
      payload: validClassPayload({ sections: ["A"] }),
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data.sections)).toBe(true);
    expect(body.data.sections[0].sectionName).toBe("A");
    expect(body.data.sections[0].capacity).toBe(40);
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

  it("returns 400 for empty payload", async () => {
    setupAuthUser();
    seedSchool();
    seedClass("cls_1");

    const res = await server.inject({
      method: "PATCH", url: "/classes/cls_1",
      headers: { authorization: "Bearer token" },
      payload: {},
    });

    expect(res.statusCode).toBe(400);
  });

  it("returns 400 when sections array is empty", async () => {
    setupAuthUser();
    seedSchool();
    seedClass("cls_1");

    const res = await server.inject({
      method: "PATCH", url: "/classes/cls_1",
      headers: { authorization: "Bearer token" },
      payload: { sections: [] },
    });

    expect(res.statusCode).toBe(400);
  });

  it("preserves studentsCount when updating existing section by id", async () => {
    setupAuthUser();
    seedSchool();
    seedClass("cls_1", "school_1", {
      sections: [{ id: "sec_keep", sectionName: "A", capacity: 40, studentsCount: 23 }],
    });

    const res = await server.inject({
      method: "PATCH", url: "/classes/cls_1",
      headers: { authorization: "Bearer token" },
      payload: {
        sections: [{ id: "sec_keep", sectionName: "A", capacity: 45 }],
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    const updatedSection = body.data.sections.find((section: { id: string }) => section.id === "sec_keep");
    expect(updatedSection).toBeTruthy();
    expect(updatedSection.capacity).toBe(45);
    expect(updatedSection.studentsCount).toBe(23);
  });

  it("preserves section IDs for existing sections during update", async () => {
    setupAuthUser();
    seedSchool();
    seedClass("cls_1", "school_1", {
      sections: [{ id: "sec_stable", sectionName: "A", capacity: 40, studentsCount: 7 }],
    });

    const res = await server.inject({
      method: "PATCH", url: "/classes/cls_1",
      headers: { authorization: "Bearer token" },
      payload: {
        sections: [{ id: "sec_stable", sectionName: "A", capacity: 40, teacherName: "Ms Rao" }],
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    const updatedSection = body.data.sections.find((section: { id: string }) => section.id === "sec_stable");
    expect(updatedSection).toBeTruthy();
    expect(updatedSection.id).toBe("sec_stable");
    expect(updatedSection.teacherName).toBe("Ms Rao");
    expect(updatedSection.studentsCount).toBe(7);
  });

  it("clears teacher assignment when teacher fields are null", async () => {
    setupAuthUser();
    seedSchool();
    seedClass("cls_1", "school_1", {
      sections: [{
        id: "sec_teacher",
        sectionName: "A",
        capacity: 40,
        studentsCount: 9,
        teacherId: "TCH-100",
        teacherName: "Ms Rao",
      }],
    });

    const res = await server.inject({
      method: "PATCH", url: "/classes/cls_1",
      headers: { authorization: "Bearer token" },
      payload: {
        sections: [{
          id: "sec_teacher",
          sectionName: "A",
          capacity: 40,
          teacherId: null,
          teacherName: null,
        }],
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    const updatedSection = body.data.sections.find((section: { id: string }) => section.id === "sec_teacher");
    expect(updatedSection).toBeTruthy();
    expect(updatedSection.teacherId).toBeNull();
    expect(updatedSection.teacherName).toBeNull();

    const storedSection = mockState.sections.get("sec_teacher");
    expect(storedSection.teacherId).toBeNull();
    expect(storedSection.teacherName).toBeNull();
  });

  it("normalizes empty teacher fields to null", async () => {
    setupAuthUser();
    seedSchool();
    seedClass("cls_1", "school_1", {
      sections: [{
        id: "sec_teacher_empty",
        sectionName: "A",
        capacity: 40,
        studentsCount: 11,
        teacherId: "TCH-101",
        teacherName: "Mr Khan",
      }],
    });

    const res = await server.inject({
      method: "PATCH", url: "/classes/cls_1",
      headers: { authorization: "Bearer token" },
      payload: {
        sections: [{
          id: "sec_teacher_empty",
          sectionName: "A",
          capacity: 40,
          teacherId: "",
          teacherName: "   ",
        }],
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    const updatedSection = body.data.sections.find((section: { id: string }) => section.id === "sec_teacher_empty");
    expect(updatedSection).toBeTruthy();
    expect(updatedSection.teacherId).toBeNull();
    expect(updatedSection.teacherName).toBeNull();

    const storedSection = mockState.sections.get("sec_teacher_empty");
    expect(storedSection.teacherId).toBeNull();
    expect(storedSection.teacherName).toBeNull();
  });

  it("returns 400 when renaming section without id", async () => {
    setupAuthUser();
    seedSchool();
    seedClass("cls_1", "school_1", {
      sections: [{ id: "sec_rename", sectionName: "A", capacity: 40, studentsCount: 12 }],
    });

    const res = await server.inject({
      method: "PATCH", url: "/classes/cls_1",
      headers: { authorization: "Bearer token" },
      payload: {
        sections: [{ sectionName: "A1", capacity: 40 }],
      },
    });

    expect(res.statusCode).toBe(400);
  });

  it("normalizes section payloads with unsupported fields", async () => {
    setupAuthUser();
    seedSchool();
    seedClass("cls_1");

    const res = await server.inject({
      method: "PATCH", url: "/classes/cls_1",
      headers: { authorization: "Bearer token" },
      payload: {
        sections: [
          {
            id: "sec_1",
            sectionName: "B",
            capacity: 35,
            teacherName: "Ms Rao",
            studentsCount: 99,
          },
        ],
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.sections[0].sectionName).toBe("B");
    expect(body.data.sections[0].capacity).toBe(35);
    expect(body.data.sections[0].studentsCount).toBe(0);
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

  it("accepts section payloads with unsupported fields", async () => {
    setupAuthUser();
    seedSchool();
    seedClass("cls_1");

    const res = await server.inject({
      method: "POST", url: "/classes/cls_1/sections",
      headers: { authorization: "Bearer token" },
      payload: { sectionName: "C", capacity: 30, studentsCount: 12 },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.sections.some((section: { sectionName: string }) => section.sectionName === "C")).toBe(true);
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
