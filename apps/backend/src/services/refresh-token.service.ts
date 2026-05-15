import crypto from "crypto";
import jwt from "jsonwebtoken";
import type { FastifyRequest } from "fastify";
import type { Prisma } from "@prisma/client";
import { prisma, type PrismaTransactionClient } from "../lib/prisma";
import { env } from "../lib/env";
import { Errors } from "../errors";
import { createLogger } from "../utils/logger";
import { writeAuditLog } from "./audit.service";
import {
  extractRequestDevice,
  extractRequestIp,
  extractRequestUserAgent,
} from "./session.service";
import { resolveAccessVersion } from "./tenant-lifecycle.service";

const log = createLogger("refresh-token");

const REFRESH_SELECTOR_BYTES = 12;
const REFRESH_SECRET_BYTES = 32;
const REFRESH_PART_REGEX = /^[A-Za-z0-9_-]+$/;

export type RefreshTokenIssueResult = {
  refreshToken: string;
  refreshTokenId: string;
  refreshTokenSelector: string;
  refreshTokenFamilyId: string;
  refreshTokenExpiresAt: Date;
};

export type RefreshSessionResult = {
  accessToken: string;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
  refreshTokenFamilyId: string;
  session: {
    id: string;
    device: string;
    ipAddress: string | null;
    userAgent: string | null;
    lastActiveAt: Date;
    expiresAt: Date;
  };
};

type ParsedRefreshToken = {
  selector: string;
  secret: string;
};

type RefreshTokenRecord = {
  id: string;
  selector: string;
  tokenHash: string;
  familyId: string;
  parentId: string | null;
  replacedById: string | null;
  sessionId: string;
  userUid: string;
  schoolId: string | null;
  lastUsedAt: Date | null;
  expiresAt: Date;
  revokedAt: Date | null;
  revokeReason: string | null;
  reuseDetectedAt: Date | null;
};

type RefreshReuseContext = {
  tokenId: string;
  selector: string;
  familyId: string;
  sessionId: string;
  userUid: string;
  schoolId: string | null;
};

class RefreshReuseDetectedError extends Error {
  public readonly context: RefreshReuseContext;

  constructor(context: RefreshReuseContext) {
    super("Refresh token reuse detected");
    this.name = "RefreshReuseDetectedError";
    this.context = context;
  }
}

function refreshTokensEnabled(): boolean {
  return env.AUTH_REFRESH_TOKENS_ENABLED || env.AUTH_REQUIRE_REFRESH_FLOW;
}

function auditSchoolId(schoolId: string | null): string {
  return schoolId && schoolId.trim().length > 0 ? schoolId : "platform";
}

function buildRefreshTokenExpiresAt(now: Date): Date {
  const ttlMs = env.AUTH_REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000;
  return new Date(now.getTime() + ttlMs);
}

function isReuseWithinGraceWindow(lastUsedAt: Date | null): boolean {
  if (!lastUsedAt) return false;
  const graceMs = env.AUTH_REFRESH_TOKEN_REUSE_GRACE_SECONDS * 1000;
  if (graceMs <= 0) return false;
  return Date.now() - lastUsedAt.getTime() <= graceMs;
}

function timingSafeEqualString(actual: string, expected: string): boolean {
  const actualBytes = Buffer.from(actual, "utf8");
  const expectedBytes = Buffer.from(expected, "utf8");

  if (actualBytes.length !== expectedBytes.length) {
    return false;
  }

  return crypto.timingSafeEqual(actualBytes, expectedBytes);
}

export function hashRefreshTokenSecret(secret: string): string {
  return crypto
    .createHmac("sha256", env.AUTH_REFRESH_TOKEN_HASH_SECRET)
    .update(secret)
    .digest("hex");
}

export function parseRefreshToken(value: string): ParsedRefreshToken | null {
  if (!value || typeof value !== "string") return null;

  const trimmed = value.trim();
  const parts = trimmed.split(".");
  if (parts.length !== 2) return null;

  const [selector, secret] = parts;
  if (!selector || !secret) return null;

  if (!REFRESH_PART_REGEX.test(selector) || !REFRESH_PART_REGEX.test(secret)) {
    return null;
  }

  if (selector.length < 12 || secret.length < 20) {
    return null;
  }

  return { selector, secret };
}

export function generateRefreshTokenPair(): {
  token: string;
  selector: string;
  secret: string;
  hash: string;
} {
  const selector = crypto.randomBytes(REFRESH_SELECTOR_BYTES).toString("base64url");
  const secret = crypto.randomBytes(REFRESH_SECRET_BYTES).toString("base64url");
  const hash = hashRefreshTokenSecret(secret);
  return {
    token: `${selector}.${secret}`,
    selector,
    secret,
    hash,
  };
}

export async function issueRefreshTokenForSession(params: {
  sessionId: string;
  userUid: string;
  schoolId?: string | null;
  request?: FastifyRequest;
}): Promise<RefreshTokenIssueResult> {
  if (!refreshTokensEnabled()) {
    throw Errors.badRequest("Refresh tokens are disabled");
  }

  const now = new Date();
  const { token, selector, hash } = generateRefreshTokenPair();
  const familyId = crypto.randomUUID();
  const expiresAt = buildRefreshTokenExpiresAt(now);

  const created = await prisma.refreshToken.create({
    data: {
      selector,
      tokenHash: hash,
      familyId,
      sessionId: params.sessionId,
      userUid: params.userUid,
      schoolId: params.schoolId ?? null,
      expiresAt,
    },
    select: {
      id: true,
    },
  });

  if (params.request) {
    const ipAddress = extractRequestIp(params.request);
    const userAgent = extractRequestUserAgent(params.request);
    const device = extractRequestDevice(params.request);

    void writeAuditLog(
      "REFRESH_ISSUED",
      params.userUid,
      auditSchoolId(params.schoolId ?? null),
      {
        sessionId: params.sessionId,
        familyId,
        selector,
        device,
      },
      {
        requestId: params.request.requestId,
        ipAddress: ipAddress ?? undefined,
        userAgent: userAgent ?? undefined,
      }
    );
  }

  return {
    refreshToken: token,
    refreshTokenId: created.id,
    refreshTokenSelector: selector,
    refreshTokenFamilyId: familyId,
    refreshTokenExpiresAt: expiresAt,
  };
}

async function markRefreshReuseAndRevokeFamily(params: {
  tx: PrismaTransactionClient;
  context: RefreshReuseContext;
  now: Date;
}): Promise<{ sessionRevoked: boolean; sessionJti?: string | null }> {
  const { tx, context, now } = params;

  await tx.refreshToken.updateMany({
    where: {
      familyId: context.familyId,
      revokedAt: null,
    },
    data: {
      revokedAt: now,
      revokeReason: "refresh_reuse_detected",
    },
  });

  await tx.refreshToken.update({
    where: { id: context.tokenId },
    data: {
      reuseDetectedAt: now,
    },
  });

  const session = await tx.session.findFirst({
    where: {
      id: context.sessionId,
      userUid: context.userUid,
    },
    select: {
      id: true,
      currentJti: true,
      expiresAt: true,
      revokedAt: true,
      schoolId: true,
    },
  });

  if (!session || session.revokedAt) {
    return { sessionRevoked: false, sessionJti: session?.currentJti ?? null };
  }

  await tx.session.update({
    where: { id: session.id },
    data: {
      revokedAt: now,
      revokeReason: "refresh_reuse_detected",
      lastActiveAt: now,
    },
  });

  await tx.revokedToken.upsert({
    where: { jti: session.currentJti },
    update: {
      reason: "refresh_reuse_detected",
      expiresAt: session.expiresAt,
      sessionId: session.id,
      userUid: context.userUid,
      schoolId: session.schoolId,
    },
    create: {
      jti: session.currentJti,
      reason: "refresh_reuse_detected",
      expiresAt: session.expiresAt,
      sessionId: session.id,
      userUid: context.userUid,
      schoolId: session.schoolId,
    },
  });

  return { sessionRevoked: true, sessionJti: session.currentJti };
}

async function persistRefreshReuseCompromise(params: {
  context: RefreshReuseContext;
  request?: FastifyRequest;
}): Promise<void> {
  const { context, request } = params;
  const now = new Date();

  try {
    const result = await prisma.$transaction(async (tx) =>
      markRefreshReuseAndRevokeFamily({
        tx,
        context,
        now,
      })
    );

    const ipAddress = request ? extractRequestIp(request) : null;
    const userAgent = request ? extractRequestUserAgent(request) : null;
    const device = request ? extractRequestDevice(request) : null;

    void writeAuditLog(
      "REFRESH_REUSE_DETECTED",
      context.userUid,
      auditSchoolId(context.schoolId),
      {
        sessionId: context.sessionId,
        familyId: context.familyId,
        selector: context.selector,
        device,
        sessionRevoked: result.sessionRevoked,
        sessionJti: result.sessionJti ?? null,
      },
      {
        requestId: request?.requestId,
        ipAddress: ipAddress ?? undefined,
        userAgent: userAgent ?? undefined,
      }
    );
  } catch (error) {
    log.error(
      { err: error, sessionId: context.sessionId, familyId: context.familyId },
      "Failed to persist refresh reuse revocation"
    );
  }
}

export async function refreshSessionTokens(params: {
  refreshToken: string;
  request?: FastifyRequest;
}): Promise<RefreshSessionResult> {
  if (!refreshTokensEnabled()) {
    throw Errors.badRequest("Refresh tokens are disabled");
  }

  const parsed = parseRefreshToken(params.refreshToken);
  if (!parsed) {
    throw Errors.tokenInvalid();
  }

  const now = new Date();
  let result: {
    accessToken: string;
    refreshToken: string;
    refreshTokenExpiresAt: Date;
    refreshTokenFamilyId: string;
    session: {
      id: string;
      device: string;
      ipAddress: string | null;
      userAgent: string | null;
      lastActiveAt: Date;
      expiresAt: Date;
    };
    audit: {
      userUid: string;
      schoolId: string | null;
      sessionId: string;
      familyId: string;
      selector: string;
    };
  };

  try {
    result = await prisma.$transaction(async (tx) => {
      const token = (await tx.refreshToken.findUnique({
        where: { selector: parsed.selector },
        select: {
          id: true,
          selector: true,
          tokenHash: true,
          familyId: true,
          parentId: true,
          replacedById: true,
          sessionId: true,
          userUid: true,
          schoolId: true,
          lastUsedAt: true,
          expiresAt: true,
          revokedAt: true,
          revokeReason: true,
          reuseDetectedAt: true,
        },
      })) as RefreshTokenRecord | null;

      if (!token) {
        throw Errors.tokenInvalid();
      }

      if (token.revokedAt) {
        throw Errors.tokenInvalid();
      }

      if (token.expiresAt.getTime() <= now.getTime()) {
        throw Errors.tokenInvalid();
      }

      const expectedHash = hashRefreshTokenSecret(parsed.secret);
      if (!timingSafeEqualString(expectedHash, token.tokenHash)) {
        throw Errors.tokenInvalid();
      }

      const reuseContext: RefreshReuseContext = {
        tokenId: token.id,
        selector: token.selector,
        familyId: token.familyId,
        sessionId: token.sessionId,
        userUid: token.userUid,
        schoolId: token.schoolId,
      };

      if (token.replacedById) {
        if (isReuseWithinGraceWindow(token.lastUsedAt)) {
          throw Errors.conflict("Refresh token already rotated");
        }

        throw new RefreshReuseDetectedError(reuseContext);
      }

      const session = await tx.session.findFirst({
        where: {
          id: token.sessionId,
          userUid: token.userUid,
          revokedAt: null,
          expiresAt: { gt: now },
        },
        select: {
          id: true,
          userUid: true,
          schoolId: true,
          device: true,
          ipAddress: true,
          userAgent: true,
          currentJti: true,
          lastActiveAt: true,
          expiresAt: true,
          revokedAt: true,
        },
      });

      if (!session) {
        throw Errors.tokenInvalid();
      }

      const user = await tx.user.findUnique({
        where: { uid: token.userUid },
        select: {
          role: true,
          isActive: true,
        },
      });

      if (!user) {
        throw Errors.userNotFound();
      }

      if (user.isActive === false) {
        throw Errors.userDisabled();
      }

      const { token: nextRefreshToken, selector, hash } = generateRefreshTokenPair();
      const refreshExpiresAt = buildRefreshTokenExpiresAt(now);

      const newToken = await tx.refreshToken.create({
        data: {
          selector,
          tokenHash: hash,
          familyId: token.familyId,
          parentId: token.id,
          sessionId: token.sessionId,
          userUid: token.userUid,
          schoolId: token.schoolId,
          expiresAt: refreshExpiresAt,
        },
        select: {
          id: true,
        },
      });

      const updated = await tx.refreshToken.updateMany({
        where: {
          id: token.id,
          revokedAt: null,
          replacedById: null,
        },
        data: {
          replacedById: newToken.id,
          lastUsedAt: now,
        },
      });

      if (updated.count !== 1) {
        const latest = (await tx.refreshToken.findUnique({
          where: { id: token.id },
          select: { replacedById: true, revokedAt: true, lastUsedAt: true },
        })) as { replacedById: string | null; revokedAt: Date | null; lastUsedAt: Date | null } | null;

        if (latest?.replacedById) {
          if (!isReuseWithinGraceWindow(latest.lastUsedAt)) {
            throw new RefreshReuseDetectedError(reuseContext);
          }

          throw Errors.conflict("Refresh token already rotated");
        }

        throw Errors.tokenInvalid();
      }

      const previousSessionExpiry = session.expiresAt;
      const nextSessionExpiry = new Date(now.getTime() + env.JWT_ACCESS_TTL_SECONDS * 1000);
      const nextJti = crypto.randomUUID();

      const accessVersion = await resolveAccessVersion(session.schoolId ?? null, {
        useTransaction: tx,
      });

      await tx.session.update({
        where: { id: session.id },
        data: {
          currentJti: nextJti,
          lastActiveAt: now,
          expiresAt: nextSessionExpiry,
        },
      });

      await tx.revokedToken.upsert({
        where: { jti: session.currentJti },
        update: {
          reason: "refresh_rotation",
          expiresAt: previousSessionExpiry,
          sessionId: session.id,
          userUid: session.userUid,
          schoolId: session.schoolId,
        },
        create: {
          jti: session.currentJti,
          reason: "refresh_rotation",
          expiresAt: previousSessionExpiry,
          sessionId: session.id,
          userUid: session.userUid,
          schoolId: session.schoolId,
        },
      });

      const accessToken = jwt.sign(
        {
          sub: session.userUid,
          sid: session.id,
          jti: nextJti,
          typ: "access",
          schoolId: session.schoolId ?? null,
          role: user.role ?? null,
          accessVersion,
        },
        env.JWT_ACCESS_SECRET,
        {
          algorithm: "HS256",
          expiresIn: env.JWT_ACCESS_TTL_SECONDS,
          issuer: env.JWT_ISSUER,
          audience: env.JWT_AUDIENCE,
        }
      );

      return {
        accessToken,
        refreshToken: nextRefreshToken,
        refreshTokenExpiresAt: refreshExpiresAt,
        refreshTokenFamilyId: token.familyId,
        session: {
          id: session.id,
          device: session.device,
          ipAddress: session.ipAddress,
          userAgent: session.userAgent,
          lastActiveAt: now,
          expiresAt: nextSessionExpiry,
        },
        audit: {
          userUid: session.userUid,
          schoolId: token.schoolId,
          sessionId: session.id,
          familyId: token.familyId,
          selector: token.selector,
        },
      };
    });
  } catch (error) {
    if (error instanceof RefreshReuseDetectedError) {
      await persistRefreshReuseCompromise({
        context: error.context,
        request: params.request,
      });
      throw Errors.tokenInvalid();
    }

    throw error;
  }

  const ipAddress = params.request ? extractRequestIp(params.request) : null;
  const userAgent = params.request ? extractRequestUserAgent(params.request) : null;
  const device = params.request ? extractRequestDevice(params.request) : null;

  void writeAuditLog(
    "REFRESH_ROTATED",
    result.audit.userUid,
    auditSchoolId(result.audit.schoolId),
    {
      sessionId: result.audit.sessionId,
      familyId: result.audit.familyId,
      selector: result.audit.selector,
      device,
    },
    {
      requestId: params.request?.requestId,
      ipAddress: ipAddress ?? undefined,
      userAgent: userAgent ?? undefined,
    }
  );

  return {
    accessToken: result.accessToken,
    refreshToken: result.refreshToken,
    refreshTokenExpiresAt: result.refreshTokenExpiresAt,
    refreshTokenFamilyId: result.refreshTokenFamilyId,
    session: result.session,
  };
}

export async function revokeRefreshTokenFamiliesForSession(params: {
  sessionId: string;
  userUid: string;
  schoolId?: string | null;
  reason?: string;
  request?: FastifyRequest;
}): Promise<{ revokedCount: number; familyIds: string[] }> {
  if (!refreshTokensEnabled()) {
    return { revokedCount: 0, familyIds: [] };
  }

  const now = new Date();

  const families = await prisma.refreshToken.findMany({
    where: {
      sessionId: params.sessionId,
      userUid: params.userUid,
      revokedAt: null,
      expiresAt: { gt: now },
    },
    select: { familyId: true },
  });

  const familyIds = Array.from(new Set(families.map((entry) => entry.familyId)));

  if (familyIds.length === 0) {
    return { revokedCount: 0, familyIds: [] };
  }

  const result = await prisma.refreshToken.updateMany({
    where: {
      familyId: { in: familyIds },
      revokedAt: null,
    },
    data: {
      revokedAt: now,
      revokeReason: params.reason ?? "logout",
    },
  });

  const ipAddress = params.request ? extractRequestIp(params.request) : null;
  const userAgent = params.request ? extractRequestUserAgent(params.request) : null;

  void writeAuditLog(
    "REFRESH_FAMILY_REVOKED",
    params.userUid,
    auditSchoolId(params.schoolId ?? null),
    {
      sessionId: params.sessionId,
      familyIds,
      reason: params.reason ?? "logout",
    },
    {
      requestId: params.request?.requestId,
      ipAddress: ipAddress ?? undefined,
      userAgent: userAgent ?? undefined,
    }
  );

  return { revokedCount: result.count, familyIds };
}

export async function revokeRefreshTokenFamiliesForUser(params: {
  userUid: string;
  schoolId?: string | null;
  reason?: string;
  request?: FastifyRequest;
}): Promise<{ revokedCount: number; familyIds: string[] }> {
  if (!refreshTokensEnabled()) {
    return { revokedCount: 0, familyIds: [] };
  }

  const now = new Date();

  const families = await prisma.refreshToken.findMany({
    where: {
      userUid: params.userUid,
      revokedAt: null,
      expiresAt: { gt: now },
      ...(params.schoolId ? { schoolId: params.schoolId } : {}),
    },
    select: { familyId: true },
  });

  const familyIds = Array.from(new Set(families.map((entry) => entry.familyId)));

  if (familyIds.length === 0) {
    return { revokedCount: 0, familyIds: [] };
  }

  const result = await prisma.refreshToken.updateMany({
    where: {
      familyId: { in: familyIds },
      revokedAt: null,
    },
    data: {
      revokedAt: now,
      revokeReason: params.reason ?? "logout_all",
    },
  });

  const ipAddress = params.request ? extractRequestIp(params.request) : null;
  const userAgent = params.request ? extractRequestUserAgent(params.request) : null;

  void writeAuditLog(
    "REFRESH_FAMILY_REVOKED",
    params.userUid,
    auditSchoolId(params.schoolId ?? null),
    {
      familyIds,
      reason: params.reason ?? "logout_all",
    },
    {
      requestId: params.request?.requestId,
      ipAddress: ipAddress ?? undefined,
      userAgent: userAgent ?? undefined,
    }
  );

  return { revokedCount: result.count, familyIds };
}

export function assertRefreshTokensEnabled(): void {
  if (!refreshTokensEnabled()) {
    throw Errors.badRequest("Refresh tokens are disabled");
  }
}

export function isRefreshTokensEnabled(): boolean {
  return refreshTokensEnabled();
}
