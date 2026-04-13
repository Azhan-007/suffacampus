import { NextRequest, NextResponse } from 'next/server';

/**
 * Next.js Edge Middleware â€” server-side auth guard.
 *
 * Checks for the `SuffaCampus-auth` cookie (set by Zustand persist) to determine
 * if the user is authenticated. Redirects unauthenticated users to /login.
 *
 * This is a defense-in-depth layer on top of the client-side RouteGuard.
 * The actual token verification happens on the backend for every API call.
 */

type UserRole =
  | 'SuperAdmin'
  | 'Admin'
  | 'Teacher'
  | 'Student'
  | 'Staff'
  | 'Accountant'
  | 'Principal'
  | 'Parent';

const DEBUG_ROUTES_ENABLED = process.env.NODE_ENV !== 'production';
const DEBUG_PATHS = ['/test-login', '/test-bare'];

// Routes that don't require authentication
const PUBLIC_PATHS = DEBUG_ROUTES_ENABLED
  ? ['/login', '/forgot-password', '/pricing', ...DEBUG_PATHS]
  : ['/login', '/forgot-password', '/pricing'];
const AUTH_REDIRECT_PUBLIC_PATHS = ['/login', '/forgot-password'];

const ROUTE_ACL: { prefix: string; roles: UserRole[] }[] = [
  { prefix: '/superadmin', roles: ['SuperAdmin'] },
  { prefix: '/admin', roles: ['SuperAdmin'] },
  { prefix: '/parent', roles: ['Parent', 'SuperAdmin'] },
  { prefix: '/students', roles: ['SuperAdmin', 'Admin', 'Staff', 'Principal'] },
  { prefix: '/teachers', roles: ['SuperAdmin', 'Admin', 'Principal'] },
  { prefix: '/classes', roles: ['SuperAdmin', 'Admin', 'Staff', 'Principal'] },
  { prefix: '/attendance', roles: ['SuperAdmin', 'Admin', 'Staff', 'Principal'] },
  { prefix: '/results', roles: ['SuperAdmin', 'Admin', 'Staff', 'Principal'] },
  { prefix: '/fees', roles: ['SuperAdmin', 'Admin', 'Accountant', 'Principal'] },
  { prefix: '/library', roles: ['SuperAdmin', 'Admin', 'Staff', 'Principal'] },
  { prefix: '/timetable', roles: ['SuperAdmin', 'Admin', 'Staff', 'Principal'] },
  { prefix: '/reports', roles: ['SuperAdmin', 'Admin', 'Principal'] },
  { prefix: '/settings/subscription', roles: ['SuperAdmin', 'Admin', 'Principal'] },
  { prefix: '/settings/parent-invites', roles: ['SuperAdmin', 'Admin'] },
  { prefix: '/settings/audit-logs', roles: ['SuperAdmin', 'Admin'] },
  { prefix: '/settings', roles: ['SuperAdmin', 'Admin', 'Principal'] },
];

const ROLE_HOME: Record<UserRole, string> = {
  SuperAdmin: '/superadmin',
  Admin: '/dashboard',
  Teacher: '/dashboard',
  Student: '/dashboard',
  Staff: '/dashboard',
  Accountant: '/dashboard',
  Principal: '/dashboard',
  Parent: '/parent',
};

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(p + '/')
  );
}

function shouldRedirectAuthenticatedFromPublic(pathname: string): boolean {
  return AUTH_REDIRECT_PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(p + '/')
  );
}

function normalizeRole(rawRole?: string): UserRole | null {
  if (!rawRole) return null;

  const role = rawRole.trim().toLowerCase();
  if (role === 'superadmin') return 'SuperAdmin';
  if (role === 'admin') return 'Admin';
  if (role === 'teacher') return 'Teacher';
  if (role === 'student') return 'Student';
  if (role === 'staff') return 'Staff';
  if (role === 'accountant') return 'Accountant';
  if (role === 'principal') return 'Principal';
  if (role === 'parent') return 'Parent';

  return null;
}

function findAcl(pathname: string) {
  const sorted = [...ROUTE_ACL].sort((a, b) => b.prefix.length - a.prefix.length);
  return sorted.find(
    (acl) => pathname === acl.prefix || pathname.startsWith(acl.prefix + '/')
  );
}

function getRoleHome(role: UserRole | null): string {
  if (!role) return '/dashboard';
  return ROLE_HOME[role] ?? '/dashboard';
}

// Static assets & API routes that should always pass through
function isAssetOrApi(pathname: string): boolean {
  return (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    pathname.startsWith('/favicon') ||
    pathname.includes('.')  // static files like .css, .js, .png
  );
}

export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  // Skip static assets & API routes
  if (isAssetOrApi(pathname)) {
    return NextResponse.next();
  }

  if (!DEBUG_ROUTES_ENABLED) {
    const isDebugPath = DEBUG_PATHS.some(
      (p) => pathname === p || pathname.startsWith(p + '/')
    );
    if (isDebugPath) {
      return NextResponse.redirect(new URL('/login', request.url));
    }
  }

  const authCookie =
    request.cookies.get('__session') ??
    request.cookies.get('SuffaCampus-token');
  const isAuthenticated = Boolean(authCookie?.value);

  // Allow public paths (except login-like pages for authenticated users)
  if (isPublicPath(pathname)) {
    if (isAuthenticated && shouldRedirectAuthenticatedFromPublic(pathname)) {
      const roleCookie = request.cookies.get('SuffaCampus-role')?.value;
      const role = normalizeRole(roleCookie);
      const home = getRoleHome(role);
      if (pathname !== home) {
        return NextResponse.redirect(new URL(home, request.url));
      }
    }

    return NextResponse.next();
  }

  // Check for auth cookie (Zustand persists as "SuffaCampus-auth" in localStorage,
  // but Next.js middleware can't read localStorage. We check for the Firebase
  // auth session cookie instead.)
  // Strategy: Check for the __session cookie or the presence of a token cookie
  if (!isAuthenticated) {
    // No auth cookie â€” redirect to login
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirect', `${pathname}${search}`);
    return NextResponse.redirect(loginUrl);
  }

  // UX-level role gating (server-side redirect only; backend still enforces authz).
  const roleCookie = request.cookies.get('SuffaCampus-role')?.value;
  const role = normalizeRole(roleCookie);
  const acl = findAcl(pathname);

  if (role && acl && !acl.roles.includes(role)) {
    const fallback = getRoleHome(role);
    if (pathname !== fallback) {
      return NextResponse.redirect(new URL(fallback, request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  // Match all routes except static files
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};

