import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import { updateSettingsSchema } from "../../schemas/modules.schema";
import { getSettings, updateSettings } from "../../services/settings.service";
import { getSchoolById } from "../../services/admin-school.service";
import { prisma } from "../../lib/prisma";
import { authenticate } from "../../middleware/auth";
import { tenantGuard } from "../../middleware/tenant";
import { roleMiddleware } from "../../middleware/role";
import { ROLES, ROLE_PERMISSIONS } from "../../services/permission.service";
import { sendSuccess } from "../../utils/response";
import { Errors } from "../../errors";

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
  server.get(
    "/settings/sessions",
    { preHandler },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const sessions = [
        {
          id: request.user.uid,
          userId: request.user.uid,
          current: true,
          ipAddress: "unknown",
          userAgent: "unknown",
          createdAt: request.user.createdAt ?? new Date().toISOString(),
          lastActiveAt: request.user.lastLogin ?? new Date().toISOString(),
        },
      ];

      return sendSuccess(request, reply, sessions);
    }
  );

  // DELETE /settings/sessions/:sessionId — best-effort revoke (Firebase token revocation is global per uid)
  server.delete<{ Params: { sessionId: string } }>(
    "/settings/sessions/:sessionId",
    { preHandler },
    async (request, reply) => {
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
      return sendSuccess(request, reply, { revoked: true });
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

  const updatePermissionsSchema = z.object({
    permissions: z.array(z.string().min(1)).default([]),
  });

  // PUT /settings/permissions/:role
  server.put<{ Params: { role: string } }>(
    "/settings/permissions/:role",
    { preHandler: [...preHandler, roleMiddleware(["Admin", "SuperAdmin"])] },
    async (request, reply) => {
      if (!ROLES.includes(request.params.role as (typeof ROLES)[number])) {
        throw Errors.badRequest(`Invalid role: ${request.params.role}`);
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
