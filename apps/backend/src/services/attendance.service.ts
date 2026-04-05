import { prisma } from "../lib/prisma";
import type { MarkAttendanceInput } from "../schemas/attendance.schema";
import { writeAuditLog } from "./audit.service";

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
 * Mark attendance for a student.
 * Validates student exists, belongs to the same school, and prevents duplicates.
 */
export async function markAttendance(
  schoolId: string,
  markedBy: string,
  data: MarkAttendanceInput
) {
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

  // 2. Prevent duplicate attendance (unique constraint will also catch this)
  const existing = await prisma.attendance.findUnique({
    where: {
      schoolId_studentId_date: {
        schoolId,
        studentId: data.studentId,
        date: data.date,
      },
    },
  });

  if (existing) {
    throw new AttendanceError(
      `Attendance already marked for student ${data.studentId} on ${data.date}`,
      "DUPLICATE"
    );
  }

  // 3. Create the attendance record
  const record = await prisma.attendance.create({
    data: {
      schoolId,
      markedBy,
      studentId: data.studentId,
      studentName: data.studentName,
      classId: data.classId,
      sectionId: data.sectionId,
      date: data.date,
      status: data.status as any,
      remarks: data.remarks,
    },
  });

  await writeAuditLog("MARK_ATTENDANCE", markedBy, schoolId, {
    attendanceId: record.id,
    studentId: record.studentId,
    date: record.date,
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
  status: "Present" | "Absent";
  classId: string;
  sectionId: string;
  studentName?: string;
  remarks?: string;
};

/**
 * Fetch attendance records for a school on a given date.
 */
export async function getAttendanceByDate(
  schoolId: string,
  date: string,
  classId?: string,
  sectionId?: string
) {
  const where: any = { schoolId, date };
  if (classId) where.classId = classId;
  if (sectionId) where.sectionId = sectionId;

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
  const existing = await prisma.attendance.findUnique({ where: { id: attendanceId } });

  if (!existing) return false;
  if (existing.schoolId !== schoolId) return false;

  await prisma.attendance.delete({ where: { id: attendanceId } });

  await writeAuditLog("DELETE_ATTENDANCE", performedBy, schoolId, {
    attendanceId,
    studentId: existing.studentId,
    date: existing.date,
    status: existing.status,
  });

  return true;
}
