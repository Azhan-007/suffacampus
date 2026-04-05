'use client';

import { useCallback, useRef } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Users,
  GraduationCap,
  ClipboardList,
  FileText,
  IndianRupee,
  Library,
  Calendar,
  CalendarDays,
  Settings,
  PanelLeftClose,
  PanelLeftOpen,
  School,
  Building2,
  BarChart3,
  Shield,
  CreditCard,
  Palette,
  Code2,
  X,
  UserPlus,
  ScrollText,
  Webhook,
  Monitor,
  Lock,
} from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { useBranding } from '@/components/providers/BrandingProvider';
import SchoolSelector from '@/components/common/SchoolSelector';

/* ------------------------------------------------------------------ */
/*  Types & Data                                                       */
/* ------------------------------------------------------------------ */

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
  superAdminOnly?: boolean;
  section?: string;
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard',    href: '/dashboard',              icon: LayoutDashboard, section: 'Overview' },
  { label: 'Students',     href: '/students',               icon: Users,           section: 'Academics' },
  { label: 'Teachers',     href: '/teachers',               icon: GraduationCap,   section: 'Academics' },
  { label: 'Classes',      href: '/classes',                icon: School,          section: 'Academics' },
  { label: 'Attendance',   href: '/attendance',             icon: ClipboardList,   section: 'Academics' },
  { label: 'Results',      href: '/results',                icon: FileText,        section: 'Academics' },
  { label: 'Fees',         href: '/fees',                   icon: IndianRupee,     section: 'Finance' },
  { label: 'Library',      href: '/library',                icon: Library,         section: 'Resources' },
  { label: 'Timetable',    href: '/timetable',              icon: Calendar,        section: 'Resources' },
  { label: 'Events',       href: '/events',                 icon: CalendarDays,    section: 'Resources' },
  { label: 'Analytics',    href: '/reports',                icon: BarChart3,       section: 'Resources' },
  { label: 'Parent Codes', href: '/settings/parent-invites', icon: UserPlus,       section: 'Settings' },
  { label: 'Audit Logs',  href: '/settings/audit-logs',     icon: ScrollText,     section: 'Settings' },
  { label: 'Webhooks',    href: '/settings/webhooks',       icon: Webhook,         section: 'Settings' },
  { label: 'Data Privacy', href: '/settings/privacy',       icon: Shield,          section: 'Settings' },
  { label: 'Sessions',    href: '/settings/sessions',       icon: Monitor,         section: 'Settings' },
  { label: 'Permissions', href: '/settings/permissions',    icon: Lock,            section: 'Settings' },
  { label: 'Branding',     href: '/settings/branding',      icon: Palette,         section: 'Settings' },
  { label: 'API',           href: '/settings/api',            icon: Code2,           section: 'Settings' },
  { label: 'Subscription', href: '/settings/subscription',  icon: CreditCard,      section: 'Settings' },
  { label: 'Settings',     href: '/settings',               icon: Settings,        section: 'Settings' },
];

const ALL_HREFS = NAV_ITEMS.map((n) => n.href);

const SUPER_ADMIN_ITEMS: NavItem[] = [
  { label: 'Super Admin Panel', href: '/superadmin', icon: Building2, superAdminOnly: true, section: 'Admin' },
];

const PARENT_ITEMS: NavItem[] = [
  { label: 'My Children',  href: '/parent',      icon: Users,     section: 'Parent Portal' },
  { label: 'Link Child',   href: '/parent/link',  icon: UserPlus,  section: 'Parent Portal' },
  { label: 'Events',       href: '/events',       icon: CalendarDays, section: 'Parent Portal' },
];

/* ------------------------------------------------------------------ */
/*  Helper                                                             */
/* ------------------------------------------------------------------ */

function checkActive(pathname: string, href: string, allHrefs: string[]): boolean {
  const exact = pathname === href;
  const sub   = pathname.startsWith(href + '/');
  if (!exact && !sub) return false;
  return !allHrefs.some(
    (h) => h !== href && h.startsWith(href + '/') && (pathname === h || pathname.startsWith(h + '/'))
  );
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  onCloseMobile?: () => void;
}

export default function Sidebar({ collapsed, onToggle, onCloseMobile }: SidebarProps) {
  const pathname  = usePathname();
  const scrollRef = useRef<HTMLDivElement>(null);
  const { isSuperAdmin, availableSchools, user } = useAuthStore();
  const { branding } = useBranding();
  const superAdmin = isSuperAdmin();
  const isParent = user?.role === 'Parent';

  const items: NavItem[] = isParent
    ? PARENT_ITEMS
    : superAdmin
      ? [...SUPER_ADMIN_ITEMS, ...NAV_ITEMS]
      : NAV_ITEMS;
  const hrefs = items.map((i) => i.href);

  const handleNav = useCallback(() => {
    onCloseMobile?.();
  }, [onCloseMobile]);

  return (
    <aside
      className={`
        h-full flex flex-col
        transition-[width] duration-200 ease-[cubic-bezier(0.25,0.1,0.25,1)]
        ${collapsed ? 'w-[68px]' : 'w-[248px]'}
      `}
      style={{
        backgroundColor: 'var(--sidebar-bg, #ffffff)',
        borderRight: '1px solid var(--sidebar-border, #e2e8f0)',
      }}
    >
      {/* â”€â”€â”€ Header â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <div className={`flex items-center shrink-0 ${collapsed ? 'flex-col gap-1.5 pt-4 pb-2 px-2' : 'gap-3 px-5 py-5'}`}>
        <div
          className={`
            text-white
            flex items-center justify-center shrink-0 overflow-hidden
            ${collapsed ? 'w-9 h-9 rounded-lg' : 'w-10 h-10 rounded-lg'}
          `}
          style={{ backgroundColor: 'var(--sidebar-icon-bg, #2563eb)' }}
        >
          {branding.logoURL
            ? <Image src={branding.logoURL} alt="School logo" width={collapsed ? 20 : 24} height={collapsed ? 20 : 24} className={`object-contain ${collapsed ? 'w-5 h-5' : 'w-6 h-6'}`} unoptimized />
            : <School className={collapsed ? 'w-4 h-4' : 'w-5 h-5'} />
          }
        </div>

        {!collapsed && (
          <div className="flex-1 min-w-0">
            <h1 className="text-base font-semibold leading-tight tracking-tight" style={{ color: 'var(--sidebar-header-text, #0f172a)' }}>SuffaCampus</h1>
            <p className="text-xs font-medium" style={{ color: 'var(--sidebar-header-sub, #94a3b8)' }}>{superAdmin ? 'Super Admin' : isParent ? 'Parent Portal' : 'Admin Panel'}</p>
          </div>
        )}

        {!collapsed && (
          <>
            <button
              onClick={onToggle}
              className="p-1.5 rounded-lg hidden lg:flex"
              style={{ color: 'var(--sidebar-text, #94a3b8)' }}
              aria-label="Collapse sidebar"
            >
              <PanelLeftClose className="w-[18px] h-[18px]" />
            </button>
            {onCloseMobile && (
              <button
                onClick={onCloseMobile}
                className="p-1.5 rounded-lg lg:hidden"
                style={{ color: 'var(--sidebar-text, #94a3b8)' }}
                aria-label="Close menu"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </>
        )}

        {collapsed && (
          <button
            onClick={onToggle}
            className="p-1.5 rounded-lg hidden lg:flex"
            style={{ color: 'var(--sidebar-text, #94a3b8)' }}
            aria-label="Expand sidebar"
          >
            <PanelLeftOpen className="w-[18px] h-[18px]" />
          </button>
        )}
      </div>

      {/* â”€â”€â”€ School selector (SuperAdmin, expanded) â”€â”€â”€â”€â”€â”€ */}
      {!collapsed && superAdmin && availableSchools.length > 1 && (
        <div className="px-4 pb-3">
          <SchoolSelector compact />
        </div>
      )}

      {/* â”€â”€â”€ Divider â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <div className={`shrink-0 mx-auto ${collapsed ? 'w-8 h-px' : 'w-[calc(100%-32px)] h-px'}`} style={{ backgroundColor: 'var(--sidebar-divider, #f1f5f9)' }} />

      {/* â”€â”€â”€ Nav â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <nav ref={scrollRef} className="flex-1 overflow-y-auto overflow-x-hidden sidebar-scroll py-3" aria-label="Main navigation">
        <ul className={`flex flex-col gap-0.5 ${collapsed ? 'items-center px-2' : 'px-3'}`}>
          {items.map((item, index) => {
            const active = checkActive(pathname, item.href, hrefs);
            const Icon   = item.icon;
            const prevSection = index > 0 ? items[index - 1].section : null;
            const showSectionLabel = !collapsed && item.section && item.section !== prevSection;

            return (
              <li key={item.href} className="relative group/tip">
                {showSectionLabel && (
                  <div className={`px-3 pt-5 pb-2 ${index > 0 ? 'mt-2' : ''}`}>
                    <span className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: 'var(--sidebar-section, #94a3b8)' }}>{item.section}</span>
                  </div>
                )}
                <Link
                  href={item.href}
                  scroll={false}
                  prefetch={true}
                  onClick={handleNav}
                  className={`
                    sidebar-link flex items-center rounded-lg outline-none
                    focus-visible:ring-2 focus-visible:ring-blue-400/40
                    ${collapsed
                      ? 'w-10 h-10 justify-center'
                      : 'gap-3 px-3 py-2'}
                    ${active ? 'font-medium' : ''}
                  `}
                  style={{
                    backgroundColor: active ? 'var(--sidebar-active-bg, #eff6ff)' : undefined,
                    color: active ? 'var(--sidebar-text-active, #2563eb)' : 'var(--sidebar-text, #64748b)',
                  }}
                  onMouseEnter={e => { if (!active) { e.currentTarget.style.backgroundColor = 'var(--sidebar-hover-bg, #f8fafc)'; } }}
                  onMouseLeave={e => { if (!active) { e.currentTarget.style.backgroundColor = 'transparent'; } }}
                >
                  {/* Icon */}
                  <Icon
                    className="w-[18px] h-[18px] shrink-0"
                    style={{ color: active ? 'var(--sidebar-text-active, #2563eb)' : undefined }}
                  />

                  {/* Label */}
                  {!collapsed && (
                    <span className="text-sm leading-none truncate">
                      {item.label}
                    </span>
                  )}

                  {/* SuperAdmin badge */}
                  {item.superAdminOnly && !collapsed && (
                    <Shield className="w-3.5 h-3.5 text-amber-400 ml-auto shrink-0" />
                  )}

                  {/* Active indicator */}
                  {active && !collapsed && (
                    <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[2px] h-5 rounded-r-full" style={{ backgroundColor: 'var(--sidebar-indicator, #2563eb)' }} />
                  )}
                  {active && collapsed && (
                    <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[2px] h-4 rounded-r-full" style={{ backgroundColor: 'var(--sidebar-indicator, #2563eb)' }} />
                  )}
                </Link>

                {/* Tooltip on hover (collapsed only) */}
                {collapsed && (
                  <span className="
                    pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-3
                    px-2.5 py-1.5 rounded-lg text-xs font-medium
                    bg-slate-800 text-white shadow-lg
                    opacity-0 scale-95 group-hover/tip:opacity-100 group-hover/tip:scale-100
                    transition-all duration-150 origin-left
                    whitespace-nowrap z-[100]
                  ">
                    {item.label}
                    <span className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-slate-800" />
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      </nav>

      {/* â”€â”€â”€ Footer â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      {!collapsed && (
        <div className="shrink-0 px-5 py-3" style={{ borderTop: '1px solid var(--sidebar-footer-border, #f1f5f9)' }}>
          <p className="text-xs text-center font-medium select-none" style={{ color: 'var(--sidebar-footer, #94a3b8)' }}>
            {branding.footerText || 'Â© 2026 SuffaCampus'}
          </p>
        </div>
      )}
    </aside>
  );
}

