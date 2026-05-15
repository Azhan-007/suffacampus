import type { FastifyRequest, FastifyReply } from "fastify";
import { prisma } from "../lib/prisma";
import { AppError } from "../errors";
import type { CacheService } from "../plugins/cache";
import { assertSchoolScope } from "../lib/tenant-scope";
import { validateQuota } from "../services/quota.service";

interface SchoolSubscription {
  subscriptionPlan: string;
  maxStudents: number;
  maxTeachers: number;
  maxStorage: number;
  currentStudents: number;
  currentTeachers: number;
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
          currentStudents: true,
          currentTeachers: true,
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
        currentStudents: schoolRow.currentStudents ?? 0,
        currentTeachers: schoolRow.currentTeachers ?? 0,
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

  try {
    const validation = await validateQuota({
      schoolId,
      resourceType: resource,
      incoming: 1,
      schoolSnapshot: {
        subscriptionPlan: school.subscriptionPlan,
        maxStudents: school.maxStudents,
        maxTeachers: school.maxTeachers,
        maxStorage: school.maxStorage,
        currentStudents: school.currentStudents ?? 0,
        currentTeachers: school.currentTeachers ?? 0,
        currentStorage: school.currentStorage ?? 0,
      },
    });

    request.log.info(
      {
        schoolId,
        plan: school.subscriptionPlan,
        resource,
        used: validation.used,
        reserved: validation.reserved,
        limit: validation.limit,
        source: validation.source,
        stale: validation.stale,
      },
      "Subscription check passed"
    );
  } catch (err) {
    request.log.error(
      { err, schoolId, plan: school.subscriptionPlan, resource },
      "Subscription check failed"
    );

    if (err instanceof AppError) {
      throw err;
    }

    return reply.status(500).send({
      code: "INTERNAL_ERROR",
      message: "Something went wrong",
    });
  }
}
