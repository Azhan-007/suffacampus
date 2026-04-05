import { prisma } from "../lib/prisma";
import { auth } from "../lib/firebase-admin";
import type { CreateTeacherInput } from "../schemas/teacher.schema";
import type { UpdateTeacherInput } from "../schemas/update.schema";
import { writeAuditLog } from "./audit.service";
import { Errors } from "../errors";

export interface TeacherCredentials {
  email: string;
  password: string;
  username: string;
}

function buildSimplePassword(firstName: string): string {
  const name = firstName.charAt(0).toUpperCase() + firstName.slice(1).toLowerCase().replace(/\s+/g, "");
  return `${name}@123`;
}

function buildTeacherUsername(firstName: string, lastName: string): string {
  return `${firstName.toLowerCase().replace(/\s+/g, "")}.${lastName.toLowerCase().replace(/\s+/g, "")}`;
}

async function provisionTeacherAuth(
  teacher: { id: string; firstName: string; lastName: string; email: string },
  schoolId: string
): Promise<TeacherCredentials> {
  const tempPassword = buildSimplePassword(teacher.firstName);
  const username = buildTeacherUsername(teacher.firstName, teacher.lastName);

  let uid: string;
  try {
    const userRecord = await auth.createUser({
      email: teacher.email,
      password: tempPassword,
      displayName: `${teacher.firstName} ${teacher.lastName}`,
    });
    uid = userRecord.uid;
  } catch (err: any) {
    if (err?.code === "auth/email-already-exists") {
      const existing = await auth.getUserByEmail(teacher.email);
      uid = existing.uid;
    } else {
      throw err;
    }
  }

  await auth.setCustomUserClaims(uid, { role: "Teacher", schoolId });

  await prisma.user.upsert({
    where: { uid },
    update: {
      email: teacher.email,
      displayName: `${teacher.firstName} ${teacher.lastName}`,
      role: "Teacher",
      schoolId,
      teacherId: teacher.id,
      isActive: true,
      requirePasswordChange: true,
    },
    create: {
      uid,
      email: teacher.email,
      username,
      displayName: `${teacher.firstName} ${teacher.lastName}`,
      role: "Teacher",
      schoolId,
      teacherId: teacher.id,
      isActive: true,
      requirePasswordChange: true,
    },
  });

  return { email: teacher.email, password: tempPassword, username };
}

export async function createTeacher(
  schoolId: string,
  data: CreateTeacherInput,
  performedBy: string
) {
  const { assignedClasses, ...teacherData } = data;

  const teacher = await prisma.teacher.create({
    data: {
      schoolId,
      ...teacherData,
      isDeleted: false,
      assignedClasses: assignedClasses
        ? { create: assignedClasses.map((ac) => ({
            classId: ac.classId,
            sectionId: ac.sectionId,
            className: ac.className,
            sectionName: ac.sectionName,
          }))
        }
        : undefined,
    },
    include: { assignedClasses: true },
  });

  const credentials = await provisionTeacherAuth(teacher, schoolId);

  await writeAuditLog("CREATE_TEACHER", performedBy, schoolId, {
    teacherId: teacher.id,
    firstName: teacher.firstName,
    lastName: teacher.lastName,
    email: teacher.email,
    department: teacher.department,
  });

  return { ...teacher, credentials };
}

export async function getTeachersBySchool(
  schoolId: string,
  pagination: { limit?: number; cursor?: string; sortBy?: string; sortOrder?: "asc" | "desc" },
  filters: { department?: string; status?: string; search?: string } = {}
) {
  const where: any = { schoolId, isDeleted: false };

  if (filters.department) where.department = filters.department;
  if (filters.status === "inactive") where.isActive = false;

  if (filters.search) {
    where.OR = [
      { firstName: { contains: filters.search, mode: "insensitive" } },
      { lastName: { contains: filters.search, mode: "insensitive" } },
      { email: { contains: filters.search, mode: "insensitive" } },
    ];
  }

  const limit = Math.min(pagination.limit ?? 20, 100);
  const sortBy = pagination.sortBy ?? "createdAt";
  const sortOrder = pagination.sortOrder ?? "desc";

  const teachers = await prisma.teacher.findMany({
    where,
    include: { assignedClasses: true },
    orderBy: { [sortBy]: sortOrder },
    take: limit + 1,
    ...(pagination.cursor ? { cursor: { id: pagination.cursor }, skip: 1 } : {}),
  });

  const hasMore = teachers.length > limit;
  const data = hasMore ? teachers.slice(0, limit) : teachers;

  return {
    data,
    pagination: {
      cursor: data.length > 0 ? data[data.length - 1].id : null,
      hasMore,
      limit,
    },
  };
}

export async function getAllTeachersBySchool(schoolId: string) {
  return prisma.teacher.findMany({
    where: { schoolId, isDeleted: false },
    include: { assignedClasses: true },
    orderBy: { createdAt: "desc" },
  });
}

export async function getTeacherById(teacherId: string, schoolId: string) {
  const teacher = await prisma.teacher.findUnique({
    where: { id: teacherId },
    include: { assignedClasses: true },
  });

  if (!teacher) return null;
  if (teacher.schoolId !== schoolId) return null;
  if (teacher.isDeleted) return null;

  return teacher;
}

export async function updateTeacher(
  teacherId: string,
  schoolId: string,
  data: UpdateTeacherInput,
  performedBy: string
) {
  const existing = await prisma.teacher.findUnique({ where: { id: teacherId } });

  if (!existing) throw Errors.notFound("Teacher", teacherId);
  if (existing.schoolId !== schoolId) throw Errors.tenantMismatch();
  if (existing.isDeleted) throw Errors.notFound("Teacher", teacherId);

  const { assignedClasses, ...updateData } = data;

  // If assignedClasses changed, replace them
  if (assignedClasses !== undefined) {
    await prisma.teacherClassAssignment.deleteMany({ where: { teacherId } });
    if (assignedClasses.length > 0) {
      await prisma.teacherClassAssignment.createMany({
        data: assignedClasses.map((ac) => ({
          teacherId,
          classId: ac.classId,
          sectionId: ac.sectionId,
          className: ac.className,
          sectionName: ac.sectionName,
        })),
      });
    }
  }

  const updated = await prisma.teacher.update({
    where: { id: teacherId },
    data: updateData,
    include: { assignedClasses: true },
  });

  await writeAuditLog("UPDATE_TEACHER", performedBy, schoolId, {
    teacherId,
    updatedFields: Object.keys(data),
  });

  return updated;
}

export async function softDeleteTeacher(
  teacherId: string,
  schoolId: string,
  performedBy: string
): Promise<boolean> {
  const teacher = await prisma.teacher.findUnique({ where: { id: teacherId } });

  if (!teacher) return false;
  if (teacher.schoolId !== schoolId) return false;
  if (teacher.isDeleted) return false;

  await prisma.teacher.update({
    where: { id: teacherId },
    data: { isDeleted: true, deletedAt: new Date(), deletedBy: performedBy },
  });

  await writeAuditLog("DELETE_TEACHER", performedBy, schoolId, {
    teacherId,
    firstName: teacher.firstName,
    lastName: teacher.lastName,
    email: teacher.email,
  });

  return true;
}

export async function permanentDeleteTeacher(
  teacherId: string,
  schoolId: string,
  performedBy: string
): Promise<boolean> {
  const teacher = await prisma.teacher.findUnique({ where: { id: teacherId } });

  if (!teacher) return false;
  if (teacher.schoolId !== schoolId) return false;
  if (!teacher.isDeleted) {
    throw Errors.badRequest("Teacher must be soft-deleted first before permanent deletion");
  }

  await prisma.teacher.delete({ where: { id: teacherId } });

  await writeAuditLog("PERMANENT_DELETE_TEACHER", performedBy, schoolId, {
    teacherId,
    firstName: teacher.firstName,
    lastName: teacher.lastName,
  });

  return true;
}