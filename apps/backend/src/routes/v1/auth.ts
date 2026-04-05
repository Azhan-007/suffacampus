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
import { auth as firebaseAuth, firestore } from "../../lib/firebase-admin";
import { prisma } from "../../lib/prisma";
import { enterCriticalLaneOrReplyOverloaded } from "../../lib/overload";
import { authenticate } from "../../middleware/auth";
import { recordAuthLookupCacheEvent } from "../../plugins/metrics";
import { sendSuccess } from "../../utils/response";
import { Errors } from "../../errors";
import { writeAuditLog } from "../../services/audit.service";

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

  // Stricter rate limiting for auth routes (brute-force protection)
  const authRateLimit = {
    config: {
      rateLimit: {
        max: 5,
        timeWindow: "1 minute",
      },
    },
  };

  /**
   * Resolve a username to email + role so the mobile app can call
   * Firebase signInWithEmailAndPassword.
   */
  server.get<{ Querystring: { username?: string } }>(
    "/auth/user-by-username",
    authRateLimit,
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

      if (process.env.NODE_ENV === "test") {
        const snapshot = await firestore
          .collection("users")
          .where("username", "==", username)
          .limit(1)
          .get();

        if (!snapshot.empty) {
          const data = snapshot.docs[0].data();
          const payload = {
            email: (data.email as string | undefined) ?? "",
            role: (data.role as string | undefined) ?? "",
            name:
              (data.displayName as string | undefined) ??
              (data.name as string | undefined) ??
              "",
            studentId: (data.studentId as string | undefined) ?? null,
            teacherId: (data.teacherId as string | undefined) ?? null,
            requirePasswordChange:
              (data.requirePasswordChange as boolean | undefined) ?? false,
          };

          server.cache?.setWithTTL(
            "user",
            usernameCacheKey,
            payload,
            USERNAME_LOOKUP_TTL_SECONDS
          );
          return sendSuccess(request, reply, payload);
        }
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
    authRateLimit,
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

      if (process.env.NODE_ENV === "test") {
        const snapshot = await firestore
          .collection("schools")
          .where("code", "==", code)
          .limit(1)
          .get();

        if (!snapshot.empty) {
          const data = snapshot.docs[0].data();
          const isActive = (data.isActive as boolean | undefined) ?? true;

          if (isActive) {
            const payload = {
              id: (data.id as string | undefined) ?? snapshot.docs[0].id,
              name: (data.name as string | undefined) ?? "",
              code: (data.code as string | undefined) ?? code,
              tagline:
                (data.loginTagline as string | undefined) ??
                (data.tagline as string | undefined) ??
                undefined,
              supportEmail: (data.email as string | undefined) ?? undefined,
              supportPhone: (data.phone as string | undefined) ?? undefined,
              helpUrl: (data.website as string | undefined) ?? undefined,
              address: (data.address as string | undefined) ?? undefined,
              logoUrl:
                (data.logoURL as string | undefined) ??
                (data.logoUrl as string | undefined) ??
                undefined,
              primaryColor: (data.primaryColor as string | undefined) ?? undefined,
            };

            server.cache?.setWithTTL(
              "school",
              schoolCacheKey,
              payload,
              SCHOOL_LOOKUP_TTL_SECONDS
            );
            return sendSuccess(request, reply, payload);
          }
        }
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
  });

  server.post(
    "/auth/change-password",
    { preHandler: [authenticate] },
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
    { preHandler: [authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = request.user!;
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
        teacherId: (user.teacherId as string) ?? null,
        studentId: (user.studentId as string) ?? null,
        assignedClasses: (user.assignedClasses as unknown[]) ?? [],
      });
    }
  );

  // -----------------------------------------------------------------------
  // POST /api/v1/auth/login — record login and return user profile
  // Used by web panel after Firebase signInWithEmailAndPassword.
  // -----------------------------------------------------------------------
  server.post(
    "/auth/login",
    { preHandler: [authenticate] },
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

      void writeAuditLog("LOGIN", uid, auditSchoolId, {
        role: user.role ?? null,
        email: user.email,
      });

      return sendSuccess(request, reply, {
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
      });
      } finally {
        release();
      }
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
  });

  server.post(
    "/auth/register",
    authRateLimit,
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
              maxStudents: 50,
              maxTeachers: 5,
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
