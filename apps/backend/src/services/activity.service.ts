/**
 * Activity Service
 * Manages student/teacher activity feeds
 */

import { ActivityRepository } from "../repositories/activity.repository";
import { publishActivityCreated } from "../lib/realtime";

const activityRepository = new ActivityRepository();

export class ActivityService {
  /**
   * Create an activity record
   */
  static async createActivity(data: {
    schoolId: string;
    userId: string;
    studentId?: string;
    teacherId?: string;
    title: string;
    description?: string;
    type: string;
    actionUrl?: string;
    metadata?: Record<string, unknown>;
  }) {
    const activity = await activityRepository.create(data.schoolId, {
      userId: data.userId,
      studentId: data.studentId ?? null,
      teacherId: data.teacherId ?? null,
      title: data.title,
      description: data.description ?? null,
      type: data.type,
      actionUrl: data.actionUrl ?? null,
      metadata: (data.metadata || {}) as any,
      isDeleted: false,
    });

    publishActivityCreated({
      id: activity.id,
      schoolId: activity.schoolId,
      studentId: activity.studentId,
      teacherId: activity.teacherId,
      userId: activity.userId,
      title: activity.title,
      description: activity.description,
      type: activity.type,
      actionUrl: activity.actionUrl,
      metadata:
        activity.metadata && typeof activity.metadata === "object"
          ? (activity.metadata as Record<string, unknown>)
          : undefined,
      createdAt: activity.createdAt,
    });
    return activity;
  }

  /**
   * Get activities for a school or specific student
   */
  static async getActivities(params: {
    schoolId: string;
    studentId?: string;
    limit?: number;
    skip?: number;
  }) {
    const limit = Math.min(params.limit || 20, 100);
    const skip = params.skip || 0;

    return activityRepository.getForSchool(params.schoolId, params.studentId, {
      limit,
      skip,
    });
  }

  /**
   * Get a single activity
   */
  static async getActivity(schoolId: string, activityId: string) {
    return activityRepository.findById(schoolId, activityId);
  }

  /**
   * Delete an activity
   */
  static async deleteActivity(schoolId: string, activityId: string) {
    return activityRepository.softDelete(schoolId, activityId);
  }

  /**
   * Clean up old activities (older than 90 days)
   */
  static async cleanupOldActivities(schoolId: string) {
    return activityRepository.cleanupOld(schoolId);
  }
}
