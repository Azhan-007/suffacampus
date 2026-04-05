import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import {
  createClassSchema,
  updateClassSchema,
  addSectionSchema,
} from "../../schemas/modules.schema";
import { paginationSchema } from "../../utils/pagination";
import {
  createClass,
  getClassesBySchool,
  getAllClassesBySchool,
  getClassById,
  updateClass,
  softDeleteClass,
  addSection,
  removeSection,
} from "../../services/class.service";
import { authenticate } from "../../middleware/auth";
import { tenantGuard } from "../../middleware/tenant";
import { roleMiddleware } from "../../middleware/role";
import { enforceSubscription } from "../../middleware/subscription";
import { sendSuccess, sendPaginated } from "../../utils/response";
import { Errors } from "../../errors";

const preHandler = [authenticate, tenantGuard];

export default async function classRoutes(server: FastifyInstance) {
  // POST /classes — create a class
  server.post(
    "/classes",
    {
      preHandler: [
        ...preHandler,
        roleMiddleware(["Admin", "SuperAdmin"]),
        enforceSubscription,
      ],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const result = createClassSchema.safeParse(request.body);
      if (!result.success) throw Errors.validation(result.error.flatten().fieldErrors);

      const cls = await createClass(request.schoolId, result.data, request.user.uid);
      return sendSuccess(request, reply, cls, 201);
    }
  );

  // GET /classes — list (paginated)
  server.get<{ Querystring: Record<string, string | undefined> }>(
    "/classes",
    { preHandler },
    async (request, reply) => {
      const pagination = paginationSchema.parse(request.query);
      const result = await getClassesBySchool(request.schoolId, pagination);
      return sendPaginated(request, reply, result.data, result.pagination);
    }
  );

  // GET /classes/all — list all (unpaginated, for dropdowns)
  server.get(
    "/classes/all",
    { preHandler },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const classes = await getAllClassesBySchool(request.schoolId);
      return sendSuccess(request, reply, classes);
    }
  );

  // GET /classes/:id
  server.get<{ Params: { id: string } }>(
    "/classes/:id",
    { preHandler },
    async (request, reply) => {
      const cls = await getClassById(request.params.id, request.schoolId);
      if (!cls) throw Errors.notFound("Class", request.params.id);
      return sendSuccess(request, reply, cls);
    }
  );

  // PATCH /classes/:id
  server.patch<{ Params: { id: string } }>(
    "/classes/:id",
    { preHandler: [...preHandler, roleMiddleware(["Admin", "SuperAdmin"])] },
    async (request, reply) => {
      const result = updateClassSchema.safeParse(request.body);
      if (!result.success) throw Errors.validation(result.error.flatten().fieldErrors);
      if (Object.keys(result.data).length === 0) throw Errors.badRequest("No fields to update");

      const cls = await updateClass(request.params.id, request.schoolId, result.data, request.user.uid);
      return sendSuccess(request, reply, cls);
    }
  );

  // DELETE /classes/:id
  server.delete<{ Params: { id: string } }>(
    "/classes/:id",
    { preHandler: [...preHandler, roleMiddleware(["Admin", "SuperAdmin"])] },
    async (request, reply) => {
      const deleted = await softDeleteClass(request.params.id, request.schoolId, request.user.uid);
      if (!deleted) throw Errors.notFound("Class", request.params.id);
      return sendSuccess(request, reply, { message: "Class deleted" });
    }
  );

  // POST /classes/:id/sections — add a section
  server.post<{ Params: { id: string } }>(
    "/classes/:id/sections",
    { preHandler: [...preHandler, roleMiddleware(["Admin", "SuperAdmin"])] },
    async (request, reply) => {
      const result = addSectionSchema.safeParse(request.body);
      if (!result.success) throw Errors.validation(result.error.flatten().fieldErrors);

      const cls = await addSection(request.params.id, request.schoolId, result.data, request.user.uid);
      return sendSuccess(request, reply, cls, 201);
    }
  );

  // DELETE /classes/:id/sections/:sectionId — remove a section
  server.delete<{ Params: { id: string; sectionId: string } }>(
    "/classes/:id/sections/:sectionId",
    { preHandler: [...preHandler, roleMiddleware(["Admin", "SuperAdmin"])] },
    async (request, reply) => {
      const cls = await removeSection(
        request.params.id,
        request.params.sectionId,
        request.schoolId,
        request.user.uid
      );
      return sendSuccess(request, reply, cls);
    }
  );
}
