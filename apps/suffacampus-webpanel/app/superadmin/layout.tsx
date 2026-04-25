'use client';

import { ReactNode, useEffect, useState, useCallback, useRef } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import {
  LayoutDashboard,
  Building2,
  ScrollText,
  Shield,
  PanelLeftClose,
  PanelLeftOpen,
  LogOut,
  X,
  Menu,
  ChevronDown,
  School,
  ArrowLeft,
} from 'lucide-react';
import ErrorBoundary from '@/components/common/ErrorBoundary';

/* ------------------------------------------------------------------ */
/*  Nav Items                                                          */
/* ------------------------------------------------------------------ */

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
  section?: string;
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Platform Overview', href: '/superadmin',              icon: LayoutDashboard, section: 'Platform' },
  { label: 'All Schools',      href: '/superadmin/schools',       icon: Building2,       section: 'Platform' },
  { label: 'Audit Logs',       href: '/superadmin/audit-logs',    icon: ScrollText,      section: 'Platform' },
];

function isActive(pathname: string, href: string): boolean {
  if (href === '/superadmin') return pathname === '/superadmin';
  return pathname === href || pathname.startsWith(href + '/');
}

/* ------------------------------------------------------------------ */
/*  Sidebar                                                            */
/* ------------------------------------------------------------------ */

function SuperAdminSidebar({
  collapsed,
  onToggle,
  onCloseMobile,
}: {
  collapsed: boolean;
  onToggle: () => void;
  onCloseMobile?: () => void;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuthStore();

  const handleLogout = useCallback(async () => {
    logout();
    router.push('/login');
  }, [logout, router]);

  return (
    <aside
      className={`h-full flex flex-col transition-[width] duration-200 ease-[cubic-bezier(0.25,0.1,0.25,1)] bg-slate-900 ${
        collapsed ? 'w-[68px]' : 'w-[260px]'
      }`}
    >
      {/* "" Header """""""""""""""""""""""""""""""""" */}
      <div className={`flex items-center shrink-0 ${collapsed ? 'flex-col gap-1.5 pt-4 pb-2 px-2' : 'gap-3 px-5 py-5'}`}>
        <div className="w-10 h-10 rounded-lg bg-blue-600 flex items-center justify-center shrink-0">
          <Shield className={`text-white ${collapsed ? 'w-4 h-4' : 'w-5 h-5'}`} />
        </div>
        {!collapsed && (
          <div className="flex-1 min-w-0">
            <h1 className="text-base font-semibold text-white leading-tight tracking-tight">SuffaCampus</h1>
            <p className="text-xs font-medium text-slate-400">Super Admin</p>
          </div>
        )}
        {!collapsed && (
          <>
            <button onClick={onToggle} className="p-1.5 rounded-lg text-slate-400 hover:text-white hidden lg:flex" aria-label="Collapse sidebar">
              <PanelLeftClose className="w-[18px] h-[18px]" />
            </button>
            {onCloseMobile && (
              <button onClick={onCloseMobile} className="p-1.5 rounded-lg text-slate-400 hover:text-white lg:hidden" aria-label="Close menu">
                <X className="w-5 h-5" />
              </button>
            )}
          </>
        )}
        {collapsed && (
          <button onClick={onToggle} className="p-1.5 rounded-lg text-slate-400 hover:text-white hidden lg:flex" aria-label="Expand sidebar">
            <PanelLeftOpen className="w-[18px] h-[18px]" />
          </button>
        )}
      </div>

      {/* "" Divider """"""""""""""""""""""""""""""""" */}
      <div className={`shrink-0 mx-auto ${collapsed ? 'w-8' : 'w-[calc(100%-32px)]'} h-px bg-slate-700/60`} />

      {/* "" Nav """"""""""""""""""""""""""""""""""""" */}
      <nav className="flex-1 overflow-y-auto overflow-x-hidden py-3" aria-label="SuperAdmin Navigation">
        <ul className={`flex flex-col gap-0.5 ${collapsed ? 'items-center px-2' : 'px-3'}`}>
          {NAV_ITEMS.map((item, index) => {
            const active = isActive(pathname, item.href);
            const Icon = item.icon;
            const prevSection = index > 0 ? NAV_ITEMS[index - 1].section : null;
            const showSectionLabel = !collapsed && item.section && item.section !== prevSection;

            return (
              <li key={item.href} className="relative group/tip">
                {showSectionLabel && (
                  <div className={`px-3 pt-5 pb-2 ${index > 0 ? 'mt-2' : ''}`}>
                    <span className="text-[11px] font-semibold uppercase tracking-widest text-slate-500">{item.section}</span>
                  </div>
                )}
                <Link
                  href={item.href}
                  scroll={false}
                  prefetch={true}
                  onClick={onCloseMobile}
                  className={`flex items-center rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-blue-400/40 transition-colors ${
                    collapsed ? 'w-10 h-10 justify-center' : 'gap-3 px-3 py-2.5'
                  } ${active ? 'bg-blue-600/20 text-blue-400 font-medium' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}
                >
                  <Icon className="w-[18px] h-[18px] shrink-0" />
                  {!collapsed && <span className="text-sm leading-none truncate">{item.label}</span>}
                  {active && !collapsed && (
                    <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[2px] h-5 rounded-r-full bg-blue-400" />
                  )}
                </Link>
                {collapsed && (
                  <span className="pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-3 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-slate-700 text-white shadow-lg opacity-0 scale-95 group-hover/tip:opacity-100 group-hover/tip:scale-100 transition-all duration-150 origin-left whitespace-nowrap z-[100]">
                    {item.label}
                    <span className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-slate-700" />
                  </span>
                )}
              </li>
            );
          })}
        </ul>

        {/* "" Switch to School View """""""""""""""""" */}
        {!collapsed && (
          <div className="px-3 mt-6">
            <div className="px-3 pt-3 pb-2">
              <span className="text-[11px] font-semibold uppercase tracking-widest text-slate-500">Quick Actions</span>
            </div>
            <Link
              href="/dashboard"
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
            >
              <ArrowLeft className="w-[18px] h-[18px] shrink-0" />
              <span className="text-sm leading-none">School Dashboard</span>
            </Link>
          </div>
        )}
      </nav>

      {/* "" Footer / User """"""""""""""""""""""""""" */}
      {!collapsed && (
        <div className="shrink-0 px-3 py-4 border-t border-slate-700/60">
          <div className="flex items-center gap-3 px-2">
            <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-semibold shrink-0">
              {user?.displayName?.charAt(0)?.toUpperCase() || 'S'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">{user?.displayName || 'Super Admin'}</p>
              <p className="text-xs text-slate-400 truncate">{user?.email || ''}</p>
            </div>
            <button
              onClick={handleLogout}
              className="p-1.5 rounded-lg text-slate-400 hover:text-red-400 hover:bg-slate-800 transition-colors"
              title="Sign Out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </aside>
  );
}

/* ------------------------------------------------------------------ */
/*  Navbar                                                             */
/* ------------------------------------------------------------------ */

function SuperAdminNavbar({ onMenuClick }: { onMenuClick: () => void }) {
  const pathname = usePathname();

  const getPageTitle = (): string => {
    if (pathname === '/superadmin') return 'Platform Overview';
    if (pathname.startsWith('/superadmin/schools')) return 'Schools Management';
    if (pathname.startsWith('/superadmin/audit-logs')) return 'Audit Logs';
    return 'Super Admin';
  };

  return (
    <header className="h-16 shrink-0 flex items-center px-6 border-b border-slate-200 bg-white">
      <button
        onClick={onMenuClick}
        className="p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 lg:hidden mr-3"
        aria-label="Open menu"
      >
        <Menu className="w-5 h-5" />
      </button>
      <div className="flex items-center gap-2">
        <Shield className="w-4 h-4 text-amber-500" />
        <span className="text-xs font-semibold text-amber-600 uppercase tracking-wider">Super Admin</span>
        <span className="text-slate-300 mx-1">|</span>
        <span className="text-sm font-medium text-slate-700">{getPageTitle()}</span>
      </div>
    </header>
  );
}

/* ------------------------------------------------------------------ */
/*  Layout                                                             */
/* ------------------------------------------------------------------ */

export default function SuperAdminLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { isSuperAdmin, user } = useAuthStore();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Guard: Only SuperAdmin can access these pages
  useEffect(() => {
    if (user && !isSuperAdmin()) {
      router.push('/dashboard');
    }
  }, [user, isSuperAdmin, router]);

  if (!user || !isSuperAdmin()) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-50">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-slate-50">
      {/* Skip-to-content */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:px-4 focus:py-2 focus:bg-blue-600 focus:text-white focus:rounded-lg focus:text-sm focus:font-medium focus:shadow-lg"
      >
        Skip to main content
      </a>

      {/* Mobile overlay */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 bg-black/25 backdrop-blur-[2px] z-40 lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar */}
      <div
        className={`fixed inset-y-0 left-0 z-50 lg:relative lg:z-0 transition-transform duration-200 ease-[cubic-bezier(0.25,0.1,0.25,1)] ${
          mobileMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        <SuperAdminSidebar
          collapsed={sidebarCollapsed}
          onToggle={() => setSidebarCollapsed((c) => !c)}
          onCloseMobile={() => setMobileMenuOpen(false)}
        />
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <SuperAdminNavbar onMenuClick={() => setMobileMenuOpen(true)} />
        <main id="main-content" className="flex-1 overflow-y-auto scrollbar-thin" role="main">
          <div className="mx-auto max-w-[1400px] px-6 py-8 lg:px-10 lg:py-10">
            <ErrorBoundary context="SuperAdmin">
              {children}
            </ErrorBoundary>
          </div>
        </main>
      </div>
    </div>
  );
}

