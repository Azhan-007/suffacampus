import React from 'react';
import { School } from '@/types';
import { useAuthStore } from '@/store/authStore';

/**
 * School Context Hook
 * 
 * Provides the current school context for multi-tenant operations.
 * Use this hook in any component that needs to access school-scoped data.
 */
export function useSchoolContext() {
  const { 
    user, 
    currentSchool, 
    availableSchools, 
    isSuperAdmin, 
    getCurrentSchoolId,
    hasSchoolAccess,
    switchSchool,
    setCurrentSchool,
  } = useAuthStore();

  /**
   * Get the current school ID for queries
   * Returns null if no school is selected (SuperAdmin without selection)
   */
  const schoolId = getCurrentSchoolId();

  /**
   * Check if user needs to select a school
   * SuperAdmin must select a school to access school-specific features
   */
  const needsSchoolSelection = isSuperAdmin() && !currentSchool;

  /**
   * Check if current user can access a specific school
   */
  const canAccessSchool = (targetSchoolId: string): boolean => {
    return hasSchoolAccess(targetSchoolId);
  };

  /**
   * Check if user can create/manage schools
   */
  const canManageSchools = (): boolean => {
    return user?.role === 'SuperAdmin';
  };

  /**
   * Check if user can switch between schools
   */
  const canSwitchSchools = (): boolean => {
    return user?.role === 'SuperAdmin' && availableSchools.length > 1;
  };

  /**
   * Get school by ID from available schools
   */
  const getSchoolById = (id: string): School | undefined => {
    return availableSchools.find((s) => s.id === id);
  };

  return {
    // Current context
    schoolId,
    currentSchool,
    availableSchools,
    
    // State checks
    needsSchoolSelection,
    isSuperAdmin: isSuperAdmin(),
    
    // Permission checks
    canAccessSchool,
    canManageSchools,
    canSwitchSchools,
    
    // Actions
    switchSchool,
    setCurrentSchool,
    getSchoolById,
  };
}

/**
 * Higher-order component to require school context
 * Redirects to school selector if no school is selected
 */
export function withSchoolContext<P extends object>(
  WrappedComponent: React.ComponentType<P>
) {
  return function WithSchoolContextComponent(props: P) {
    const { needsSchoolSelection } = useSchoolContext();
    
    if (needsSchoolSelection) {
      // Will be handled by layout to show school selector
      return null;
    }
    
    return <WrappedComponent {...props} />;
  };
}

/**
 * Guard function for API/service calls
 * Throws error if no school context is available
 */
export function requireSchoolId(schoolId: string | null): string {
  if (!schoolId) {
    throw new Error('School context required. Please select a school first.');
  }
  return schoolId;
}


