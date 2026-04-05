/**
 * Integration tests for user routes.
 *
 * Tests: POST /users, GET /users, GET /users/:id, PATCH /users/:id, DELETE /users/:id
 */

import Fastify, { type FastifyInstance } from "fastify";
import userRoutes from "../../src/routes/v1/users";
import {
  auth,
  resetFirestoreMock,
  seedDoc,
} from "../__mocks__/firebase-admin";
import { AppError } from "../../src/errors";

const mockState = {
  users: new Map<string, any>(),
};

jest.mock("../../src/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: jest.fn(async ({ where: { uid } }) => mockState.users.get(uid) ?? null),
      create: jest.fn(async ({ data }) => {
        const row = {
          id: `usr_${mockState.users.size + 1}`,
          createdAt: new Date(),
          updatedAt: new Date(),
          ...data,
        };
        mockState.users.set(data.uid, row);
        return row;
      }),
      findMany: jest.fn(async ({ where, orderBy, take }) => {
        let rows = [...mockState.users.values()].filter((row) => {
          if (where?.schoolId && row.schoolId !== where.schoolId) return false;
          if (where?.role && row.role !== where.role) return false;
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
      update: jest.fn(async ({ where: { uid }, data }) => {
        const existing = mockState.users.get(uid);
        if (!existing) throw new Error("User not found");
        const updated = { ...existing, ...data, updatedAt: new Date() };
        mockState.users.set(uid, updated);
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
const mockCreateUser = auth.createUser as jest.Mock;
const mockUpdateUser = auth.updateUser as jest.Mock;
const mockSetCustomUserClaims = auth.setCustomUserClaims as jest.Mock;

function setupAuthUser(role = "Admin", schoolId = "school_1") {
  mockVerifyIdToken.mockResolvedValueOnce({ uid: "user_1", email: "admin@school.com" });
  seedDoc("users", "user_1", { uid: "user_1", email: "admin@school.com", role, schoolId, status: "active" });
  mockState.users.set("user_1", {
    id: "usr_1",
    uid: "user_1",
    email: "admin@school.com",
    displayName: "Admin User",
    role,
    schoolId,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

function seedSchool(schoolId = "school_1") {
  seedDoc("schools", schoolId, {
    name: "Test School", subscriptionPlan: "Pro", subscriptionStatus: "active",
    limits: { students: 500, maxStudents: 500, maxTeachers: 50, maxClasses: 20 },
  });
}

function validCreatePayload(overrides: Record<string, unknown> = {}) {
  return {
    email: "newuser@school.com",
    password: "SecurePass1",
    displayName: "New User",
    role: "Teacher",
    ...overrides,
  };
}

function seedUser(id: string, schoolId = "school_1", overrides: Record<string, unknown> = {}) {
  mockState.users.set(id, {
    uid: id, email: `${id}@school.com`, displayName: "Existing User",
    role: "Teacher", schoolId, isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });
}

beforeEach(async () => {
  resetFirestoreMock();
  mockState.users.clear();
  mockVerifyIdToken.mockReset();
  mockCreateUser.mockReset();
  mockUpdateUser.mockReset();
  mockSetCustomUserClaims.mockReset();
  // Default: createUser returns a user record with a uid
  mockCreateUser.mockResolvedValue({ uid: "new_user_uid" });
  mockUpdateUser.mockResolvedValue(undefined);
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
  await server.register(userRoutes, { prefix: "/" });
  await server.ready();
});

afterEach(async () => { await server.close(); });

// ---------------------------------------------------------------------------
// POST /users
// ---------------------------------------------------------------------------
describe("POST /users", () => {
  it("creates a user and returns 201", async () => {
    setupAuthUser();
    seedSchool();
    const res = await server.inject({
      method: "POST", url: "/users",
      headers: { authorization: "Bearer token" },
      payload: validCreatePayload(),
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data).toHaveProperty("uid");
    expect(body.data.email).toBe("newuser@school.com");
    expect(body.data.role).toBe("Teacher");
  });

  it("returns 400 for missing email", async () => {
    setupAuthUser();
    seedSchool();
    const res = await server.inject({
      method: "POST", url: "/users",
      headers: { authorization: "Bearer token" },
      payload: validCreatePayload({ email: undefined }),
    });
    expect(res.statusCode).toBe(400);
  });

  it("returns 400 for invalid email format", async () => {
    setupAuthUser();
    seedSchool();
    const res = await server.inject({
      method: "POST", url: "/users",
      headers: { authorization: "Bearer token" },
      payload: validCreatePayload({ email: "not-an-email" }),
    });
    expect(res.statusCode).toBe(400);
  });

  it("returns 400 for short password", async () => {
    setupAuthUser();
    seedSchool();
    const res = await server.inject({
      method: "POST", url: "/users",
      headers: { authorization: "Bearer token" },
      payload: validCreatePayload({ password: "short" }),
    });
    expect(res.statusCode).toBe(400);
  });

  it("returns 400 for invalid role", async () => {
    setupAuthUser();
    seedSchool();
    const res = await server.inject({
      method: "POST", url: "/users",
      headers: { authorization: "Bearer token" },
      payload: validCreatePayload({ role: "Student" }),
    });
    expect(res.statusCode).toBe(400);
  });

  it("returns 401 when unauthenticated", async () => {
    const res = await server.inject({
      method: "POST", url: "/users",
      payload: validCreatePayload(),
    });
    expect(res.statusCode).toBe(401);
  });

  it("rejects Teacher role", async () => {
    setupAuthUser("Teacher");
    seedSchool();
    const res = await server.inject({
      method: "POST", url: "/users",
      headers: { authorization: "Bearer token" },
      payload: validCreatePayload(),
    });
    expect(res.statusCode).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// GET /users
// ---------------------------------------------------------------------------
describe("GET /users", () => {
  it("returns a paginated list of users", async () => {
    setupAuthUser();
    seedSchool();
    seedUser("u2");
    seedUser("u3", "school_1", { role: "Staff" });
    const res = await server.inject({
      method: "GET", url: "/users",
      headers: { authorization: "Bearer token" },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(Array.isArray(body.data)).toBe(true);
    // user_1 (admin) + u2 + u3 = 3 users
    expect(body.data.length).toBe(3);
  });

  it("does not return users from another school", async () => {
    setupAuthUser();
    seedSchool();
    seedUser("u_other", "school_2");
    const res = await server.inject({
      method: "GET", url: "/users",
      headers: { authorization: "Bearer token" },
    });
    // Only user_1 from school_1
    const body = JSON.parse(res.body);
    expect(body.data.every((u: any) => u.schoolId === "school_1")).toBe(true);
  });

  it("filters by role", async () => {
    setupAuthUser();
    seedSchool();
    seedUser("u2", "school_1", { role: "Teacher" });
    seedUser("u3", "school_1", { role: "Staff" });
    const res = await server.inject({
      method: "GET", url: "/users?role=Staff",
      headers: { authorization: "Bearer token" },
    });
    const body = JSON.parse(res.body);
    expect(body.data.every((u: any) => u.role === "Staff")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// GET /users/:id
// ---------------------------------------------------------------------------
describe("GET /users/:id", () => {
  it("returns a single user", async () => {
    setupAuthUser();
    seedSchool();
    seedUser("u2");
    const res = await server.inject({
      method: "GET", url: "/users/u2",
      headers: { authorization: "Bearer token" },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).data.uid).toBe("u2");
  });

  it("returns 404 for non-existent user", async () => {
    setupAuthUser();
    seedSchool();
    const res = await server.inject({
      method: "GET", url: "/users/nonexistent",
      headers: { authorization: "Bearer token" },
    });
    expect(res.statusCode).toBe(404);
  });

  it("returns 404 for user in different school", async () => {
    setupAuthUser();
    seedSchool();
    seedUser("u_other", "school_2");
    const res = await server.inject({
      method: "GET", url: "/users/u_other",
      headers: { authorization: "Bearer token" },
    });
    expect(res.statusCode).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// PATCH /users/:id
// ---------------------------------------------------------------------------
describe("PATCH /users/:id", () => {
  it("updates user fields", async () => {
    setupAuthUser();
    seedSchool();
    seedUser("u2");
    const res = await server.inject({
      method: "PATCH", url: "/users/u2",
      headers: { authorization: "Bearer token" },
      payload: { displayName: "Updated Name" },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).data.displayName).toBe("Updated Name");
  });

  it("returns 400 for empty update body", async () => {
    setupAuthUser();
    seedSchool();
    seedUser("u2");
    const res = await server.inject({
      method: "PATCH", url: "/users/u2",
      headers: { authorization: "Bearer token" },
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });

  it("rejects Teacher role", async () => {
    setupAuthUser("Teacher");
    seedSchool();
    seedUser("u2");
    const res = await server.inject({
      method: "PATCH", url: "/users/u2",
      headers: { authorization: "Bearer token" },
      payload: { displayName: "X" },
    });
    expect(res.statusCode).toBe(403);
  });

  it("returns 404 for user in different school (tenant mismatch)", async () => {
    setupAuthUser();
    seedSchool();
    seedUser("u_other", "school_2");
    const res = await server.inject({
      method: "PATCH", url: "/users/u_other",
      headers: { authorization: "Bearer token" },
      payload: { displayName: "Hacked" },
    });
    // Service throws tenantMismatch (403) or notFound
    expect([403, 404]).toContain(res.statusCode);
  });
});

// ---------------------------------------------------------------------------
// DELETE /users/:id
// ---------------------------------------------------------------------------
describe("DELETE /users/:id", () => {
  it("deactivates a user", async () => {
    setupAuthUser();
    seedSchool();
    seedUser("u2");
    const res = await server.inject({
      method: "DELETE", url: "/users/u2",
      headers: { authorization: "Bearer token" },
    });
    expect(res.statusCode).toBe(200);
    const doc = mockState.users.get("u2");
    expect(doc?.isActive).toBe(false);
  });

  it("returns 404 for non-existent user", async () => {
    setupAuthUser();
    seedSchool();
    const res = await server.inject({
      method: "DELETE", url: "/users/nonexistent",
      headers: { authorization: "Bearer token" },
    });
    expect(res.statusCode).toBe(404);
  });

  it("rejects Teacher role", async () => {
    setupAuthUser("Teacher");
    seedSchool();
    seedUser("u2");
    const res = await server.inject({
      method: "DELETE", url: "/users/u2",
      headers: { authorization: "Bearer token" },
    });
    expect(res.statusCode).toBe(403);
  });
});
