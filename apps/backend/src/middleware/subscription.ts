import type { FastifyRequest, FastifyReply } from "fastify";
import { prisma } from "../lib/prisma";
import { Errors } from "../errors";
import type { CacheService } from "../plugins/cache";
import {
  assertSchoolScope,
  resolveStudentLimitForPlan,
  resolveTeacherLimitForPlan,
} from "../lib/tenant-scope";

interface SchoolSubscription {
  subscriptionPlan: string;
  maxStudents: number;
  maxTeachers: number;
  maxStorage: number;
  currentStorage: number;
}

type LimitedResource = "students" | "teachers" | "storage";

function resolveResource(request: FastifyRequest): LimitedResource | null {
  if (request.method !== "POST") return null;

  const path = request.url.split("?")[0].toLowerCase();
  if (path.includes("/students")) return "students";
  if (path.includes("/teachers")) return "teachers";
  if (path.includes("/uploads")) return "storage";
  return null;
}

/**
 * Fastify `preHandler` hook that enforces subscription plan limits.
 * Now queries PostgreSQL via Prisma instead of Firestore.
 */
export async function enforceSubscription(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const { schoolId } = request;
  assertSchoolScope(schoolId);

  // 1. Fetch school (with cache)
  const cache: CacheService | undefined = request.server.cache;
  let school: SchoolSubscription;
  try {
    const cached = cache?.get<SchoolSubscription>("school", schoolId);
    if (cached) {
      school = cached;
      request.log.debug({ schoolId }, "School subscription loaded from cache");
    } else {
      const schoolRow = await prisma.school.findUnique({
        where: { id: schoolId },
        select: {
          subscriptionPlan: true,
          maxStudents: true,
          maxTeachers: true,
          maxStorage: true,
          currentStorage: true,
        },
      });

      if (!schoolRow) {
        request.log.warn({ schoolId }, "School not found during subscription check");
        return reply.status(403).send({ success: false, message: "School not found" });
      }

      school = {
        subscriptionPlan: schoolRow.subscriptionPlan,
        maxStudents: schoolRow.maxStudents,
        maxTeachers: schoolRow.maxTeachers,
        maxStorage: schoolRow.maxStorage,
        currentStorage: schoolRow.currentStorage,
      };
      cache?.set("school", schoolId, school);
    }
  } catch (err) {
    request.log.error({ err, schoolId }, "Failed to fetch school");
    return reply.status(500).send({
      code: "INTERNAL_ERROR",
      message: "Something went wrong",
    });
  }

  const resource = resolveResource(request);
  if (!resource) {
    return;
  }

  const limitByResource: Record<LimitedResource, number> = {
    students: resolveStudentLimitForPlan(
      school.subscriptionPlan,
      school.maxStudents
    ),
    teachers: resolveTeacherLimitForPlan(
      school.subscriptionPlan,
      school.maxTeachers
    ),
    storage: school.maxStorage ?? 0,
  };

  const selectedLimit = limitByResource[resource];

  // 2. Skip for unlimited plans
  if (selectedLimit === -1) {
    request.log.info(
      { schoolId, plan: school.subscriptionPlan, resource },
      "Subscription check skipped — unlimited plan"
    );
    return;
  }

  // 3. Count current usage via Prisma
  let currentUsage: number;
  try {
    if (resource === "students") {
      currentUsage = await prisma.student.count({
        where: { schoolId, isDeleted: false },
      });
    } else if (resource === "teachers") {
      currentUsage = await prisma.teacher.count({
        where: { schoolId, isDeleted: false },
      });
    } else {
      currentUsage = school.currentStorage ?? 0;
    }
  } catch (err) {
    request.log.error({ err, schoolId, resource }, "Failed to count usage");
    return reply.status(500).send({
      code: "INTERNAL_ERROR",
      message: "Something went wrong",
    });
  }

  // 4. Enforce the limit
  if (currentUsage >= selectedLimit) {
    request.log.warn(
      {
        schoolId,
        plan: school.subscriptionPlan,
        resource,
        currentUsage,
        selectedLimit,
      },
      "Subscription limit reached"
    );
    throw Errors.subscriptionLimitReached(resource, selectedLimit);
  }

  request.log.info(
    {
      schoolId,
      plan: school.subscriptionPlan,
      resource,
      currentUsage,
      selectedLimit,
    },
    "Subscription check passed"
  );
}
