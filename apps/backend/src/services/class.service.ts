import { prisma } from "../lib/prisma";
import type { CreateClassInput, UpdateClassInput, SectionInput } from "../schemas/modules.schema";
import { writeAuditLog } from "./audit.service";
import { Errors } from "../errors";
import { assertSchoolScope } from "../lib/tenant-scope";
import { enforcePlanLimit } from "./plan-limit.service";

export async function createClass(
  schoolId: string,
  data: CreateClassInput,
  performedBy: string
) {
  assertSchoolScope(schoolId);
  await enforcePlanLimit("classes", schoolId);

  const classRecord = await prisma.class.create({
    data: {
      schoolId,
      className: data.className,
      grade: data.grade,
      capacity: data.capacity,
      isActive: true,
      sections: {
        create: data.sections.map((s) => ({
          sectionName: s.sectionName,
          capacity: s.capacity,
          teacherId: s.teacherId,
          teacherName: s.teacherName,
          studentsCount: 0,
        })),
      },
    },
    include: { sections: true },
  });

  await writeAuditLog("CREATE_CLASS", performedBy, schoolId, {
    classId: classRecord.id,
    className: classRecord.className,
    grade: classRecord.grade,
    sectionsCount: classRecord.sections.length,
  });

  return classRecord;
}

export async function getClassesBySchool(
  schoolId: string,
  pagination: { limit?: number; cursor?: string }
) {
  assertSchoolScope(schoolId);

  const limit = Math.min(pagination.limit ?? 50, 100);

  const classes = await prisma.class.findMany({
    where: { schoolId, isActive: true },
    include: { sections: true },
    orderBy: { grade: "asc" },
    take: limit + 1,
    ...(pagination.cursor ? { cursor: { id: pagination.cursor }, skip: 1 } : {}),
  });

  const hasMore = classes.length > limit;
  const data = hasMore ? classes.slice(0, limit) : classes;

  return {
    data,
    pagination: {
      cursor: data.length > 0 ? data[data.length - 1].id : null,
      hasMore,
      limit,
    },
  };
}

export async function getAllClassesBySchool(schoolId: string) {
  assertSchoolScope(schoolId);

  return prisma.class.findMany({
    where: { schoolId, isActive: true },
    include: { sections: true },
    orderBy: { grade: "asc" },
  });
}

export async function getClassById(classId: string, schoolId: string) {
  assertSchoolScope(schoolId);

  const classRecord = await prisma.class.findUnique({
    where: { id: classId },
    include: { sections: true },
  });

  if (!classRecord) return null;
  if (classRecord.schoolId !== schoolId) return null;
  if (!classRecord.isActive) return null;

  return classRecord;
}

export async function updateClass(
  classId: string,
  schoolId: string,
  data: UpdateClassInput,
  performedBy: string
) {
  assertSchoolScope(schoolId);

  const existing = await prisma.class.findUnique({
    where: { id: classId },
    include: { sections: true },
  });

  if (!existing) throw Errors.notFound("Class", classId);
  if (existing.schoolId !== schoolId) throw Errors.tenantMismatch();
  if (!existing.isActive) throw Errors.notFound("Class", classId);

  // When sections are provided, perform an ID-aware diff update to avoid
  // resetting counters and changing IDs for existing sections.
  if (data.sections !== undefined) {
    const currentSections = existing.sections;
    const currentById = new Map(currentSections.map((section) => [section.id, section]));
    const hasExistingSections = currentSections.length > 0;

    if (hasExistingSections) {
      for (const incomingSection of data.sections) {
        if (typeof incomingSection.id !== "string" || incomingSection.id.trim().length === 0) {
          throw Errors.badRequest("Section id is required for section updates");
        }
      }

      const unknownSectionIds = data.sections
        .map((section) => section.id!.trim())
        .filter((sectionId) => !currentById.has(sectionId));

      if (unknownSectionIds.length > 0) {
        throw Errors.badRequest("Unknown section id in update payload", {
          sectionIds: unknownSectionIds,
        });
      }
    }

    const matchedSectionIds = new Set<string>();

    for (const incomingSection of data.sections) {
      const normalizedId =
        typeof incomingSection.id === "string" ? incomingSection.id.trim() : "";
      const existingSection =
        normalizedId.length > 0 ? currentById.get(normalizedId) : undefined;

      if (existingSection) {
        matchedSectionIds.add(existingSection.id);

        const sectionUpdateData: Partial<SectionInput> = {
          ...(incomingSection.sectionName !== existingSection.sectionName
            ? { sectionName: incomingSection.sectionName }
            : {}),
          ...(incomingSection.capacity !== existingSection.capacity
            ? { capacity: incomingSection.capacity }
            : {}),
        };

        const hasTeacherId = Object.prototype.hasOwnProperty.call(incomingSection, "teacherId");
        if (
          hasTeacherId
          && incomingSection.teacherId !== undefined
          && incomingSection.teacherId !== existingSection.teacherId
        ) {
          sectionUpdateData.teacherId = incomingSection.teacherId;
        }

        const hasTeacherName = Object.prototype.hasOwnProperty.call(incomingSection, "teacherName");
        if (
          hasTeacherName
          && incomingSection.teacherName !== undefined
          && incomingSection.teacherName !== existingSection.teacherName
        ) {
          sectionUpdateData.teacherName = incomingSection.teacherName;
        }

        if (Object.keys(sectionUpdateData).length > 0) {
          await prisma.section.update({
            where: { id: existingSection.id },
            data: sectionUpdateData,
          });
        }

        continue;
      }

      await prisma.section.create({
        data: {
          classId,
          sectionName: incomingSection.sectionName,
          capacity: incomingSection.capacity,
          teacherId: incomingSection.teacherId,
          teacherName: incomingSection.teacherName,
          studentsCount: 0,
        },
      });
    }

    if (hasExistingSections) {
      const removedSectionIds = currentSections
        .filter((section) => !matchedSectionIds.has(section.id))
        .map((section) => section.id);

      if (removedSectionIds.length > 0) {
        await prisma.section.deleteMany({
          where: {
            classId,
            id: { in: removedSectionIds },
          },
        });
      }
    }
  }

  const updated = await prisma.class.update({
    where: { id: classId },
    data: {
      ...(data.className !== undefined ? { className: data.className } : {}),
      ...(data.grade !== undefined ? { grade: data.grade } : {}),
      ...(data.capacity !== undefined ? { capacity: data.capacity } : {}),
      ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
    },
    include: { sections: true },
  });

  await writeAuditLog("UPDATE_CLASS", performedBy, schoolId, {
    classId,
    updatedFields: Object.keys(data),
  });

  return updated;
}

export async function softDeleteClass(
  classId: string,
  schoolId: string,
  performedBy: string
): Promise<boolean> {
  assertSchoolScope(schoolId);

  const existing = await prisma.class.findUnique({ where: { id: classId } });

  if (!existing) return false;
  if (existing.schoolId !== schoolId) return false;
  if (!existing.isActive) return false;

  await prisma.class.update({
    where: { id: classId },
    data: { isActive: false },
  });

  await writeAuditLog("DELETE_CLASS", performedBy, schoolId, {
    classId,
    className: existing.className,
  });

  return true;
}

export async function addSection(
  classId: string,
  schoolId: string,
  section: SectionInput,
  performedBy: string
) {
  assertSchoolScope(schoolId);

  const existing = await prisma.class.findUnique({ where: { id: classId } });

  if (!existing) throw Errors.notFound("Class", classId);
  if (existing.schoolId !== schoolId) throw Errors.tenantMismatch();
  if (!existing.isActive) throw Errors.notFound("Class", classId);

  await prisma.section.create({
    data: {
      classId,
      sectionName: section.sectionName,
      capacity: section.capacity,
      teacherId: section.teacherId,
      teacherName: section.teacherName,
      studentsCount: 0,
    },
  });

  await writeAuditLog("ADD_SECTION", performedBy, schoolId, {
    classId,
    sectionName: section.sectionName,
  });

  return prisma.class.findUnique({
    where: { id: classId },
    include: { sections: true },
  });
}

export async function removeSection(
  classId: string,
  sectionId: string,
  schoolId: string,
  performedBy: string
) {
  assertSchoolScope(schoolId);

  const existing = await prisma.class.findUnique({ where: { id: classId } });

  if (!existing) throw Errors.notFound("Class", classId);
  if (existing.schoolId !== schoolId) throw Errors.tenantMismatch();
  if (!existing.isActive) throw Errors.notFound("Class", classId);

  const section = await prisma.section.findFirst({
    where: {
      id: sectionId,
      classId,
      class: { schoolId },
    },
  });
  if (!section) throw Errors.notFound("Section", sectionId);

  await prisma.section.deleteMany({
    where: {
      id: sectionId,
      classId,
      class: { schoolId },
    },
  });

  await writeAuditLog("REMOVE_SECTION", performedBy, schoolId, {
    classId,
    sectionId,
    sectionName: section.sectionName,
  });

  return prisma.class.findUnique({
    where: { id: classId },
    include: { sections: true },
  });
}
