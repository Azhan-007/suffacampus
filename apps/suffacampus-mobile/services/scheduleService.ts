/**
 * scheduleService.ts
 *
 * Backend routes:
 *   GET    /timetable?teacherId=&day=  — get teacher's schedule for a day
 *   POST   /timetable                  — create a schedule entry
 *   PUT    /timetable/:id              — update a schedule entry
 *   DELETE /timetable/:id              — delete a schedule entry
 */

import { apiFetch } from "./api";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ScheduleClass {
  id: string;
  subject: string;
  class: string;
  day: string;
  startTime: string;
  endTime: string;
  room: string;
  teacherId: string;
  teacherName: string;
  status?: "upcoming" | "ongoing" | "completed";
}

export interface CreateSchedulePayload {
  subject: string;
  class: string;
  day: string;
  startTime: string;
  endTime: string;
  room: string;
  teacherId?: string;
  teacherName?: string;
}

// ─── Functions ───────────────────────────────────────────────────────────────

/** Fetch timetable/schedule entries. Uses teacher-specific endpoint when teacherId provided. */
export async function getSchedules(params: {
  teacherId?: string;
  day?: string;
  class?: string;
  classId?: string;
  sectionId?: string;
}): Promise<ScheduleClass[]> {
  try {
    const query: Record<string, string | undefined> = { day: params.day };

    let raw: any[];
    if (params.teacherId) {
      // Use dedicated teacher timetable endpoint — returns periods for this teacher
      raw = await apiFetch<any[]>(`/timetable/teacher/${params.teacherId}`, { params: query });
    } else {
      query.classId = params.classId ?? params.class;
      query.sectionId = params.sectionId;
      raw = await apiFetch<any[]>("/timetable", { params: query });
    }

    if (!Array.isArray(raw)) return [];

    // Backend returns timetable docs with periods[] array — flatten into ScheduleClass items
    const results: ScheduleClass[] = [];
    for (const entry of raw) {
      if (Array.isArray(entry.periods)) {
        for (const p of entry.periods) {
          // If teacherId filter, only include matching periods
          if (params.teacherId && p.teacherId !== params.teacherId) continue;
          results.push({
            id: entry.id || p.id || "",
            subject: p.subject || "",
            class: entry.className || entry.class || "",
            day: entry.day || params.day || "",
            startTime: p.startTime || "",
            endTime: p.endTime || "",
            room: p.roomNumber || p.room || "",
            teacherId: p.teacherId || "",
            teacherName: p.teacherName || "",
          });
        }
      } else {
        // Flat schedule entry (no nested periods)
        results.push({
          id: entry.id || "",
          subject: entry.subject || "",
          class: entry.className || entry.class || "",
          day: entry.day || params.day || "",
          startTime: entry.startTime || "",
          endTime: entry.endTime || "",
          room: entry.roomNumber || entry.room || "",
          teacherId: entry.teacherId || "",
          teacherName: entry.teacherName || "",
        });
      }
    }
    return results;
  } catch {
    return [];
  }
}

/** Create a new schedule entry. */
export async function createSchedule(
  data: CreateSchedulePayload
): Promise<ScheduleClass> {
  return apiFetch<ScheduleClass>("/timetable", {
    method: "POST",
    body: data,
  });
}

/** Update an existing schedule entry. */
export async function updateSchedule(
  id: string,
  data: Partial<CreateSchedulePayload>
): Promise<ScheduleClass> {
  return apiFetch<ScheduleClass>(`/timetable/${id}`, {
    method: "PATCH",
    body: data,
  });
}

/** Delete a schedule entry. */
export async function deleteSchedule(id: string): Promise<void> {
  await apiFetch<void>(`/timetable/${id}`, { method: "DELETE" });
}

/** Fetch all timetable entries (admin — no teacher filter). */
export async function getAllTimetableEntries(): Promise<ScheduleClass[]> {
  return apiFetch<ScheduleClass[]>("/timetable");
}
