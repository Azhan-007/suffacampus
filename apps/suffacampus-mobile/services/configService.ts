/**
 * configService.ts
 *
 * Backend routes:
 *   GET  /config/summary-card   — get summary card configuration
 *   PUT  /config/summary-card   — save summary card configuration (admin)
 */

import { apiFetch } from "./api";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface SummaryCardItemConfig {
  enabled: boolean;
  label: string;
  icon: string;
  color: string;
  route: string;
}

export interface SummaryConfig {
  enabled: boolean;
  title: string;
  items: {
    classesToday: SummaryCardItemConfig;
    classesCompleted: SummaryCardItemConfig;
    totalStudents: SummaryCardItemConfig;
  };
}

// ─── Functions ───────────────────────────────────────────────────────────────

/** Fetch the summary card configuration. Falls back to defaults if endpoint unavailable. */
export async function getSummaryConfig(): Promise<SummaryConfig> {
  try {
    return await apiFetch<SummaryConfig>("/config/summary-card");
  } catch {
    return {
      enabled: true,
      title: "Today's Summary",
      items: {
        classesToday: { enabled: true, label: "Classes", icon: "book-open-variant", color: "#4C6EF5", route: "/teacher/schedule" },
        classesCompleted: { enabled: true, label: "Completed", icon: "check-circle", color: "#10B981", route: "/teacher/schedule" },
        totalStudents: { enabled: true, label: "Students", icon: "account-group", color: "#F59E0B", route: "/teacher/attendance" },
      },
    };
  }
}

/** Save the summary card configuration (admin). */
export async function saveSummaryConfig(
  config: SummaryConfig
): Promise<SummaryConfig> {
  return apiFetch<SummaryConfig>("/config/summary-card", {
    method: "PATCH",
    body: config,
  });
}
