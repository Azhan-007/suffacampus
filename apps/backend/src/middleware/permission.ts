import type { FastifyReply, FastifyRequest } from "fastify";
import { Errors } from "../errors";
import { Permission, PermissionService } from "../services/permission.service";

export type PermissionInput = Permission | keyof typeof Permission;

function resolvePermission(permission: PermissionInput): Permission {
  if (Object.prototype.hasOwnProperty.call(Permission, permission)) {
    return Permission[permission as keyof typeof Permission];
  }

  if ((Object.values(Permission) as string[]).includes(permission as string)) {
    return permission as Permission;
  }

  throw Errors.badRequest(`Invalid permission: ${String(permission)}`);
}

/**
 * Fastify preHandler permission guard.
 *
 * Usage:
 * preHandler: [authenticate, tenantGuard, requirePermission("FEE_CREATE")]
 */
export function requirePermission(permission: PermissionInput) {
  const resolvedPermission = resolvePermission(permission);

  return async function permissionGuard(
    request: FastifyRequest,
    _reply: FastifyReply
  ): Promise<void> {
    const user = request.user;

    if (!user) {
      throw Errors.tokenMissing();
    }

    const schoolId =
      typeof request.schoolId === "string" && request.schoolId.trim().length > 0
        ? request.schoolId
        : typeof user.schoolId === "string"
          ? user.schoolId
          : undefined;

    PermissionService.requirePermission(resolvedPermission)({
      role: user.role,
      schoolId,
    });
  };
}
