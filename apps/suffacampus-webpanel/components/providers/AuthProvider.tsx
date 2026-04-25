'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import { AuthService } from '@/services/authService';
import { SchoolService } from '@/services/schoolService';
import { School, User } from '@/types';

const AUTH_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

function getSecureCookieSuffix(): string {
  if (typeof window !== 'undefined' && window.location.protocol === 'https:') {
    return '; Secure';
  }

  return '';
}

function setAuthCookies(role?: string): void {
  const secureSuffix = getSecureCookieSuffix();
  document.cookie = `SuffaCampus-token=1; path=/; max-age=${AUTH_COOKIE_MAX_AGE_SECONDS}; SameSite=Lax${secureSuffix}`;

  if (role) {
    document.cookie = `SuffaCampus-role=${encodeURIComponent(role)}; path=/; max-age=${AUTH_COOKIE_MAX_AGE_SECONDS}; SameSite=Lax${secureSuffix}`;
  } else {
    document.cookie = `SuffaCampus-role=; path=/; max-age=0; SameSite=Lax${secureSuffix}`;
  }
}

function clearAuthCookies(): void {
  const secureSuffix = getSecureCookieSuffix();
  document.cookie = `SuffaCampus-token=; path=/; max-age=0; SameSite=Lax${secureSuffix}`;
  document.cookie = `SuffaCampus-role=; path=/; max-age=0; SameSite=Lax${secureSuffix}`;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [authChecked, setAuthChecked] = useState(false);
  const { 
    user, 
    setUser, 
    setLoading, 
    setAvailableSchools, 
    setCurrentSchool,
    currentSchool,
  } = useAuthStore();

  // Load schools based on user role
  const loadUserSchools = async (userData: User) => {
    try {
      if (userData.role === 'SuperAdmin') {
        const schoolIds = userData.schoolIds || [];
        
        if (schoolIds.length > 0) {
          const schools = await Promise.all(
            schoolIds.map((id: string) => SchoolService.getSchoolById(id))
          );
          const validSchools = schools.filter((s): s is School => s !== null);
          setAvailableSchools(validSchools);
          
          if (!currentSchool && validSchools.length > 0) {
            setCurrentSchool(validSchools[0]);
          }
        } else {
          const allSchools = await SchoolService.getSchools();
          setAvailableSchools(allSchools);
          
          if (!currentSchool && allSchools.length > 0) {
            setCurrentSchool(allSchools[0]);
          }
        }
      } else {
        // Non-SuperAdmin: use /school/me endpoint (doesn't require SuperAdmin)
        const school = await SchoolService.getMySchool();
        if (school) {
          setAvailableSchools([school]);
          setCurrentSchool(school);
        }
      }
    } catch (error) {
      console.error('Error loading user schools:', error);
    }
  };

  // Initial auth check - runs only once on mount
  useEffect(() => {
    // If user already exists in persisted state, hydrate UI immediately,
    // but still subscribe to Firebase auth state to reconcile stale sessions.
    if (user) {
      setAuthChecked(true);
      setAuthCookies(user.role);
      // Always attempt to load schools if currentSchool is not set
      if (user.role && !currentSchool) {
        loadUserSchools(user).catch(() => {});
      }
      setLoading(false);
    }

    // Subscribe to Firebase auth state
    const unsubscribe = AuthService.onAuthStateChanged(async (firebaseUser) => {
      setUser(firebaseUser);
      setAuthChecked(true);
      
      // Set/clear auth cookie for middleware (server-side route protection)
      if (firebaseUser) {
        setAuthCookies(firebaseUser.role);
        await loadUserSchools(firebaseUser);
      } else {
        clearAuthCookies();
      }
    });

    return () => unsubscribe();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Handle redirects - only redirect to login if auth is checked and no user
  useEffect(() => {
    // If user exists and on login page, redirect based on role
    if (user && pathname === '/login') {
      if (user.role === 'SuperAdmin') {
        router.push('/superadmin');
      } else {
        router.push('/dashboard');
      }
      return;
    }
    
    // Only redirect to login if:
    // 1. Auth has been checked (Firebase responded)
    // 2. No user exists
    // 3. Not already on public pages
    const debugRoutesEnabled = process.env.NODE_ENV !== 'production';
    const publicPaths = debugRoutesEnabled
      ? ['/login', '/forgot-password', '/pricing', '/test-bare', '/test-login']
      : ['/login', '/forgot-password', '/pricing'];
    const isPublicPage = publicPaths.some(path => pathname === path || pathname.startsWith(path + '/'));
    
    if (authChecked && !user && !isPublicPage) {
      clearAuthCookies();
      router.push('/login');
    }
  }, [user, pathname, router, authChecked]);

  return <>{children}</>;
}

