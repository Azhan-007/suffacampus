/**
 * attendanceService.ts
 *
 * All Firestore client usage has been removed.
 * Data access goes through the Fastify backend via apiFetch.
 *
 * Backend routes:
 *   GET  /attendance?date=YYYY-MM-DD&classId=xxx&sectionId=yyy
 *   POST /attendance
 *   PUT  /attendance/:id
 *   POST /attendance/bulk
 *   GET  /students?classId=xxx&sectionId=yyy
 */

import { apiFetch } from "./api";
import { enqueueOfflineMutation } from "./offlineSyncQueue";

export interface AttendanceRecord {
  id?: string;
  studentId: string;
  classId: string;
  sectionId: string;
  date: string;
  session?: "FN" | "AN";
  status: "Present" | "Absent" | "Late" | "Excused";
  markedBy?: string;
  createdAt?: string;
}

/**
 * Mark attendance for a student on a given date.
 * Maps to: POST /attendance
 * Returns { synced: true } on immediate success or { synced: false, queued: true }
 * if the request failed and was queued for offline retry.
 */
export async function markAttendance(
  studentId: string,
  date: string,
  status: "Present" | "Absent" | "Late" | "Excused",
  classId: string,
  sectionId: string
): Promise<{ synced: boolean; queued: boolean; queueId?: string }> {
  const payload = { studentId, date, status, classId, sectionId };

  try {
    await apiFetch<void>("/attendance", {
      method: "POST",
      body: payload,
    });
    return { synced: true, queued: false };
  } catch {
    const queueId = await enqueueOfflineMutation({
      path: "/attendance",
      method: "POST",
      body: payload,
      dedupKey: `att:${studentId}:${date}`,
    });
    return { synced: false, queued: true, queueId };
  }
}

/**
 * Fetch all attendance records for a specific date.
 * Maps to: GET /attendance?date=YYYY-MM-DD
 */
export async function getAttendanceByDate(date: string): Promise<AttendanceRecord[]> {
  return apiFetch<AttendanceRecord[]>("/attendance", {
    params: { date },
  });
}

/**
 * Fetch attendance records filtered by student.
 * Uses the dedicated /attendance/student/:studentId endpoint for efficiency and security.
 */
export async function getAttendanceByStudent(studentId: string): Promise<AttendanceRecord[]> {
  try {
    const result = await apiFetch<{ records: AttendanceRecord[]; stats?: unknown }>(
      `/attendance/student/${encodeURIComponent(studentId)}`
    );
    // Backend returns { records: [...], stats: {...} } — we only need records
    return Array.isArray(result.records) ? result.records : (Array.isArray(result) ? result : []);
  } catch {
    return [];
  }
}

// ─── Session-shaped type (used by student/attendance.tsx screen) ─────────────

export interface AttendanceSessionRecord {
  id?: string;
  date: string;
  status: "Present" | "Absent" | "Late" | "Excused";
  session?: "FN" | "AN";
  studentId?: string;
  classId?: string;
  sectionId?: string;
}

export interface StudentAttendanceStats {
  total: number;
  present: number;
  absent: number;
  percentage: number;
}

export interface StudentAttendanceResponse {
  records: AttendanceSessionRecord[];
  stats: StudentAttendanceStats;
}

/**
 * Fetch full attendance history for a student with computed stats.
 * Uses dedicated student attendance endpoint.
 */
export async function getStudentAttendanceHistory(
  studentId: string,
  params?: { fromDate?: string; toDate?: string }
): Promise<StudentAttendanceResponse> {
  try {
    return await apiFetch<StudentAttendanceResponse>(
      `/attendance/student/${studentId}`,
      { params }
    );
  } catch {
    return { records: [], stats: { total: 0, present: 0, absent: 0, percentage: 0 } };
  }
}

/**
 * Fetch all attendance sessions for a student, shaped for the Attendance screen.
 * @deprecated Use getStudentAttendanceHistory() instead for full history + stats.
 */
export async function getStudentAttendanceSessions(
  studentId: string
): Promise<AttendanceSessionRecord[]> {
  try {
    const { records } = await getStudentAttendanceHistory(studentId);
    return records;
  } catch {
    return [];
  }
}

// ─── Teacher attendance functions ─────────────────────────────────────────────

export interface StudentRecord {
  id: string;
  name: string;
  rollNo: string;
  classId: string;
  sectionId: string;
  admissionNumber?: string;
}

export interface ClassAttendanceRecord {
  id?: string;
  studentId: string;
  studentName?: string;
  classId: string;
  sectionId: string;
  date: string;
  session?: "FN" | "AN";
  status: "Present" | "Absent" | "Late" | "Excused";
  markedBy?: string;
}

export interface BulkAttendancePayload {
  classId: string;
  sectionId: string;
  date: string;
  session?: "FN" | "AN";
  entries: Array<{
    studentId: string;
    status: "Present" | "Absent" | "Late" | "Excused";
  }>;
}

/**
 * Fetch students belonging to a class+section.
 * Backend uses classId + sectionId params on /students.
 */
export async function getStudentsByClass(
  classId: string,
  sectionId: string
): Promise<StudentRecord[]> {
  const params: Record<string, string> = { classId, limit: "200" };
  if (sectionId) params.sectionId = sectionId;
  const data = await apiFetch<any>("/students", { params });

  // Handle both array and paginated envelope responses
  const records = Array.isArray(data) ? data : (data?.data ?? []);

  return records.map((s: any) => ({
    id: s.id,
    name: `${s.firstName || ""} ${s.lastName || ""}`.trim(),
    rollNo: s.rollNumber || "",
    classId: s.classId,
    sectionId: s.sectionId,
  }));
}

/**
 * Fetch attendance records for a class on a specific date.
 * Now uses server-side classId/sectionId filtering.
 */
export async function getAttendanceByClassDate(
  classId: string,
  sectionId: string,
  date: string,
  session?: "FN" | "AN"
): Promise<ClassAttendanceRecord[]> {
  const params: Record<string, string> = { date, classId };
  if (sectionId) params.sectionId = sectionId;
  if (session) params.session = session;
  return apiFetch<ClassAttendanceRecord[]>("/attendance", { params });
}

/** Upsert a single attendance record (create or update). */
export async function upsertAttendance(
  record: { studentId: string; classId: string; sectionId: string; date: string; session?: "FN" | "AN"; status: "Present" | "Absent" | "Late" | "Excused"; id?: string }
): Promise<ClassAttendanceRecord> {
  const { id, ...payload } = record;
  // Ensure session defaults to FN
  if (!payload.session) payload.session = "FN";
  
  try {
    if (id) {
      return await apiFetch<ClassAttendanceRecord>(`/attendance/${id}`, {
        method: "PATCH",
        body: { status: payload.status },
      });
    }
    return await apiFetch<ClassAttendanceRecord>("/attendance", {
      method: "POST",
      body: payload,
    });
  } catch (err) {
    throw err;
  }
}

/**
 * Submit attendance for all students in a class at once.
 * Returns { synced: true } on immediate success or { synced: false, queued: true }
 * if the request failed and was queued for offline retry.
 */
export async function bulkMarkAttendance(
  payload: BulkAttendancePayload
): Promise<{ synced: boolean; queued: boolean; queueId?: string }> {
  try {
    await apiFetch<void>("/attendance/bulk", {
      method: "POST",
      body: payload,
    });
    return { synced: true, queued: false };
  } catch {
    const queueId = await enqueueOfflineMutation({
      path: "/attendance/bulk",
      method: "POST",
      body: payload,
      dedupKey: `att-bulk:${payload.classId}:${payload.sectionId}:${payload.date}`,
    });
    return { synced: false, queued: true, queueId };
  }
}
