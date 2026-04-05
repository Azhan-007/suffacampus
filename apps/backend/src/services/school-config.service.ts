/**
 * School Config Service
 * Manages school-level configurations (UI preferences, etc.)
 */

import { prisma } from "../lib/prisma";

export class SchoolConfigService {
  /**
   * Get or create school config
   */
  static async getConfig(schoolId: string) {
    let config = await prisma.schoolConfig.findUnique({
      where: { schoolId },
    });

    if (!config) {
      config = await prisma.schoolConfig.create({
        data: {
          schoolId,
          summaryCard: {
            enabled: true,
            title: "Today's Summary",
            items: {
              classesToday: { enabled: true, label: "Classes", icon: "book-open-variant", color: "#4C6EF5", route: "/teacher/schedule" },
              classesCompleted: { enabled: true, label: "Completed", icon: "check-circle", color: "#10B981", route: "/teacher/schedule" },
              totalStudents: { enabled: true, label: "Students", icon: "account-group", color: "#F59E0B", route: "/teacher/attendance" },
            },
          },
        },
      });
    }

    return config;
  }

  /**
   * Update summary card config
   */
  static async updateSummaryCard(
    schoolId: string,
    data: Record<string, unknown>
  ) {
    const config = await this.getConfig(schoolId);

    return prisma.schoolConfig.update({
      where: { schoolId },
      data: {
        summaryCard: data as any,
      },
    });
  }

  /**
   * Get summary card config
   */
  static async getSummaryCard(schoolId: string) {
    const config = await this.getConfig(schoolId);
    return config.summaryCard || {
      enabled: true,
      title: "Today's Summary",
      items: {
        classesToday: { enabled: true, label: "Classes", icon: "book-open-variant", color: "#4C6EF5", route: "/teacher/schedule" },
        classesCompleted: { enabled: true, label: "Completed", icon: "check-circle", color: "#10B981", route: "/teacher/schedule" },
        totalStudents: { enabled: true, label: "Students", icon: "account-group", color: "#F59E0B", route: "/teacher/attendance" },
      },
    };
  }

  /**
   * Update metadata
   */
  static async updateMetadata(schoolId: string, metadata: Record<string, unknown>) {
    const config = await this.getConfig(schoolId);

    return prisma.schoolConfig.update({
      where: { schoolId },
      data: {
        metadata: {
          ...((config.metadata as Record<string, unknown>) || {}),
          ...metadata,
        } as any,
      },
    });
  }
}
