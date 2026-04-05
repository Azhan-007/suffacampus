import { apiFetch, ApiError } from '@/lib/api';
import { Teacher } from '@/types';

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

function deserializeTeacher(raw: Record<string, unknown>): Teacher {
  return {
    ...(raw as unknown as Teacher),
    joiningDate: toDate(raw.joiningDate),
    createdAt: toDate(raw.createdAt),
    updatedAt: toDate(raw.updatedAt),
  };
}

// ---------------------------------------------------------------------------

export class TeacherService {
  /**
   * Get all teachers — backend: GET /teachers
   * schoolId enforced server-side. Client-side filtering applied for optional params.
   */
  static async getTeachers(filters?: {
    department?: string;
    subjects?: string;
    isActive?: boolean;
  }): Promise<Teacher[]> {
    const raw = await apiFetch<Record<string, unknown>[]>('/teachers');
    let teachers = raw.map(deserializeTeacher);
    if (filters?.department) teachers = teachers.filter((t) => t.department === filters.department);
    if (filters?.subjects) teachers = teachers.filter((t) => t.subjects.includes(filters.subjects!));
    if (filters?.isActive !== undefined) teachers = teachers.filter((t) => t.isActive === filters.isActive);
    return teachers;
  }

  /**
   * Get a single teacher by ID — backend: GET /teachers/:id
   * Returns null on 404.
   */
  static async getTeacherById(id: string): Promise<Teacher | null> {
    try {
      const raw = await apiFetch<Record<string, unknown>>(`/teachers/${id}`);
      return deserializeTeacher(raw);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) return null;
      throw err;
    }
  }

  /**
   * Create a new teacher — backend: POST /teachers
   * Returns the new teacher's id and auto-generated login credentials.
   */
  static async createTeacher(teacherData: Omit<Teacher, 'id' | 'createdAt' | 'updatedAt'>): Promise<{ id: string; credentials?: { email: string; password: string } }> {
    const raw = await apiFetch<Record<string, unknown>>('/teachers', {
      method: 'POST',
      body: JSON.stringify(teacherData),
    });
    return {
      id: raw.id as string,
      credentials: raw.credentials as { email: string; password: string } | undefined,
    };
  }

  /**
   * Update an existing teacher — backend: PATCH /teachers/:id
   */
  static async updateTeacher(id: string, teacherData: Partial<Teacher>): Promise<void> {
    await apiFetch(`/teachers/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(teacherData),
    });
  }

  /**
   * Soft-delete a teacher — backend: DELETE /teachers/:id
   */
  static async deleteTeacher(id: string): Promise<void> {
    await apiFetch(`/teachers/${id}`, { method: 'DELETE' });
  }

  /**
   * Permanently delete a soft-deleted teacher — backend: DELETE /teachers/:id/permanent
   * SuperAdmin only.
   */
  static async permanentDeleteTeacher(id: string): Promise<void> {
    await apiFetch(`/teachers/${id}/permanent`, { method: 'DELETE' });
  }

  /**
   * Search teachers by name, teacherId, email, or subject.
   * Fetches all teachers from the backend then filters client-side.
   */
  static async searchTeachers(searchTerm: string): Promise<Teacher[]> {
    const teachers = await TeacherService.getTeachers();
    const q = searchTerm.toLowerCase();
    return teachers.filter(
      (t) =>
        (t.firstName ?? '').toLowerCase().includes(q) ||
        (t.lastName ?? '').toLowerCase().includes(q) ||
        (t.teacherId ?? '').toLowerCase().includes(q) ||
        (t.email ?? '').toLowerCase().includes(q) ||
        (Array.isArray(t.subjects) ? t.subjects : []).some((s) => (s ?? '').toLowerCase().includes(q))
    );
  }
}
