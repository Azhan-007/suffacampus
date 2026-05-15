process.env.NODE_ENV = "test";
process.env.AUTH_REFRESH_TOKENS_ENABLED = "true";
process.env.AUTH_REFRESH_TOKEN_HASH_SECRET = "test-refresh-secret";
process.env.JWT_ACCESS_SECRET = "test-access-secret";
process.env.JWT_ACCESS_TTL_SECONDS = "3600";
process.env.JWT_ISSUER = "suffacampus-api";
process.env.JWT_AUDIENCE = "suffacampus-clients";
process.env.AUTH_REFRESH_TOKEN_TTL_DAYS = "1";
process.env.AUTH_REFRESH_TOKEN_REUSE_GRACE_SECONDS = "0";

import { prisma } from "../../src/lib/prisma";
import { AppError } from "../../src/errors";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const refreshService = require("../../src/services/refresh-token.service") as typeof import("../../src/services/refresh-token.service");
const { issueRefreshTokenForSession, refreshSessionTokens } = refreshService;

describe("refresh token reuse persistence (db)", () => {
  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.refreshToken.deleteMany();
    await prisma.revokedToken.deleteMany();
    await prisma.session.deleteMany();
    await prisma.user.deleteMany();
  });

  it("persists family + session revocation after reuse detection", async () => {
    const user = await prisma.user.create({
      data: {
        uid: "user_refresh_1",
        email: "refresh-test@suffacampus.app",
        displayName: "Refresh Test",
        role: "Admin",
        isActive: true,
      },
    });

    const session = await prisma.session.create({
      data: {
        userUid: user.uid,
        device: "Test",
        ipAddress: "127.0.0.1",
        userAgent: "jest",
        currentJti: "jti_initial",
        lastActiveAt: new Date(),
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });

    const issued = await issueRefreshTokenForSession({
      sessionId: session.id,
      userUid: user.uid,
      schoolId: null,
    });

    const first = await refreshSessionTokens({ refreshToken: issued.refreshToken });
    expect(first.accessToken).toBeTruthy();

    await expect(
      refreshSessionTokens({ refreshToken: issued.refreshToken })
    ).rejects.toThrow(AppError);

    const family = await prisma.refreshToken.findMany({
      where: { familyId: issued.refreshTokenFamilyId },
    });

    expect(family.length).toBeGreaterThan(0);
    expect(family.every((token) => token.revokedAt !== null)).toBe(true);

    const revokedSession = await prisma.session.findUnique({
      where: { id: session.id },
    });

    expect(revokedSession?.revokedAt).toBeTruthy();
    expect(revokedSession?.revokeReason).toBe("refresh_reuse_detected");

    const revokedToken = await prisma.revokedToken.findUnique({
      where: { jti: revokedSession?.currentJti ?? "" },
    });

    expect(revokedToken).toBeTruthy();
  });
});
