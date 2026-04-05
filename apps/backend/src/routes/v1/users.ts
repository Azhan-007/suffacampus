import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { createUserSchema, updateUserSchema } from "../../schemas/admin.schema";
import { paginationSchema } from "../../utils/pagination";
import {
  createUser,
  getUsersBySchool,
  getUserById,
  updateUser,
  deactivateUser,
} from "../../services/user.service";
import { authenticate } from "../../middleware/auth";
import { tenantGuard } from "../../middleware/tenant";
import { roleMiddleware } from "../../middleware/role";
import { sendSuccess, sendPaginated } from "../../utils/response";
import { Errors } from "../../errors";
import { writeAuditLog } from "../../services/audit.service";

const preHandler = [authenticate, tenantGuard, roleMiddleware(["Admin", "SuperAdmin"])];

export default async function userRoutes(server: FastifyInstance) {
  // POST /users — create a user (Admin/SuperAdmin only)
  server.post(
    "/users",
    { preHandler },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const result = createUserSchema.safeParse(request.body);
      if (!result.success) throw Errors.validation(result.error.flatten().fieldErrors);

      const user = await createUser(request.schoolId, result.data, request.user.uid);

      await writeAuditLog("USER_CREATED", request.user.uid, request.schoolId, {
        targetUserId: user.id,
        role: user.role,
        email: user.email,
      });

      return sendSuccess(request, reply, user, 201);
    }
  );

  // GET /users — list users for school
  server.get<{ Querystring: Record<string, string | undefined> }>(
    "/users",
    { preHandler },
    async (request, reply) => {
      const pagination = paginationSchema.parse(request.query);
      const filters = {
        role: request.query.role,
        status: request.query.status,
      };

      const result = await getUsersBySchool(request.schoolId, pagination, filters);
      return sendPaginated(request, reply, result.data, result.pagination);
    }
  );

  // GET /users/:id
  server.get<{ Params: { id: string } }>(
    "/users/:id",
    { preHandler },
    async (request, reply) => {
      const user = await getUserById(request.params.id, request.schoolId);
      if (!user) throw Errors.notFound("User", request.params.id);
      return sendSuccess(request, reply, user);
    }
  );

  // PATCH /users/:id
  server.patch<{ Params: { id: string } }>(
    "/users/:id",
    { preHandler },
    async (request, reply) => {
      const result = updateUserSchema.safeParse(request.body);
      if (!result.success) throw Errors.validation(result.error.flatten().fieldErrors);
      if (Object.keys(result.data).length === 0) throw Errors.badRequest("No fields to update");

      const existingUser = await getUserById(request.params.id, request.schoolId);
      if (!existingUser) throw Errors.notFound("User", request.params.id);

      const user = await updateUser(request.params.id, request.schoolId, result.data, request.user.uid);

      await writeAuditLog("USER_UPDATED", request.user.uid, request.schoolId, {
        targetUserId: request.params.id,
        updatedFields: Object.keys(result.data),
        roleChanged: typeof result.data.role !== "undefined",
        oldRole: existingUser.role,
        newRole: user.role,
      });

      // Invalidate user cache after profile/role update
      server.cache.del("user", request.params.id);

      return sendSuccess(request, reply, user);
    }
  );

  // DELETE /users/:id — deactivate
  server.delete<{ Params: { id: string } }>(
    "/users/:id",
    { preHandler },
    async (request, reply) => {
      const deleted = await deactivateUser(request.params.id, request.schoolId, request.user.uid);
      if (!deleted) throw Errors.notFound("User", request.params.id);

      await writeAuditLog("USER_DEACTIVATED", request.user.uid, request.schoolId, {
        targetUserId: request.params.id,
      });

      // Invalidate user cache after deactivation
      server.cache.del("user", request.params.id);

      return sendSuccess(request, reply, { message: "User deactivated" });
    }
  );
}
