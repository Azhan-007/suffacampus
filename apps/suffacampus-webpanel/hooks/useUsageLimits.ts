'use client';

import { useState, useCallback } from 'react';
import { useAuthStore } from '@/store/authStore';
import { UsageTrackingService, UsageCheckResult } from '@/services/usageTrackingService';
import { SubscriptionPlan } from '@/types';

/**
 * Hook for checking usage limits before performing actions
 */
export function useUsageLimits() {
  const { currentSchool } = useAuthStore();
  const [checking, setChecking] = useState(false);
  const [lastCheck, setLastCheck] = useState<UsageCheckResult | null>(null);

  const plan: SubscriptionPlan = currentSchool?.subscriptionPlan || 'free';
  const schoolId = currentSchool?.id;

  /**
   * Check if adding resources is allowed
   */
  const checkLimit = useCallback(
    async (
      resource: 'students' | 'teachers' | 'classes' | 'storage' | 'admins',
      count: number = 1
    ): Promise<UsageCheckResult> => {
      if (!schoolId) {
        return {
          withinLimits: false,
          nearLimit: false,
          warnings: [],
          blockers: ['No school selected'],
        };
      }

      setChecking(true);
      try {
        const result = await UsageTrackingService.checkLimits(schoolId, plan, resource, count);
        setLastCheck(result);
        return result;
      } finally {
        setChecking(false);
      }
    },
    [schoolId, plan]
  );

  /**
   * Quick check if can add resource
   */
  const canAdd = useCallback(
    async (
      resource: 'students' | 'teachers' | 'classes' | 'storage' | 'admins',
      count: number = 1
    ): Promise<boolean> => {
      if (!schoolId) return false;
      return UsageTrackingService.canAdd(schoolId, plan, resource, count);
    },
    [schoolId, plan]
  );

  /**
   * Check all limits at once
   */
  const checkAllLimits = useCallback(async () => {
    if (!schoolId) return null;
    return UsageTrackingService.checkAllLimits(schoolId, plan);
  }, [schoolId, plan]);

  /**
   * Get current usage summary
   */
  const getUsageSummary = useCallback(async () => {
    if (!schoolId) return null;
    return UsageTrackingService.getUsageSummary(schoolId, plan);
  }, [schoolId, plan]);

  return {
    checkLimit,
    canAdd,
    checkAllLimits,
    getUsageSummary,
    checking,
    lastCheck,
    plan,
    schoolId,
  };
}

/**
 * Guard component that checks limits before allowing actions
 */
export interface LimitGuardProps {
  resource: 'students' | 'teachers' | 'classes' | 'storage' | 'admins';
  count?: number;
  children: React.ReactNode;
  fallback?: React.ReactNode;
  onBlocked?: (result: UsageCheckResult) => void;
}

export function useLimitGuard() {
  const { checkLimit } = useUsageLimits();

  /**
   * Execute action only if within limits
   */
  const guardedAction = async <T,>(
    resource: 'students' | 'teachers' | 'classes' | 'storage' | 'admins',
    action: () => Promise<T>,
    count: number = 1,
    onBlocked?: (result: UsageCheckResult) => void
  ): Promise<T | null> => {
    const result = await checkLimit(resource, count);

    if (!result.withinLimits) {
      onBlocked?.(result);
      return null;
    }

    // Show warning but allow action
    if (result.warnings.length > 0) {
      console.warn('Usage warnings:', result.warnings);
    }

    return action();
  };

  return { guardedAction, checkLimit };
}
