/**
 * Attendance Repository
 * Centralized data access for attendance records
 */

import type { Attendance, Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import {
  BaseRepository,
  type PaginationParams,
  type PaginatedResult,
} from "./base.repository";

export class AttendanceRepository extends BaseRepository<Attendance> {
  constructor() {
    super("attendance");
  }

  async create(
    schoolId: string,
    data: Omit<Attendance, "id" | "schoolId" | "createdAt" | "updatedAt">
  ): Promise<Attendance> {
    return prisma.attendance.create({
      data: {
        ...data,
        schoolId,
      } as any,
    });
  }

  async update(
    schoolId: string,
    id: string,
    data: Partial<Attendance>
  ): Promise<Attendance> {
    delete (data as any).id;
    delete (data as any).schoolId;

    return prisma.attendance.update({
      where: { id },
      data: data as any,
    });
  }

  /**
   * Get attendance for a specific student on a date
   */
  async getByStudentDate(
    schoolId: string,
    studentId: string,
    date: string
  ): Promise<Attendance | null> {
    return prisma.attendance.findFirst({
      where: {
        schoolId,
        studentId,
        date,
      },
    });
  }

  /**
   * Get attendance records for a date range
   */
  async getByDateRange(
    schoolId: string,
    startDate: string,
    endDate: string,
    classId?: string,
    sectionId?: string,
    pagination?: PaginationParams
  ): Promise<PaginatedResult<Attendance>> {
    const limit = Math.min(pagination?.limit || 100, 500);
    const skip = pagination?.skip || 0;

    const where: Prisma.AttendanceWhereInput = {
      schoolId,
      date: {
        gte: startDate,
        lte: endDate,
      },
    };

    if (classId) {
      where.classId = classId;
    }
    if (sectionId) {
      where.sectionId = sectionId;
    }

    const [data, total] = await Promise.all([
      prisma.attendance.findMany({
        where,
        take: limit,
        skip,
        orderBy: [{ date: "desc" }, { studentName: "asc" }],
      }),
      prisma.attendance.count({ where }),
    ]);

    return {
      data,
      pagination: {
        total,
        limit,
        skip,
        hasMore: skip + limit < total,
        cursor: data.length > 0 ? data[data.length - 1].id : null,
      },
    };
  }

  /**
   * Get attendance records for a specific class on a date
   */
  async getClassAttendance(
    schoolId: string,
    classId: string,
    sectionId: string,
    date: string
  ): Promise<Attendance[]> {
    return prisma.attendance.findMany({
      where: {
        schoolId,
        classId,
        sectionId,
        date,
      },
      orderBy: { studentName: "asc" },
    });
  }

  /**
   * Get attendance statistics for a student
   */
  async getStudentStats(
    schoolId: string,
    studentId: string,
    fromDate: string,
    toDate: string
  ): Promise<{
    total: number;
    present: number;
    absent: number;
    late: number;
    excused: number;
    percentage: number;
  }> {
    const records = await prisma.attendance.findMany({
      where: {
        schoolId,
        studentId,
        date: {
          gte: fromDate,
          lte: toDate,
        },
      },
    });

    const present = records.filter((r) => r.status === "Present").length;
    const absent = records.filter((r) => r.status === "Absent").length;
    const late = records.filter((r) => r.status === "Late").length;
    const excused = records.filter((r) => r.status === "Excused").length;
    const total = records.length;
    const percentage = total > 0 ? Math.round((present / total) * 100) : 0;

    return { total, present, absent, late, excused, percentage };
  }

  /**
   * Bulk create attendance records
   */
  async bulkCreate(
    schoolId: string,
    records: Array<Omit<Attendance, "id" | "schoolId" | "createdAt" | "updatedAt">>
  ): Promise<number> {
    const result = await prisma.attendance.createMany({
      data: records.map((r) => ({
        ...r,
        schoolId,
      })) as any,
      skipDuplicates: true,
    });

    return result.count;
  }

  /**
   * Bulk update attendance records
   */
  async bulkUpdate(
    schoolId: string,
    updates: Array<{ id: string; status: string; remarks?: string }>
  ): Promise<number> {
    let count = 0;

    for (const update of updates) {
      const result = await prisma.attendance.updateMany({
        where: {
          id: update.id,
          schoolId,
        },
        data: {
          status: update.status as any,
          remarks: update.remarks,
        },
      });
      count += result.count;
    }

    return count;
  }
}
