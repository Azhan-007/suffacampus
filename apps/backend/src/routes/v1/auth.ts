/**
 * Public auth routes — no Bearer token required.
 * Called by the mobile app before / during login.
 *
 *  GET  /api/v1/auth/user-by-username?username=  — resolve username → email + role
 *  GET  /api/v1/auth/schools?code=               — verify school code
 *  POST /api/v1/auth/change-password              — force password change (authenticated)
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import { auth as firebaseAuth } from "../../lib/firebase-admin";
import { prisma } from "../../lib/prisma";
import { env } from "../../lib/env";
import { enterCriticalLaneOrReplyOverloaded } from "../../lib/overload";
import { authenticate } from "../../middleware/auth";
import { recordAuthLookupCacheEvent } from "../../plugins/metrics";
import { authRateLimitConfig, refreshRateLimitConfig } from "../../plugins/rateLimit";
import { sendSuccess } from "../../utils/response";
import { Errors } from "../../errors";
import { writeAuditLog } from "../../services/audit.service";
import {
  createSessionWithAccessToken,
  decodeSessionAccessToken,
  revokeAllSessionsForUser,
  revokeSessionById,
  revokeTokenByJti,
} from "../../services/session.service";
import {
  issueRefreshTokenForSession,
  refreshSessionTokens,
  revokeRefreshTokenFamiliesForSession,
  revokeRefreshTokenFamiliesForUser,
  isRefreshTokensEnabled,
} from "../../services/refresh-token.service";
import {
  createTenantAccessState,
  deriveTenantAccessSeed,
  isTenantAccessStateAvailable,
} from "../../services/tenant-lifecycle.service";

async function generateUniqueSchoolCode(schoolName: string): Promise<string> {
  const prefix = schoolName
    .replace(/[^a-zA-Z0-9]/g, "")
    .toUpperCase()
    .slice(0, 4) || "EDU";

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const suffix = Math.floor(1000 + Math.random() * 9000);
    const code = `${prefix}${suffix}`;
    const existing = await prisma.school.findUnique({ where: { code }, select: { id: true } });
    if (!existing) return code;
  }

  throw Errors.conflict("Unable to generate a unique school code");
}

export default async function authRoutes(server: FastifyInstance) {
  const USERNAME_LOOKUP_TTL_SECONDS = 60;
  const SCHOOL_LOOKUP_TTL_SECONDS = 120;

  /**
   * Resolve a username to email + role so the mobile app can call
   * Firebase signInWithEmailAndPassword.
   */
  server.get<{ Querystring: { username?: string } }>(
    "/auth/user-by-username",
    authRateLimitConfig,
    async (
      request: FastifyRequest<{ Querystring: { username?: string } }>,
      reply: FastifyReply
    ) => {
      const release = enterCriticalLaneOrReplyOverloaded(
        request,
        reply,
        "auth_lookup"
      );
      if (!release) return;

      try {
      const username = (request.query.username ?? "").trim().toLowerCase();

      if (!username) {
        throw Errors.badRequest("username query param is required");
      }

      const usernameCacheKey = `lookup:${username}`;
      const cachedUser = server.cache?.get<Record<string, unknown>>("user", usernameCacheKey);
      if (cachedUser) {
        recordAuthLookupCacheEvent("username", "hit");
        return sendSuccess(request, reply, cachedUser);
      }
      recordAuthLookupCacheEvent("username", "miss");

      // Prisma-first lookup (authoritative for newly created users).
      const prismaUser = await prisma.user.findFirst({
        where: { username, isActive: true },
        select: {
          email: true,
          role: true,
          displayName: true,
          studentId: true,
          teacherId: true,
          requirePasswordChange: true,
        },
      });

      if (prismaUser) {
        const payload = {
          email: prismaUser.email,
          role: prismaUser.role,
          name: prismaUser.displayName ?? "",
          studentId: prismaUser.studentId ?? null,
          teacherId: prismaUser.teacherId ?? null,
          requirePasswordChange: prismaUser.requirePasswordChange ?? false,
        };

        server.cache?.setWithTTL("user", usernameCacheKey, payload, USERNAME_LOOKUP_TTL_SECONDS);
        return sendSuccess(request, reply, payload);
      }

      throw Errors.notFound("User");
      } finally {
        release();
      }
    }
  );

  /**
   * Verify a school code and return school details.
   */
  server.get<{ Querystring: { code?: string } }>(
    "/auth/schools",
    authRateLimitConfig,
    async (
      request: FastifyRequest<{ Querystring: { code?: string } }>,
      reply: FastifyReply
    ) => {
      const release = enterCriticalLaneOrReplyOverloaded(
        request,
        reply,
        "auth_lookup"
      );
      if (!release) return;

      try {
      const code = (request.query.code ?? "").trim().toUpperCase();

      if (!code) {
        throw Errors.badRequest("code query param is required");
      }

      const schoolCacheKey = `lookup:${code}`;
      const cachedSchool = server.cache?.get<Record<string, unknown>>("school", schoolCacheKey);
      if (cachedSchool) {
        recordAuthLookupCacheEvent("school", "hit");
        return sendSuccess(request, reply, cachedSchool);
      }
      recordAuthLookupCacheEvent("school", "miss");

      // Prisma-first lookup (authoritative for super-admin created schools).
      const prismaSchool = await prisma.school.findUnique({
        where: { code },
        select: {
          id: true,
          name: true,
          code: true,
          loginTagline: true,
          email: true,
          phone: true,
          website: true,
          address: true,
          logoURL: true,
          primaryColor: true,
          isActive: true,
        },
      });

      if (prismaSchool && prismaSchool.isActive) {
        const payload = {
          id: prismaSchool.id,
          name: prismaSchool.name,
          code: prismaSchool.code,
          tagline: prismaSchool.loginTagline ?? undefined,
          supportEmail: prismaSchool.email ?? undefined,
          supportPhone: prismaSchool.phone ?? undefined,
          helpUrl: prismaSchool.website ?? undefined,
          address: prismaSchool.address ?? undefined,
          logoUrl: prismaSchool.logoURL ?? undefined,
          primaryColor: prismaSchool.primaryColor ?? undefined,
        };

        server.cache?.setWithTTL("school", schoolCacheKey, payload, SCHOOL_LOOKUP_TTL_SECONDS);
        return sendSuccess(request, reply, payload);
      }

      throw Errors.notFound("School");
      } finally {
        release();
      }
    }
  );

  // -----------------------------------------------------------------------
  // POST /api/v1/auth/change-password — force or voluntary password change
  // -----------------------------------------------------------------------
  const changePasswordSchema = z.object({
    newPassword: z
      .string()
      .min(8, "Password must be at least 8 characters")
      .max(128, "Password too long")
      .regex(
        /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
        "Password must contain at least one uppercase letter, one lowercase letter, and one digit"
      ),
  }).strict();

  server.post(
    "/auth/change-password",
    { ...authRateLimitConfig, preHandler: [authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = changePasswordSchema.safeParse(request.body);
      if (!parsed.success) {
        throw Errors.validation(parsed.error.flatten().fieldErrors);
      }

      const uid = request.user!.uid;

      // Update Firebase Auth password
      await firebaseAuth.updateUser(uid, {
        password: parsed.data.newPassword,
      });

      // Clear the requirePasswordChange flag in primary auth datastore.
      await prisma.user.updateMany({
        where: { uid },
        data: { requirePasswordChange: false },
      });

      return sendSuccess(request, reply, {
        message: "Password changed successfully",
      });
    }
  );

  // -----------------------------------------------------------------------
  // GET /api/v1/auth/me — return current authenticated user's profile
  // -----------------------------------------------------------------------
  server.get(
    "/auth/me",
    { ...authRateLimitConfig, preHandler: [authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = request.user!;

      // Resolve assigned classes from the Teacher relation if user is a teacher.
      // The User model doesn't have assignedClasses — it lives on TeacherClassAssignment.
      let assignedClasses: Array<{
        classId: string;
        sectionId: string;
        className: string | null;
        sectionName: string | null;
      }> = [];

      const teacherId =
        typeof user.teacherId === "string" && user.teacherId.trim().length > 0
          ? user.teacherId
          : null;

      if (teacherId) {
        try {
          assignedClasses = await prisma.teacherClassAssignment.findMany({
            where: { teacherId },
            select: {
              classId: true,
              sectionId: true,
              className: true,
              sectionName: true,
            },
          });
        } catch {
          // If TeacherClassAssignment table doesn't exist yet, return empty
          assignedClasses = [];
        }
      }

      return sendSuccess(request, reply, {
        uid: user.uid,
        email: user.email,
        displayName: user.name ?? user.displayName ?? "",
        role: user.role ?? "",
        schoolId: user.schoolId ?? null,
        phone: user.phone ?? null,
        photoURL: user.photoURL ?? null,
        isActive: user.isActive ?? true,
        requirePasswordChange: user.requirePasswordChange ?? false,
        createdAt: user.createdAt ?? null,
        lastLogin: user.lastLogin ?? null,
        teacherId: teacherId,
        studentId: (user.studentId as string) ?? null,
        assignedClasses,
      });
    }
  );

  // -----------------------------------------------------------------------
  // POST /api/v1/auth/login — record login and return user profile
  // Used by web panel after Firebase signInWithEmailAndPassword.
  // -----------------------------------------------------------------------
  server.post(
    "/auth/login",
    { ...authRateLimitConfig, preHandler: [authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const release = enterCriticalLaneOrReplyOverloaded(
        request,
        reply,
        "auth_login"
      );
      if (!release) return;

      try {
      const uid = request.user!.uid;
      const user = request.user!;
      const nowIso = new Date().toISOString();
      const isTestEnv = process.env.NODE_ENV === "test";

      // Update last-login asynchronously in Prisma (primary datastore).
      const persistPrismaLastLogin = async () => {
        await prisma.user.updateMany({
          where: { uid },
          data: { lastLogin: new Date(nowIso) },
        });
      };

      if (isTestEnv) {
        await persistPrismaLastLogin();
      } else {
        void persistPrismaLastLogin();
      }

      // Invalidate user cache so next request picks up the new lastLogin
      server.cache?.del("user", uid);
      if (typeof user.username === "string" && user.username.length > 0) {
        server.cache?.del("user", `lookup:${user.username.toLowerCase()}`);
      }

      const auditSchoolId =
        typeof user.schoolId === "string" && user.schoolId.trim().length > 0
          ? user.schoolId
          : "platform";

      try {
        await writeAuditLog("USER_LOGIN", uid, auditSchoolId, {
          role: user.role ?? null,
          email: user.email,
        });
      } catch (error) {
        request.log.error(
          { err: error, uid, schoolId: auditSchoolId },
          "Failed to write USER_LOGIN audit log"
        );
      }

      const { accessToken, session } = await createSessionWithAccessToken({
        userUid: uid,
        schoolId:
          typeof user.schoolId === "string" && user.schoolId.trim().length > 0
            ? user.schoolId
            : null,
        role: typeof user.role === "string" ? user.role : null,
        request,
      });

      const shouldIssueRefresh = isRefreshTokensEnabled();
      let refreshPayload: {
        refreshToken: string;
        refreshTokenId: string;
        refreshTokenFamilyId: string;
        refreshTokenExpiresAt: Date;
      } | null = null;
      let refreshError: unknown = null;

      if (shouldIssueRefresh) {
        try {
          const refresh = await issueRefreshTokenForSession({
            sessionId: session.id,
            userUid: uid,
            schoolId:
              typeof user.schoolId === "string" && user.schoolId.trim().length > 0
                ? user.schoolId
                : null,
            request,
          });

          refreshPayload = {
            refreshToken: refresh.refreshToken,
            refreshTokenId: refresh.refreshTokenId,
            refreshTokenFamilyId: refresh.refreshTokenFamilyId,
            refreshTokenExpiresAt: refresh.refreshTokenExpiresAt,
          };
        } catch (error) {
          refreshError = error;
          request.log.error(
            { err: error, uid, sessionId: session.id },
            "Failed to issue refresh token"
          );
        }
      }

      if (env.AUTH_REQUIRE_REFRESH_FLOW && shouldIssueRefresh && !refreshPayload) {
        await revokeSessionById({
          sessionId: session.id,
          userUid: uid,
          schoolId:
            typeof user.schoolId === "string" && user.schoolId.trim().length > 0
              ? user.schoolId
              : undefined,
          reason: "refresh_required_failed",
        });

        throw Errors.internal(
          refreshError instanceof Error
            ? refreshError.message
            : "Refresh token issuance failed"
        );
      }

      const responsePayload: Record<string, unknown> = {
        uid,
        email: user.email,
        displayName: user.name ?? user.displayName ?? "",
        role: user.role ?? "",
        schoolId: user.schoolId ?? null,
        phone: user.phone ?? null,
        photoURL: user.photoURL ?? null,
        isActive: user.isActive ?? true,
        requirePasswordChange: user.requirePasswordChange ?? false,
        createdAt: user.createdAt ?? null,
        lastLogin: nowIso,
        accessToken,
        session: {
          id: session.id,
          device: session.device,
          ipAddress: session.ipAddress,
          userAgent: session.userAgent,
          lastActiveAt: session.lastActiveAt,
          expiresAt: session.expiresAt,
        },
      };

      if (shouldIssueRefresh) {
        responsePayload.refreshTokenRequired = env.AUTH_REQUIRE_REFRESH_FLOW;
      }

      if (refreshPayload) {
        Object.assign(responsePayload, refreshPayload);
      }

      return sendSuccess(request, reply, responsePayload);
      } finally {
        release();
      }
    }
  );

  const refreshSchema = z.object({
    refreshToken: z.string().min(1),
  }).strict();

  // -----------------------------------------------------------------------
  // POST /api/v1/auth/refresh — rotate refresh token and issue access JWT
  // -----------------------------------------------------------------------
  server.post(
    "/auth/refresh",
    refreshRateLimitConfig,
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = refreshSchema.safeParse(request.body);
      if (!parsed.success) {
        throw Errors.validation(parsed.error.flatten().fieldErrors);
      }

      if (!isRefreshTokensEnabled()) {
        throw Errors.badRequest("Refresh tokens are disabled");
      }

      const result = await refreshSessionTokens({
        refreshToken: parsed.data.refreshToken,
        request,
      });

      return sendSuccess(request, reply, {
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        refreshTokenExpiresAt: result.refreshTokenExpiresAt,
        refreshTokenFamilyId: result.refreshTokenFamilyId,
        session: result.session,
      });
    }
  );

  const revokeTokenSchema = z.object({
    token: z.string().min(1).optional(),
    jti: z.string().min(1).optional(),
    sessionId: z.string().min(1).optional(),
    reason: z.string().min(1).max(120).optional(),
  }).strict();

  // -----------------------------------------------------------------------
  // POST /api/v1/auth/logout — logout current session
  // -----------------------------------------------------------------------
  server.post(
    "/auth/logout",
    { ...authRateLimitConfig, preHandler: [authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (request.session?.source !== "session-jwt") {
        throw Errors.badRequest(
          "Session JWT is required to logout the current session"
        );
      }

      const revoked = await revokeSessionById({
        sessionId: request.session.id,
        userUid: request.user.uid,
        schoolId:
          typeof request.user.schoolId === "string"
            ? request.user.schoolId
            : undefined,
        reason: "logout_current",
      });

      if (!revoked) {
        throw Errors.notFound("Session", request.session.id);
      }

      let refreshRevokedCount = 0;
      if (isRefreshTokensEnabled()) {
        const refreshResult = await revokeRefreshTokenFamiliesForSession({
          sessionId: request.session.id,
          userUid: request.user.uid,
          schoolId:
            typeof request.user.schoolId === "string"
              ? request.user.schoolId
              : null,
          reason: "logout_current",
          request,
        });

        refreshRevokedCount = refreshResult.revokedCount;
      }

      return sendSuccess(request, reply, {
        revoked: true,
        sessionId: request.session.id,
        refreshRevokedCount,
      });
    }
  );

  // -----------------------------------------------------------------------
  // POST /api/v1/auth/logout-all — logout all sessions for current user
  // -----------------------------------------------------------------------
  server.post(
    "/auth/logout-all",
    { ...authRateLimitConfig, preHandler: [authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const result = await revokeAllSessionsForUser({
        userUid: request.user.uid,
        schoolId:
          typeof request.user.schoolId === "string"
            ? request.user.schoolId
            : undefined,
        reason: "logout_all",
      });

      let refreshRevokedCount = 0;
      if (isRefreshTokensEnabled()) {
        const refreshResult = await revokeRefreshTokenFamiliesForUser({
          userUid: request.user.uid,
          schoolId:
            typeof request.user.schoolId === "string"
              ? request.user.schoolId
              : null,
          reason: "logout_all",
          request,
        });

        refreshRevokedCount = refreshResult.revokedCount;
      }

      return sendSuccess(request, reply, {
        revoked: true,
        revokedCount: result.revokedCount,
        refreshRevokedCount,
      });
    }
  );

  // -----------------------------------------------------------------------
  // POST /api/v1/auth/revoke-token — revoke a JWT by token or jti
  // -----------------------------------------------------------------------
  server.post(
    "/auth/revoke-token",
    { ...authRateLimitConfig, preHandler: [authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = revokeTokenSchema.safeParse(request.body);
      if (!parsed.success) {
        throw Errors.validation(parsed.error.flatten().fieldErrors);
      }

      let jti = parsed.data.jti;
      let sessionId = parsed.data.sessionId;

      if (parsed.data.token) {
        const decoded = decodeSessionAccessToken(parsed.data.token);
        if (!decoded) {
          throw Errors.badRequest("Provided token is not a valid session JWT");
        }

        if (decoded.sub !== request.user.uid) {
          throw Errors.tokenInvalid();
        }

        jti = decoded.jti;
        sessionId = decoded.sid;
      }

      if (!jti) {
        if (request.session?.source !== "session-jwt") {
          throw Errors.badRequest("Provide token or jti to revoke");
        }

        jti = request.session.jti;
        sessionId = request.session.id;
      }

      const revoked = await revokeTokenByJti({
        jti,
        sessionId,
        userUid: request.user.uid,
        schoolId:
          typeof request.user.schoolId === "string"
            ? request.user.schoolId
            : undefined,
        reason: parsed.data.reason,
      });

      if (!revoked && sessionId) {
        throw Errors.notFound("Session", sessionId);
      }

      return sendSuccess(request, reply, {
        revoked: true,
        jti,
        sessionId: sessionId ?? null,
      });
    }
  );

  // -----------------------------------------------------------------------
  // POST /api/v1/auth/register — school self-onboarding
  // Creates a new school (14-day trial) + admin user in one step.
  // Public endpoint — no token required.
  // -----------------------------------------------------------------------
  const registerSchema = z.object({
    schoolName: z.string().min(2, "School name is required").max(200).trim(),
    adminName: z.string().min(2, "Admin name is required").max(200).trim(),
    email: z.string().email("Invalid email"),
    password: z
      .string()
      .min(8, "Password must be at least 8 characters")
      .max(128)
      .regex(
        /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
        "Must contain uppercase, lowercase, and digit"
      ),
    phone: z.string().max(20).optional(),
    city: z.string().min(1).max(100).trim().default(""),
  }).strict();

  server.post(
    "/auth/register",
    authRateLimitConfig,
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = registerSchema.safeParse(request.body);
      if (!parsed.success) {
        throw Errors.validation(parsed.error.flatten().fieldErrors);
      }

      const { schoolName, adminName, email, password, phone, city } = parsed.data;
      const normalizedEmail = email.trim().toLowerCase();

      const existingUser = await prisma.user.findFirst({
        where: { email: normalizedEmail },
        select: { id: true },
      });
      if (existingUser) {
        throw Errors.alreadyExists("User", normalizedEmail);
      }

      let firebaseUid: string | null = null;
      let createdSchoolId: string | null = null;

      try {
        const firebaseUser = await firebaseAuth.createUser({
          email: normalizedEmail,
          password,
          displayName: adminName,
        });
        firebaseUid = firebaseUser.uid;

        const schoolCode = await generateUniqueSchoolCode(schoolName);
        const trialEnd = new Date();
        trialEnd.setDate(trialEnd.getDate() + 14);
        const trialEndDate = trialEnd.toISOString().split("T")[0];

        const created = await prisma.$transaction(async (tx) => {
          const school = await tx.school.create({
            data: {
              name: schoolName,
              code: schoolCode,
              city: city || "Unknown",
              email: normalizedEmail,
              phone: phone ?? null,
              primaryColor: "#1a73e8",
              secondaryColor: "#4285f4",
              subscriptionPlan: "free",
              subscriptionStatus: "trial",
              trialEndDate,
              autoRenew: false,
              paymentFailureCount: 0,
              maxStudents: 200,
              maxTeachers: 20,
              maxStorage: 1024,
              timezone: "Asia/Kolkata",
              currency: "INR",
              dateFormat: "DD/MM/YYYY",
              isActive: true,
            },
          });

          await tx.user.create({
            data: {
              uid: firebaseUid!,
              email: normalizedEmail,
              displayName: adminName,
              role: "Admin",
              schoolId: school.id,
              phone: phone ?? null,
              isActive: true,
            },
          });

          await tx.subscription.create({
            data: {
              schoolId: school.id,
              plan: "free",
              status: "trial",
              billingCycle: "monthly",
              trialEndDate: trialEnd,
              endDate: trialEnd,
              autoRenew: false,
              amount: 0,
              currency: "INR",
            },
          });

          const seed = deriveTenantAccessSeed({
            subscriptionStatus: school.subscriptionStatus ?? "trial",
            trialEndDate: school.trialEndDate ?? trialEnd,
            currentPeriodEnd: school.currentPeriodEnd ?? null,
            cancelEffectiveDate: school.cancelEffectiveDate ?? null,
            isActive: school.isActive ?? true,
          });

          const access = await createTenantAccessState({
            schoolId: school.id,
            lifecycleState: seed.lifecycleState,
            accessState: seed.accessState,
            reason: "self_onboarding",
            effectiveUntil: seed.effectiveUntil,
            performedBy: firebaseUid ?? "system",
            source: "auth_register",
            useTransaction: tx,
          });

          if (isTenantAccessStateAvailable() && !access) {
            throw Errors.internal("Failed to bootstrap tenant access state");
          }

          await tx.schoolConfig.create({
            data: {
              schoolId: school.id,
              summaryCard: {
                enabled: true,
                title: "Today's Summary",
                items: {
                  classesToday: {
                    enabled: true,
                    label: "Classes",
                    icon: "book-open-variant",
                    color: "#4C6EF5",
                    route: "/teacher/schedule",
                  },
                  classesCompleted: {
                    enabled: true,
                    label: "Completed",
                    icon: "check-circle",
                    color: "#10B981",
                    route: "/teacher/schedule",
                  },
                  totalStudents: {
                    enabled: true,
                    label: "Students",
                    icon: "account-group",
                    color: "#F59E0B",
                    route: "/teacher/attendance",
                  },
                },
              },
              metadata: {
                subscriptionBootstrap: {
                  plan: "free",
                  limits: {
                    maxStudents: 200,
                    maxTeachers: 20,
                  },
                },
              },
            },
          });

          return school;
        });

        createdSchoolId = created.id;

        await firebaseAuth.setCustomUserClaims(firebaseUid, {
          role: "Admin",
          schoolId: created.id,
        });

        await writeAuditLog("SCHOOL_REGISTERED", firebaseUid, created.id, {
          schoolName,
          adminEmail: normalizedEmail,
          schoolCode: created.code,
        });

        return sendSuccess(
          request,
          reply,
          {
            schoolId: created.id,
            schoolCode: created.code,
            uid: firebaseUid,
            email: normalizedEmail,
            role: "Admin",
            trialEndDate,
            message: `School "${schoolName}" created with a 14-day free trial.`,
          },
          201
        );
      } catch (error) {
        if (createdSchoolId) {
          await prisma.$transaction([
            prisma.subscription.deleteMany({ where: { schoolId: createdSchoolId } }),
            prisma.user.deleteMany({ where: { schoolId: createdSchoolId } }),
            prisma.school.deleteMany({ where: { id: createdSchoolId } }),
          ]).catch(() => {
            // Best-effort rollback.
          });
        }

        if (firebaseUid) {
          await firebaseAuth.deleteUser(firebaseUid).catch(() => {
            // Best-effort rollback.
          });
        }

        throw error;
      }
    }
  );
}
