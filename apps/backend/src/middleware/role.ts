import type { FastifyRequest, FastifyReply } from "fastify";
import { Errors } from "../errors";

const ROLE_CANONICAL_MAP: Record<string, string> = {
  admin: "Admin",
  staff: "Staff",
  student: "Student",
  parent: "Parent",
  superadmin: "SuperAdmin",
};

function normalizeRole(role: unknown): string | undefined {
  if (typeof role !== "string") return undefined;

  const trimmed = role.trim();
  if (!trimmed) return undefined;

  return ROLE_CANONICAL_MAP[trimmed.toLowerCase()] ?? trimmed;
}

/**
 * Factory that creates a Fastify `preHandler` hook restricting
 * access to users whose `role` is included in `allowedRoles`.
 *
 * Must run **after** the `authenticate` middleware.
 */
export function roleMiddleware(allowedRoles: string[]) {
  return async function roleGuard(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    const user = request.user;

    if (!user) {
      throw Errors.tokenMissing();
    }

    const userRole = normalizeRole(user.role);
    const normalizedAllowedRoles = allowedRoles.map((role) => normalizeRole(role) ?? role);

    if (!userRole || !normalizedAllowedRoles.includes(userRole)) {
      request.log.warn(
        { uid: user.uid, role: userRole, required: normalizedAllowedRoles },
        "Access denied — insufficient role"
      );
      throw Errors.insufficientRole(normalizedAllowedRoles);
    }
  };
}
