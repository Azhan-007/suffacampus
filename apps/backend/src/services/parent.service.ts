/**
 * Parent Service — data access layer for parent-facing portal.
 * Parents are users with `role: "Parent"` and linked studentIds.
 */

import { prisma } from "../lib/prisma";
import { auth } from "../lib/firebase-admin";
import { writeAuditLog } from "./audit.service";
import { Errors } from "../errors";
import crypto from "node:crypto";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface ChildSummary {
  studentId: string;
  name: string;
  class: string;
  section: string;
  rollNumber: string;
  photoURL?: string | null;
  attendanceRate: number | null;
  pendingFees: number;
  lastExamScore: string | null;
}

/* ------------------------------------------------------------------ */
/*  Invite codes                                                       */
/* ------------------------------------------------------------------ */

export async function createParentInvite(
  schoolId: string,
  studentId: string,
  createdBy: string
) {
  const student = await prisma.student.findUnique({ where: { id: studentId } });
  if (!student) throw Errors.notFound("Student", studentId);
  if (student.schoolId !== schoolId) throw Errors.tenantMismatch();

  const code = crypto.randomBytes(3).toString("hex").toUpperCase();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  const invite = await prisma.parentInvite.create({
    data: {
      schoolId,
      studentId,
      studentName: `${student.firstName} ${student.lastName}`,
      code,
      createdBy,
      expiresAt,
      isActive: true,
    },
  });

  await writeAuditLog("CREATE_PARENT_INVITE", createdBy, schoolId, {
    inviteId: invite.id,
    studentId,
    code,
  });

  return invite;
}

export async function redeemParentInvite(
  code: string,
  parentUid: string
): Promise<{ schoolId: string; studentId: string; studentName: string }> {
  const invite = await prisma.parentInvite.findFirst({
    where: { code: code.toUpperCase(), isActive: true },
  });

  if (!invite) throw Errors.badRequest("Invalid or expired invite code");

  if (invite.expiresAt < new Date()) {
    await prisma.parentInvite.update({
      where: { id: invite.id },
      data: { isActive: false },
    });
    throw Errors.badRequest("Invite code has expired");
  }

  // Link the parent
  const user = await prisma.user.findUnique({ where: { uid: parentUid } });
  if (!user) throw Errors.notFound("User", parentUid);

  const existingIds: string[] = (user.studentIds as string[]) ?? [];
  if (existingIds.includes(invite.studentId)) {
    throw Errors.conflict("Student is already linked to your account");
  }

  await prisma.$transaction([
    prisma.user.update({
      where: { uid: parentUid },
      data: {
        role: "Parent",
        schoolId: invite.schoolId,
        studentIds: [...existingIds, invite.studentId],
      },
    }),
    prisma.parentInvite.update({
      where: { id: invite.id },
      data: { isActive: false, usedBy: parentUid, usedAt: new Date() },
    }),
  ]);

  await auth.setCustomUserClaims(parentUid, {
    role: "Parent",
    schoolId: invite.schoolId,
  });

  await writeAuditLog("REDEEM_PARENT_INVITE", parentUid, invite.schoolId, {
    inviteId: invite.id,
    studentId: invite.studentId,
  });

  return {
    schoolId: invite.schoolId,
    studentId: invite.studentId,
    studentName: invite.studentName,
  };
}

/* ------------------------------------------------------------------ */
/*  Parent data queries                                                */
/* ------------------------------------------------------------------ */

export function getLinkedStudentIds(user: Record<string, unknown>): string[] {
  const ids = user.studentIds;
  if (!Array.isArray(ids)) return [];
  return ids.filter((id): id is string => typeof id === "string");
}

export function assertParentOwnsStudent(
  user: Record<string, unknown>,
  studentId: string
): void {
  const ids = getLinkedStudentIds(user);
  if (!ids.includes(studentId)) {
    throw Errors.insufficientRole(["Parent (linked)"]);
  }
}

export async function getChildrenSummaries(
  schoolId: string,
  studentIds: string[]
): Promise<ChildSummary[]> {
  if (studentIds.length === 0) return [];

  const students = await prisma.student.findMany({
    where: { id: { in: studentIds }, schoolId },
  });

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    .toISOString().split("T")[0];

  const summaries: ChildSummary[] = [];

  for (const s of students) {
    // Attendance rate (last 30 days)
    const [totalAttendance, presentCount] = await Promise.all([
      prisma.attendance.count({
        where: { schoolId, studentId: s.id, date: { gte: thirtyDaysAgo } },
      }),
      prisma.attendance.count({
        where: {
          schoolId,
          studentId: s.id,
          date: { gte: thirtyDaysAgo },
          status: { in: ["Present", "Late"] },
        },
      }),
    ]);

    const attendanceRate =
      totalAttendance > 0 ? Math.round((presentCount / totalAttendance) * 100) : null;

    // Pending fees
    const pendingFees = await prisma.fee.aggregate({
      where: {
        schoolId,
        studentId: s.id,
        status: { in: ["Pending", "Overdue"] },
      },
      _sum: { amount: true },
    });

    // Last exam result
    const lastResult = await prisma.result.findFirst({
      where: { schoolId, studentId: s.id, isActive: true },
      orderBy: { createdAt: "desc" },
    });

    summaries.push({
      studentId: s.id,
      name: `${s.firstName} ${s.lastName}`,
      class: s.classId ?? "",
      section: s.sectionId ?? "",
      rollNumber: s.rollNumber ?? "",
      photoURL: s.photoURL,
      attendanceRate,
      pendingFees: pendingFees._sum.amount ?? 0,
      lastExamScore: lastResult
        ? `${lastResult.marksObtained}/${lastResult.totalMarks}`
        : null,
    });
  }

  return summaries;
}

export async function getStudentAttendanceForParent(
  schoolId: string,
  studentId: string,
  pagination: { limit?: number; cursor?: string }
) {
  const limit = Math.min(pagination.limit ?? 20, 100);

  const records = await prisma.attendance.findMany({
    where: { schoolId, studentId },
    orderBy: { date: "desc" },
    take: limit + 1,
    ...(pagination.cursor ? { cursor: { id: pagination.cursor }, skip: 1 } : {}),
  });

  const hasMore = records.length > limit;
  const data = hasMore ? records.slice(0, limit) : records;

  return {
    data,
    pagination: { cursor: data.length > 0 ? data[data.length - 1].id : null, hasMore, limit },
  };
}

export async function getStudentFeesForParent(
  schoolId: string,
  studentId: string,
  pagination: { limit?: number; cursor?: string }
) {
  const limit = Math.min(pagination.limit ?? 20, 100);

  const fees = await prisma.fee.findMany({
    where: { schoolId, studentId },
    orderBy: { createdAt: "desc" },
    take: limit + 1,
    ...(pagination.cursor ? { cursor: { id: pagination.cursor }, skip: 1 } : {}),
  });

  const hasMore = fees.length > limit;
  const data = hasMore ? fees.slice(0, limit) : fees;

  return {
    data,
    pagination: { cursor: data.length > 0 ? data[data.length - 1].id : null, hasMore, limit },
  };
}

export async function getStudentResultsForParent(
  schoolId: string,
  studentId: string,
  pagination: { limit?: number; cursor?: string }
) {
  const limit = Math.min(pagination.limit ?? 20, 100);

  const results = await prisma.result.findMany({
    where: { schoolId, studentId, isActive: true },
    orderBy: { createdAt: "desc" },
    take: limit + 1,
    ...(pagination.cursor ? { cursor: { id: pagination.cursor }, skip: 1 } : {}),
  });

  const hasMore = results.length > limit;
  const data = hasMore ? results.slice(0, limit) : results;

  return {
    data,
    pagination: { cursor: data.length > 0 ? data[data.length - 1].id : null, hasMore, limit },
  };
}

export async function getSchoolEventsForParent(
  schoolId: string,
  pagination: { limit?: number; cursor?: string }
) {
  const today = new Date().toISOString().split("T")[0];
  const limit = Math.min(pagination.limit ?? 20, 100);

  const events = await prisma.event.findMany({
    where: { schoolId, isActive: true, eventDate: { gte: today } },
    orderBy: { eventDate: "asc" },
    take: limit + 1,
    ...(pagination.cursor ? { cursor: { id: pagination.cursor }, skip: 1 } : {}),
  });

  const hasMore = events.length > limit;
  const data = hasMore ? events.slice(0, limit) : events;

  return {
    data,
    pagination: { cursor: data.length > 0 ? data[data.length - 1].id : null, hasMore, limit },
  };
}
