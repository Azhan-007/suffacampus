/**
 * data/attendance-api.ts
 *
 * Attendance data-access helpers for UI screens.
 * All Firestore client usage removed — data comes from the backend via apiFetch.
 *
 * Backend routes used:
 *   GET  /attendance?date=YYYY-MM-DD
 *   POST /attendance
 */

import { apiFetch } from "../services/api";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface AttendanceRecord {
  id?: string;
  studentId: string;
  studentName?: string;
  date: string;
  status: "present" | "absent" | "late";
  teacherId?: string;
}

export interface StudentAttendanceSummary {
  monthlyPercentage: number;
  presentDays: number;
  totalDays: number;
}

export interface TeacherAttendanceListItem {
  id: string;
  name: string;
  present: boolean;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function todayString(): string {
  return new Date().toISOString().split("T")[0];
}

// ─── Exported functions (same names preserved) ───────────────────────────────

/**
 * Returns a summary of the current student's attendance for the current month.
 * Maps to: GET /attendance?date=<today>  (full month aggregation done server-side).
 *
 * Note: The backend response is expected to already include the summary object.
 * If the endpoint returns a flat list instead, adjust the mapping below.
 */
export const getStudentAttendance = async (): Promise<StudentAttendanceSummary> => {
  const records = await apiFetch<AttendanceRecord[]>("/attendance", {
    params: { date: todayString() },
  });

  // Derive summary client-side from the record list as a fallback.
  const totalDays = records.length;
  const presentDays = records.filter(
    (r) => r.status === "present" || r.status === "late"
  ).length;
  const monthlyPercentage =
    totalDays > 0 ? Math.round((presentDays / totalDays) * 100) : 0;

  return { monthlyPercentage, presentDays, totalDays };
};

/**
 * Returns today's attendance list for the teacher's class.
 * Maps to: GET /attendance?date=<today>
 */
export const getTeacherAttendanceList = async (): Promise<TeacherAttendanceListItem[]> => {
  const records = await apiFetch<AttendanceRecord[]>("/attendance", {
    params: { date: todayString() },
  });

  return records.map((r) => ({
    id: r.studentId,
    name: r.studentName ?? r.studentId,
    present: r.status === "present",
  }));
};

/**
 * Mark a single student's attendance.
 * Maps to: POST /attendance
 */
export const markAttendance = async (
  studentId: string,
  present: boolean
): Promise<void> => {
  await apiFetch<void>("/attendance", {
    method: "POST",
    body: {
      studentId,
      date: todayString(),
      status: present ? "present" : "absent",
    },
  });
};
