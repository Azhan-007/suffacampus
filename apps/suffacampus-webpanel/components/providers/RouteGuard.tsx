'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import toast from 'react-hot-toast';
import { UserRole } from '@/types';

/**
 * Route-to-role access control matrix.
 * If a route prefix is listed here, ONLY the specified roles may access it.
 * Unlisted routes are accessible to any authenticated user.
 * More specific prefixes are checked first.
 */
const ROUTE_ACL: { prefix: string; roles: UserRole[] }[] = [
  // SuperAdmin-only
  { prefix: '/superadmin',               roles: ['SuperAdmin'] },
  { prefix: '/admin',                    roles: ['SuperAdmin'] },

  // Parent-only
  { prefix: '/parent',                   roles: ['Parent', 'SuperAdmin'] },

  // Management routes — no Parent access
  { prefix: '/students',                 roles: ['SuperAdmin', 'Admin', 'Staff', 'Principal'] },
  { prefix: '/teachers',                 roles: ['SuperAdmin', 'Admin', 'Principal'] },
  { prefix: '/classes',                  roles: ['SuperAdmin', 'Admin', 'Staff', 'Principal'] },
  { prefix: '/attendance',               roles: ['SuperAdmin', 'Admin', 'Staff', 'Principal'] },
  { prefix: '/results',                  roles: ['SuperAdmin', 'Admin', 'Staff', 'Principal'] },
  { prefix: '/fees',                     roles: ['SuperAdmin', 'Admin', 'Accountant', 'Principal'] },
  { prefix: '/library',                  roles: ['SuperAdmin', 'Admin', 'Staff', 'Principal'] },
  { prefix: '/timetable',               roles: ['SuperAdmin', 'Admin', 'Staff', 'Principal'] },
  { prefix: '/reports',                  roles: ['SuperAdmin', 'Admin', 'Principal'] },

  // Settings — admin/super only (except subscription for Principal too)
  { prefix: '/settings/subscription',    roles: ['SuperAdmin', 'Admin', 'Principal'] },
  { prefix: '/settings/parent-invites',  roles: ['SuperAdmin', 'Admin'] },
  { prefix: '/settings/audit-logs',      roles: ['SuperAdmin', 'Admin'] },
  { prefix: '/settings',                 roles: ['SuperAdmin', 'Admin', 'Principal'] },
];

// Public routes that don't need auth at all
const PUBLIC_PATHS = ['/login', '/forgot-password', '/pricing'];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some(p => pathname === p || pathname.startsWith(p + '/'));
}

/**
 * Find the most specific ACL entry that matches the current path.
 * Entries are sorted by prefix length (longest first) to give specificity.
 */
function findAcl(pathname: string) {
  // Sort by length descending so more specific prefixes are checked first
  const sorted = [...ROUTE_ACL].sort((a, b) => b.prefix.length - a.prefix.length);
  return sorted.find(
    acl => pathname === acl.prefix || pathname.startsWith(acl.prefix + '/')
  );
}

export function RouteGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user } = useAuthStore();

  useEffect(() => {
    // Skip for public paths or unauthenticated users (AuthProvider handles login redirect)
    if (!user || isPublicPath(pathname)) return;

    const acl = findAcl(pathname);
    if (!acl) return; // No ACL entry means open to any authenticated user

    const userRole = user.role as UserRole;
    if (!acl.roles.includes(userRole)) {
      toast.error('You don\'t have permission to access this page');
      // Redirect parents to their portal, others to dashboard
      const fallback = userRole === 'Parent' ? '/parent' : '/dashboard';
      router.replace(fallback);
    }
  }, [pathname, user, router]);

  return <>{children}</>;
}
