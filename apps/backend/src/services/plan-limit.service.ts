import { prisma } from "../lib/prisma";
import { Errors } from "../errors";
import {
  assertSchoolScope,
  resolveClassLimitForPlan,
  resolveStudentLimitForPlan,
  resolveTeacherLimitForPlan,
} from "../lib/tenant-scope";

export type PlanLimitedResource = "students" | "teachers" | "classes";

function normalizeIncomingCount(incomingCount?: number): number {
  if (incomingCount === undefined) {
    return 1;
  }

  if (!Number.isFinite(incomingCount)) {
    throw Errors.badRequest("incomingCount must be a finite number");
  }

  const normalized = Math.trunc(incomingCount);
  if (normalized < 1) {
    throw Errors.badRequest("incomingCount must be at least 1");
  }

  return normalized;
}

async function getCurrentUsage(
  schoolId: string,
  resourceType: PlanLimitedResource
): Promise<number> {
  if (resourceType === "students") {
    return prisma.student.count({
      where: { schoolId, isDeleted: false },
    });
  }

  if (resourceType === "teachers") {
    return prisma.teacher.count({
      where: { schoolId, isDeleted: false },
    });
  }

  return prisma.class.count({
    where: { schoolId, isActive: true },
  });
}

async function getPlanLimit(
  schoolId: string,
  resourceType: PlanLimitedResource
): Promise<number> {
  const school = await prisma.school.findUnique({
    where: { id: schoolId },
    select: {
      subscriptionPlan: true,
      maxStudents: true,
      maxTeachers: true,
    },
  });

  if (!school) {
    throw Errors.notFound("School", schoolId);
  }

  if (resourceType === "students") {
    return resolveStudentLimitForPlan(
      school.subscriptionPlan,
      school.maxStudents
    );
  }

  if (resourceType === "teachers") {
    return resolveTeacherLimitForPlan(
      school.subscriptionPlan,
      school.maxTeachers
    );
  }

  return resolveClassLimitForPlan(school.subscriptionPlan);
}

/**
 * Centralized subscription limit enforcement for write operations.
 * Throws an AppError when the requested operation exceeds the tenant plan cap.
 */
export async function enforcePlanLimit(
  resourceType: PlanLimitedResource,
  schoolId: string,
  incomingCount?: number
): Promise<void> {
  assertSchoolScope(schoolId);

  const normalizedIncoming = normalizeIncomingCount(incomingCount);
  const [limit, currentUsage] = await Promise.all([
    getPlanLimit(schoolId, resourceType),
    getCurrentUsage(schoolId, resourceType),
  ]);

  if (limit === -1) {
    return;
  }

  if (currentUsage + normalizedIncoming > limit) {
    throw Errors.subscriptionLimitReached(resourceType, limit);
  }
}
