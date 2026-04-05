import type { FastifyRequest, FastifyReply } from "fastify";
import { auth, firestore } from "../lib/firebase-admin";
import { prisma } from "../lib/prisma";
import { Errors } from "../errors";
import type { CacheService } from "../plugins/cache";

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
 * 2. Verifies it as a Firebase ID token
 * 3. Fetches the matching user record from PostgreSQL via Prisma
 * 4. Attaches the user object to `request.user`
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

  let decoded;
  try {
    decoded = await auth.verifyIdToken(token);
  } catch (err) {
    request.log.warn(
      { err, url: request.url, method: request.method },
      "Firebase token verification failed"
    );
    throw Errors.tokenInvalid();
  }

  // Check in-memory cache first
  const cache: CacheService | undefined = request.server.cache;
  const cacheKey = decoded.uid;
  const cached = cache?.get<Record<string, unknown>>("user", cacheKey);
  const isTestEnv = process.env.NODE_ENV === "test";

  if (cached) {
    request.user = { uid: decoded.uid, email: decoded.email ?? "", ...cached };
    request.log.debug({ uid: decoded.uid }, "User loaded from cache");
  } else {
    let userData: Record<string, unknown> | null = null;

    try {
      const userRow = await prisma.user.findUnique({
        where: { uid: decoded.uid },
      });

      if (userRow) {
        userData = {
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
    } catch (err) {
      if (!isTestEnv) {
        throw err;
      }

      request.log.debug(
        { uid: decoded.uid, err },
        "Prisma user lookup failed in test environment; attempting Firestore fallback"
      );
    }

    if (!userData && isTestEnv) {
      const userSnap = await firestore.collection("users").doc(decoded.uid).get();
      if (userSnap.exists) {
        const row = (userSnap.data() ?? {}) as Record<string, unknown>;
        userData = {
          role: row.role,
          username: row.username,
          displayName:
            (row.displayName as string | undefined) ??
            (row.name as string | undefined) ??
            undefined,
          schoolId: row.schoolId,
          phone: row.phone,
          photoURL: row.photoURL,
          isActive: row.isActive,
          requirePasswordChange: row.requirePasswordChange,
          studentId: row.studentId,
          studentIds: row.studentIds,
          teacherId: row.teacherId,
        };
      }
    }

    if (!userData) {
      throw Errors.userNotFound();
    }

    cache?.set("user", cacheKey, userData);

    request.user = {
      uid: decoded.uid,
      email: decoded.email ?? "",
      ...userData,
    };
  }

  if (request.user.isActive === false) {
    throw Errors.userDisabled();
  }

  request.log.info({ uid: decoded.uid }, "User authenticated successfully");
}
