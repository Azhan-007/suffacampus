import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import type { MarkAttendanceInput } from "../schemas/attendance.schema";
import { writeAuditLog } from "./audit.service";
import { assertSchoolScope } from "../lib/tenant-scope";
import { dateTimeFrom } from "../utils/safe-fields";
import { sendToUsers, PushTemplates } from "./push-notification.service";
import pino from "pino";

const log = pino({ name: "attendance-service" });

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

  // 4. Create new attendance record.
  // Race condition guard: if another request created the same record
  // between our findUnique and this create, Prisma throws P2002
  // (unique constraint violation). We catch it and fall back to update.
  try {
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

    // Fire push notification to linked parents (non-blocking)
    notifyParentsOfAttendance(schoolId, data.studentId, data.studentName ?? "", record.status).catch(() => {});

    return record;
  } catch (err) {
    // P2002 = unique constraint violation — another request won the race
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const raced = await prisma.attendance.findUnique({
        where: {
          schoolId_studentId_date_session: {
            schoolId,
            studentId: data.studentId,
            date: attendanceDate,
            session,
          },
        },
      });

      if (raced) {
        const updated = await prisma.attendance.update({
          where: { id: raced.id },
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
    }

    throw err;
  }
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

// ---------------------------------------------------------------------------
// Push notification helper (fire-and-forget)
// ---------------------------------------------------------------------------

async function notifyParentsOfAttendance(
  schoolId: string,
  studentId: string,
  studentName: string,
  status: string
): Promise<void> {
  try {
    // Find parent users linked to this student
    const parents = await prisma.user.findMany({
      where: {
        schoolId,
        role: "Parent",
        studentIds: { has: studentId },
      },
      select: { uid: true },
    });

    if (parents.length === 0) return;

    const parentUids = parents.map((p) => p.uid);
    const normalizedStatus = status.toLowerCase() as "present" | "absent" | "late";
    const payload = PushTemplates.attendanceMarked(
      studentName || "Your child",
      normalizedStatus === "present" || normalizedStatus === "absent" || normalizedStatus === "late"
        ? normalizedStatus
        : "present"
    );

    await sendToUsers(parentUids, payload);
  } catch (err) {
    log.warn({ err, studentId, schoolId }, "Failed to send attendance push notification");
  }
}
