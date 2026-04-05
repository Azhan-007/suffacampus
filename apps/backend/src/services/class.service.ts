import { prisma } from "../lib/prisma";
import type { CreateClassInput, UpdateClassInput, SectionInput } from "../schemas/modules.schema";
import { writeAuditLog } from "./audit.service";
import { Errors } from "../errors";

export async function createClass(
  schoolId: string,
  data: CreateClassInput,
  performedBy: string
) {
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
  return prisma.class.findMany({
    where: { schoolId, isActive: true },
    include: { sections: true },
    orderBy: { grade: "asc" },
  });
}

export async function getClassById(classId: string, schoolId: string) {
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
  const existing = await prisma.class.findUnique({ where: { id: classId } });

  if (!existing) throw Errors.notFound("Class", classId);
  if (existing.schoolId !== schoolId) throw Errors.tenantMismatch();
  if (!existing.isActive) throw Errors.notFound("Class", classId);

  const updated = await prisma.class.update({
    where: { id: classId },
    data: {
      className: data.className,
      grade: data.grade,
      capacity: data.capacity,
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
  const existing = await prisma.class.findUnique({ where: { id: classId } });

  if (!existing) throw Errors.notFound("Class", classId);
  if (existing.schoolId !== schoolId) throw Errors.tenantMismatch();
  if (!existing.isActive) throw Errors.notFound("Class", classId);

  const section = await prisma.section.findUnique({ where: { id: sectionId } });
  if (!section || section.classId !== classId) throw Errors.notFound("Section", sectionId);

  await prisma.section.delete({ where: { id: sectionId } });

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
