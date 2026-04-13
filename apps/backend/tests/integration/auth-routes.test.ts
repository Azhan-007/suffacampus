/**
 * Integration tests for auth routes.
 *
 * Tests: GET /auth/user-by-username, GET /auth/schools,
 *        POST /auth/change-password, GET /auth/me,
 *        POST /auth/login, POST /auth/register
 */

import Fastify, { type FastifyInstance } from "fastify";
import authRoutes from "../../src/routes/v1/auth";
import {
  auth,
  resetFirestoreMock,
  seedDoc,
  getDoc,
  getAllDocs,
} from "../__mocks__/firebase-admin";
import { AppError } from "../../src/errors";

jest.mock("../../src/lib/prisma", () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { getDoc, getAllDocs, seedDoc } = require("../__mocks__/firebase-admin");

  const toUserRow = (uid: string, doc: Record<string, unknown>) => ({
    id: (doc.id as string | undefined) ?? uid,
    uid,
    email: (doc.email as string | undefined) ?? "",
    role: (doc.role as string | undefined) ?? null,
    username: (doc.username as string | undefined) ?? null,
    displayName:
      (doc.displayName as string | undefined) ??
      (doc.name as string | undefined) ??
      null,
    schoolId: (doc.schoolId as string | undefined) ?? null,
    phone: (doc.phone as string | undefined) ?? null,
    photoURL: (doc.photoURL as string | undefined) ?? null,
    isActive: (doc.isActive as boolean | undefined) ?? true,
    requirePasswordChange:
      (doc.requirePasswordChange as boolean | undefined) ?? false,
    studentId: (doc.studentId as string | undefined) ?? null,
    studentIds: (doc.studentIds as string[] | undefined) ?? null,
    teacherId: (doc.teacherId as string | undefined) ?? null,
    createdAt: (doc.createdAt as unknown) ?? null,
    lastLogin: (doc.lastLogin as unknown) ?? null,
  });

  const findUserBy = (
    predicate: (uid: string, doc: Record<string, unknown>) => boolean
  ): { uid: string; row: Record<string, unknown> } | null => {
    const users = getAllDocs("users") as Map<string, Record<string, unknown>>;
    for (const [uid, doc] of users.entries()) {
      if (predicate(uid, doc)) {
        return { uid, row: toUserRow(uid, doc) };
      }
    }

    return null;
  };

  const userCreate = jest.fn(
    async ({ data }: { data: Record<string, unknown> }) => {
      const uid = (data.uid as string | undefined) ?? "generated_uid";
      seedDoc("users", uid, { ...data, uid });
      return { id: (data.id as string | undefined) ?? uid, ...data, uid };
    }
  );

  const schoolCreate = jest.fn(
    async ({ data }: { data: Record<string, unknown> }) => {
      const id =
        (data.id as string | undefined) ??
        `school_${Math.random().toString(36).slice(2, 10)}`;
      seedDoc("schools", id, { ...data, id });
      return { id, ...data };
    }
  );

  const subscriptionCreate = jest.fn(
    async ({ data }: { data: Record<string, unknown> }) => {
      const id =
        (data.id as string | undefined) ??
        `sub_${Math.random().toString(36).slice(2, 10)}`;
      seedDoc("subscriptions", id, { ...data, id });
      return { id, ...data };
    }
  );

  const schoolConfigCreate = jest.fn(
    async ({ data }: { data: Record<string, unknown> }) => {
      const id =
        (data.id as string | undefined) ??
        `cfg_${Math.random().toString(36).slice(2, 10)}`;
      seedDoc("schoolConfigs", id, { ...data, id });
      return { id, ...data };
    }
  );

  const prisma = {
    user: {
      findUnique: jest.fn(
        async ({ where }: { where: { uid?: string } }) => {
          const uid = where?.uid;
          if (!uid) return null;

          const doc = getDoc("users", uid) as Record<string, unknown> | undefined;
          if (!doc) return null;

          return toUserRow(uid, doc);
        }
      ),
      findFirst: jest.fn(
        async (
          args: {
            where?: Record<string, unknown>;
          } = {}
        ) => {
          const where = args.where ?? {};

          const email =
            typeof where.email === "string"
              ? where.email.trim().toLowerCase()
              : null;
          if (email) {
            const match = findUserBy((_uid, doc) => {
              const docEmail =
                typeof doc.email === "string"
                  ? doc.email.trim().toLowerCase()
                  : "";
              return docEmail === email;
            });
            return match?.row ?? null;
          }

          const username =
            typeof where.username === "string"
              ? where.username.trim().toLowerCase()
              : null;
          if (username) {
            const requireActive = where.isActive === true;
            const match = findUserBy((_uid, doc) => {
              const docUsername =
                typeof doc.username === "string"
                  ? doc.username.trim().toLowerCase()
                  : "";
              const active = (doc.isActive as boolean | undefined) ?? true;
              return docUsername === username && (!requireActive || active);
            });
            return match?.row ?? null;
          }

          return null;
        }
      ),
      updateMany: jest.fn(
        async ({ where, data }: { where?: { uid?: string }; data: Record<string, unknown> }) => {
          const uid = where?.uid;
          if (!uid) return { count: 0 };

          const existing = getDoc("users", uid) as Record<string, unknown> | undefined;
          if (!existing) return { count: 0 };

          seedDoc("users", uid, { ...existing, ...data });
          return { count: 1 };
        }
      ),
      create: userCreate,
      deleteMany: jest.fn(async () => ({ count: 0 })),
    },
    school: {
      findUnique: jest.fn(
        async ({ where }: { where: { id?: string; code?: string } }) => {
          if (where.id) {
            const doc = getDoc("schools", where.id) as
              | Record<string, unknown>
              | undefined;
            if (!doc) return null;
            return {
              id: where.id,
              ...doc,
              isActive: (doc.isActive as boolean | undefined) ?? true,
            };
          }

          if (where.code) {
            const code = where.code.toUpperCase();
            const schools = getAllDocs("schools") as Map<string, Record<string, unknown>>;
            for (const [id, doc] of schools.entries()) {
              const schoolCode =
                typeof doc.code === "string" ? doc.code.toUpperCase() : "";
              if (schoolCode === code) {
                return {
                  id,
                  ...doc,
                  isActive: (doc.isActive as boolean | undefined) ?? true,
                };
              }
            }
          }

          return null;
        }
      ),
      create: schoolCreate,
      deleteMany: jest.fn(async () => ({ count: 0 })),
    },
    subscription: {
      create: subscriptionCreate,
      deleteMany: jest.fn(async () => ({ count: 0 })),
    },
    schoolConfig: {
      create: schoolConfigCreate,
      deleteMany: jest.fn(async () => ({ count: 0 })),
    },
    $transaction: jest.fn(async (arg: unknown) => {
      if (typeof arg === "function") {
        const tx = {
          school: { create: schoolCreate },
          user: { create: userCreate },
          subscription: { create: subscriptionCreate },
          schoolConfig: { create: schoolConfigCreate },
        };
        return (arg as (input: typeof tx) => Promise<unknown>)(tx);
      }

      if (Array.isArray(arg)) {
        return Promise.all(arg as unknown[]);
      }

      return arg;
    }),
  };

  return { prisma };
});

jest.mock("../../src/services/audit.service", () => ({
  writeAuditLog: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("../../src/services/session.service", () => ({
  validateSessionAccessToken: jest.fn().mockResolvedValue(null),
  createSessionWithAccessToken: jest.fn().mockResolvedValue({
    accessToken: "session_access_token",
    session: {
      id: "sess_1",
      userUid: "user_1",
      schoolId: "school_1",
      device: "Web",
      ipAddress: "127.0.0.1",
      userAgent: "Jest",
      currentJti: "jti_1",
      lastActiveAt: new Date("2024-01-01T00:00:00.000Z"),
      expiresAt: new Date("2024-01-02T00:00:00.000Z"),
      revokedAt: null,
    },
  }),
  decodeSessionAccessToken: jest.fn().mockReturnValue(null),
  revokeAllSessionsForUser: jest.fn().mockResolvedValue({ revokedCount: 0 }),
  revokeSessionById: jest.fn().mockResolvedValue(true),
  revokeTokenByJti: jest.fn().mockResolvedValue(true),
}));

let server: FastifyInstance;
const mockVerifyIdToken = auth.verifyIdToken as jest.Mock;
const mockCreateUser = auth.createUser as jest.Mock;
const mockUpdateUser = auth.updateUser as jest.Mock;
const mockSetCustomUserClaims = auth.setCustomUserClaims as jest.Mock;
const mockGetUserByEmail = auth.getUserByEmail as jest.Mock;

function setupAuthUser(uid = "user_1", role = "Admin", schoolId = "school_1") {
  mockVerifyIdToken.mockResolvedValueOnce({ uid, email: `${uid}@school.com` });
  seedDoc("users", uid, {
    uid, email: `${uid}@school.com`, name: "Test User", displayName: "Test User",
    role, schoolId, isActive: true, status: "active",
    requirePasswordChange: false,
    createdAt: { toMillis: () => Date.now() },
    lastLogin: null,
  });
}

function seedSchool(schoolId = "school_1") {
  seedDoc("schools", schoolId, {
    id: schoolId, name: "Test School", code: "TEST1234",
    subscriptionPlan: "Pro", subscriptionStatus: "active",
    limits: { students: 500, maxStudents: 500, maxTeachers: 50, maxClasses: 20 },
  });
}

beforeEach(async () => {
  resetFirestoreMock();
  mockVerifyIdToken.mockReset();
  mockCreateUser.mockReset();
  mockUpdateUser.mockReset();
  mockSetCustomUserClaims.mockReset();
  mockGetUserByEmail.mockReset();

  // Default mock implementations
  mockCreateUser.mockResolvedValue({ uid: "new_uid" });
  mockUpdateUser.mockResolvedValue({});
  mockSetCustomUserClaims.mockResolvedValue(undefined);
  mockGetUserByEmail.mockRejectedValue({ code: "auth/user-not-found" });

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
  await server.register(authRoutes, { prefix: "/" });
  await server.ready();
});

afterEach(async () => { await server.close(); });

// ---------------------------------------------------------------------------
// GET /auth/user-by-username
// ---------------------------------------------------------------------------
describe("GET /auth/user-by-username", () => {
  it("returns user details by username", async () => {
    seedDoc("users", "u1", {
      username: "johndoe", email: "john@school.com",
      role: "Teacher", name: "John Doe",
      studentId: null, requirePasswordChange: false,
    });
    const res = await server.inject({
      method: "GET", url: "/auth/user-by-username?username=johndoe",
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.email).toBe("john@school.com");
    expect(body.data.role).toBe("Teacher");
    expect(body.data.name).toBe("John Doe");
  });

  it("returns 400 when username is missing", async () => {
    const res = await server.inject({
      method: "GET", url: "/auth/user-by-username",
    });
    expect(res.statusCode).toBe(400);
  });

  it("returns 404 when username not found", async () => {
    const res = await server.inject({
      method: "GET", url: "/auth/user-by-username?username=nobody",
    });
    expect(res.statusCode).toBe(404);
  });

  it("is case-insensitive", async () => {
    seedDoc("users", "u1", {
      username: "johndoe", email: "john@school.com",
      role: "Teacher", name: "John",
      studentId: null, requirePasswordChange: false,
    });
    const res = await server.inject({
      method: "GET", url: "/auth/user-by-username?username=JohnDoe",
    });
    expect(res.statusCode).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// GET /auth/schools
// ---------------------------------------------------------------------------
describe("GET /auth/schools", () => {
  it("returns school details by code", async () => {
    seedDoc("schools", "s1", { id: "s1", name: "Alpha School", code: "ALPH1234" });
    const res = await server.inject({
      method: "GET", url: "/auth/schools?code=ALPH1234",
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.name).toBe("Alpha School");
    expect(body.data.code).toBe("ALPH1234");
  });

  it("returns 400 when code is missing", async () => {
    const res = await server.inject({ method: "GET", url: "/auth/schools" });
    expect(res.statusCode).toBe(400);
  });

  it("returns 404 when school code not found", async () => {
    const res = await server.inject({
      method: "GET", url: "/auth/schools?code=XXXXYYYY",
    });
    expect(res.statusCode).toBe(404);
  });

  it("converts code to uppercase for matching", async () => {
    seedDoc("schools", "s1", { id: "s1", name: "Beta School", code: "BETA5678" });
    const res = await server.inject({
      method: "GET", url: "/auth/schools?code=beta5678",
    });
    expect(res.statusCode).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// POST /auth/change-password
// ---------------------------------------------------------------------------
describe("POST /auth/change-password", () => {
  it("changes password successfully", async () => {
    setupAuthUser();
    const res = await server.inject({
      method: "POST", url: "/auth/change-password",
      headers: { authorization: "Bearer token" },
      payload: { newPassword: "NewSecure1Pass" },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).data.message).toContain("Password changed");
    expect(mockUpdateUser).toHaveBeenCalledWith("user_1", { password: "NewSecure1Pass" });
    // Check that requirePasswordChange is cleared
    const user = getDoc("users", "user_1");
    expect(user?.requirePasswordChange).toBe(false);
  });

  it("returns 400 for short password", async () => {
    setupAuthUser();
    const res = await server.inject({
      method: "POST", url: "/auth/change-password",
      headers: { authorization: "Bearer token" },
      payload: { newPassword: "short" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("returns 400 for password without uppercase", async () => {
    setupAuthUser();
    const res = await server.inject({
      method: "POST", url: "/auth/change-password",
      headers: { authorization: "Bearer token" },
      payload: { newPassword: "nouppercase1" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("returns 400 for password without digit", async () => {
    setupAuthUser();
    const res = await server.inject({
      method: "POST", url: "/auth/change-password",
      headers: { authorization: "Bearer token" },
      payload: { newPassword: "NoDigitHere" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("returns 401 when unauthenticated", async () => {
    const res = await server.inject({
      method: "POST", url: "/auth/change-password",
      payload: { newPassword: "NewSecure1Pass" },
    });
    expect(res.statusCode).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// GET /auth/me
// ---------------------------------------------------------------------------
describe("GET /auth/me", () => {
  it("returns current user profile", async () => {
    setupAuthUser();
    const res = await server.inject({
      method: "GET", url: "/auth/me",
      headers: { authorization: "Bearer token" },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.uid).toBe("user_1");
    expect(body.data.email).toBe("user_1@school.com");
    expect(body.data.role).toBe("Admin");
    expect(body.data.schoolId).toBe("school_1");
  });

  it("returns 401 when unauthenticated", async () => {
    const res = await server.inject({ method: "GET", url: "/auth/me" });
    expect(res.statusCode).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// POST /auth/login
// ---------------------------------------------------------------------------
describe("POST /auth/login", () => {
  it("records login and returns profile", async () => {
    setupAuthUser();
    const res = await server.inject({
      method: "POST", url: "/auth/login",
      headers: { authorization: "Bearer token" },
      payload: {},
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.uid).toBe("user_1");
    // lastLogin should be updated
    const user = getDoc("users", "user_1");
    expect(user?.lastLogin).toBeTruthy();
  });

  it("returns 401 when unauthenticated", async () => {
    const res = await server.inject({
      method: "POST", url: "/auth/login",
      payload: {},
    });
    expect(res.statusCode).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// POST /auth/register
// ---------------------------------------------------------------------------
describe("POST /auth/register", () => {
  it("registers a new school and admin user, returns 201", async () => {
    const res = await server.inject({
      method: "POST", url: "/auth/register",
      payload: {
        schoolName: "New Academy",
        adminName: "Admin User",
        email: "admin@newacademy.com",
        password: "StrongPass1",
      },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data).toHaveProperty("schoolId");
    expect(body.data).toHaveProperty("schoolCode");
    expect(body.data.email).toBe("admin@newacademy.com");
    expect(body.data.role).toBe("Admin");
    expect(body.data).toHaveProperty("trialEndDate");
  });

  it("returns 400 for missing school name", async () => {
    const res = await server.inject({
      method: "POST", url: "/auth/register",
      payload: {
        adminName: "Admin User",
        email: "admin@school.com",
        password: "StrongPass1",
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it("returns 400 for invalid email", async () => {
    const res = await server.inject({
      method: "POST", url: "/auth/register",
      payload: {
        schoolName: "Test School",
        adminName: "Admin",
        email: "bad-email",
        password: "StrongPass1",
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it("returns 400 for weak password", async () => {
    const res = await server.inject({
      method: "POST", url: "/auth/register",
      payload: {
        schoolName: "Test School",
        adminName: "Admin",
        email: "admin@school.com",
        password: "weak",
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it("returns 400 for short admin name", async () => {
    const res = await server.inject({
      method: "POST", url: "/auth/register",
      payload: {
        schoolName: "Test School",
        adminName: "A",
        email: "admin@school.com",
        password: "StrongPass1",
      },
    });
    expect(res.statusCode).toBe(400);
  });
});
