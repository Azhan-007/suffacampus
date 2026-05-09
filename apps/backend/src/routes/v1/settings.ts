import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import { updateSettingsSchema } from "../../schemas/modules.schema";
import { getSettings, updateSettings } from "../../services/settings.service";
import { getSchoolById } from "../../services/admin-school.service";
import { prisma } from "../../lib/prisma";
import { authenticate } from "../../middleware/auth";
import { tenantGuard } from "../../middleware/tenant";
import { roleMiddleware } from "../../middleware/role";
import { ROLES, ROLE_PERMISSIONS, Permission } from "../../services/permission.service";
import { sendSuccess } from "../../utils/response";
import { Errors } from "../../errors";
import {
  listActiveSessionsForUser,
  revokeAllSessionsForUser,
  revokeSessionById,
} from "../../services/session.service";

const preHandler = [authenticate, tenantGuard];

export default async function settingsRoutes(server: FastifyInstance) {
  // GET /school/me — get current user's school info (any authenticated user)
  server.get(
    "/school/me",
    { preHandler },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const school = await getSchoolById(request.schoolId);
      if (!school) throw Errors.notFound("School", request.schoolId);
      return sendSuccess(request, reply, school);
    }
  );

  // GET /settings — current school settings
  server.get(
    "/settings",
    { preHandler },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const settings = await getSettings(request.schoolId);
      if (!settings) throw Errors.notFound("School", request.schoolId);
      return sendSuccess(request, reply, settings);
    }
  );

  // PATCH /settings — update school settings
  server.patch(
    "/settings",
    { preHandler: [...preHandler, roleMiddleware(["Admin", "SuperAdmin"])] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const result = updateSettingsSchema.safeParse(request.body);
      if (!result.success) throw Errors.validation(result.error.flatten().fieldErrors);
      if (Object.keys(result.data).length === 0) throw Errors.badRequest("No fields to update");

      const settings = await updateSettings(request.schoolId, result.data, request.user.uid);

      // Invalidate school/settings cache after update
      server.cache.del("school", request.schoolId);
      server.cache.del("settings", request.schoolId);

      return sendSuccess(request, reply, settings);
    }
  );

  // GET /settings/sessions — active sessions for current user
  server.get<{ Querystring: { limit?: string } }>(
    "/settings/sessions",
    { preHandler },
    async (request, reply) => {
      const parsedLimit = z
        .coerce
        .number()
        .int()
        .min(1)
        .max(100)
        .default(50)
        .safeParse(request.query.limit);

      if (!parsedLimit.success) {
        throw Errors.validation(parsedLimit.error.flatten().fieldErrors);
      }

      const sessions = await listActiveSessionsForUser(
        request.user.uid,
        request.schoolId,
        parsedLimit.data
      );

      const currentSessionId =
        request.session?.source === "session-jwt"
          ? request.session.id
          : null;

      const payload = sessions.map((session) => ({
        id: session.id,
        userUid: session.userUid,
        schoolId: session.schoolId,
        current: currentSessionId === session.id,
        device: session.device,
        ipAddress: session.ipAddress,
        userAgent: session.userAgent,
        lastActiveAt: session.lastActiveAt,
        expiresAt: session.expiresAt,
      }));

      return sendSuccess(request, reply, payload);
    }
  );

  // DELETE /settings/sessions/:sessionId — revoke a specific persisted session
  server.delete<{ Params: { sessionId: string } }>(
    "/settings/sessions/:sessionId",
    { preHandler },
    async (request, reply) => {
      const revoked = await revokeSessionById({
        sessionId: request.params.sessionId,
        userUid: request.user.uid,
        schoolId: request.schoolId,
        reason: "manual_session_revoke",
      });

      if (!revoked) {
        throw Errors.notFound("Session", request.params.sessionId);
      }

      return sendSuccess(request, reply, {
        revoked: true,
        sessionId: request.params.sessionId,
      });
    }
  );

  // POST /settings/sessions/revoke-others
  server.post(
    "/settings/sessions/revoke-others",
    { preHandler },
    async (request, reply) => {
      const currentSessionId =
        request.session?.source === "session-jwt"
          ? request.session.id
          : undefined;

      const result = await revokeAllSessionsForUser({
        userUid: request.user.uid,
        schoolId: request.schoolId,
        excludeSessionId: currentSessionId,
        reason: "revoke_other_sessions",
      });

      return sendSuccess(request, reply, {
        revoked: true,
        revokedCount: result.revokedCount,
        keptSessionId: currentSessionId ?? null,
      });
    }
  );

  // GET /settings/permissions
  server.get(
    "/settings/permissions",
    { preHandler: [...preHandler, roleMiddleware(["Admin", "SuperAdmin"])] },
    async (request, reply) => {
      const config = await prisma.schoolConfig.findUnique({
        where: { schoolId: request.schoolId },
        select: { metadata: true },
      });

      const metadata = (config?.metadata ?? {}) as Record<string, unknown>;
      const overrides = (metadata.rolePermissions ?? {}) as Record<string, string[]>;

      const matrix = ROLES.map((role) => ({
        role,
        permissions: overrides[role] ?? [...ROLE_PERMISSIONS[role]],
      }));

      return sendSuccess(request, reply, matrix);
    }
  );

  const VALID_PERMISSION_VALUES = Object.values(Permission) as string[];

  /** Roles that cannot have their permissions edited by school admins. */
  const IMMUTABLE_ROLES = ["SuperAdmin", "Admin", "Principal"];

  const updatePermissionsSchema = z.object({
    permissions: z.array(
      z.string().min(1).refine(
        (p) => VALID_PERMISSION_VALUES.includes(p),
        { message: "Invalid permission value" }
      )
    ).default([]),
  }).strict();

  // PUT /settings/permissions/:role
  server.put<{ Params: { role: string } }>(
    "/settings/permissions/:role",
    { preHandler: [...preHandler, roleMiddleware(["Admin", "SuperAdmin"])] },
    async (request, reply) => {
      if (!ROLES.includes(request.params.role as (typeof ROLES)[number])) {
        throw Errors.badRequest(`Invalid role: ${request.params.role}`);
      }

      // Prevent escalation — protected roles cannot be modified
      if (IMMUTABLE_ROLES.includes(request.params.role)) {
        throw Errors.badRequest(
          `Cannot modify permissions for protected role: ${request.params.role}`
        );
      }

      const parsed = updatePermissionsSchema.safeParse(request.body);
      if (!parsed.success) {
        throw Errors.validation(parsed.error.flatten().fieldErrors);
      }

      const schoolConfig = await prisma.schoolConfig.findUnique({
        where: { schoolId: request.schoolId },
        select: { metadata: true },
      });

      const metadata = ((schoolConfig?.metadata as Record<string, unknown> | null) ?? {}) as Record<string, unknown>;
      const rolePermissions = ((metadata.rolePermissions as Record<string, string[]> | undefined) ?? {});
      rolePermissions[request.params.role] = parsed.data.permissions;

      await prisma.schoolConfig.upsert({
        where: { schoolId: request.schoolId },
        update: {
          metadata: {
            ...metadata,
            rolePermissions,
          },
        },
        create: {
          schoolId: request.schoolId,
          metadata: { rolePermissions },
        },
      });

      return sendSuccess(request, reply, { updated: true });
    }
  );
}
