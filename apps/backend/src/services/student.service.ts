import { prisma } from "../lib/prisma";
import { auth } from "../lib/firebase-admin";
import type { CreateStudentInput } from "../schemas/student.schema";
import type { UpdateStudentInput } from "../schemas/update.schema";
import { writeAuditLog } from "./audit.service";
import { Errors } from "../errors";
import { createLogger } from "../utils/logger";
import {
  assertSchoolScope,
} from "../lib/tenant-scope";
import { enforcePlanLimit } from "./plan-limit.service";

const log = createLogger("student-service");

export interface StudentCredentials {
  username: string;
  email: string;
  password: string;
}

export interface StudentAccessContext {
  role?: string | null;
  uid?: string | null;
  studentId?: string | null;
  studentIds?: string[] | null;
}

function normalizeActorRole(role: unknown): string {
  if (typeof role !== "string") return "";
  return role.trim().toLowerCase();
}

function normalizeLinkedStudentIds(
  context?: StudentAccessContext
): string[] {
  const ids: string[] = [];

  if (typeof context?.studentId === "string" && context.studentId.trim().length > 0) {
    ids.push(context.studentId.trim());
  }

  if (Array.isArray(context?.studentIds)) {
    for (const rawId of context.studentIds) {
      if (typeof rawId === "string" && rawId.trim().length > 0) {
        ids.push(rawId.trim());
      }
    }
  }

  return [...new Set(ids)];
}

function applyStudentScopeToWhere(
  where: Record<string, unknown>,
  context?: StudentAccessContext
): boolean {
  const role = normalizeActorRole(context?.role);

  if (role === "student") {
    if (typeof context?.studentId !== "string" || context.studentId.trim().length === 0) {
      return false;
    }

    where.id = context.studentId.trim();
    return true;
  }

  if (role === "parent") {
    const linkedStudentIds = normalizeLinkedStudentIds(context);
    if (linkedStudentIds.length === 0) {
      return false;
    }

    where.id = { in: linkedStudentIds };
  }

  return true;
}

function enforceStudentOwnership(
  context: StudentAccessContext | undefined,
  studentId: string
): void {
  const role = normalizeActorRole(context?.role);

  if (role === "student") {
    if (context?.studentId !== studentId) {
      throw Errors.insufficientRole(["Student (self)"]);
    }
    return;
  }

  if (role === "parent") {
    const linkedStudentIds = normalizeLinkedStudentIds(context);
    if (!linkedStudentIds.includes(studentId)) {
      throw Errors.insufficientRole(["Parent (linked)"]);
    }
  }
}

async function writeStudentAuditLogSafe(
  action: string,
  userId: string,
  schoolId: string,
  metadata: Record<string, unknown>
): Promise<void> {
  try {
    await writeAuditLog(action, userId, schoolId, metadata);
  } catch (error) {
    log.error({ err: error, action, userId, schoolId }, "Failed to write student audit log");
  }
}

/** Generate a simple readable password for new student accounts: FirstName@123 */
function buildSimplePassword(firstName: string): string {
  const name =
    firstName.charAt(0).toUpperCase() +
    firstName.slice(1).toLowerCase().replace(/\s+/g, "");
  return `${name}@123`;
}

/**
 * Derive a unique username from firstName + lastName.
 */
function buildUsername(firstName: string, lastName: string): string {
  return `${firstName.toLowerCase().replace(/\s+/g, "")}.${lastName
    .toLowerCase()
    .replace(/\s+/g, "")}`;
}

/**
 * Auto-provision a Firebase Auth account + Prisma user doc for a new student.
 */
async function provisionStudentAuth(
  student: { id: string; firstName: string; lastName: string; rollNumber: string },
  schoolId: string
): Promise<StudentCredentials> {
  assertSchoolScope(schoolId);

  const username = buildUsername(student.firstName, student.lastName);
  const email = `${username}.${schoolId}@SuffaCampus.internal`;
  const tempPassword = buildSimplePassword(student.firstName);

  // Create Firebase Auth user
  let uid: string;
  try {
    const userRecord = await auth.createUser({
      email,
      password: tempPassword,
      displayName: `${student.firstName} ${student.lastName}`,
    });
    uid = userRecord.uid;
  } catch (err: any) {
    if (err?.code === "auth/email-already-exists") {
      const existing = await auth.getUserByEmail(email);
      uid = existing.uid;
    } else {
      throw err;
    }
  }

  // Set custom claims for RBAC
  await auth.setCustomUserClaims(uid, { role: "Student", schoolId });

  // Create user record in PostgreSQL
  await prisma.user.upsert({
    where: { uid },
    update: {
      email,
      displayName: `${student.firstName} ${student.lastName}`,
      role: "Student",
      schoolId,
      studentId: student.id,
      isActive: true,
      requirePasswordChange: true,
    },
    create: {
      uid,
      email,
      username,
      displayName: `${student.firstName} ${student.lastName}`,
      role: "Student",
      schoolId,
      studentId: student.id,
      isActive: true,
      requirePasswordChange: true,
    },
  });

  return { username, email, password: tempPassword };
}

export async function createStudent(
  schoolId: string,
  data: CreateStudentInput,
  performedBy: string
) {
  assertSchoolScope(schoolId);
  await enforcePlanLimit("students", schoolId);

  const student = await prisma.student.create({
    data: {
      schoolId,
      ...data,
      gender: data.gender as any,
      isDeleted: false,
    },
  });

  // Auto-provision login credentials
  const credentials = await provisionStudentAuth(student, schoolId);

  await writeStudentAuditLogSafe("STUDENT_CREATED", performedBy, schoolId, {
    studentId: student.id,
    firstName: student.firstName,
    lastName: student.lastName,
    classId: student.classId,
    sectionId: student.sectionId,
  });

  return { ...student, credentials };
}

/**
 * List students for a school â€” paginated, filterable, searchable.
 */
export async function getStudentsBySchool(
  schoolId: string,
  pagination: { limit?: number; cursor?: string; sortBy?: string; sortOrder?: "asc" | "desc" },
  filters: { classId?: string; sectionId?: string; gender?: string; status?: string; search?: string } = {},
  context?: StudentAccessContext
) {
  assertSchoolScope(schoolId);

  const where: any = { schoolId, isDeleted: false };

  if (filters.classId) where.classId = filters.classId;
  if (filters.sectionId) where.sectionId = filters.sectionId;
  if (filters.gender) where.gender = filters.gender;
  if (filters.status === "inactive") where.isActive = false;

  // Name search (PostgreSQL supports `contains` natively)
  if (filters.search) {
    where.OR = [
      { firstName: { contains: filters.search, mode: "insensitive" } },
      { lastName: { contains: filters.search, mode: "insensitive" } },
    ];
  }

  const limit = Math.min(pagination.limit ?? 20, 100);
  const sortBy = pagination.sortBy ?? "createdAt";
  const sortOrder = pagination.sortOrder ?? "desc";

  const isVisible = applyStudentScopeToWhere(where, context);
  if (!isVisible) {
    return {
      data: [],
      pagination: {
        cursor: null,
        hasMore: false,
        limit,
      },
    };
  }

  const students = await prisma.student.findMany({
    where,
    orderBy: { [sortBy]: sortOrder },
    take: limit + 1,
    ...(pagination.cursor
      ? { cursor: { id: pagination.cursor }, skip: 1 }
      : {}),
  });

  const hasMore = students.length > limit;
  const data = hasMore ? students.slice(0, limit) : students;

  return {
    data,
    pagination: {
      cursor: data.length > 0 ? data[data.length - 1].id : null,
      hasMore,
      limit,
    },
  };
}

/**
 * Get all students for a school (unpaginated â€” internal use, e.g. counts).
 */
export async function getAllStudentsBySchool(schoolId: string) {
  assertSchoolScope(schoolId);

  return prisma.student.findMany({
    where: { schoolId, isDeleted: false },
    orderBy: { createdAt: "desc" },
  });
}

export async function getStudentById(
  studentId: string,
  schoolId: string,
  context?: StudentAccessContext
) {
  assertSchoolScope(schoolId);

  const student = await prisma.student.findUnique({ where: { id: studentId } });

  if (!student) return null;
  if (student.schoolId !== schoolId) return null;
  if (student.isDeleted) return null;

  enforceStudentOwnership(context, student.id);

  return student;
}

/**
 * Partially update a student document.
 */
export async function updateStudent(
  studentId: string,
  schoolId: string,
  data: UpdateStudentInput,
  performedBy: string
) {
  assertSchoolScope(schoolId);

  const existing = await prisma.student.findUnique({ where: { id: studentId } });

  if (!existing) throw Errors.notFound("Student", studentId);
  if (existing.schoolId !== schoolId) throw Errors.tenantMismatch();
  if (existing.isDeleted) throw Errors.notFound("Student", studentId);

  const updated = await prisma.student.update({
    where: { id: studentId },
    data: { ...data, gender: data.gender as any },
  });

  await writeAuditLog("UPDATE_STUDENT", performedBy, schoolId, {
    studentId,
    updatedFields: Object.keys(data),
  });

  return updated;
}

/**
 * Soft-delete a student.
 */
export async function softDeleteStudent(
  studentId: string,
  schoolId: string,
  performedBy: string
): Promise<boolean> {
  assertSchoolScope(schoolId);

  const student = await prisma.student.findUnique({ where: { id: studentId } });

  if (!student) return false;
  if (student.schoolId !== schoolId) return false;
  if (student.isDeleted) return false;

  await prisma.student.update({
    where: { id: studentId },
    data: {
      isDeleted: true,
      deletedAt: new Date(),
      deletedBy: performedBy,
    },
  });

  await writeAuditLog("DELETE_STUDENT", performedBy, schoolId, {
    studentId,
    firstName: student.firstName,
    lastName: student.lastName,
  });

  return true;
}

/**
 * Permanently delete a student (must be soft-deleted first).
 */
export async function permanentDeleteStudent(
  studentId: string,
  schoolId: string,
  performedBy: string
): Promise<boolean> {
  assertSchoolScope(schoolId);

  const student = await prisma.student.findUnique({ where: { id: studentId } });

  if (!student) return false;
  if (student.schoolId !== schoolId) return false;
  if (!student.isDeleted) {
    throw Errors.badRequest(
      "Student must be soft-deleted first before permanent deletion"
    );
  }

  await prisma.student.delete({ where: { id: studentId } });

  await writeAuditLog("PERMANENT_DELETE_STUDENT", performedBy, schoolId, {
    studentId,
    firstName: student.firstName,
    lastName: student.lastName,
  });

  return true;
}
