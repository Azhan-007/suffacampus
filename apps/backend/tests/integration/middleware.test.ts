/**
 * Integration tests for auth, tenant, and role middleware.
 *
 * Uses a minimal Fastify instance with the middleware applied to
 * verify the full request lifecycle: token verification, user lookup,
 * tenant extraction, and role checking.
 */

import Fastify, { type FastifyInstance } from "fastify";
import { authenticate } from "../../src/middleware/auth";
import { tenantGuard } from "../../src/middleware/tenant";
import { roleMiddleware } from "../../src/middleware/role";
import { requirePermission } from "../../src/middleware/permission";
import {
  auth,
  resetFirestoreMock,
  seedDoc,
} from "../__mocks__/firebase-admin";
import { AppError } from "../../src/errors";

jest.mock("../../src/lib/prisma", () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { getDoc } = require("../__mocks__/firebase-admin");

  return {
    prisma: {
      user: {
        findUnique: jest.fn(async ({ where: { uid } }: { where: { uid: string } }) => {
          const doc = getDoc("users", uid) as Record<string, unknown> | undefined;
          if (!doc) return null;

          return {
            uid,
            role: (doc.role as string | undefined) ?? null,
            username: (doc.username as string | undefined) ?? null,
            displayName: (doc.displayName as string | undefined) ?? (doc.name as string | undefined) ?? null,
            schoolId: (doc.schoolId as string | undefined) ?? null,
            phone: (doc.phone as string | undefined) ?? null,
            photoURL: (doc.photoURL as string | undefined) ?? null,
            isActive: (doc.isActive as boolean | undefined) ?? true,
            requirePasswordChange: (doc.requirePasswordChange as boolean | undefined) ?? false,
            studentId: (doc.studentId as string | undefined) ?? null,
            studentIds: (doc.studentIds as string[] | undefined) ?? null,
            teacherId: (doc.teacherId as string | undefined) ?? null,
          };
        }),
      },
    },
  };
});

let server: FastifyInstance;

// Cast auth.verifyIdToken to a jest mock for easy control
const mockVerifyIdToken = auth.verifyIdToken as jest.Mock;

beforeEach(async () => {
  resetFirestoreMock();
  mockVerifyIdToken.mockReset();

  server = Fastify({ logger: false });

  // Global error handler that mirrors production
  server.setErrorHandler((error, _request, reply) => {
    if (error instanceof AppError) {
      return reply.status(error.statusCode).send({
        success: false,
        error: error.toJSON(),
      });
    }
    const msg = error instanceof Error ? error.message : "Unknown error";
    return reply.status(500).send({ success: false, message: msg });
  });
});

afterEach(async () => {
  await server.close();
});

// ---------------------------------------------------------------------------
// authenticate middleware
// ---------------------------------------------------------------------------

describe("authenticate middleware", () => {
  beforeEach(() => {
    server.get(
      "/test",
      { preHandler: [authenticate] },
      async (request, reply) => {
        return reply.send({
          success: true,
          user: {
            uid: request.user.uid,
            email: request.user.email,
            role: request.user.role,
          },
        });
      }
    );
  });

  it("rejects requests without Authorization header", async () => {
    const res = await server.inject({ method: "GET", url: "/test" });
    expect(res.statusCode).toBe(401);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("AUTH_TOKEN_MISSING");
  });

  it("rejects requests with invalid Bearer format", async () => {
    const res = await server.inject({
      method: "GET",
      url: "/test",
      headers: { authorization: "Basic abc123" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("rejects requests with empty Bearer token", async () => {
    const res = await server.inject({
      method: "GET",
      url: "/test",
      headers: { authorization: "Bearer " },
    });
    expect(res.statusCode).toBe(401);
  });

  it("rejects expired/invalid tokens", async () => {
    mockVerifyIdToken.mockRejectedValueOnce(new Error("Token expired"));

    const res = await server.inject({
      method: "GET",
      url: "/test",
      headers: { authorization: "Bearer expired_token" },
    });
    expect(res.statusCode).toBe(401);
    const body = JSON.parse(res.body);
    expect(body.error.code).toBe("AUTH_TOKEN_INVALID");
  });

  it("rejects if user document does not exist in Firestore", async () => {
    mockVerifyIdToken.mockResolvedValueOnce({
      uid: "ghost_user",
      email: "ghost@test.com",
    });
    // Do NOT seed any user doc

    const res = await server.inject({
      method: "GET",
      url: "/test",
      headers: { authorization: "Bearer valid_token" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("authenticates successfully with valid token and user doc", async () => {
    mockVerifyIdToken.mockResolvedValueOnce({
      uid: "user_1",
      email: "admin@school.com",
    });
    seedDoc("users", "user_1", {
      uid: "user_1",
      email: "admin@school.com",
      role: "Admin",
      schoolId: "school_1",
    });

    const res = await server.inject({
      method: "GET",
      url: "/test",
      headers: { authorization: "Bearer valid_token" },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.user.uid).toBe("user_1");
    expect(body.user.role).toBe("Admin");
  });
});

// ---------------------------------------------------------------------------
// tenantGuard middleware
// ---------------------------------------------------------------------------

describe("tenantGuard middleware", () => {
  beforeEach(() => {
    server.get(
      "/test",
      { preHandler: [authenticate, tenantGuard] },
      async (request, reply) => {
        return reply.send({
          success: true,
          schoolId: request.schoolId,
        });
      }
    );
  });

  it("extracts schoolId from user document", async () => {
    mockVerifyIdToken.mockResolvedValueOnce({
      uid: "user_1",
      email: "admin@school.com",
    });
    seedDoc("users", "user_1", {
      uid: "user_1",
      email: "admin@school.com",
      role: "Admin",
      schoolId: "school_abc",
    });

    const res = await server.inject({
      method: "GET",
      url: "/test",
      headers: { authorization: "Bearer valid_token" },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.schoolId).toBe("school_abc");
  });

  it("rejects users without a schoolId", async () => {
    mockVerifyIdToken.mockResolvedValueOnce({
      uid: "user_1",
      email: "orphan@test.com",
    });
    seedDoc("users", "user_1", {
      uid: "user_1",
      email: "orphan@test.com",
      role: "Admin",
      // No schoolId!
    });

    const res = await server.inject({
      method: "GET",
      url: "/test",
      headers: { authorization: "Bearer valid_token" },
    });
    expect(res.statusCode).toBe(403);
    const body = JSON.parse(res.body);
    expect(body.error.code).toBe("TENANT_MISSING");
  });
});

// ---------------------------------------------------------------------------
// roleMiddleware
// ---------------------------------------------------------------------------

describe("roleMiddleware", () => {
  beforeEach(() => {
    server.get(
      "/admin-only",
      { preHandler: [authenticate, tenantGuard, roleMiddleware(["Admin", "SuperAdmin"])] },
      async (request, reply) => {
        return reply.send({ success: true });
      }
    );

    server.get(
      "/teacher-route",
      { preHandler: [authenticate, tenantGuard, roleMiddleware(["Teacher", "Admin", "SuperAdmin"])] },
      async (request, reply) => {
        return reply.send({ success: true });
      }
    );
  });

  function setupUser(role: string) {
    mockVerifyIdToken.mockResolvedValueOnce({
      uid: "u1",
      email: "test@test.com",
    });
    seedDoc("users", "u1", {
      uid: "u1",
      email: "test@test.com",
      role,
      schoolId: "school_1",
    });
  }

  it("allows Admin access to admin-only route", async () => {
    setupUser("Admin");
    const res = await server.inject({
      method: "GET",
      url: "/admin-only",
      headers: { authorization: "Bearer token" },
    });
    expect(res.statusCode).toBe(200);
  });

  it("allows SuperAdmin access to admin-only route", async () => {
    setupUser("SuperAdmin");
    const res = await server.inject({
      method: "GET",
      url: "/admin-only",
      headers: { authorization: "Bearer token" },
    });
    expect(res.statusCode).toBe(200);
  });

  it("rejects Teacher from admin-only route", async () => {
    setupUser("Teacher");
    const res = await server.inject({
      method: "GET",
      url: "/admin-only",
      headers: { authorization: "Bearer token" },
    });
    expect(res.statusCode).toBe(403);
    const body = JSON.parse(res.body);
    expect(body.error.code).toBe("ROLE_UNAUTHORIZED");
  });

  it("allows Teacher access to teacher-accessible route", async () => {
    setupUser("Teacher");
    const res = await server.inject({
      method: "GET",
      url: "/teacher-route",
      headers: { authorization: "Bearer token" },
    });
    expect(res.statusCode).toBe(200);
  });

  it("rejects Student from admin-only route", async () => {
    setupUser("Student");
    const res = await server.inject({
      method: "GET",
      url: "/admin-only",
      headers: { authorization: "Bearer token" },
    });
    expect(res.statusCode).toBe(403);
  });

  it("rejects user with no role", async () => {
    mockVerifyIdToken.mockResolvedValueOnce({
      uid: "u1",
      email: "test@test.com",
    });
    seedDoc("users", "u1", {
      uid: "u1",
      email: "test@test.com",
      schoolId: "school_1",
      // No role!
    });

    const res = await server.inject({
      method: "GET",
      url: "/admin-only",
      headers: { authorization: "Bearer token" },
    });
    expect(res.statusCode).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// permission middleware
// ---------------------------------------------------------------------------

describe("permission middleware", () => {
  beforeEach(() => {
    server.get(
      "/fee-create",
      {
        preHandler: [authenticate, tenantGuard, requirePermission("FEE_CREATE")],
      },
      async (_request, reply) => {
        return reply.send({ success: true });
      }
    );
  });

  function setupUser(role: string) {
    mockVerifyIdToken.mockResolvedValueOnce({
      uid: "u1",
      email: "test@test.com",
    });
    seedDoc("users", "u1", {
      uid: "u1",
      email: "test@test.com",
      role,
      schoolId: "school_1",
    });
  }

  it("allows Admin access", async () => {
    setupUser("Admin");
    const res = await server.inject({
      method: "GET",
      url: "/fee-create",
      headers: { authorization: "Bearer token" },
    });
    expect(res.statusCode).toBe(200);
  });

  it("rejects Staff access", async () => {
    setupUser("Staff");
    const res = await server.inject({
      method: "GET",
      url: "/fee-create",
      headers: { authorization: "Bearer token" },
    });
    expect(res.statusCode).toBe(403);
    const body = JSON.parse(res.body);
    expect(body.error.code).toBe("ROLE_UNAUTHORIZED");
  });

  it("rejects Parent access", async () => {
    setupUser("Parent");
    const res = await server.inject({
      method: "GET",
      url: "/fee-create",
      headers: { authorization: "Bearer token" },
    });
    expect(res.statusCode).toBe(403);
    const body = JSON.parse(res.body);
    expect(body.error.code).toBe("ROLE_UNAUTHORIZED");
  });

  it("blocks unauthenticated access", async () => {
    const res = await server.inject({
      method: "GET",
      url: "/fee-create",
    });
    expect(res.statusCode).toBe(401);
    const body = JSON.parse(res.body);
    expect(body.error.code).toBe("AUTH_TOKEN_MISSING");
  });
});

// ---------------------------------------------------------------------------
// Full middleware chain: authenticate → tenantGuard → roleMiddleware
// ---------------------------------------------------------------------------

describe("full middleware chain", () => {
  beforeEach(() => {
    server.post(
      "/protected",
      {
        preHandler: [
          authenticate,
          tenantGuard,
          roleMiddleware(["Admin"]),
        ],
      },
      async (request, reply) => {
        return reply.send({
          success: true,
          uid: request.user.uid,
          schoolId: request.schoolId,
          role: request.user.role,
        });
      }
    );
  });

  it("passes through all middleware with valid Admin user", async () => {
    mockVerifyIdToken.mockResolvedValueOnce({
      uid: "admin_1",
      email: "admin@school.com",
    });
    seedDoc("users", "admin_1", {
      uid: "admin_1",
      email: "admin@school.com",
      role: "Admin",
      schoolId: "school_xyz",
    });

    const res = await server.inject({
      method: "POST",
      url: "/protected",
      headers: { authorization: "Bearer good_token" },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.uid).toBe("admin_1");
    expect(body.schoolId).toBe("school_xyz");
    expect(body.role).toBe("Admin");
  });

  it("rejects at auth step when token is missing", async () => {
    const res = await server.inject({
      method: "POST",
      url: "/protected",
    });
    expect(res.statusCode).toBe(401);
  });

  it("rejects at tenant step when schoolId missing", async () => {
    mockVerifyIdToken.mockResolvedValueOnce({
      uid: "u1",
      email: "test@test.com",
    });
    seedDoc("users", "u1", {
      uid: "u1",
      email: "test@test.com",
      role: "Admin",
      // No schoolId
    });

    const res = await server.inject({
      method: "POST",
      url: "/protected",
      headers: { authorization: "Bearer token" },
    });
    expect(res.statusCode).toBe(403);
  });

  it("rejects at role step for wrong role", async () => {
    mockVerifyIdToken.mockResolvedValueOnce({
      uid: "u1",
      email: "test@test.com",
    });
    seedDoc("users", "u1", {
      uid: "u1",
      email: "test@test.com",
      role: "Student",
      schoolId: "school_1",
    });

    const res = await server.inject({
      method: "POST",
      url: "/protected",
      headers: { authorization: "Bearer token" },
    });
    expect(res.statusCode).toBe(403);
  });
});
