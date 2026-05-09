import { prisma } from "../lib/prisma";
import type { CreateResultInput, UpdateResultInput } from "../schemas/modules.schema";
import { writeAuditLog } from "./audit.service";
import { Errors } from "../errors";
import { assertSchoolScope } from "../lib/tenant-scope";
import { sendToUsers, PushTemplates } from "./push-notification.service";
import pino from "pino";

const log = pino({ name: "result-service" });

/** Auto-calculate grade from percentage */
function calculateGrade(percentage: number): string {
  if (percentage >= 90) return "A+";
  if (percentage >= 80) return "A";
  if (percentage >= 70) return "B+";
  if (percentage >= 60) return "B";
  if (percentage >= 50) return "C";
  if (percentage >= 40) return "D";
  return "F";
}

export async function createResult(
  schoolId: string,
  data: CreateResultInput,
  performedBy: string
) {
  assertSchoolScope(schoolId);

  const percentage = data.percentage ?? (data.marksObtained / data.totalMarks) * 100;
  const grade = data.grade ?? calculateGrade(percentage);
  const status = data.status ?? (percentage >= 33 ? "Pass" : "Fail");

  const result = await prisma.result.create({
    data: {
      schoolId,
      studentId: data.studentId,
      studentName: data.studentName,
      rollNumber: data.rollNumber,
      classId: data.classId,
      sectionId: data.sectionId,
      className: data.className,
      examType: data.examType,
      examName: data.examName,
      subject: data.subject,
      marksObtained: data.marksObtained,
      totalMarks: data.totalMarks,
      percentage: Math.round(percentage * 100) / 100,
      grade,
      status: status as any,
      rank: data.rank,
      remarks: data.remarks,
      isActive: true,
      published: false,
    },
  });

  await writeAuditLog("CREATE_RESULT", performedBy, schoolId, {
    resultId: result.id,
    studentId: result.studentId,
    examName: result.examName,
    subject: result.subject,
  });

  // Notify linked parents of new result (non-blocking)
  notifyParentsOfResult(schoolId, data.studentId, data.studentName ?? "", data.examName ?? "Exam").catch(() => {});

  return result;
}

export async function getResultsBySchool(
  schoolId: string,
  pagination: { limit?: number; cursor?: string; sortBy?: string; sortOrder?: "asc" | "desc" },
  filters: {
    studentId?: string;
    classId?: string;
    sectionId?: string;
    examType?: string;
    examName?: string;
    subject?: string;
  } = {}
) {
  assertSchoolScope(schoolId);

  const where: any = { schoolId, isActive: true };
  if (filters.studentId) where.studentId = filters.studentId;
  if (filters.classId) where.classId = filters.classId;
  if (filters.sectionId) where.sectionId = filters.sectionId;
  if (filters.examType) where.examType = filters.examType;
  if (filters.examName) where.examName = filters.examName;
  if (filters.subject) where.subject = filters.subject;

  const limit = Math.min(pagination.limit ?? 20, 100);

  const results = await prisma.result.findMany({
    where,
    orderBy: { [pagination.sortBy ?? "createdAt"]: pagination.sortOrder ?? "desc" },
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

export async function getResultById(resultId: string, schoolId: string) {
  assertSchoolScope(schoolId);

  const result = await prisma.result.findUnique({ where: { id: resultId } });
  if (!result || result.schoolId !== schoolId || !result.isActive) return null;
  return result;
}

export async function getResultsByStudent(
  studentId: string,
  schoolId: string,
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

export async function updateResult(
  resultId: string,
  schoolId: string,
  data: UpdateResultInput,
  performedBy: string
) {
  assertSchoolScope(schoolId);

  const existing = await prisma.result.findUnique({ where: { id: resultId } });
  if (!existing) throw Errors.notFound("Result", resultId);
  if (existing.schoolId !== schoolId) throw Errors.tenantMismatch();
  if (!existing.isActive) throw Errors.notFound("Result", resultId);

  // Explicit field mapping — never spread raw input into Prisma
  const updateData: Record<string, unknown> = {};
  if (data.studentId !== undefined) updateData.studentId = data.studentId;
  if (data.studentName !== undefined) updateData.studentName = data.studentName;
  if (data.rollNumber !== undefined) updateData.rollNumber = data.rollNumber;
  if (data.classId !== undefined) updateData.classId = data.classId;
  if (data.sectionId !== undefined) updateData.sectionId = data.sectionId;
  if (data.className !== undefined) updateData.className = data.className;
  if (data.examType !== undefined) updateData.examType = data.examType;
  if (data.examName !== undefined) updateData.examName = data.examName;
  if (data.subject !== undefined) updateData.subject = data.subject;
  if (data.marksObtained !== undefined) updateData.marksObtained = data.marksObtained;
  if (data.totalMarks !== undefined) updateData.totalMarks = data.totalMarks;
  if (data.grade !== undefined) updateData.grade = data.grade;
  if (data.status !== undefined) updateData.status = data.status;
  if (data.rank !== undefined) updateData.rank = data.rank;
  if (data.remarks !== undefined) updateData.remarks = data.remarks;
  if (data.published !== undefined) updateData.published = data.published;
  if (data.marksObtained !== undefined || data.totalMarks !== undefined) {
    const marks = data.marksObtained ?? existing.marksObtained;
    const total = data.totalMarks ?? existing.totalMarks;
    const pct = (marks / total) * 100;
    updateData.percentage = Math.round(pct * 100) / 100;
    updateData.grade = data.grade ?? calculateGrade(pct);
    updateData.status = data.status ?? (pct >= 33 ? "Pass" : "Fail");
  }

  const updated = await prisma.result.update({
    where: { id: resultId },
    data: updateData as any,
  });

  await writeAuditLog("UPDATE_RESULT", performedBy, schoolId, {
    resultId,
    updatedFields: Object.keys(data),
  });

  return updated;
}

export async function softDeleteResult(
  resultId: string,
  schoolId: string,
  performedBy: string
): Promise<boolean> {
  assertSchoolScope(schoolId);

  const existing = await prisma.result.findUnique({ where: { id: resultId } });
  if (!existing || existing.schoolId !== schoolId || !existing.isActive) return false;

  await prisma.result.update({
    where: { id: resultId },
    data: { isActive: false },
  });

  await writeAuditLog("DELETE_RESULT", performedBy, schoolId, {
    resultId,
    studentId: existing.studentId,
  });

  return true;
}

// ---------------------------------------------------------------------------
// Push notification helper (fire-and-forget)
// ---------------------------------------------------------------------------

async function notifyParentsOfResult(
  schoolId: string,
  studentId: string,
  studentName: string,
  examName: string
): Promise<void> {
  try {
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
    const payload = PushTemplates.examResult(studentName || "Your child", examName);
    await sendToUsers(parentUids, payload);
  } catch (err) {
    log.warn({ err, studentId, schoolId }, "Failed to send result push notification");
  }
}
