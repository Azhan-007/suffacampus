/**
 * Student Repository
 * Centralized data access for students
 */

import type { Student, Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import {
  BaseRepository,
  type PaginationParams,
  type PaginatedResult,
  type Filter,
} from "./base.repository";

export class StudentRepository extends BaseRepository<Student> {
  constructor() {
    super("student");
  }

  async create(
    schoolId: string,
    data: Omit<Student, "id" | "schoolId" | "createdAt" | "updatedAt">
  ): Promise<Student> {
    return prisma.student.create({
      data: {
        ...data,
        schoolId,
      } as any,
    });
  }

  async update(
    schoolId: string,
    id: string,
    data: Partial<Student>
  ): Promise<Student> {
    delete (data as any).id;
    delete (data as any).schoolId;

    return prisma.student.update({
      where: { id },
      data: data as any,
    });
  }

  /**
   * Find students by class
   */
  async findByClass(
    schoolId: string,
    classId: string,
    sectionId?: string,
    pagination?: PaginationParams
  ): Promise<PaginatedResult<Student>> {
    const limit = Math.min(pagination?.limit || 20, 100);
    const skip = pagination?.skip || 0;

    const where: Prisma.StudentWhereInput = {
      schoolId,
      classId,
      isDeleted: false,
    };

    if (sectionId) {
      where.sectionId = sectionId;
    }

    const [data, total] = await Promise.all([
      prisma.student.findMany({
        where,
        take: limit,
        skip,
        orderBy: { firstName: "asc" },
      }),
      prisma.student.count({ where }),
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
   * Search students by name or email
   */
  async search(
    schoolId: string,
    query: string,
    pagination?: PaginationParams
  ): Promise<PaginatedResult<Student>> {
    const limit = Math.min(pagination?.limit || 20, 100);
    const skip = pagination?.skip || 0;

    const where: Prisma.StudentWhereInput = {
      schoolId,
      isDeleted: false,
      OR: [
        { firstName: { contains: query, mode: "insensitive" } },
        { lastName: { contains: query, mode: "insensitive" } },
        { email: { contains: query, mode: "insensitive" } },
        { studentId: { contains: query, mode: "insensitive" } },
      ],
    };

    const [data, total] = await Promise.all([
      prisma.student.findMany({
        where,
        take: limit,
        skip,
        orderBy: { firstName: "asc" },
      }),
      prisma.student.count({ where }),
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
   * Count active students in school
   */
  async countActive(schoolId: string): Promise<number> {
    return prisma.student.count({
      where: {
        schoolId,
        isDeleted: false,
        isActive: true,
      },
    });
  }

  /**
   * Soft delete student
   */
  async softDelete(schoolId: string, id: string, deletedBy: string): Promise<void> {
    await prisma.student.update({
      where: { id },
      data: {
        isDeleted: true,
        deletedAt: new Date(),
        deletedBy,
      },
    });
  }
}
