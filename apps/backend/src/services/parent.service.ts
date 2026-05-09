/**
 * Parent Service — data access layer for parent-facing portal.
 * Parents are users with `role: "Parent"` and linked studentIds.
 */

import { prisma } from "../lib/prisma";
import { auth } from "../lib/firebase-admin";
import { writeAuditLog } from "./audit.service";
import { Errors } from "../errors";
import crypto from "node:crypto";
import { moneyFrom, moneyToNumber } from "../utils/safe-fields";
import { assertSchoolScope } from "../lib/tenant-scope";

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
  assertSchoolScope(schoolId);

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

  // Cross-tenant guard — if user already belongs to a school, the invite
  // must be for the SAME school. Prevents cross-tenant student binding.
  if (user.schoolId && user.schoolId !== invite.schoolId) {
    throw Errors.badRequest(
      "Invite belongs to a different school. You cannot link students across schools."
    );
  }

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
  assertSchoolScope(schoolId);

  if (studentIds.length === 0) return [];

  const students = await prisma.student.findMany({
    where: { id: { in: studentIds }, schoolId },
  });

  if (students.length === 0) return [];

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const ids = students.map((s) => s.id);

  // Batch all queries instead of N+1 per student
  const [totalAttGroups, presentAttGroups, pendingFeeGroups, latestResults] = await Promise.all([
    // 1. Total attendance per student (last 30 days)
    prisma.attendance.groupBy({
      by: ["studentId"],
      where: { schoolId, studentId: { in: ids }, date: { gte: thirtyDaysAgo } },
      _count: true,
    }),
    // 2. Present/Late attendance per student (last 30 days)
    prisma.attendance.groupBy({
      by: ["studentId"],
      where: {
        schoolId,
        studentId: { in: ids },
        date: { gte: thirtyDaysAgo },
        status: { in: ["Present", "Late"] },
      },
      _count: true,
    }),
    // 3. Pending fee sums per student
    prisma.fee.groupBy({
      by: ["studentId"],
      where: {
        schoolId,
        studentId: { in: ids },
        status: { in: ["Pending", "Overdue"] as any },
      },
      _sum: { amount: true },
    }),
    // 4. Latest result per student (bounded query — max 1 per student)
    prisma.result.findMany({
      where: { schoolId, studentId: { in: ids }, isActive: true },
      orderBy: { createdAt: "desc" },
      distinct: ["studentId"],
      select: { studentId: true, marksObtained: true, totalMarks: true },
    }),
  ]);

  // Build lookup maps for O(1) access
  const totalAttMap = new Map(totalAttGroups.map((g) => [g.studentId, g._count]));
  const presentAttMap = new Map(presentAttGroups.map((g) => [g.studentId, g._count]));
  const pendingFeeMap = new Map(
    pendingFeeGroups.map((g) => [g.studentId, moneyToNumber(moneyFrom(g._sum.amount))])
  );
  const resultMap = new Map(
    latestResults.map((r) => [r.studentId, `${r.marksObtained}/${r.totalMarks}`])
  );

  return students.map((s) => {
    const totalAtt = totalAttMap.get(s.id) ?? 0;
    const presentAtt = presentAttMap.get(s.id) ?? 0;
    const attendanceRate = totalAtt > 0 ? Math.round((presentAtt / totalAtt) * 100) : null;

    return {
      studentId: s.id,
      name: `${s.firstName} ${s.lastName}`,
      class: s.classId ?? "",
      section: s.sectionId ?? "",
      rollNumber: s.rollNumber ?? "",
      photoURL: s.photoURL,
      attendanceRate,
      pendingFees: pendingFeeMap.get(s.id) ?? 0,
      lastExamScore: resultMap.get(s.id) ?? null,
    };
  });
}

export async function getStudentAttendanceForParent(
  schoolId: string,
  studentId: string,
  pagination: { limit?: number; cursor?: string }
) {
  assertSchoolScope(schoolId);

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
  assertSchoolScope(schoolId);

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
  assertSchoolScope(schoolId);

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
  assertSchoolScope(schoolId);

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
