import { prisma } from "../lib/prisma";
import type { MarkAttendanceInput } from "../schemas/attendance.schema";
import { writeAuditLog } from "./audit.service";
import { assertSchoolScope } from "../lib/tenant-scope";
import { dateTimeFrom } from "../utils/safe-fields";

export class AttendanceError extends Error {
  constructor(
    message: string,
    public readonly code: "STUDENT_NOT_FOUND" | "CROSS_TENANT" | "DUPLICATE"
  ) {
    super(message);
    this.name = "AttendanceError";
  }
}

/**
 * Mark attendance for a student for a specific session (FN or AN).
 * Validates student exists, belongs to the same school, and prevents duplicates.
 */
export async function markAttendance(
  schoolId: string,
  markedBy: string,
  data: MarkAttendanceInput
) {
  assertSchoolScope(schoolId);

  const session = data.session ?? "FN";

  // 1. Validate student belongs to this school
  const student = await prisma.student.findUnique({
    where: { id: data.studentId },
    select: { schoolId: true, isDeleted: true },
  });

  if (!student) {
    throw new AttendanceError("Student not found", "STUDENT_NOT_FOUND");
  }
  if (student.schoolId !== schoolId) {
    throw new AttendanceError("Student does not belong to this school", "CROSS_TENANT");
  }
  if (student.isDeleted) {
    throw new AttendanceError("Student not found", "STUDENT_NOT_FOUND");
  }

  // 2. Parse date
  const attendanceDate = dateTimeFrom(data.date);
  if (!attendanceDate) {
    throw new AttendanceError("Invalid date format", "STUDENT_NOT_FOUND");
  }

  // 3. Check for existing record (upsert-style: update if exists, create if not)
  const existing = await prisma.attendance.findUnique({
    where: {
      schoolId_studentId_date_session: {
        schoolId,
        studentId: data.studentId,
        date: attendanceDate,
        session,
      },
    },
  });

  if (existing) {
    // Update existing record
    const updated = await prisma.attendance.update({
      where: { id: existing.id },
      data: {
        status: data.status as any,
        markedBy,
        remarks: data.remarks,
      },
    });

    await writeAuditLog("UPDATE_ATTENDANCE", markedBy, schoolId, {
      attendanceId: updated.id,
      studentId: updated.studentId,
      date: updated.date,
      session,
      status: updated.status,
    });

    return updated;
  }

  // 4. Create new attendance record
  const record = await prisma.attendance.create({
    data: {
      schoolId,
      markedBy,
      studentId: data.studentId,
      studentName: data.studentName,
      classId: data.classId,
      sectionId: data.sectionId,
      date: attendanceDate,
      session,
      status: data.status as any,
      remarks: data.remarks,
    },
  });

  await writeAuditLog("MARK_ATTENDANCE", markedBy, schoolId, {
    attendanceId: record.id,
    studentId: record.studentId,
    date: record.date,
    session,
    status: record.status,
    classId: record.classId,
    sectionId: record.sectionId,
  });

  return record;
}

/**
 * Type for a single attendance record within a bulk operation.
 */
export type BulkMarkAttendanceItem = {
  studentId: string;
  date: string;
  session?: string;
  status: "Present" | "Absent";
  classId: string;
  sectionId: string;
  studentName?: string;
  remarks?: string;
};

/**
 * Fetch attendance records for a school on a given date.
 * Optionally filter by classId, sectionId, and session.
 */
export async function getAttendanceByDate(
  schoolId: string,
  date: string,
  classId?: string,
  sectionId?: string,
  session?: string
) {
  assertSchoolScope(schoolId);

  const parsedDate = dateTimeFrom(date);
  const where: any = { schoolId, date: parsedDate ?? date };
  if (classId) where.classId = classId;
  if (sectionId) where.sectionId = sectionId;
  if (session) where.session = session;

  return prisma.attendance.findMany({ where, orderBy: { studentName: "asc" } });
}

/**
 * Update an attendance record.
 */
export async function updateAttendance(
  attendanceId: string,
  schoolId: string,
  data: { status?: string; remarks?: string },
  performedBy: string
) {
  assertSchoolScope(schoolId);

  const existing = await prisma.attendance.findUnique({ where: { id: attendanceId } });

  if (!existing) return null;
  if (existing.schoolId !== schoolId) return null;

  const updated = await prisma.attendance.update({
    where: { id: attendanceId },
    data: {
      ...(data.status ? { status: data.status as any } : {}),
      ...(data.remarks !== undefined ? { remarks: data.remarks } : {}),
    },
  });

  await writeAuditLog("UPDATE_ATTENDANCE", performedBy, schoolId, {
    attendanceId,
    studentId: existing.studentId,
    date: existing.date,
    session: existing.session,
    changes: data,
  });

  return updated;
}

/**
 * Delete an attendance record.
 */
export async function deleteAttendance(
  attendanceId: string,
  schoolId: string,
  performedBy: string
): Promise<boolean> {
  assertSchoolScope(schoolId);

  const existing = await prisma.attendance.findUnique({ where: { id: attendanceId } });

  if (!existing) return false;
  if (existing.schoolId !== schoolId) return false;

  await prisma.attendance.delete({ where: { id: attendanceId } });

  await writeAuditLog("DELETE_ATTENDANCE", performedBy, schoolId, {
    attendanceId,
    studentId: existing.studentId,
    date: existing.date,
    session: existing.session,
    status: existing.status,
  });

  return true;
}
