import crypto from "crypto";
import type { FastifyRequest } from "fastify";
import jwt, {
  JsonWebTokenError,
  NotBeforeError,
  TokenExpiredError,
  type JwtPayload,
} from "jsonwebtoken";
import { prisma } from "../lib/prisma";
import { env } from "../lib/env";
import { createLogger } from "../utils/logger";
import { resolveAccessVersion } from "./tenant-lifecycle.service";

const log = createLogger("session-service");

const SESSION_ACTIVITY_WRITE_INTERVAL_MS = 60_000;
const SESSION_CLEANUP_INTERVAL_MS = 15 * 60_000;
const SESSION_RETENTION_MS = 7 * 24 * 60 * 60_000;
const MAX_ACTIVE_SESSIONS_PER_USER = 25;

let lastCleanupRunAt = 0;
let cleanupInFlight: Promise<void> | null = null;

type SessionLike = {
  id: string;
  userUid: string;
  schoolId: string | null;
  device: string;
  ipAddress: string | null;
  userAgent: string | null;
  currentJti: string;
  lastActiveAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
};

export type SessionJwtPayload = JwtPayload & {
  sub: string;
  sid: string;
  jti: string;
  typ: "access";
  schoolId?: string | null;
  role?: string | null;
  accessVersion?: number;
};

export type SessionAuthContext = {
  id: string;
  userUid: string;
  schoolId: string | null;
  jti: string;
  device: string;
  ipAddress: string | null;
  userAgent: string | null;
  lastActiveAt: Date;
  expiresAt: Date;
  accessVersion?: number;
};

type CreateSessionParams = {
  userUid: string;
  schoolId?: string | null;
  role?: string | null;
  request: FastifyRequest;
};

type RevokeSessionParams = {
  sessionId: string;
  userUid: string;
  schoolId?: string;
  reason?: string;
};

type RevokeAllSessionsParams = {
  userUid: string;
  schoolId?: string;
  excludeSessionId?: string;
  reason?: string;
};

type RevokeTokenByJtiParams = {
  jti: string;
  userUid: string;
  schoolId?: string;
  sessionId?: string;
  reason?: string;
  expiresAt?: Date;
};

type SessionRevocationSeed = {
  id: string;
  userUid: string;
  schoolId: string | null;
  currentJti: string;
  expiresAt: Date;
};

function firstHeaderValue(value: string | string[] | undefined): string | null {
  if (!value) return null;
  if (Array.isArray(value)) {
    return value.length > 0 ? value[0] : null;
  }
  return value;
}

export function extractRequestIp(request: FastifyRequest): string | null {
  const proxiedRequest = request as FastifyRequest & { ips?: string[] };
  if (Array.isArray(proxiedRequest.ips) && proxiedRequest.ips.length > 0) {
    const forwardedIp = proxiedRequest.ips[0]?.trim();
    if (forwardedIp) {
      return forwardedIp;
    }
  }

  if (request.ip && request.ip.trim().length > 0) {
    return request.ip.trim();
  }

  return null;
}

export function extractRequestUserAgent(request: FastifyRequest): string | null {
  const userAgent = firstHeaderValue(request.headers["user-agent"]);
  if (!userAgent) return null;

  const trimmed = userAgent.trim();
  if (!trimmed) return null;

  return trimmed.slice(0, 512);
}

export function extractRequestDevice(request: FastifyRequest): string {
  const explicitDevice =
    firstHeaderValue(request.headers["x-device"]) ??
    firstHeaderValue(request.headers["x-device-name"]) ??
    firstHeaderValue(request.headers["x-device-id"]);

  if (explicitDevice && explicitDevice.trim().length > 0) {
    return explicitDevice.trim().slice(0, 128);
  }

  const userAgent = extractRequestUserAgent(request) ?? "unknown";

  if (/android/i.test(userAgent)) return "Android";
  if (/iphone|ipad|ios/i.test(userAgent)) return "iOS";
  if (/windows/i.test(userAgent)) return "Windows";
  if (/macintosh|mac os/i.test(userAgent)) return "macOS";
  if (/linux/i.test(userAgent)) return "Linux";

  return "Unknown Device";
}

function toSessionJwtPayload(value: string | JwtPayload): SessionJwtPayload | null {
  if (typeof value === "string") {
    return null;
  }

  const sub = typeof value.sub === "string" ? value.sub : null;
  const sid = typeof value.sid === "string" ? value.sid : null;
  const jti = typeof value.jti === "string" ? value.jti : null;
  const typ = value.typ === "access" ? "access" : null;
  const accessVersion =
    typeof (value as { accessVersion?: unknown }).accessVersion === "number"
      ? (value as { accessVersion: number }).accessVersion
      : undefined;

  if (!sub || !sid || !jti || !typ) {
    return null;
  }

  return {
    ...value,
    sub,
    sid,
    jti,
    typ,
    accessVersion,
  };
}

function signAccessToken(payload: Omit<SessionJwtPayload, keyof JwtPayload>): string {
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    algorithm: "HS256",
    expiresIn: env.JWT_ACCESS_TTL_SECONDS,
    issuer: env.JWT_ISSUER,
    audience: env.JWT_AUDIENCE,
  });
}

function hasPrismaTransactionSupport(): boolean {
  return typeof (prisma as unknown as { $transaction?: unknown }).$transaction === "function";
}

async function cleanupExpiredSessionArtifacts(now: Date): Promise<void> {
  if (!hasPrismaTransactionSupport()) {
    return;
  }

  await prisma.$transaction(async (tx) => {
    await tx.revokedToken.deleteMany({
      where: {
        expiresAt: { lt: now },
      },
    });

    await tx.session.deleteMany({
      where: {
        expiresAt: {
          lt: new Date(now.getTime() - SESSION_RETENTION_MS),
        },
      },
    });
  });
}

function maybeRunSessionCleanup(): void {
  const nowMs = Date.now();
  if (nowMs - lastCleanupRunAt < SESSION_CLEANUP_INTERVAL_MS) {
    return;
  }

  if (cleanupInFlight) {
    return;
  }

  lastCleanupRunAt = nowMs;

  cleanupInFlight = (async () => {
    try {
      await cleanupExpiredSessionArtifacts(new Date(nowMs));
    } catch (error) {
      // Best-effort cleanup should never crash request handling.
      log.error({ err: error }, "Session cleanup failed");
    } finally {
      cleanupInFlight = null;
    }
  })();
}

async function revokeSessionSeeds(
  sessions: SessionRevocationSeed[],
  reason: string,
  now: Date
): Promise<void> {
  if (sessions.length === 0) {
    return;
  }

  await prisma.$transaction(async (tx) => {
    await tx.session.updateMany({
      where: {
        id: { in: sessions.map((session) => session.id) },
      },
      data: {
        revokedAt: now,
        revokeReason: reason,
        lastActiveAt: now,
      },
    });

    await tx.revokedToken.createMany({
      data: sessions.map((session) => ({
        jti: session.currentJti,
        sessionId: session.id,
        userUid: session.userUid,
        schoolId: session.schoolId,
        reason,
        expiresAt: session.expiresAt,
      })),
      skipDuplicates: true,
    });
  });
}

async function enforceUserSessionCap(userUid: string, schoolId?: string | null): Promise<void> {
  const now = new Date();
  const activeCount = await prisma.session.count({
    where: {
      userUid,
      revokedAt: null,
      expiresAt: { gt: now },
      ...(schoolId ? { schoolId } : {}),
    },
  });

  if (activeCount < MAX_ACTIVE_SESSIONS_PER_USER) {
    return;
  }

  const overflowCount = activeCount - MAX_ACTIVE_SESSIONS_PER_USER + 1;
  const oldestSessions = await prisma.session.findMany({
    where: {
      userUid,
      revokedAt: null,
      expiresAt: { gt: now },
      ...(schoolId ? { schoolId } : {}),
    },
    orderBy: [{ lastActiveAt: "asc" }, { createdAt: "asc" }],
    take: overflowCount,
    select: {
      id: true,
      userUid: true,
      schoolId: true,
      currentJti: true,
      expiresAt: true,
    },
  });

  await revokeSessionSeeds(oldestSessions, "session_limit_exceeded", now);
}

export function decodeSessionAccessToken(token: string): SessionJwtPayload | null {
  try {
    const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET, {
      issuer: env.JWT_ISSUER,
      audience: env.JWT_AUDIENCE,
      algorithms: ["HS256"],
    });

    return toSessionJwtPayload(decoded);
  } catch (error) {
    if (
      error instanceof JsonWebTokenError ||
      error instanceof TokenExpiredError ||
      error instanceof NotBeforeError
    ) {
      return null;
    }

    throw error;
  }
}

async function touchSessionActivity(session: SessionLike, request: FastifyRequest): Promise<void> {
  const now = new Date();
  const ipAddress = extractRequestIp(request);
  const userAgent = extractRequestUserAgent(request);
  const device = extractRequestDevice(request);

  const staleActivity =
    now.getTime() - session.lastActiveAt.getTime() >=
    SESSION_ACTIVITY_WRITE_INTERVAL_MS;

  const ipChanged = session.ipAddress !== (ipAddress ?? null);
  const userAgentChanged = session.userAgent !== (userAgent ?? null);
  const deviceChanged = session.device !== device;

  if (!staleActivity && !ipChanged && !userAgentChanged && !deviceChanged) {
    return;
  }

  await prisma.session.updateMany({
    where: {
      id: session.id,
      revokedAt: null,
    },
    data: {
      lastActiveAt: now,
      ipAddress: ipAddress ?? null,
      userAgent: userAgent ?? null,
      device,
    },
  });
}

export async function createSessionWithAccessToken(
  params: CreateSessionParams
): Promise<{ accessToken: string; session: SessionLike }> {
  maybeRunSessionCleanup();

  await enforceUserSessionCap(params.userUid, params.schoolId ?? null);

  const now = new Date();
  const expiresAt = new Date(now.getTime() + env.JWT_ACCESS_TTL_SECONDS * 1000);
  const jti = crypto.randomUUID();

  const session = await prisma.session.create({
    data: {
      userUid: params.userUid,
      schoolId: params.schoolId ?? null,
      device: extractRequestDevice(params.request),
      ipAddress: extractRequestIp(params.request),
      userAgent: extractRequestUserAgent(params.request),
      currentJti: jti,
      lastActiveAt: now,
      expiresAt,
    },
  });

  const accessVersion = await resolveAccessVersion(params.schoolId ?? null);

  const accessToken = signAccessToken({
    sub: params.userUid,
    sid: session.id,
    jti,
    typ: "access",
    schoolId: params.schoolId ?? null,
    role: params.role ?? null,
    accessVersion,
  });

  return { accessToken, session };
}

export async function validateSessionAccessToken(
  token: string,
  request?: FastifyRequest
): Promise<SessionAuthContext | null> {
  maybeRunSessionCleanup();

  const payload = decodeSessionAccessToken(token);
  if (!payload) {
    return null;
  }

  const now = new Date();

  const revokedToken = await prisma.revokedToken.findUnique({
    where: { jti: payload.jti },
    select: { id: true, expiresAt: true },
  });

  if (revokedToken && revokedToken.expiresAt > now) {
    return null;
  }

  const session = await prisma.session.findFirst({
    where: {
      id: payload.sid,
      userUid: payload.sub,
      currentJti: payload.jti,
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
    return null;
  }

  if (request) {
    await touchSessionActivity(session, request);
  }

  return {
    id: session.id,
    userUid: session.userUid,
    schoolId: session.schoolId,
    jti: session.currentJti,
    device: session.device,
    ipAddress: session.ipAddress,
    userAgent: session.userAgent,
    lastActiveAt: session.lastActiveAt,
    expiresAt: session.expiresAt,
    accessVersion: payload.accessVersion,
  };
}

export async function listActiveSessionsForUser(
  userUid: string,
  schoolId?: string,
  limit = 50
): Promise<SessionLike[]> {
  const now = new Date();
  const safeLimit = Math.max(1, Math.min(limit, 100));

  return prisma.session.findMany({
    where: {
      userUid,
      revokedAt: null,
      expiresAt: { gt: now },
      ...(schoolId ? { schoolId } : {}),
    },
    orderBy: [{ lastActiveAt: "desc" }, { createdAt: "desc" }],
    take: safeLimit,
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
}

export async function revokeSessionById(
  params: RevokeSessionParams
): Promise<boolean> {
  const session = await prisma.session.findFirst({
    where: {
      id: params.sessionId,
      userUid: params.userUid,
      revokedAt: null,
      ...(params.schoolId ? { schoolId: params.schoolId } : {}),
    },
    select: {
      id: true,
      userUid: true,
      schoolId: true,
      currentJti: true,
      expiresAt: true,
    },
  });

  if (!session) {
    return false;
  }

  const reason = params.reason ?? "manual_logout";
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.session.update({
      where: { id: session.id },
      data: {
        revokedAt: now,
        revokeReason: reason,
        lastActiveAt: now,
      },
    });

    await tx.revokedToken.upsert({
      where: { jti: session.currentJti },
      update: {
        reason,
        expiresAt: session.expiresAt,
        sessionId: session.id,
        userUid: session.userUid,
        schoolId: session.schoolId,
      },
      create: {
        jti: session.currentJti,
        reason,
        expiresAt: session.expiresAt,
        sessionId: session.id,
        userUid: session.userUid,
        schoolId: session.schoolId,
      },
    });
  });

  return true;
}

export async function revokeAllSessionsForUser(
  params: RevokeAllSessionsParams
): Promise<{ revokedCount: number }> {
  const now = new Date();

  const sessions = await prisma.session.findMany({
    where: {
      userUid: params.userUid,
      revokedAt: null,
      expiresAt: { gt: now },
      ...(params.schoolId ? { schoolId: params.schoolId } : {}),
      ...(params.excludeSessionId ? { id: { not: params.excludeSessionId } } : {}),
    },
    select: {
      id: true,
      userUid: true,
      schoolId: true,
      currentJti: true,
      expiresAt: true,
    },
  });

  if (sessions.length === 0) {
    return { revokedCount: 0 };
  }

  const reason = params.reason ?? "logout_all";

  await revokeSessionSeeds(sessions, reason, now);

  return { revokedCount: sessions.length };
}

export async function revokeTokenByJti(
  params: RevokeTokenByJtiParams
): Promise<boolean> {
  const reason = params.reason ?? "manual_token_revoke";

  let expiresAt = params.expiresAt;
  let schoolId = params.schoolId ?? null;

  if (params.sessionId) {
    const session = await prisma.session.findFirst({
      where: {
        id: params.sessionId,
        userUid: params.userUid,
      },
      select: {
        expiresAt: true,
        schoolId: true,
      },
    });

    if (!session) {
      return false;
    }

    expiresAt = expiresAt ?? session.expiresAt;
    schoolId = schoolId ?? session.schoolId;
  }

  await prisma.revokedToken.upsert({
    where: { jti: params.jti },
    update: {
      reason,
      expiresAt:
        expiresAt ??
        new Date(Date.now() + env.JWT_ACCESS_TTL_SECONDS * 1000),
      sessionId: params.sessionId ?? null,
      userUid: params.userUid,
      schoolId,
    },
    create: {
      jti: params.jti,
      reason,
      expiresAt:
        expiresAt ??
        new Date(Date.now() + env.JWT_ACCESS_TTL_SECONDS * 1000),
      sessionId: params.sessionId ?? null,
      userUid: params.userUid,
      schoolId,
    },
  });

  return true;
}
