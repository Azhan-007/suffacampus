import type { FastifyRequest, FastifyReply } from "fastify";
import { auth, firestore } from "../lib/firebase-admin";
import { prisma } from "../lib/prisma";
import { env } from "../lib/env";
import { setTenantContext } from "../lib/tenant-context";
import { Errors } from "../errors";
import type { CacheService } from "../plugins/cache";
import { validateSessionAccessToken } from "../services/session.service";

export interface UserRecord {
  uid: string;
  email: string;
  role?: string;
  displayName?: string;
  name?: string;
  schoolId?: string | null;
  phone?: string | null;
  photoURL?: string | null;
  isActive?: boolean;
  requirePasswordChange?: boolean;
  createdAt?: string | null;
  lastLogin?: string | null;
  [key: string]: unknown;
}

// Augment Fastify request to carry the authenticated user
declare module "fastify" {
  interface FastifyRequest {
    user: UserRecord;
  }
}

/**
 * Fastify `preHandler` hook that:
 * 1. Extracts a Bearer token from the Authorization header
 * 2. Tries session JWT validation (signature + DB session + revocation)
 * 3. Allows Firebase ID token on login bootstrap route and optional
 *    migration fallback mode (AUTH_ALLOW_FIREBASE_FALLBACK or test env)
 * 4. Fetches the matching user record from PostgreSQL via Prisma
 * 5. Attaches auth context to `request.user` and `request.session`
 */
export async function authenticate(
  request: FastifyRequest,
  _reply: FastifyReply
): Promise<void> {
  const header = request.headers.authorization;
  const token = header && header.startsWith("Bearer ")
    ? header.slice(7)
    : "";

  if (!token) {
    throw Errors.tokenMissing();
  }

  const sessionAuth = await validateSessionAccessToken(token, request);

  let uid: string;
  let email = "";

  if (sessionAuth) {
    uid = sessionAuth.userUid;
    request.session = {
      id: sessionAuth.id,
      jti: sessionAuth.jti,
      source: "session-jwt",
      device: sessionAuth.device,
      ipAddress: sessionAuth.ipAddress,
      userAgent: sessionAuth.userAgent,
      lastActiveAt: sessionAuth.lastActiveAt.toISOString(),
      expiresAt: sessionAuth.expiresAt.toISOString(),
      accessVersion: sessionAuth.accessVersion,
    };
  } else {
    const route = (request.routeOptions?.url ?? request.url).split("?")[0];
    const isSessionBootstrapRoute = route.endsWith("/auth/login");
    const allowFirebaseFallback =
      isSessionBootstrapRoute ||
      env.AUTH_ALLOW_FIREBASE_FALLBACK ||
      env.NODE_ENV === "test";

    if (!allowFirebaseFallback) {
      request.log.warn(
        { route, fallbackEnabled: env.AUTH_ALLOW_FIREBASE_FALLBACK },
        "Session JWT required for this route"
      );
      throw Errors.tokenInvalid();
    }

    let decoded;
    try {
      // Revocation check is expensive, so keep this path only for migration/bootstrap endpoints.
      decoded = await auth.verifyIdToken(token, true);
    } catch (err) {
      request.log.warn(
        { err, url: request.url, method: request.method },
        "Token verification failed"
      );
      throw Errors.tokenInvalid();
    }

    uid = decoded.uid;
    email = decoded.email ?? "";
    request.session = {
      id: "firebase",
      jti: "firebase",
      source: "firebase",
    };
  }

  // Check in-memory cache first
  const cache: CacheService | undefined = request.server.cache;
  const cacheKey = uid;
  const cached = cache?.get<Record<string, unknown>>("user", cacheKey);

  if (cached) {
    request.user = { uid, email, ...cached };
    request.log.debug({ uid }, "User loaded from cache");
  } else {
    let userData: Record<string, unknown> | null = null;

    const userRow = await prisma.user.findUnique({
      where: { uid },
    });

    if (userRow) {
      userData = {
        email: userRow.email,
        role: userRow.role,
        username: userRow.username,
        displayName: userRow.displayName,
        schoolId: userRow.schoolId,
        phone: userRow.phone,
        photoURL: userRow.photoURL,
        isActive: userRow.isActive,
        requirePasswordChange: userRow.requirePasswordChange,
        studentId: userRow.studentId,
        studentIds: userRow.studentIds,
        teacherId: userRow.teacherId,
      };
    }

    if (!userData && env.NODE_ENV === "test") {
      try {
        const userDoc = await firestore.collection("users").doc(uid).get();
        const fallbackUser = userDoc.exists ? userDoc.data() : undefined;

        if (fallbackUser) {
          const fallbackStatus =
            typeof fallbackUser.status === "string"
              ? fallbackUser.status.trim().toLowerCase()
              : "";

          userData = {
            email: typeof fallbackUser.email === "string" ? fallbackUser.email : undefined,
            role: typeof fallbackUser.role === "string" ? fallbackUser.role : undefined,
            username:
              typeof fallbackUser.username === "string"
                ? fallbackUser.username
                : undefined,
            displayName:
              typeof fallbackUser.displayName === "string"
                ? fallbackUser.displayName
                : undefined,
            schoolId:
              typeof fallbackUser.schoolId === "string"
                ? fallbackUser.schoolId
                : null,
            phone:
              typeof fallbackUser.phone === "string"
                ? fallbackUser.phone
                : null,
            photoURL:
              typeof fallbackUser.photoURL === "string"
                ? fallbackUser.photoURL
                : null,
            isActive:
              typeof fallbackUser.isActive === "boolean"
                ? fallbackUser.isActive
                : fallbackStatus
                  ? fallbackStatus === "active"
                  : true,
            requirePasswordChange:
              typeof fallbackUser.requirePasswordChange === "boolean"
                ? fallbackUser.requirePasswordChange
                : false,
            studentId:
              typeof fallbackUser.studentId === "string"
                ? fallbackUser.studentId
                : undefined,
            studentIds: Array.isArray(fallbackUser.studentIds)
              ? fallbackUser.studentIds
              : undefined,
            teacherId:
              typeof fallbackUser.teacherId === "string"
                ? fallbackUser.teacherId
                : undefined,
          };
        }
      } catch (fallbackError) {
        request.log.debug(
          { err: fallbackError, uid },
          "Test auth fallback to Firestore failed"
        );
      }
    }

    if (!userData) {
      throw Errors.userNotFound();
    }

    cache?.set("user", cacheKey, userData);

    if (!email) {
      const userEmail = userData.email;
      if (typeof userEmail === "string") {
        email = userEmail;
      }
    }

    request.user = {
      uid,
      email,
      ...userData,
    };
  }

  if (request.user.isActive === false) {
    throw Errors.userDisabled();
  }

  if (sessionAuth) {
    const userSchoolId =
      typeof request.user.schoolId === "string"
        ? request.user.schoolId.trim()
        : "";
    const sessionSchoolId =
      typeof sessionAuth.schoolId === "string"
        ? sessionAuth.schoolId.trim()
        : "";

    // Non-superadmin sessions must stay tenant-bound to the same school
    // as the current user record to prevent cross-tenant reuse.
    if (request.user.role !== "SuperAdmin") {
      if (!userSchoolId || !sessionSchoolId || sessionSchoolId !== userSchoolId) {
        request.log.warn(
          {
            uid,
            userSchoolId: userSchoolId || null,
            sessionSchoolId: sessionSchoolId || null,
          },
          "Session school scope mismatch"
        );
        throw Errors.tokenInvalid();
      }
    }
  }

  // Default tenant scoping for authenticated non-SuperAdmin users.
  // SuperAdmin remains unscoped until tenantGuard sets an explicit school context.
  if (request.user.role === "SuperAdmin") {
    const selectedSchoolHeader = request.headers["x-school-id"];
    const selectedSchoolId =
      typeof selectedSchoolHeader === "string" && selectedSchoolHeader.trim().length > 0
        ? selectedSchoolHeader.trim()
        : undefined;

    if (selectedSchoolId) {
      setTenantContext({ enforceTenant: true, schoolId: selectedSchoolId });
      request.log.debug(
        { uid, schoolId: selectedSchoolId },
        "SuperAdmin authenticated with explicit tenant header"
      );
    } else {
      setTenantContext({ enforceTenant: false, schoolId: undefined });
      request.log.debug(
        { uid },
        "SuperAdmin authenticated; tenant scope disabled until tenantGuard selects a school"
      );
    }
  } else if (request.user.schoolId) {
    setTenantContext({
      enforceTenant: true,
      schoolId: String(request.user.schoolId),
    });
  }

  request.log.info({ uid }, "User authenticated successfully");
}
