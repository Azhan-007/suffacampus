import type { FastifyRequest, FastifyReply } from "fastify";
import { Errors } from "../errors";
import { setTenantContext } from "../lib/tenant-context";
import {
  resolveTenantAccessState,
  isAccessExpiredSnapshot,
  queueExpiryFailsafe,
} from "../services/tenant-lifecycle.service";

// Augment Fastify request to carry the tenant school ID
declare module "fastify" {
  interface FastifyRequest {
    schoolId: string;
    tenantAccess?: {
      accessState: string;
      lifecycleState: string;
      accessVersion: number;
      effectiveUntil?: Date | null;
    };
  }
}

/**
 * Fastify `preHandler` hook that:
 * 1. Ensures an authenticated user is present on the request
 * 2. Extracts `schoolId` from the user object
 * 3. Attaches it to `request.schoolId`
 * 4. Rejects the request if either is missing
 *
 * Must run **after** the `authenticate` middleware.
 */
export async function tenantGuard(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const user = request.user;

  if (!user) {
    throw Errors.tokenMissing();
  }

  const userSchoolId = user.schoolId as string | undefined;
  const requestedSchoolIdRaw = request.headers["x-school-id"];
  const requestedSchoolId =
    typeof requestedSchoolIdRaw === "string" ? requestedSchoolIdRaw.trim() : undefined;

  // SuperAdmin can operate on a selected tenant by passing X-School-Id.
  // Other roles are always restricted to their own schoolId from auth context.
  let schoolId: string | undefined;

  if (user.role === "SuperAdmin") {
    schoolId = requestedSchoolId || userSchoolId;

    if (!schoolId) {
      throw Errors.badRequest(
        "SuperAdmin must provide X-School-Id for tenant-scoped routes"
      );
    }
  } else {
    schoolId = userSchoolId;
  }

  if (!schoolId) {
    throw Errors.tenantMissing();
  }

  request.schoolId = schoolId;
  setTenantContext({ enforceTenant: true, schoolId });
  request.log.info({ uid: user.uid, schoolId }, "Tenant context set");

  const accessSnapshot = await resolveTenantAccessState(schoolId);
  if (!accessSnapshot) {
    throw Errors.tenantMissing();
  }

  request.tenantAccess = {
    accessState: accessSnapshot.accessState,
    lifecycleState: accessSnapshot.lifecycleState,
    accessVersion: accessSnapshot.accessVersion ?? 0,
    effectiveUntil: accessSnapshot.effectiveUntil ?? null,
  };

  // SuperAdmin is allowed to operate on suspended tenants; skip enforcement.
  if (user.role === "SuperAdmin") {
    return;
  }

  if (
    request.session?.source === "session-jwt" &&
    typeof request.session.accessVersion === "number" &&
    accessSnapshot.accessVersion > request.session.accessVersion
  ) {
    throw Errors.tokenInvalid();
  }

  if (accessSnapshot.accessState === "blocked") {
    throw Errors.subscriptionExpired();
  }

  if (isAccessExpiredSnapshot(accessSnapshot)) {
    void queueExpiryFailsafe({
      schoolId,
      lifecycleState: accessSnapshot.lifecycleState,
      performedBy: request.user.uid,
      source: "request_failsafe",
    });

    throw Errors.subscriptionExpired();
  }
}
