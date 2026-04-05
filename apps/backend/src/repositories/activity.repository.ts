/**
 * Activity Repository
 * Centralized data access for activity records
 */

import type { Activity, Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import {
  BaseRepository,
  type PaginationParams,
  type PaginatedResult,
} from "./base.repository";

export class ActivityRepository extends BaseRepository<Activity> {
  constructor() {
    super("activity");
  }

  async create(
    schoolId: string,
    data: Omit<Activity, "id" | "schoolId" | "createdAt">
  ): Promise<Activity> {
    return prisma.activity.create({
      data: {
        ...data,
        schoolId,
      } as any,
    });
  }

  async update(
    schoolId: string,
    id: string,
    data: Partial<Activity>
  ): Promise<Activity> {
    delete (data as any).id;
    delete (data as any).schoolId;

    return prisma.activity.update({
      where: { id },
      data: data as any,
    });
  }

  /**
   * Get activities for a school (optionally filtered by student)
   */
  async getForSchool(
    schoolId: string,
    studentId?: string,
    pagination?: PaginationParams
  ): Promise<PaginatedResult<Activity>> {
    const limit = Math.min(pagination?.limit || 20, 100);
    const skip = pagination?.skip || 0;

    const where: Prisma.ActivityWhereInput = {
      schoolId,
      isDeleted: false,
    };

    if (studentId) {
      where.studentId = studentId;
    }

    const [data, total] = await Promise.all([
      prisma.activity.findMany({
        where,
        take: limit,
        skip,
        orderBy: { createdAt: "desc" },
      }),
      prisma.activity.count({ where }),
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
   * Get activities for a specific user
   */
  async getForUser(
    schoolId: string,
    userId: string,
    pagination?: PaginationParams
  ): Promise<PaginatedResult<Activity>> {
    const limit = Math.min(pagination?.limit || 20, 100);
    const skip = pagination?.skip || 0;

    const where: Prisma.ActivityWhereInput = {
      schoolId,
      userId,
      isDeleted: false,
    };

    const [data, total] = await Promise.all([
      prisma.activity.findMany({
        where,
        take: limit,
        skip,
        orderBy: { createdAt: "desc" },
      }),
      prisma.activity.count({ where }),
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
   * Soft delete activity
   */
  async softDelete(schoolId: string, id: string): Promise<void> {
    await prisma.activity.update({
      where: { id },
      data: { isDeleted: true },
    });
  }

  /**
   * Clean up old activities (older than 90 days)
   */
  async cleanupOld(schoolId: string): Promise<number> {
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    const result = await prisma.activity.updateMany({
      where: {
        schoolId,
        createdAt: { lt: ninetyDaysAgo },
      },
      data: { isDeleted: true },
    });

    return result.count;
  }
}
