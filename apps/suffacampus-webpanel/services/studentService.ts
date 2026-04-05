import { apiFetch, ApiError } from '@/lib/api';
import { Student } from '@/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Convert a raw JSON date value coming from the backend into a JS Date.
 * Handles:
 *  - ISO / numeric strings  →  new Date(value)
 *  - Firestore Timestamp.toJSON()  →  { seconds, nanoseconds }
 *  - Internal Firestore shape  →  { _seconds, _nanoseconds }
 */
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

function deserializeStudent(raw: Record<string, unknown>): Student {
  return {
    ...(raw as unknown as Student),
    dateOfBirth: toDate(raw.dateOfBirth),
    enrollmentDate: toDate(raw.enrollmentDate),
    createdAt: toDate(raw.createdAt),
    updatedAt: toDate(raw.updatedAt),
  };
}

export class StudentService {

  /**
   * Get all students — backend: GET /students
   * schoolId is enforced server-side via the auth token (tenant guard).
   * Client-side filtering is applied for classId / sectionId / isActive.
   */
  static async getStudents(
    schoolId: string,
    filters?: {
      classId?: string;
      sectionId?: string;
      isActive?: boolean;
    }
  ): Promise<Student[]> {
    const raw = await apiFetch<Record<string, unknown>[]>('/students');
    let students = raw.map(deserializeStudent);
    if (filters?.classId) students = students.filter((s) => s.classId === filters.classId);
    if (filters?.sectionId) students = students.filter((s) => s.sectionId === filters.sectionId);
    if (filters?.isActive !== undefined) students = students.filter((s) => s.isActive === filters.isActive);
    return students;
  }

  /**
   * Get a single student by ID — backend: GET /students/:id
   * Returns null when the server responds with 404.
   */
  static async getStudentById(schoolId: string, id: string): Promise<Student | null> {
    try {
      const raw = await apiFetch<Record<string, unknown>>(`/students/${id}`);
      return deserializeStudent(raw);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) return null;
      throw err;
    }
  }

  /**
   * Create a new student — backend: POST /students
   * Returns the new student ID plus auto-generated login credentials.
   */
  static async createStudent(
    schoolId: string,
    studentData: Omit<Student, 'id' | 'schoolId' | 'createdAt' | 'updatedAt'>
  ): Promise<{ id: string; credentials: { username: string; email: string; password: string } }> {
    const raw = await apiFetch<Record<string, unknown>>('/students', {
      method: 'POST',
      body: JSON.stringify(studentData),
    });
    return {
      id: raw.id as string,
      credentials: raw.credentials as { username: string; email: string; password: string },
    };
  }

  /**
   * Update an existing student — backend: PATCH /students/:id
   */
  static async updateStudent(
    schoolId: string,
    id: string,
    studentData: Partial<Omit<Student, 'schoolId'>>
  ): Promise<void> {
    await apiFetch(`/students/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(studentData),
    });
  }

  /**
   * Soft-delete a student — backend: DELETE /students/:id
   */
  static async deleteStudent(schoolId: string, id: string): Promise<void> {
    await apiFetch(`/students/${id}`, { method: 'DELETE' });
  }

  /**
   * Permanently delete a soft-deleted student — backend: DELETE /students/:id/permanent
   * SuperAdmin only.
   */
  static async permanentDeleteStudent(schoolId: string, id: string): Promise<void> {
    await apiFetch(`/students/${id}/permanent`, { method: 'DELETE' });
  }

  /**
   * Search students by name, studentId, or roll number.
   * Fetches all students from the backend then filters client-side.
   */
  static async searchStudents(schoolId: string, searchTerm: string): Promise<Student[]> {
    const students = await StudentService.getStudents(schoolId);
    const q = searchTerm.toLowerCase();
    return students.filter(
      (s) =>
        s.firstName.toLowerCase().includes(q) ||
        s.lastName.toLowerCase().includes(q) ||
        (s.studentId ?? '').toLowerCase().includes(q) ||
        (s.rollNumber ?? '').toLowerCase().includes(q)
    );
  }

  /**
   * Get the count of active students for a school (usage tracking).
   * Fetches all students from the backend and counts active ones client-side.
   */
  static async getStudentCount(schoolId: string): Promise<number> {
    const students = await StudentService.getStudents(schoolId, { isActive: true });
    return students.length;
  }
}
