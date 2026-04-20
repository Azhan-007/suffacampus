/**
 * Integration tests for admin routes (SuperAdmin only).
 *
 * Tests: POST /admin/schools, GET /admin/schools, GET /admin/stats,
 *        GET /admin/schools/:id, PATCH /admin/schools/:id,
 *        DELETE /admin/schools/:id, PATCH /admin/schools/:id/plan
 */

import Fastify, { type FastifyInstance } from "fastify";
import adminRoutes from "../../src/routes/v1/admin";
import {
  auth,
  resetFirestoreMock,
  seedDoc,
} from "../__mocks__/firebase-admin";
import { AppError } from "../../src/errors";

const mockState = {
  schools: new Map<string, any>(),
  schoolCounter: 1,
};

jest.mock("../../src/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: jest.fn(async () => null),
      create: jest.fn(async ({ data }) => ({ id: data.uid, ...data })),
    },
    school: {
      findUnique: jest.fn(async ({ where }) => {
        if (where.id) return mockState.schools.get(where.id) ?? null;
        if (where.code) {
          return [...mockState.schools.values()].find((s) => s.code === where.code) ?? null;
        }
        return null;
      }),
      create: jest.fn(async ({ data }) => {
        const id = data.id ?? `school_${mockState.schoolCounter++}`;
        const now = new Date();
        const school = {
          id,
          currentStudents: 0,
          currentTeachers: 0,
          createdAt: now,
          updatedAt: now,
          ...data,
        };
        mockState.schools.set(id, school);
        return school;
      }),
      findMany: jest.fn(async ({ where, take }) => {
        const records = [...mockState.schools.values()].filter((s) => {
          if (typeof where?.isActive !== "undefined" && s.isActive !== where.isActive) return false;
          if (where?.subscriptionStatus && s.subscriptionStatus !== where.subscriptionStatus) return false;
          if (where?.subscriptionPlan && s.subscriptionPlan !== where.subscriptionPlan) return false;
          return true;
        });
        const sorted = records.sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
        return typeof take === "number" ? sorted.slice(0, take) : sorted;
      }),
      update: jest.fn(async ({ where: { id }, data }) => {
        const existing = mockState.schools.get(id);
        if (!existing) throw new Error("School not found");
        const updated = { ...existing, ...data, updatedAt: new Date() };
        mockState.schools.set(id, updated);
        return updated;
      }),
      count: jest.fn(async ({ where } = {} as any) => {
        const rows = [...mockState.schools.values()].filter((s) => {
          if (!where) return true;
          if (typeof where.isActive !== "undefined" && s.isActive !== where.isActive) return false;
          if (where.subscriptionStatus && s.subscriptionStatus !== where.subscriptionStatus) return false;
          return true;
        });
        return rows.length;
      }),
      groupBy: jest.fn(async () => {
        const counts = new Map<string, number>();
        for (const school of mockState.schools.values()) {
          const plan = String(school.subscriptionPlan ?? "free");
          counts.set(plan, (counts.get(plan) ?? 0) + 1);
        }
        return [...counts.entries()].map(([subscriptionPlan, count]) => ({
          subscriptionPlan,
          _count: count,
        }));
      }),
      aggregate: jest.fn(async () => {
        let currentStudents = 0;
        let currentTeachers = 0;
        for (const school of mockState.schools.values()) {
          currentStudents += Number(school.currentStudents ?? 0);
          currentTeachers += Number(school.currentTeachers ?? 0);
        }
        return { _sum: { currentStudents, currentTeachers } };
      }),
    },
    subscription: {
      create: jest.fn(async ({ data }) => ({
        id: `sub_${Date.now()}`,
        createdAt: new Date(),
        updatedAt: new Date(),
        ...data,
      })),
    },
    schoolConfig: {
      create: jest.fn(async ({ data }) => ({
        id: `cfg_${Date.now()}`,
        createdAt: new Date(),
        updatedAt: new Date(),
        ...data,
      })),
    },
    $transaction: jest.fn(async (arg: unknown) => {
      if (typeof arg === "function") {
        const tx = {
          school: {
            create: async ({ data }: { data: Record<string, unknown> }) => {
              const id =
                (data.id as string | undefined) ??
                `school_${mockState.schoolCounter++}`;
              const now = new Date();
              const school = {
                id,
                currentStudents: 0,
                currentTeachers: 0,
                createdAt: now,
                updatedAt: now,
                ...data,
              };
              mockState.schools.set(id, school);
              return school;
            },
          },
          subscription: {
            create: async ({ data }: { data: Record<string, unknown> }) => ({
              id: `sub_${Date.now()}`,
              createdAt: new Date(),
              updatedAt: new Date(),
              ...data,
            }),
          },
          schoolConfig: {
            create: async ({ data }: { data: Record<string, unknown> }) => ({
              id: `cfg_${Date.now()}`,
              createdAt: new Date(),
              updatedAt: new Date(),
              ...data,
            }),
          },
        };

        return (arg as (input: typeof tx) => Promise<unknown>)(tx);
      }

      if (Array.isArray(arg)) {
        return Promise.all(arg as Array<Promise<unknown>>);
      }

      return arg;
    }),
  },
}));

jest.mock("../../src/services/audit.service", () => ({
  writeAuditLog: jest.fn().mockResolvedValue(undefined),
}));

let server: FastifyInstance;
const mockVerifyIdToken = auth.verifyIdToken as jest.Mock;
const mockCreateUser = auth.createUser as jest.Mock;
const mockSetCustomUserClaims = auth.setCustomUserClaims as jest.Mock;

function setupAuthUser(role = "SuperAdmin") {
  mockVerifyIdToken.mockResolvedValueOnce({ uid: "super_1", email: "super@platform.com" });
  seedDoc("users", "super_1", {
    uid: "super_1", email: "super@platform.com", role,
    schoolId: "platform", status: "active",
  });
}

function seedSchool(id: string, overrides: Record<string, unknown> = {}) {
  mockState.schools.set(id, {
    id, name: `School ${id}`, code: `CODE${id}`,
    city: "Mumbai",
    email: `${id}@school.com`,
    subscriptionPlan: "pro", subscriptionStatus: "active",
    isActive: true,
    maxStudents: 500,
    maxTeachers: 50,
    maxStorage: 5,
    currentStudents: 0,
    currentTeachers: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });
}

function validSchoolPayload(overrides: Record<string, unknown> = {}) {
  return {
    name: "New School",
    code: "NEWSC001",
    email: "admin@newschool.com",
    phone: "+911234567890",
    city: "Mumbai",
    subscriptionPlan: "basic",
    ...overrides,
  };
}

beforeEach(async () => {
  resetFirestoreMock();
  mockState.schools.clear();
  mockState.schoolCounter = 1;
  mockVerifyIdToken.mockReset();
  mockCreateUser.mockReset();
  mockSetCustomUserClaims.mockReset();
  mockCreateUser.mockResolvedValue({ uid: "admin_uid" });
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
  await server.register(adminRoutes, { prefix: "/" });
  await server.ready();
});

afterEach(async () => { await server.close(); });

// ---------------------------------------------------------------------------
// POST /admin/schools
// ---------------------------------------------------------------------------
describe("POST /admin/schools", () => {
  it("creates a school and returns 201", async () => {
    setupAuthUser();
    const res = await server.inject({
      method: "POST", url: "/admin/schools",
      headers: { authorization: "Bearer token" },
      payload: validSchoolPayload(),
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data).toHaveProperty("id");
    expect(body.data.name).toBe("New School");
  });

  it("accepts UI payload with bare website + admin fields", async () => {
    setupAuthUser();
    const res = await server.inject({
      method: "POST", url: "/admin/schools",
      headers: { authorization: "Bearer token" },
      payload: validSchoolPayload({
        website: "mps.com",
        principalName: "Wasiullah",
        adminEmail: "wasi@SuffaCampus.com",
        adminPassword: "wasi@SuffaCampus",
        adminDisplayName: "Wasiullah",
        subscriptionStatus: "active",
        maxStudents: 200,
        maxTeachers: 20,
        maxStorage: 500,
        subscriptionStartDate: new Date().toISOString(),
        subscriptionEndDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        isActive: true,
        createdBy: "superadmin",
      }),
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.website).toBe("https://mps.com");
  });

  it("reports admin provisioning failure details when Firebase user creation fails", async () => {
    setupAuthUser();
    const firebaseError = Object.assign(new Error("The email address is already in use"), {
      code: "auth/email-already-exists",
    });
    mockCreateUser.mockRejectedValueOnce(firebaseError);

    const res = await server.inject({
      method: "POST", url: "/admin/schools",
      headers: { authorization: "Bearer token" },
      payload: validSchoolPayload({
        adminEmail: "existing-admin@newschool.com",
        adminPassword: "StrongPass123",
      }),
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.adminCredentials).toBeUndefined();
    expect(body.data.adminProvisioning).toMatchObject({
      requested: true,
      status: "failed",
      email: "existing-admin@newschool.com",
      errorCode: "auth/email-already-exists",
    });
    expect(typeof body.data.adminProvisioning.errorMessage).toBe("string");
  });

  it("returns 400 for missing required fields", async () => {
    setupAuthUser();
    const res = await server.inject({
      method: "POST", url: "/admin/schools",
      headers: { authorization: "Bearer token" },
      payload: { name: "No Code" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("returns 401 when unauthenticated", async () => {
    const res = await server.inject({
      method: "POST", url: "/admin/schools",
      payload: validSchoolPayload(),
    });
    expect(res.statusCode).toBe(401);
  });

  it("rejects Admin role (SuperAdmin only)", async () => {
    setupAuthUser("Admin");
    const res = await server.inject({
      method: "POST", url: "/admin/schools",
      headers: { authorization: "Bearer token" },
      payload: validSchoolPayload(),
    });
    expect(res.statusCode).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// GET /admin/schools
// ---------------------------------------------------------------------------
describe("GET /admin/schools", () => {
  it("returns a paginated list of schools", async () => {
    setupAuthUser();
    seedSchool("s1");
    seedSchool("s2");
    const res = await server.inject({
      method: "GET", url: "/admin/schools",
      headers: { authorization: "Bearer token" },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBeGreaterThanOrEqual(2);
  });

  it("rejects Teacher role", async () => {
    setupAuthUser("Teacher");
    const res = await server.inject({
      method: "GET", url: "/admin/schools",
      headers: { authorization: "Bearer token" },
    });
    expect(res.statusCode).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// GET /admin/stats
// ---------------------------------------------------------------------------
describe("GET /admin/stats", () => {
  it("returns platform-wide statistics", async () => {
    setupAuthUser();
    seedSchool("s1", { subscriptionStatus: "active" });
    seedSchool("s2", { subscriptionStatus: "trial" });
    const res = await server.inject({
      method: "GET", url: "/admin/stats",
      headers: { authorization: "Bearer token" },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data).toHaveProperty("totalSchools");
  });
});

// ---------------------------------------------------------------------------
// GET /admin/schools/:id
// ---------------------------------------------------------------------------
describe("GET /admin/schools/:id", () => {
  it("returns a single school", async () => {
    setupAuthUser();
    seedSchool("s1");
    const res = await server.inject({
      method: "GET", url: "/admin/schools/s1",
      headers: { authorization: "Bearer token" },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).data.id).toBe("s1");
  });

  it("returns 404 for non-existent school", async () => {
    setupAuthUser();
    const res = await server.inject({
      method: "GET", url: "/admin/schools/nonexistent",
      headers: { authorization: "Bearer token" },
    });
    expect(res.statusCode).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// PATCH /admin/schools/:id
// ---------------------------------------------------------------------------
describe("PATCH /admin/schools/:id", () => {
  it("updates school fields", async () => {
    setupAuthUser();
    seedSchool("s1");
    const res = await server.inject({
      method: "PATCH", url: "/admin/schools/s1",
      headers: { authorization: "Bearer token" },
      payload: { name: "Updated School" },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).data.name).toBe("Updated School");
  });

  it("accepts empty body (defaults apply from schema)", async () => {
    setupAuthUser();
    seedSchool("s1");
    const res = await server.inject({
      method: "PATCH", url: "/admin/schools/s1",
      headers: { authorization: "Bearer token" },
      payload: {},
    });
    expect(res.statusCode).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// DELETE /admin/schools/:id
// ---------------------------------------------------------------------------
describe("DELETE /admin/schools/:id", () => {
  it("soft-deletes a school", async () => {
    setupAuthUser();
    seedSchool("s1");
    const res = await server.inject({
      method: "DELETE", url: "/admin/schools/s1",
      headers: { authorization: "Bearer token" },
    });
    expect(res.statusCode).toBe(200);
    const school = mockState.schools.get("s1");
    expect(school?.isActive).toBe(false);
  });

  it("returns 404 for non-existent school", async () => {
    setupAuthUser();
    const res = await server.inject({
      method: "DELETE", url: "/admin/schools/nonexistent",
      headers: { authorization: "Bearer token" },
    });
    expect(res.statusCode).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// PATCH /admin/schools/:id/plan
// ---------------------------------------------------------------------------
describe("PATCH /admin/schools/:id/plan", () => {
  it("changes subscription plan", async () => {
    setupAuthUser();
    seedSchool("s1");
    const res = await server.inject({
      method: "PATCH", url: "/admin/schools/s1/plan",
      headers: { authorization: "Bearer token" },
      payload: {
        plan: "enterprise",
        maxStudents: 1000,
        maxTeachers: 100,
        maxStorage: 50,
      },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.subscriptionPlan).toBe("enterprise");
  });

  it("returns 400 for invalid plan", async () => {
    setupAuthUser();
    seedSchool("s1");
    const res = await server.inject({
      method: "PATCH", url: "/admin/schools/s1/plan",
      headers: { authorization: "Bearer token" },
      payload: { plan: "diamond", maxStudents: 10, maxTeachers: 5, maxStorage: 1 },
    });
    expect(res.statusCode).toBe(400);
  });

  it("returns 400 for missing fields", async () => {
    setupAuthUser();
    seedSchool("s1");
    const res = await server.inject({
      method: "PATCH", url: "/admin/schools/s1/plan",
      headers: { authorization: "Bearer token" },
      payload: { plan: "pro" },
    });
    expect(res.statusCode).toBe(400);
  });
});

