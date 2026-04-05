import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import {
  createSchoolSchema,
  updateSchoolSchema,
} from "../../schemas/admin.schema";
import { paginationSchema } from "../../utils/pagination";
import {
  createSchool,
  getSchools,
  getSchoolById,
  updateSchool,
  softDeleteSchool,
  changePlan,
  getPlatformStats,
} from "../../services/admin-school.service";
import { authenticate } from "../../middleware/auth";
import { tenantGuard } from "../../middleware/tenant";
import { roleMiddleware } from "../../middleware/role";
import { sendSuccess, sendPaginated } from "../../utils/response";
import { Errors } from "../../errors";
import { z } from "zod";
import { writeAuditLog } from "../../services/audit.service";

// SuperAdmin-only middleware chain (no tenantGuard — they operate across schools)
const superAdminHandler = [authenticate, roleMiddleware(["SuperAdmin"])];

export default async function adminRoutes(server: FastifyInstance) {
  // POST /admin/schools — create a new school
  server.post(
    "/admin/schools",
    { preHandler: superAdminHandler },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const result = createSchoolSchema.safeParse(request.body);
      if (!result.success) {
        request.log.warn({ fieldErrors: result.error.flatten().fieldErrors, bodyKeys: Object.keys(request.body as object) }, 'School creation validation failed');
        throw Errors.validation(result.error.flatten().fieldErrors);
      }

      const school = await createSchool(result.data, request.user.uid);
      return sendSuccess(request, reply, school, 201);
    }
  );

  // GET /admin/schools — list all schools
  server.get<{ Querystring: Record<string, string | undefined> }>(
    "/admin/schools",
    { preHandler: superAdminHandler },
    async (request, reply) => {
      const pagination = paginationSchema.parse(request.query);
      const filters = {
        status: request.query.status,
        plan: request.query.plan,
        search: request.query.search,
      };

      const result = await getSchools(pagination, filters);
      return sendPaginated(request, reply, result.data, result.pagination);
    }
  );

  // GET /admin/stats — platform-wide statistics
  server.get(
    "/admin/stats",
    { preHandler: superAdminHandler },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const stats = await getPlatformStats();
      return sendSuccess(request, reply, stats);
    }
  );

  // GET /admin/schools/:id
  server.get<{ Params: { id: string } }>(
    "/admin/schools/:id",
    { preHandler: superAdminHandler },
    async (request, reply) => {
      const school = await getSchoolById(request.params.id);
      if (!school) throw Errors.notFound("School", request.params.id);
      return sendSuccess(request, reply, school);
    }
  );

  // PATCH /admin/schools/:id
  server.patch<{ Params: { id: string } }>(
    "/admin/schools/:id",
    { preHandler: superAdminHandler },
    async (request, reply) => {
      const result = updateSchoolSchema.safeParse(request.body);
      if (!result.success) throw Errors.validation(result.error.flatten().fieldErrors);
      if (Object.keys(result.data).length === 0) throw Errors.badRequest("No fields to update");

      const school = await updateSchool(request.params.id, result.data, request.user.uid);

      if (
        typeof result.data.subscriptionPlan !== "undefined" ||
        typeof result.data.subscriptionStatus !== "undefined"
      ) {
        await writeAuditLog("SCHOOL_SUBSCRIPTION_UPDATED", request.user.uid, request.params.id, {
          schoolId: request.params.id,
          subscriptionPlan: result.data.subscriptionPlan,
          subscriptionStatus: result.data.subscriptionStatus,
          updatedFields: Object.keys(result.data),
        });
      }

      return sendSuccess(request, reply, school);
    }
  );

  // DELETE /admin/schools/:id
  server.delete<{ Params: { id: string } }>(
    "/admin/schools/:id",
    { preHandler: superAdminHandler },
    async (request, reply) => {
      const deleted = await softDeleteSchool(request.params.id, request.user.uid);
      if (!deleted) throw Errors.notFound("School", request.params.id);
      return sendSuccess(request, reply, { message: "School deactivated" });
    }
  );

  // PATCH /admin/schools/:id/plan — change subscription plan
  server.patch<{ Params: { id: string } }>(
    "/admin/schools/:id/plan",
    { preHandler: superAdminHandler },
    async (request, reply) => {
      const schema = z.object({
        plan: z.enum(["free", "basic", "pro", "enterprise"]),
        maxStudents: z.number().int().positive(),
        maxTeachers: z.number().int().positive(),
        maxStorage: z.number().positive(),
      });

      const result = schema.safeParse(request.body);
      if (!result.success) throw Errors.validation(result.error.flatten().fieldErrors);

      const school = await changePlan(
        request.params.id,
        result.data.plan,
        {
          maxStudents: result.data.maxStudents,
          maxTeachers: result.data.maxTeachers,
          maxStorage: result.data.maxStorage,
        },
        request.user.uid
      );

      await writeAuditLog("SCHOOL_PLAN_CHANGED", request.user.uid, request.params.id, {
        schoolId: request.params.id,
        newPlan: result.data.plan,
        limits: {
          maxStudents: result.data.maxStudents,
          maxTeachers: result.data.maxTeachers,
          maxStorage: result.data.maxStorage,
        },
      });

      return sendSuccess(request, reply, school);
    }
  );
}
