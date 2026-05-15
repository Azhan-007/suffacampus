process.env.NODE_ENV = "test";
process.env.AUTH_REFRESH_TOKENS_ENABLED = "true";
process.env.AUTH_REQUIRE_REFRESH_FLOW = "true";
process.env.AUTH_REFRESH_TOKEN_HASH_SECRET = "test-refresh-secret";

import Fastify, { type FastifyInstance } from "fastify";
import authRoutes from "../../src/routes/v1/auth";
import { auth } from "../__mocks__/firebase-admin";
import { AppError } from "../../src/errors";

jest.mock("../../src/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: jest.fn(async ({ where }: { where: { uid?: string } }) => {
        if (!where?.uid) return null;
        return {
          uid: where.uid,
          email: "user_refresh@suffacampus.app",
          role: "Admin",
          displayName: "Refresh User",
          schoolId: "school_1",
          phone: null,
          photoURL: null,
          isActive: true,
          requirePasswordChange: false,
          studentId: null,
          studentIds: [],
          teacherId: null,
        };
      }),
      updateMany: jest.fn(async () => ({ count: 1 })),
    },
  },
}));

jest.mock("../../src/services/session.service", () => ({
  validateSessionAccessToken: jest.fn().mockResolvedValue(null),
  createSessionWithAccessToken: jest.fn().mockResolvedValue({
    accessToken: "session_access_token",
    session: {
      id: "sess_1",
      userUid: "user_refresh",
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

jest.mock("../../src/services/refresh-token.service", () => ({
  issueRefreshTokenForSession: jest.fn().mockRejectedValue(new Error("refresh issuance failed")),
  refreshSessionTokens: jest.fn(),
  revokeRefreshTokenFamiliesForSession: jest.fn().mockResolvedValue({ revokedCount: 0, familyIds: [] }),
  revokeRefreshTokenFamiliesForUser: jest.fn().mockResolvedValue({ revokedCount: 0, familyIds: [] }),
  isRefreshTokensEnabled: jest.fn().mockReturnValue(true),
}));

jest.mock("../../src/services/audit.service", () => ({
  writeAuditLog: jest.fn().mockResolvedValue(undefined),
}));

let server: FastifyInstance;
const mockVerifyIdToken = auth.verifyIdToken as jest.Mock;

beforeEach(async () => {
  mockVerifyIdToken.mockReset();
  mockVerifyIdToken.mockResolvedValue({ uid: "user_refresh", email: "user_refresh@suffacampus.app" });

  server = Fastify({ logger: false });
  server.setErrorHandler((error, _request, reply) => {
    if (error instanceof AppError) {
      return reply.status(error.statusCode).send({ success: false, error: error.toJSON() });
    }
    return reply.status(500).send({ success: false, message: error instanceof Error ? error.message : "Unknown error" });
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
  await server.register(authRoutes, { prefix: "/" });
  await server.ready();
});

afterEach(async () => {
  await server.close();
});

describe("POST /auth/login refresh-required", () => {
  it("fails login when refresh issuance fails and refresh is required", async () => {
    const res = await server.inject({
      method: "POST",
      url: "/auth/login",
      headers: { authorization: "Bearer token" },
      payload: {},
    });

    expect(res.statusCode).toBe(500);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(false);
  });
});
