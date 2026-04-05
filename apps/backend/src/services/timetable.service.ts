import { prisma } from "../lib/prisma";
import type { CreateTimetableInput, UpdateTimetableInput } from "../schemas/modules.schema";
import { writeAuditLog } from "./audit.service";
import { Errors } from "../errors";

export async function createTimetable(
  schoolId: string,
  data: CreateTimetableInput,
  performedBy: string
) {
  const timetable = await prisma.timetable.create({
    data: {
      schoolId,
      classId: data.classId,
      sectionId: data.sectionId,
      className: data.className,
      day: data.day,
      isActive: true,
      periods: {
        create: (data.periods ?? []).map((p) => ({
          periodNumber: p.periodNumber,
          subject: p.subject,
          teacherId: p.teacherId,
          teacherName: p.teacherName,
          startTime: p.startTime,
          endTime: p.endTime,
          roomNumber: p.roomNumber,
        })),
      },
    },
    include: { periods: true },
  });

  await writeAuditLog("CREATE_TIMETABLE", performedBy, schoolId, {
    timetableId: timetable.id,
    classId: timetable.classId,
    sectionId: timetable.sectionId,
    day: timetable.day,
    periodsCount: timetable.periods.length,
  });

  return timetable;
}

export async function getTimetablesBySchool(
  schoolId: string,
  pagination: { limit?: number; cursor?: string; sortBy?: string; sortOrder?: "asc" | "desc" },
  filters: { classId?: string; sectionId?: string; day?: string } = {}
) {
  const where: any = { schoolId, isActive: true };
  if (filters.classId) where.classId = filters.classId;
  if (filters.sectionId) where.sectionId = filters.sectionId;
  if (filters.day) where.day = filters.day;

  const limit = Math.min(pagination.limit ?? 20, 100);

  const timetables = await prisma.timetable.findMany({
    where,
    include: { periods: { orderBy: { periodNumber: "asc" } } },
    orderBy: { day: pagination.sortOrder ?? "asc" },
    take: limit + 1,
    ...(pagination.cursor ? { cursor: { id: pagination.cursor }, skip: 1 } : {}),
  });

  const hasMore = timetables.length > limit;
  const data = hasMore ? timetables.slice(0, limit) : timetables;

  return {
    data,
    pagination: { cursor: data.length > 0 ? data[data.length - 1].id : null, hasMore, limit },
  };
}

export async function getTimetableById(timetableId: string, schoolId: string) {
  const tt = await prisma.timetable.findUnique({
    where: { id: timetableId },
    include: { periods: { orderBy: { periodNumber: "asc" } } },
  });
  if (!tt || tt.schoolId !== schoolId || !tt.isActive) return null;
  return tt;
}

export async function getTimetableByClassDay(
  schoolId: string,
  classId: string,
  sectionId: string,
  day: string
) {
  return prisma.timetable.findUnique({
    where: { schoolId_classId_sectionId_day: { schoolId, classId, sectionId, day } },
    include: { periods: { orderBy: { periodNumber: "asc" } } },
  });
}

export async function updateTimetable(
  timetableId: string,
  schoolId: string,
  data: UpdateTimetableInput,
  performedBy: string
) {
  const existing = await prisma.timetable.findUnique({ where: { id: timetableId } });
  if (!existing) throw Errors.notFound("Timetable", timetableId);
  if (existing.schoolId !== schoolId) throw Errors.tenantMismatch();
  if (!existing.isActive) throw Errors.notFound("Timetable", timetableId);

  const { periods, ...rest } = data;

  // Replace periods if provided
  if (periods) {
    await prisma.period.deleteMany({ where: { timetableId } });
    await prisma.period.createMany({
      data: periods.map((p) => ({
        timetableId,
        periodNumber: p.periodNumber,
        subject: p.subject,
        teacherId: p.teacherId,
        teacherName: p.teacherName,
        startTime: p.startTime,
        endTime: p.endTime,
        roomNumber: p.roomNumber,
      })),
    });
  }

  const updated = await prisma.timetable.update({
    where: { id: timetableId },
    data: rest,
    include: { periods: { orderBy: { periodNumber: "asc" } } },
  });

  await writeAuditLog("UPDATE_TIMETABLE", performedBy, schoolId, {
    timetableId,
    updatedFields: Object.keys(data),
  });

  return updated;
}

export async function softDeleteTimetable(
  timetableId: string,
  schoolId: string,
  performedBy: string
): Promise<boolean> {
  const existing = await prisma.timetable.findUnique({ where: { id: timetableId } });
  if (!existing || existing.schoolId !== schoolId || !existing.isActive) return false;

  await prisma.timetable.update({
    where: { id: timetableId },
    data: { isActive: false },
  });

  await writeAuditLog("DELETE_TIMETABLE", performedBy, schoolId, {
    timetableId,
    classId: existing.classId,
    day: existing.day,
  });

  return true;
}
