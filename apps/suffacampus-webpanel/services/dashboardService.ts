import { apiFetch } from '@/lib/api';
import { SummaryConfig } from '@/types';

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

// ---------------------------------------------------------------------------

export class DashboardService {
  /**
   * Get dashboard summary — backend: GET /dashboard/stats
   * Maps backend response to SummaryConfig shape.
   */
  static async getSummary(schoolId: string): Promise<SummaryConfig | null> {
    try {
      const raw = await apiFetch<Record<string, unknown>>('/dashboard/stats');
      return {
        id: 'summary',
        schoolId,
        totalStudents: (raw.totalStudents as number) ?? 0,
        totalTeachers: (raw.totalTeachers as number) ?? 0,
        totalClasses: (raw.totalClasses as number) ?? 0,
        attendanceToday: (raw.attendanceToday as number) ?? (raw.attendanceRate as number) ?? 0,
        pendingFees: (raw.pendingFees as number) ?? 0,
        upcomingEvents: (raw.upcomingEvents as number) ?? 0,
        lastUpdated: raw.lastUpdated ? toDate(raw.lastUpdated) : new Date(),
      };
    } catch {
      return null;
    }
  }

  /**
   * Update dashboard summary — not typically needed (backend auto-computes).
   * Kept for API compatibility.
   */
  static async updateSummary(
    _schoolId: string,
    _data: Partial<Omit<SummaryConfig, 'schoolId'>>
  ): Promise<void> {
    // Backend auto-computes stats — nothing to update
  }

  /**
   * Poll for dashboard summary every 30 seconds.
   */
  static subscribeToSummary(
    schoolId: string,
    callback: (summary: SummaryConfig | null) => void
  ): () => void {
    let cancelled = false;

    const poll = async () => {
      if (cancelled) return;
      try {
        const summary = await DashboardService.getSummary(schoolId);
        if (!cancelled) callback(summary);
      } catch (err) {
        console.error('subscribeToSummary: poll error', err);
        if (!cancelled) callback(null);
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
   * Get recent activity — backend: GET /dashboard/activity
   */
  static async getRecentActivity(
    limit: number = 20
  ): Promise<Array<Record<string, unknown>>> {
    try {
      return await apiFetch<Array<Record<string, unknown>>>(
        `/dashboard/activity?limit=${limit}`
      );
    } catch {
      return [];
    }
  }

  /**
   * Get upcoming events for dashboard — backend: GET /dashboard/upcoming-events
   */
  static async getDashboardUpcomingEvents(
    limit: number = 5
  ): Promise<Array<Record<string, unknown>>> {
    try {
      return await apiFetch<Array<Record<string, unknown>>>(
        `/dashboard/upcoming-events?limit=${limit}`
      );
    } catch {
      return [];
    }
  }

  /**
   * Initialize summary for a new school — no-op (backend handles).
   */
  static async initializeSummary(_schoolId: string): Promise<void> {
    // Backend auto-computes — nothing to initialize
  }
}
