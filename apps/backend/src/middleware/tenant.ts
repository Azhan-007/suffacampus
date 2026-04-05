import type { FastifyRequest, FastifyReply } from "fastify";
import { Errors } from "../errors";

// Augment Fastify request to carry the tenant school ID
declare module "fastify" {
  interface FastifyRequest {
    schoolId: string;
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
  request.log.info({ uid: user.uid, schoolId }, "Tenant context set");
}
