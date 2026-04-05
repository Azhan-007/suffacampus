/**
 * timetableService.ts
 *
 * Backend routes:
 *   GET /timetable?classId=&day=
 */

import { apiFetch } from "./api";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface TimetableEntry {
  id: string;
  subject: string;
  teacher: string;
  startTime: string;
  endTime: string;
  room: string;
  day?: string;
  periodNumber?: number;
  color?: string;
  classId?: string;
}

// ─── Functions ────────────────────────────────────────────────────────────────

/**
 * Fetch timetable entries for a class and day.
 * Replaces: getDocs(query(collection(db, "timetables"), where("classId", ...), where("day", ...)))
 */
export async function getTimetable(params: {
  classId: string;
  day: string;
}): Promise<TimetableEntry[]> {
  return apiFetch<TimetableEntry[]>("/timetable", { params });
}
