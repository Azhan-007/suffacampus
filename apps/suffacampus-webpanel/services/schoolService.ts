import { apiFetch, ApiError } from '@/lib/api';
import { School, SubscriptionPlan } from '@/types';

// ---------------------------------------------------------------------------
// Plan limits configuration (kept client-side for UI display)
// ---------------------------------------------------------------------------

export const PLAN_LIMITS: Record<
  SubscriptionPlan,
  {
    maxStudents: number;
    maxTeachers: number;
    maxStorage: number;
    features: string[];
  }
> = {
  free: {
    maxStudents: 50,
    maxTeachers: 5,
    maxStorage: 100,
    features: ['Basic Dashboard', 'Student Management', 'Attendance'],
  },
  basic: {
    maxStudents: 200,
    maxTeachers: 20,
    maxStorage: 500,
    features: ['All Free Features', 'Fees Management', 'Reports'],
  },
  pro: {
    maxStudents: 1000,
    maxTeachers: 100,
    maxStorage: 2000,
    features: [
      'All Basic Features',
      'Library',
      'Timetable',
      'Events',
      'Custom Branding',
    ],
  },
  enterprise: {
    maxStudents: -1,
    maxTeachers: -1,
    maxStorage: -1,
    features: [
      'All Pro Features',
      'API Access',
      'Priority Support',
      'Custom Integrations',
    ],
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toDate(value: unknown): Date {
  if (!value) return new Date(0);
  if (value instanceof Date) return value;
  if (typeof value === 'string' || typeof value === 'number')
    return new Date(value);
  if (typeof value === 'object') {
    const v = value as Record<string, number>;
    if ('seconds' in v) return new Date(v.seconds * 1000);
    if ('_seconds' in v) return new Date(v._seconds * 1000);
  }
  return new Date(0);
}

function deserializeSchool(raw: Record<string, unknown>): School {
  return {
    ...(raw as unknown as School),
    createdAt: toDate(raw.createdAt),
    updatedAt: toDate(raw.updatedAt),
    subscriptionStartDate: raw.subscriptionStartDate
      ? toDate(raw.subscriptionStartDate)
      : new Date(),
    subscriptionEndDate: raw.subscriptionEndDate
      ? toDate(raw.subscriptionEndDate)
      : undefined,
  };
}

// ---------------------------------------------------------------------------

export class SchoolService {
  /**
   * Get all schools (SuperAdmin) — backend: GET /admin/schools
   */
  static async getSchools(): Promise<School[]> {
    const raw = await apiFetch<Record<string, unknown>[]>(
      '/admin/schools?limit=1000'
    );
    return raw.map(deserializeSchool);
  }

  /**
   * Get schools by IDs — fetches each individually.
   */
  static async getSchoolsByIds(schoolIds: string[]): Promise<School[]> {
    const results = await Promise.all(
      schoolIds.map((id) =>
        SchoolService.getSchoolById(id).catch(() => null)
      )
    );
    return results.filter((s): s is School => s !== null);
  }

  /**
   * Get school by ID — backend: GET /admin/schools/:id (SuperAdmin)
   * or GET /school/me (for current user's school)
   */
  static async getSchoolById(id: string): Promise<School | null> {
    try {
      const raw = await apiFetch<Record<string, unknown>>(
        `/admin/schools/${id}`
      );
      return deserializeSchool(raw);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) return null;
      // If forbidden (not SuperAdmin), swallow — caller should use getMySchool
      if (err instanceof ApiError && (err.status === 403 || err.status === 401)) return null;
      throw err;
    }
  }

  /**
   * Get the current user's school — backend: GET /school/me
   * Works for any authenticated user (Admin, Teacher, Student, etc.)
   */
  static async getMySchool(): Promise<School | null> {
    try {
      const raw = await apiFetch<Record<string, unknown>>('/school/me');
      return deserializeSchool(raw);
    } catch (err) {
      if (err instanceof ApiError && (err.status === 404 || err.status === 401)) return null;
      throw err;
    }
  }

  /**
   * Create a new school — backend: POST /admin/schools
   * Optionally creates an admin user if adminEmail is provided.
   * Returns the school ID and optional admin credentials.
   */
  static async createSchool(
    data: Record<string, unknown>
  ): Promise<{ id: string; adminCredentials?: { email: string; password: string; displayName: string; uid: string } }> {
    const raw = await apiFetch<Record<string, unknown>>('/admin/schools', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return {
      id: raw.id as string,
      adminCredentials: raw.adminCredentials as { email: string; password: string; displayName: string; uid: string } | undefined,
    };
  }

  /**
   * Update school — backend: PATCH /admin/schools/:id
   */
  static async updateSchool(
    id: string,
    data: Partial<Omit<School, 'id' | 'createdAt' | 'updatedAt'>>
  ): Promise<void> {
    await apiFetch(`/admin/schools/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  /**
   * Delete school (deactivate) — backend: DELETE /admin/schools/:id
   */
  static async deleteSchool(id: string): Promise<void> {
    await apiFetch(`/admin/schools/${id}`, { method: 'DELETE' });
  }

  /**
   * Poll for school updates every 30 seconds.
   */
  static subscribeToSchools(
    callback: (schools: School[]) => void
  ): () => void {
    let cancelled = false;

    const poll = async () => {
      if (cancelled) return;
      try {
        const schools = await SchoolService.getSchools();
        if (!cancelled) callback(schools);
      } catch (err) {
        console.error('subscribeToSchools: poll error', err);
        if (!cancelled) callback([]);
      }
    };

    poll();
    const intervalId = setInterval(poll, 30_000);
    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }

  /**
   * Update school plan — backend: PATCH /admin/schools/:id/plan
   */
  static async updateSchoolPlan(
    id: string,
    plan: SubscriptionPlan,
    limits?: {
      maxStudents?: number;
      maxTeachers?: number;
      maxStorage?: number;
    }
  ): Promise<void> {
    await apiFetch(`/admin/schools/${id}/plan`, {
      method: 'PATCH',
      body: JSON.stringify({ plan, ...limits }),
    });
  }

  /**
   * Get platform-wide stats — backend: GET /admin/stats
   */
  static async getPlatformStats(): Promise<Record<string, unknown>> {
    try {
      return await apiFetch<Record<string, unknown>>('/admin/stats');
    } catch {
      return {};
    }
  }
}
