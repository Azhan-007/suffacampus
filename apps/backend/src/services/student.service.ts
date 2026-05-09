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
  // Note: enforcePlanLimit is already handled by the enforceSubscription middleware

  const student = await prisma.student.create({
    data: {
      schoolId,
      firstName: data.firstName,
      lastName: data.lastName,
      classId: data.classId,
      sectionId: data.sectionId,
      rollNumber: data.rollNumber,
      parentPhone: data.parentPhone,
      gender: data.gender as any,
      photoURL: data.photoURL,
      email: data.email,
      phone: data.phone,
      alternatePhone: data.alternatePhone,
      dateOfBirth: data.dateOfBirth,
      bloodGroup: data.bloodGroup,
      nationality: data.nationality,
      religion: data.religion,
      address: data.address,
      city: data.city,
      state: data.state,
      postalCode: data.postalCode,
      emergencyContact: data.emergencyContact,
      emergencyContactName: data.emergencyContactName,
      emergencyRelation: data.emergencyRelation,
      medicalConditions: data.medicalConditions,
      allergies: data.allergies,
      previousSchool: data.previousSchool,
      admissionDate: data.admissionDate,
      fatherName: data.fatherName,
      fatherPhone: data.fatherPhone,
      fatherEmail: data.fatherEmail,
      fatherOccupation: data.fatherOccupation,
      fatherWorkplace: data.fatherWorkplace,
      motherName: data.motherName,
      motherPhone: data.motherPhone,
      motherEmail: data.motherEmail,
      motherOccupation: data.motherOccupation,
      motherWorkplace: data.motherWorkplace,
      guardianName: data.guardianName,
      guardianRelation: data.guardianRelation,
      guardianPhone: data.guardianPhone,
      guardianEmail: data.guardianEmail,
      parentEmail: data.parentEmail,
      enrollmentDate: data.enrollmentDate,
      isActive: data.isActive,
      isDeleted: false,
    },
  });

  // Pre-compute credentials so we can return them immediately
  const username = buildUsername(student.firstName, student.lastName);
  const email = `${username}.${schoolId}@SuffaCampus.internal`;
  const password = buildSimplePassword(student.firstName);
  const credentials: StudentCredentials = { username, email, password };

  // Fire-and-forget: provision Firebase Auth + audit log in background
  // This avoids 30-60s timeouts on Render free tier (0.1 CPU)
  provisionStudentAuth(student, schoolId).catch((err) => {
    log.error({ err, studentId: student.id }, "Background auth provisioning failed");
  });

  writeStudentAuditLogSafe("STUDENT_CREATED", performedBy, schoolId, {
    studentId: student.id,
    firstName: student.firstName,
    lastName: student.lastName,
    classId: student.classId,
    sectionId: student.sectionId,
  });

  return { ...student, credentials };
}

/**
 * List students for a school — paginated, filterable, searchable.
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
 * Get all students for a school (unpaginated — internal use, e.g. counts).
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

  // Explicit field mapping — never spread raw input into Prisma
  const safeUpdate: Record<string, unknown> = {};
  if (data.firstName !== undefined) safeUpdate.firstName = data.firstName;
  if (data.lastName !== undefined) safeUpdate.lastName = data.lastName;
  if (data.classId !== undefined) safeUpdate.classId = data.classId;
  if (data.sectionId !== undefined) safeUpdate.sectionId = data.sectionId;
  if (data.rollNumber !== undefined) safeUpdate.rollNumber = data.rollNumber;
  if (data.parentPhone !== undefined) safeUpdate.parentPhone = data.parentPhone;
  if (data.gender !== undefined) safeUpdate.gender = data.gender;
  if (data.photoURL !== undefined) safeUpdate.photoURL = data.photoURL;
  if (data.email !== undefined) safeUpdate.email = data.email;
  if (data.phone !== undefined) safeUpdate.phone = data.phone;
  if (data.alternatePhone !== undefined) safeUpdate.alternatePhone = data.alternatePhone;
  if (data.dateOfBirth !== undefined) safeUpdate.dateOfBirth = data.dateOfBirth;
  if (data.bloodGroup !== undefined) safeUpdate.bloodGroup = data.bloodGroup;
  if (data.nationality !== undefined) safeUpdate.nationality = data.nationality;
  if (data.religion !== undefined) safeUpdate.religion = data.religion;
  if (data.address !== undefined) safeUpdate.address = data.address;
  if (data.city !== undefined) safeUpdate.city = data.city;
  if (data.state !== undefined) safeUpdate.state = data.state;
  if (data.postalCode !== undefined) safeUpdate.postalCode = data.postalCode;
  if (data.emergencyContact !== undefined) safeUpdate.emergencyContact = data.emergencyContact;
  if (data.emergencyContactName !== undefined) safeUpdate.emergencyContactName = data.emergencyContactName;
  if (data.emergencyRelation !== undefined) safeUpdate.emergencyRelation = data.emergencyRelation;
  if (data.medicalConditions !== undefined) safeUpdate.medicalConditions = data.medicalConditions;
  if (data.allergies !== undefined) safeUpdate.allergies = data.allergies;
  if (data.previousSchool !== undefined) safeUpdate.previousSchool = data.previousSchool;
  if (data.admissionDate !== undefined) safeUpdate.admissionDate = data.admissionDate;
  if (data.fatherName !== undefined) safeUpdate.fatherName = data.fatherName;
  if (data.fatherPhone !== undefined) safeUpdate.fatherPhone = data.fatherPhone;
  if (data.fatherEmail !== undefined) safeUpdate.fatherEmail = data.fatherEmail;
  if (data.fatherOccupation !== undefined) safeUpdate.fatherOccupation = data.fatherOccupation;
  if (data.fatherWorkplace !== undefined) safeUpdate.fatherWorkplace = data.fatherWorkplace;
  if (data.motherName !== undefined) safeUpdate.motherName = data.motherName;
  if (data.motherPhone !== undefined) safeUpdate.motherPhone = data.motherPhone;
  if (data.motherEmail !== undefined) safeUpdate.motherEmail = data.motherEmail;
  if (data.motherOccupation !== undefined) safeUpdate.motherOccupation = data.motherOccupation;
  if (data.motherWorkplace !== undefined) safeUpdate.motherWorkplace = data.motherWorkplace;
  if (data.guardianName !== undefined) safeUpdate.guardianName = data.guardianName;
  if (data.guardianRelation !== undefined) safeUpdate.guardianRelation = data.guardianRelation;
  if (data.guardianPhone !== undefined) safeUpdate.guardianPhone = data.guardianPhone;
  if (data.guardianEmail !== undefined) safeUpdate.guardianEmail = data.guardianEmail;
  if (data.parentEmail !== undefined) safeUpdate.parentEmail = data.parentEmail;
  if (data.enrollmentDate !== undefined) safeUpdate.enrollmentDate = data.enrollmentDate;
  if (data.isActive !== undefined) safeUpdate.isActive = data.isActive;

  const updated = await prisma.student.update({
    where: { id: studentId },
    data: safeUpdate,
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

/**
 * Reset a student's password to a temporary value.
 * Admin action: generates a secure temp password, updates Firebase Auth,
 * and sets requirePasswordChange: true so the student must set a new
 * password on next login.
 */
export async function resetStudentPassword(
  studentId: string,
  schoolId: string,
  performedBy: string
): Promise<{ tempPassword: string }> {
  assertSchoolScope(schoolId);

  const student = await prisma.student.findUnique({
    where: { id: studentId },
    select: {
      id: true,
      schoolId: true,
      isDeleted: true,
      firstName: true,
      lastName: true,
    },
  });

  if (!student) throw Errors.notFound("Student", studentId);
  if (student.schoolId !== schoolId) throw Errors.tenantMismatch();
  if (student.isDeleted) throw Errors.notFound("Student", studentId);

  // Find the linked user account
  const user = await prisma.user.findFirst({
    where: { studentId, schoolId },
    select: { uid: true },
  });

  if (!user) {
    throw Errors.badRequest("No user account linked to this student");
  }

  // Generate a temporary password: FirstName + random 4 digits
  const safeName = (student.firstName || "Student").replace(/[^a-zA-Z]/g, "");
  const randomDigits = Math.floor(1000 + Math.random() * 9000);
  const tempPassword = `${safeName}@${randomDigits}`;

  // Update Firebase Auth password
  await auth.updateUser(user.uid, { password: tempPassword });

  // Set requirePasswordChange flag
  await prisma.user.update({
    where: { uid: user.uid },
    data: { requirePasswordChange: true },
  });

  await writeAuditLog("RESET_STUDENT_PASSWORD", performedBy, schoolId, {
    studentId,
    studentName: `${student.firstName} ${student.lastName}`,
  });

  return { tempPassword };
}
