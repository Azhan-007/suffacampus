import { apiFetch, apiFetchPaginated, ApiError, PaginatedResponse } from '@/lib/api';
import { Student } from '@/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Convert a raw JSON date value coming from the backend into a JS Date.
 * Handles:
 *  - ISO / numeric strings  ->  new Date(value)
 *  - Firestore Timestamp.toJSON()  ->  { seconds, nanoseconds }
 *  - Internal Firestore shape  ->  { _seconds, _nanoseconds }
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

// ---------------------------------------------------------------------------
// Internal: fetch all students by looping through pages (cursor-based)
// ---------------------------------------------------------------------------

/**
 * Fetch ALL students from the backend by iterating through pages.
 * Uses cursor-based pagination with a large page size to minimise round-trips.
 * Server-side filters (classId, sectionId, gender, search) are pushed to the
 * backend so only matching records are transferred.
 */
async function fetchAllStudents(
  filters?: {
    classId?: string;
    sectionId?: string;
    search?: string;
    status?: string;
  }
): Promise<Student[]> {
  const PAGE_SIZE = 100; // max allowed by backend
  const allStudents: Student[] = [];
  let cursor: string | null = null;
  let hasMore = true;

  while (hasMore) {
    const params: Record<string, string | number | boolean | null | undefined> = {
      limit: PAGE_SIZE,
      cursor,
      sortBy: 'createdAt',
      sortOrder: 'desc' as const,
    };

    // Push filters to the backend (server-side filtering)
    if (filters?.classId) params.classId = filters.classId;
    if (filters?.sectionId) params.sectionId = filters.sectionId;
    if (filters?.search) params.search = filters.search;
    if (filters?.status) params.status = filters.status;

    const page: PaginatedResponse<Record<string, unknown>> = await apiFetchPaginated<Record<string, unknown>>(
      '/students',
      params
    );

    allStudents.push(...page.data.map(deserializeStudent));
    cursor = page.pagination.cursor;
    hasMore = page.pagination.hasMore;
  }

  return allStudents;
}

// ---------------------------------------------------------------------------

export class StudentService {

  /**
   * Get all students  -  backend: GET /students (paginated, server-side filtered)
   *
   * Pushes classId / sectionId / isActive filters to the backend query params
   * and loops through all pages so callers receive the complete dataset.
   *
   * For UI pagination (load-more / table pages), use `getStudentsPaginated()`.
   */
  static async getStudents(
    schoolId: string,
    filters?: {
      classId?: string;
      sectionId?: string;
      isActive?: boolean;
    }
  ): Promise<Student[]> {
    // Map isActive boolean to the backend's status filter string
    let status: string | undefined;
    if (filters?.isActive === false) status = 'inactive';

    const students = await fetchAllStudents({
      classId: filters?.classId,
      sectionId: filters?.sectionId,
      status,
    });

    return students;
  }

  /**
   * Get students with cursor-based pagination  -  for paginated UI tables.
   * Returns the raw paginated response so callers can use cursor / hasMore.
   */
  static async getStudentsPaginated(
    schoolId: string,
    params: {
      limit?: number;
      cursor?: string | null;
      sortBy?: string;
      sortOrder?: 'asc' | 'desc';
      classId?: string;
      sectionId?: string;
      search?: string;
    } = {}
  ): Promise<PaginatedResponse<Student>> {
    const queryParams: Record<string, string | number | boolean | null | undefined> = {
      limit: params.limit ?? 20,
      cursor: params.cursor ?? undefined,
      sortBy: params.sortBy,
      sortOrder: params.sortOrder,
      classId: params.classId,
      sectionId: params.sectionId,
      search: params.search,
    };

    const page = await apiFetchPaginated<Record<string, unknown>>(
      '/students',
      queryParams
    );

    return {
      data: page.data.map(deserializeStudent),
      pagination: page.pagination,
    };
  }

  /**
   * Get a single student by ID  -  backend: GET /students/:id
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
   * Create a new student  -  backend: POST /students
   * Returns the new student ID plus auto-generated login credentials.
   */
  static async createStudent(
    studentData: Omit<Student, 'id' | 'schoolId' | 'classId' | 'createdAt' | 'updatedAt'>,
    classId: string
  ): Promise<{ id: string; credentials: { username: string; email: string; password: string } }> {
    if (!classId) {
      throw new Error('classId is required to create a student.');
    }

    const payload = {
      ...studentData,
      classId,
    };

    const raw = await apiFetch<Record<string, unknown>>('/students', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return {
      id: raw.id as string,
      credentials: raw.credentials as { username: string; email: string; password: string },
    };
  }

  /**
   * Update an existing student  -  backend: PATCH /students/:id
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
   * Soft-delete a student  -  backend: DELETE /students/:id
   */
  static async deleteStudent(schoolId: string, id: string): Promise<void> {
    await apiFetch(`/students/${id}`, { method: 'DELETE' });
  }

  /**
   * Permanently delete a soft-deleted student  -  backend: DELETE /students/:id/permanent
   * SuperAdmin only.
   */
  static async permanentDeleteStudent(schoolId: string, id: string): Promise<void> {
    await apiFetch(`/students/${id}/permanent`, { method: 'DELETE' });
  }

  /**
   * Search students by name  -  uses backend server-side search.
   * The backend's GET /students?search= param does case-insensitive
   * firstName / lastName matching in PostgreSQL.
   */
  static async searchStudents(schoolId: string, searchTerm: string): Promise<Student[]> {
    if (!searchTerm.trim()) return [];

    return fetchAllStudents({ search: searchTerm.trim() });
  }

  /**
   * Get the count of active students for a school.
   * Uses a small paginated request with count=true to avoid fetching all records.
   */
  static async getStudentCount(schoolId: string): Promise<number> {
    const page = await apiFetchPaginated<Record<string, unknown>>(
      '/students',
      { limit: 1, count: true }
    );

    // If the backend returns total in pagination, use it.
    // Otherwise fall back to fetching all active students.
    if (typeof page.pagination.total === 'number') {
      return page.pagination.total;
    }

    // Fallback: fetch all and count
    const students = await fetchAllStudents();
    return students.length;
  }
}
