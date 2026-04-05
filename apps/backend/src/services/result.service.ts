import { prisma } from "../lib/prisma";
import type { CreateResultInput, UpdateResultInput } from "../schemas/modules.schema";
import { writeAuditLog } from "./audit.service";
import { Errors } from "../errors";

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
  const result = await prisma.result.findUnique({ where: { id: resultId } });
  if (!result || result.schoolId !== schoolId || !result.isActive) return null;
  return result;
}

export async function getResultsByStudent(
  studentId: string,
  schoolId: string,
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

export async function updateResult(
  resultId: string,
  schoolId: string,
  data: UpdateResultInput,
  performedBy: string
) {
  const existing = await prisma.result.findUnique({ where: { id: resultId } });
  if (!existing) throw Errors.notFound("Result", resultId);
  if (existing.schoolId !== schoolId) throw Errors.tenantMismatch();
  if (!existing.isActive) throw Errors.notFound("Result", resultId);

  // Recalculate derived fields if marks changed
  const updateData: Record<string, unknown> = { ...data };
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
