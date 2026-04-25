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
import { enqueueOfflineMutation, flushOfflineQueue } from "./offlineSyncQueue";

export interface AttendanceRecord {
  id?: string;
  studentId: string;
  classId: string;
  sectionId: string;
  date: string;
  session?: "FN" | "AN";
  status: "Present" | "Absent";
  markedBy?: string;
  createdAt?: string;
}

/**
 * Mark attendance for a student on a given date.
 * Maps to: POST /attendance
 */
export async function markAttendance(
  studentId: string,
  date: string,
  status: "Present" | "Absent",
  classId: string,
  sectionId: string
): Promise<void> {
  const payload = { studentId, date, status, classId, sectionId };

  try {
    await apiFetch<void>("/attendance", {
      method: "POST",
      body: payload,
    });
  } catch {
    await enqueueOfflineMutation({
      path: "/attendance",
      method: "POST",
      body: payload,
    });
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
 */
export async function getAttendanceByStudent(studentId: string): Promise<AttendanceRecord[]> {
  try {
    const today = new Date().toISOString().split("T")[0];
    const records = await apiFetch<AttendanceRecord[]>("/attendance", {
      params: { date: today },
    });
    return (Array.isArray(records) ? records : []).filter((r) => r.studentId === studentId);
  } catch {
    return [];
  }
}

// ─── Session-shaped type (used by student/attendance.tsx screen) ─────────────

export interface AttendanceSessionRecord {
  id?: string;
  date: string;
  status: "Present" | "Absent" | "Leave";
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
  status: "Present" | "Absent";
  markedBy?: string;
}

export interface BulkAttendancePayload {
  classId: string;
  sectionId: string;
  date: string;
  session?: "FN" | "AN";
  entries: Array<{
    studentId: string;
    status: "Present" | "Absent";
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
  console.log(`[DEBUG] getStudentsByClass called: classId=${classId}, sectionId=${sectionId}`);
  const data = await apiFetch<any>("/students", {
    params: { classId, sectionId, limit: "200" },
  });
  console.log(`[DEBUG] getStudentsByClass raw response:`, JSON.stringify(data)?.substring(0, 500));
  console.log(`[DEBUG] getStudentsByClass isArray:`, Array.isArray(data), `type:`, typeof data);
  
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
  const params: Record<string, string> = { date, classId, sectionId };
  if (session) params.session = session;
  return apiFetch<ClassAttendanceRecord[]>("/attendance", { params });
}

/** Upsert a single attendance record (create or update). */
export async function upsertAttendance(
  record: { studentId: string; classId: string; sectionId: string; date: string; session?: "FN" | "AN"; status: "Present" | "Absent"; id?: string }
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
  } catch (err: any) {
    console.error(`[DEBUG] upsertAttendance ERROR:`, err?.message, err);
    throw err;
  }
}

/** Submit attendance for all students in a class at once. */
export async function bulkMarkAttendance(
  payload: BulkAttendancePayload
): Promise<void> {
  try {
    await apiFetch<void>("/attendance/bulk", {
      method: "POST",
      body: payload,
    });
  } catch {
    await enqueueOfflineMutation({
      path: "/attendance/bulk",
      method: "POST",
      body: payload,
    });
  }
}

/**
 * Try flushing any queued attendance mutations.
 * Call this after reconnect/login/app foreground to reduce stale queued writes.
 */
export async function flushQueuedAttendanceMutations(): Promise<{
  flushed: number;
  remaining: number;
}> {
  return flushOfflineQueue({
    paths: [
      // Attendance endpoints
      "/attendance",
      "/attendance/bulk",
      // Assignment submission endpoints
      "/submissions",
      // Student fee/payment endpoints
      "/payments",
      "/payments/create-order",
      // Admin fee management endpoints
      "/fees",
    ],
    maxItems: 50, // Increased from 25 to handle more diverse mutation types
  });
}
