/**
 * Base Repository Class
 * Abstract data access layer supporting pagination, filtering, sorting
 */

import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";

export interface PaginationParams {
  limit?: number;
  skip?: number;
  cursor?: string;
}

export interface PaginatedResult<T> {
  data: T[];
  pagination: {
    total: number;
    limit: number;
    skip: number;
    hasMore: boolean;
    cursor: string | null;
  };
}

export interface Filter {
  field: string;
  operator: "eq" | "ne" | "gt" | "gte" | "lt" | "lte" | "in" | "contains";
  value: unknown;
}

/**
 * Base repository class with common operations
 * Subclass for each entity and override findMany, create, etc.
 */
export abstract class BaseRepository<T extends { id: string; schoolId: string }> {
  protected modelName: keyof typeof prisma;

  constructor(modelName: keyof typeof prisma) {
    this.modelName = modelName;
  }

  /**
   * Find a single record by ID
   */
  async findById(schoolId: string, id: string): Promise<T | null> {
    const model = prisma[this.modelName] as any;
    return model.findFirst({
      where: { id, schoolId },
    });
  }

  /**
   * Find all records matching filters with pagination
   */
  async findMany(
    schoolId: string,
    filters?: Filter[],
    pagination?: PaginationParams
  ): Promise<PaginatedResult<T>> {
    const model = prisma[this.modelName] as any;
    const limit = Math.min(pagination?.limit || 20, 100);
    const skip = pagination?.skip || 0;

    // Build where clause
    const where: any = { schoolId };
    if (filters) {
      for (const f of filters) {
        switch (f.operator) {
          case "eq":
            where[f.field] = f.value;
            break;
          case "ne":
            where[f.field] = { not: f.value };
            break;
          case "gt":
            where[f.field] = { gt: f.value };
            break;
          case "gte":
            where[f.field] = { gte: f.value };
            break;
          case "lt":
            where[f.field] = { lt: f.value };
            break;
          case "lte":
            where[f.field] = { lte: f.value };
            break;
          case "in":
            where[f.field] = { in: f.value };
            break;
          case "contains":
            where[f.field] = { contains: f.value, mode: "insensitive" };
            break;
        }
      }
    }

    const [data, total] = await Promise.all([
      model.findMany({
        where,
        take: limit,
        skip,
        orderBy: { createdAt: "desc" },
      }),
      model.count({ where }),
    ]);

    return {
      data: data as T[],
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
   * Count records matching filters
   */
  async count(schoolId: string, filters?: Filter[]): Promise<number> {
    const model = prisma[this.modelName] as any;

    const where: any = { schoolId };
    if (filters) {
      for (const f of filters) {
        switch (f.operator) {
          case "eq":
            where[f.field] = f.value;
            break;
          case "ne":
            where[f.field] = { not: f.value };
            break;
          case "in":
            where[f.field] = { in: f.value };
            break;
        }
      }
    }

    return model.count({ where });
  }

  /**
   * Check if a record exists
   */
  async exists(schoolId: string, id: string): Promise<boolean> {
    const record = await this.findById(schoolId, id);
    return record !== null;
  }

  /**
   * Delete a record (soft or hard)
   */
  async delete(schoolId: string, id: string, soft = true): Promise<void> {
    const model = prisma[this.modelName] as any;

    if (soft && "isDeleted" in (await this.findById(schoolId, id))!) {
      await model.update({
        where: { id },
        data: { isDeleted: true, deletedAt: new Date() },
      });
    } else {
      await model.delete({
        where: { id },
      });
    }
  }

  /**
   * Override in subclass for specific create logic
   */
  abstract create(schoolId: string, data: Omit<T, "id" | "schoolId">): Promise<T>;

  /**
   * Override in subclass for specific update logic
   */
  abstract update(
    schoolId: string,
    id: string,
    data: Partial<T>
  ): Promise<T>;
}
