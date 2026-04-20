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

// Backward compatibility: stale clients may send section payloads with
// unsupported fields (for example studentsCount) or sections as string[].
function normalizeTeacherField(value: unknown): string | null | undefined {
  if (value === null) return null;
  if (typeof value !== "string") return undefined;

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeSectionInput(section: unknown, fallbackCapacity: number): unknown {
  if (typeof section === "string") {
    return {
      sectionName: section.trim(),
      capacity: fallbackCapacity,
    };
  }

  if (!section || typeof section !== "object" || Array.isArray(section)) return section;

  const rawSection = section as Record<string, unknown>;
  const capacity = typeof rawSection.capacity === "number" ? rawSection.capacity : fallbackCapacity;
  const normalizedTeacherId = normalizeTeacherField(rawSection.teacherId);
  const normalizedTeacherName = normalizeTeacherField(rawSection.teacherName);

  return {
    ...(typeof rawSection.id === "string" && rawSection.id.trim().length > 0 ? { id: rawSection.id.trim() } : {}),
    ...(typeof rawSection.sectionName === "string" ? { sectionName: rawSection.sectionName.trim() } : {}),
    ...(typeof capacity === "number" ? { capacity } : {}),
    ...(normalizedTeacherId !== undefined ? { teacherId: normalizedTeacherId } : {}),
    ...(normalizedTeacherName !== undefined ? { teacherName: normalizedTeacherName } : {}),
  };
}

function normalizeClassBodyWithSections(rawBody: unknown): unknown {
  if (!rawBody || typeof rawBody !== "object" || Array.isArray(rawBody)) return rawBody;

  const body = rawBody as Record<string, unknown>;
  if (!Array.isArray(body.sections)) return rawBody;

  const classCapacity = typeof body.capacity === "number" ? body.capacity : 0;

  const normalizedSections = body.sections.map((section) => normalizeSectionInput(section, classCapacity));

  return {
    ...body,
    sections: normalizedSections,
  };
}

function normalizeCreateClassBody(rawBody: unknown): unknown {
  return normalizeClassBodyWithSections(rawBody);
}

function normalizeUpdateClassBody(rawBody: unknown): unknown {
  return normalizeClassBodyWithSections(rawBody);
}

function normalizeAddSectionBody(rawBody: unknown): unknown {
  return normalizeSectionInput(rawBody, 0);
}

function hasClassUpdateFields(rawBody: unknown): boolean {
  if (!rawBody || typeof rawBody !== "object" || Array.isArray(rawBody)) return false;
  return Object.keys(rawBody).length > 0;
}

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
      const normalizedBody = normalizeCreateClassBody(request.body);
      const result = createClassSchema.safeParse(normalizedBody);
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
      const normalizedBody = normalizeUpdateClassBody(request.body);
      if (!hasClassUpdateFields(normalizedBody)) {
        throw Errors.badRequest("No fields to update");
      }

      const result = updateClassSchema.safeParse(normalizedBody);
      if (!result.success) {
        const flattened = result.error.flatten();
        const details =
          flattened.formErrors.length > 0
            ? { ...flattened.fieldErrors, _form: flattened.formErrors }
            : flattened.fieldErrors;
        throw Errors.validation(details);
      }

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
      const normalizedBody = normalizeAddSectionBody(request.body);
      const result = addSectionSchema.safeParse(normalizedBody);
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
