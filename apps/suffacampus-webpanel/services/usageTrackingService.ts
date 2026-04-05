import { apiFetch } from '@/lib/api';
import { UsageRecord, UsageAlert, SubscriptionPlan } from '@/types';
import { SUBSCRIPTION_PLANS } from './subscriptionService';

// =============================================================================
// TYPES
// =============================================================================

export interface UsageSummary {
  students: { current: number; limit: number; percentage: number };
  teachers: { current: number; limit: number; percentage: number };
  classes: { current: number; limit: number; percentage: number };
  storage: { current: number; limit: number; percentage: number };
  admins: { current: number; limit: number; percentage: number };
}

export interface UsageCheckResult {
  withinLimits: boolean;
  nearLimit: boolean;
  warnings: string[];
  blockers: string[];
}

// =============================================================================
// BACKEND RESPONSE TYPES
// =============================================================================

interface BackendUsageResponse {
  students: { current: number; limit: number | null; remaining: number | null };
  teachers: { current: number; limit: number | null; remaining: number | null };
  classes: { current: number; limit: number | null; remaining: number | null };
  plan: string;
  status: string;
}

// =============================================================================
// USAGE TRACKING SERVICE — Backend API
// =============================================================================

export class UsageTrackingService {
  // Warning thresholds
  private static WARNING_THRESHOLD = 80; // 80%
  private static CRITICAL_THRESHOLD = 95; // 95%

  // Cache to avoid repeated API calls within the same render cycle
  private static cachedUsage: BackendUsageResponse | null = null;
  private static cacheTimestamp = 0;
  private static CACHE_TTL = 30_000; // 30 seconds

  // ---------------------------------------------------------------------------
  // INTERNAL — Fetch usage from backend (with cache)
  // ---------------------------------------------------------------------------

  private static async fetchUsage(): Promise<BackendUsageResponse> {
    const now = Date.now();
    if (this.cachedUsage && now - this.cacheTimestamp < this.CACHE_TTL) {
      return this.cachedUsage;
    }

    const data = await apiFetch<BackendUsageResponse>('/subscriptions/usage');
    this.cachedUsage = data;
    this.cacheTimestamp = now;
    return data;
  }

  /** Invalidate cache after mutations (e.g. creating a student) */
  static invalidateCache(): void {
    this.cachedUsage = null;
    this.cacheTimestamp = 0;
  }

  // ---------------------------------------------------------------------------
  // USAGE CALCULATION
  // ---------------------------------------------------------------------------

  /**
   * Get current usage for a school (from backend)
   */
  static async getCurrentUsage(schoolId: string): Promise<UsageRecord | null> {
    try {
      const data = await this.fetchUsage();
      const dateKey = new Date().toISOString().split('T')[0];

      return {
        id: 'usage-' + schoolId + '-' + dateKey,
        schoolId,
        date: new Date(),
        students: data.students.current,
        teachers: data.teachers.current,
        classes: data.classes.current,
        storage: 0,
        admins: 0,
        period: 'daily',
        createdAt: new Date(),
      };
    } catch (error) {
      console.error('Error getting current usage:', error);
      return null;
    }
  }

  /**
   * Calculate usage summary with limits
   */
  static async getUsageSummary(schoolId: string, plan: SubscriptionPlan): Promise<UsageSummary> {
    try {
      const data = await this.fetchUsage();
      const planLimits = SUBSCRIPTION_PLANS[plan]?.limits;

      const calculateMetric = (
        current: number,
        backendLimit: number | null,
        fallbackLimit: number
      ) => {
        const effectiveLimit = backendLimit ?? (fallbackLimit === -1 ? Infinity : fallbackLimit);
        return {
          current,
          limit: effectiveLimit === -1 ? Infinity : effectiveLimit,
          percentage:
            effectiveLimit === -1 || effectiveLimit === Infinity
              ? 0
              : Math.round((current / effectiveLimit) * 100),
        };
      };

      return {
        students: calculateMetric(data.students.current, data.students.limit, planLimits?.maxStudents ?? -1),
        teachers: calculateMetric(data.teachers.current, data.teachers.limit, planLimits?.maxTeachers ?? -1),
        classes: calculateMetric(data.classes.current, data.classes.limit, planLimits?.maxClasses ?? -1),
        storage: calculateMetric(0, null, planLimits?.maxStorage ?? -1),
        admins: calculateMetric(0, null, planLimits?.maxAdmins ?? -1),
      };
    } catch (error) {
      console.error('Error getting usage summary:', error);
      // Return zeros on error so UI doesn't break
      return {
        students: { current: 0, limit: Infinity, percentage: 0 },
        teachers: { current: 0, limit: Infinity, percentage: 0 },
        classes: { current: 0, limit: Infinity, percentage: 0 },
        storage: { current: 0, limit: Infinity, percentage: 0 },
        admins: { current: 0, limit: Infinity, percentage: 0 },
      };
    }
  }

  /**
   * Get usage history for a school
   */
  static async getUsageHistory(
    schoolId: string,
    _days: number = 30
  ): Promise<UsageRecord[]> {
    // Backend doesn't expose a history endpoint yet — return current snapshot
    const current = await this.getCurrentUsage(schoolId);
    return current ? [current] : [];
  }

  // ---------------------------------------------------------------------------
  // LIMIT CHECKING
  // ---------------------------------------------------------------------------

  /**
   * Check if action is allowed within limits
   */
  static async checkLimits(
    schoolId: string,
    plan: SubscriptionPlan,
    resource: 'students' | 'teachers' | 'classes' | 'storage' | 'admins',
    additionalCount: number = 1
  ): Promise<UsageCheckResult> {
    const summary = await this.getUsageSummary(schoolId, plan);
    const metric = summary[resource];

    const warnings: string[] = [];
    const blockers: string[] = [];

    // Unlimited plan
    if (metric.limit === Infinity || metric.limit === -1) {
      return { withinLimits: true, nearLimit: false, warnings, blockers };
    }

    const newTotal = metric.current + additionalCount;
    const percentage = (newTotal / metric.limit) * 100;

    // Check if over limit
    if (newTotal > metric.limit) {
      blockers.push(
        'Adding ' + additionalCount + ' ' + resource +
        ' would exceed your plan limit of ' + metric.limit +
        '. Current: ' + metric.current + '/' + metric.limit
      );
    }

    // Check if near limit
    if (percentage >= this.CRITICAL_THRESHOLD && newTotal <= metric.limit) {
      warnings.push(
        "You're at " + Math.round(percentage) + '% of your ' + resource + ' limit. Consider upgrading soon.'
      );
    } else if (percentage >= this.WARNING_THRESHOLD && newTotal <= metric.limit) {
      warnings.push(
        "You're using " + Math.round(percentage) + '% of your ' + resource + ' limit.'
      );
    }

    return {
      withinLimits: blockers.length === 0,
      nearLimit: percentage >= this.WARNING_THRESHOLD,
      warnings,
      blockers,
    };
  }

  /**
   * Check all limits at once
   */
  static async checkAllLimits(
    schoolId: string,
    plan: SubscriptionPlan
  ): Promise<{
    overall: UsageCheckResult;
    byResource: Record<string, UsageCheckResult>;
  }> {
    const resources = ['students', 'teachers', 'classes', 'storage', 'admins'] as const;
    const byResource: Record<string, UsageCheckResult> = {};
    const allWarnings: string[] = [];
    const allBlockers: string[] = [];

    for (const resource of resources) {
      const result = await this.checkLimits(schoolId, plan, resource, 0);
      byResource[resource] = result;
      allWarnings.push(...result.warnings);
      allBlockers.push(...result.blockers);
    }

    return {
      overall: {
        withinLimits: allBlockers.length === 0,
        nearLimit: Object.values(byResource).some((r) => r.nearLimit),
        warnings: allWarnings,
        blockers: allBlockers,
      },
      byResource,
    };
  }

  /**
   * Can add resource (quick check)
   */
  static async canAdd(
    schoolId: string,
    plan: SubscriptionPlan,
    resource: 'students' | 'teachers' | 'classes' | 'storage' | 'admins',
    count: number = 1
  ): Promise<boolean> {
    const result = await this.checkLimits(schoolId, plan, resource, count);
    return result.withinLimits;
  }

  // ---------------------------------------------------------------------------
  // ALERTS (computed client-side from backend usage data)
  // ---------------------------------------------------------------------------

  /**
   * Get alerts derived from current usage vs limits
   */
  static async getAlerts(schoolId: string): Promise<UsageAlert[]> {
    try {
      const data = await this.fetchUsage();
      const alerts: UsageAlert[] = [];

      const resources = [
        { key: 'students' as const, label: 'students', data: data.students },
        { key: 'teachers' as const, label: 'teachers', data: data.teachers },
        { key: 'classes' as const, label: 'classes', data: data.classes },
      ];

      for (const { key, label, data: metric } of resources) {
        if (metric.limit === null || metric.limit === -1) continue;

        const percentage = Math.round((metric.current / metric.limit) * 100);

        if (percentage >= this.WARNING_THRESHOLD) {
          const severity: UsageAlert['severity'] =
            percentage >= this.CRITICAL_THRESHOLD ? 'critical' : 'warning';
          const message =
            percentage >= 100
              ? 'You have reached your ' + label + ' limit (' + metric.current + '/' + metric.limit + '). Upgrade to add more.'
              : 'You are using ' + percentage + '% of your ' + label + ' limit (' + metric.current + '/' + metric.limit + ').';

          alerts.push({
            id: 'alert-' + key + '-' + schoolId,
            schoolId,
            type: 'limit_warning',
            resource: key,
            currentUsage: metric.current,
            limit: metric.limit,
            percentage,
            message,
            severity,
            isRead: false,
            isDismissed: false,
            acknowledged: false,
            createdAt: new Date(),
          });
        }
      }

      return alerts;
    } catch (error) {
      console.error('Error generating alerts:', error);
      return [];
    }
  }

  /**
   * Acknowledge (dismiss) an alert — client-side only (no persistence)
   */
  static async acknowledgeAlert(_alertId: string): Promise<void> {
    // Alerts are computed on-the-fly from backend usage data;
    // dismissal would require a backend endpoint. No-op for now.
    return;
  }

  /**
   * Generate alerts based on current usage
   */
  static async generateAlerts(schoolId: string, _plan: SubscriptionPlan): Promise<UsageAlert[]> {
    return this.getAlerts(schoolId);
  }

  // ---------------------------------------------------------------------------
  // USAGE UTILITIES
  // ---------------------------------------------------------------------------

  /** Format storage size */
  static formatStorage(mb: number): string {
    if (mb === -1 || mb === Infinity) return 'Unlimited';
    if (mb >= 1000) {
      return (mb / 1000).toFixed(1) + ' GB';
    }
    return mb + ' MB';
  }

  /** Get usage status color */
  static getUsageStatusColor(percentage: number): 'success' | 'warning' | 'error' {
    if (percentage >= this.CRITICAL_THRESHOLD) return 'error';
    if (percentage >= this.WARNING_THRESHOLD) return 'warning';
    return 'success';
  }

  /** Format limit display */
  static formatLimit(value: number): string {
    if (value === -1) return 'Unlimited';
    return value.toLocaleString('en-IN');
  }

  /** Calculate percentage safely */
  static calculatePercentage(current: number, limit: number): number {
    if (limit === -1 || limit === 0) return 0;
    return Math.min(100, Math.round((current / limit) * 100));
  }
}
