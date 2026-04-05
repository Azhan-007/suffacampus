import { apiFetch, ApiError } from '@/lib/api';
import { Attendance } from '@/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toDate(value: unknown): Date {
  if (!value) return new Date(0);
  if (value instanceof Date) return value;
  if (typeof value === 'string' || typeof value === 'number') return new Date(value);
  if (typeof value === 'object') {
    const v = value as Record<string, number>;
    if ('seconds' in v) return new Date(v.seconds * 1000);
    if ('_seconds' in v) return new Date(v._seconds * 1000);
  }
  return new Date(0);
}

function toDateString(date: Date): string {
  return date.toISOString().split('T')[0]; // YYYY-MM-DD
}

function deserializeAttendance(raw: Record<string, unknown>): Attendance {
  return {
    ...(raw as unknown as Attendance),
    date: toDate(raw.date),
    createdAt: toDate(raw.createdAt),
    updatedAt: toDate(raw.updatedAt),
  };
}

// ---------------------------------------------------------------------------

export class AttendanceService {
  /**
   * Get attendance records for a school on a specific date — backend: GET /attendance?date=YYYY-MM-DD
   * Client-side filtering applied for classId / sectionId / status.
   */
  static async getAttendance(
    schoolId: string,
    filters?: {
      date?: Date;
      classId?: string;
      sectionId?: string;
      status?: string;
    }
  ): Promise<Attendance[]> {
    const dateStr = filters?.date ? toDateString(filters.date) : toDateString(new Date());
    const raw = await apiFetch<Record<string, unknown>[]>(`/attendance?date=${dateStr}`);
    let records = raw.map(deserializeAttendance);
    if (filters?.classId) records = records.filter((a) => a.classId === filters.classId);
    if (filters?.sectionId) records = records.filter((a) => a.sectionId === filters.sectionId);
    if (filters?.status) records = records.filter((a) => a.status === filters.status);
    return records;
  }

  /**
   * Get a single attendance record by ID.
   * No dedicated backend route — fetches by date and finds by id client-side.
   */
  static async getAttendanceById(schoolId: string, id: string): Promise<Attendance | null> {
    const records = await AttendanceService.getAttendance(schoolId);
    return records.find((a) => a.id === id) ?? null;
  }

  /**
   * Mark attendance for a student — backend: POST /attendance
   * Returns the new record's id.
   */
  static async createAttendance(
    schoolId: string,
    attendanceData: Omit<Attendance, 'id' | 'schoolId' | 'createdAt' | 'updatedAt'>
  ): Promise<string> {
    const payload = {
      studentId: attendanceData.studentId,
      date: toDateString(new Date(attendanceData.date)),
      status: attendanceData.status,
      classId: attendanceData.classId,
      sectionId: attendanceData.sectionId,
    };
    const raw = await apiFetch<Record<string, unknown>>('/attendance', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return raw.id as string;
  }

  /**
   * Update attendance record — backend: PATCH /attendance/:id
   */
  static async updateAttendance(
    schoolId: string,
    id: string,
    attendanceData: Partial<Omit<Attendance, 'schoolId'>>
  ): Promise<void> {
    await apiFetch(`/attendance/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(attendanceData),
    });
  }

  /**
   * Delete attendance record — backend: DELETE /attendance/:id
   */
  static async deleteAttendance(schoolId: string, id: string): Promise<void> {
    await apiFetch(`/attendance/${id}`, { method: 'DELETE' });
  }

  /**
   * Get attendance statistics for a school on a specific date.
   * Fetches records from the backend and computes stats client-side.
   */
  static async getAttendanceStats(
    schoolId: string,
    date: Date
  ): Promise<{
    total: number;
    present: number;
    absent: number;
    late: number;
    excused: number;
    percentage: number;
  }> {
    try {
      const records = await AttendanceService.getAttendance(schoolId, { date });
      const total = records.length;
      const present = records.filter((a) => a.status === 'Present').length;
      const absent = records.filter((a) => a.status === 'Absent').length;
      const late = records.filter((a) => a.status === 'Late').length;
      const excused = records.filter((a) => a.status === 'Excused').length;
      const percentage = total > 0 ? Math.round((present / total) * 100) : 0;
      return { total, present, absent, late, excused, percentage };
    } catch {
      return { total: 0, present: 0, absent: 0, late: 0, excused: 0, percentage: 0 };
    }
  }

  /**
   * Get weekly attendance data for dashboard charts.
   * Makes one backend request per day (Mon–Sun relative to today).
   */
  static async getWeeklyAttendance(schoolId: string): Promise<Array<{
    day: string;
    present: number;
    total: number;
    percentage: number;
  }>> {
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const today = new Date();
    try {
      return await Promise.all(
        days.map(async (day, index) => {
          const date = new Date(today);
          date.setDate(today.getDate() - (6 - index));
          const stats = await AttendanceService.getAttendanceStats(schoolId, date);
          return { day, present: stats.present, total: stats.total, percentage: stats.percentage };
        })
      );
    } catch {
      return [];
    }
  }

  /**
   * Get today's attendance statistics for the dashboard.
   */
  static async getTodayAttendanceStats(schoolId: string): Promise<{
    total: number;
    present: number;
    absent: number;
    percentage: number;
  }> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const stats = await AttendanceService.getAttendanceStats(schoolId, today);
    return { total: stats.total, present: stats.present, absent: stats.absent, percentage: stats.percentage };
  }

  /**
   * Bulk mark attendance — fires POST /attendance for each record sequentially.
   */
  static async bulkMarkAttendance(
    schoolId: string,
    records: Array<Omit<Attendance, 'id' | 'schoolId' | 'createdAt' | 'updatedAt'>>
  ): Promise<void> {
    for (const record of records) {
      await AttendanceService.createAttendance(schoolId, record);
    }
  }
}

