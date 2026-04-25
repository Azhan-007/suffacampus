import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { User, School } from '@/types';

interface AuthState {
  user: User | null;
  loading: boolean;
  
  // Multi-tenant: Current school context
  currentSchool: School | null;
  availableSchools: School[];
  
  // Actions
  setUser: (user: User | null) => void;
  setLoading: (loading: boolean) => void;
  setCurrentSchool: (school: School | null) => void;
  setAvailableSchools: (schools: School[]) => void;
  switchSchool: (schoolId: string) => void;
  logout: () => void;
  
  // Helpers
  isSuperAdmin: () => boolean;
  getCurrentSchoolId: () => string | null;
  hasSchoolAccess: (schoolId: string) => boolean;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      loading: true,
      currentSchool: null,
      availableSchools: [],

      setUser: (user) => set({ user, loading: false }),
      
      setLoading: (loading) => set({ loading }),
      
      setCurrentSchool: (school) => set({ currentSchool: school }),
      
      setAvailableSchools: (schools) => set({ availableSchools: schools }),
      
      switchSchool: (schoolId) => {
        const { availableSchools } = get();
        const school = availableSchools.find((s) => s.id === schoolId);
        if (school) {
          set({ currentSchool: school });
        }
      },
      
      logout: () =>
        set({
          user: null,
          loading: false,
          currentSchool: null,
          availableSchools: [],
        }),

      isSuperAdmin: () => {
        const { user } = get();
        return user?.role === 'SuperAdmin';
      },

      getCurrentSchoolId: () => {
        const { user, currentSchool } = get();
        if (user?.role === 'SuperAdmin') {
          return currentSchool?.id || null;
        }
        return user?.schoolId || null;
      },

      hasSchoolAccess: (schoolId) => {
        const { user, availableSchools } = get();
        if (!user) return false;
        if (user.role === 'SuperAdmin') {
          // SuperAdmin has access if school is in their list or they manage all
          return !user.schoolIds || user.schoolIds.includes(schoolId) ||
            availableSchools.some((s) => s.id === schoolId);
        }
        return user.schoolId === schoolId;
      },
    }),
    {
      name: 'SuffaCampus-auth',
      partialize: (state) => ({
        // Persist user and currentSchool for session continuity
        user: state.user,
        currentSchool: state.currentSchool,
      }),
    }
  )
);

