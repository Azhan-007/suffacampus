'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useAuthStore } from '@/store/authStore';
import { AuthService } from '@/services/authService';
import { useRouter, usePathname } from 'next/navigation';
import {
  Bell,
  LogOut,
  Menu,
  ChevronDown,
  Settings,
  ChevronRight,
  X,
  CheckCheck,
  CreditCard,
  CalendarCheck,
  Info,
} from 'lucide-react';
import Link from 'next/link';
import LanguageSwitcher from '@/components/common/LanguageSwitcher';
import CommandPalette from '@/components/common/CommandPalette';
import { NotificationService, Notification as AppNotification, NotificationType } from '@/services/notificationService';

/* ------------------------------------------------------------------ */
/*  Breadcrumb helper                                                  */
/* ------------------------------------------------------------------ */

const PAGE_LABELS: Record<string, string> = {
  dashboard: 'Dashboard',
  students: 'Students',
  teachers: 'Teachers',
  classes: 'Classes',
  attendance: 'Attendance',
  results: 'Results',
  fees: 'Fees',
  library: 'Library',
  timetable: 'Timetable',
  events: 'Events',
  reports: 'Reports',
  settings: 'Settings',
  subscription: 'Subscription',
  branding: 'Branding',
  api: 'API & Integrations',
  admin: 'Admin',
  superadmin: 'Super Admin',
  schools: 'Schools',
  parent: 'Parent Portal',
  link: 'Link Child',
  'parent-invites': 'Parent Invites',
  'audit-logs': 'Audit Logs',
};

function buildBreadcrumbs(pathname: string) {
  const parts = pathname.split('/').filter(Boolean);
  return parts.map((part) => ({
    label: PAGE_LABELS[part] || part.charAt(0).toUpperCase() + part.slice(1),
    segment: part,
  }));
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

interface NavbarProps {
  onMenuClick?: () => void;
}

export default function Navbar({ onMenuClick }: NavbarProps) {
  const { user, currentSchool } = useAuthStore();
  const router = useRouter();
  const pathname = usePathname();
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);

  // Notifications — live from API with graceful fallback
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  // Fetch notifications on mount & when dropdown opens
  const fetchNotifications = useCallback(async () => {
    try {
      const [notifs, count] = await Promise.all([
        NotificationService.getNotifications({ limit: 10 }),
        NotificationService.getUnreadCount(),
      ]);
      setNotifications(notifs);
      setUnreadCount(count);
    } catch {
      // Silently fail — demo/offline mode keeps empty state
    }
  }, []);

  useEffect(() => { fetchNotifications(); }, [fetchNotifications]);
  useEffect(() => { if (showNotifications) fetchNotifications(); }, [showNotifications, fetchNotifications]);

  const crumbs = buildBreadcrumbs(pathname);
  const pageTitle = crumbs.length > 0 ? crumbs[crumbs.length - 1].label : 'Dashboard';

  // Close dropdowns on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowProfileMenu(false);
      }
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setShowNotifications(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const markAllRead = useCallback(async () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    setUnreadCount(0);
    try { await NotificationService.markAllAsRead(); } catch { /* silent */ }
  }, []);

  const markOneRead = useCallback(async (id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    );
    setUnreadCount((c) => Math.max(0, c - 1));
    try { await NotificationService.markAsRead(id); } catch { /* silent */ }
  }, []);

  const getNotifIcon = (type: NotificationType | string) => {
    switch (type) {
      case 'payment': return <CreditCard className="w-4 h-4 text-emerald-500" />;
      case 'subscription': return <CreditCard className="w-4 h-4 text-blue-600" />;
      case 'success': return <CalendarCheck className="w-4 h-4 text-emerald-500" />;
      case 'warning': return <Info className="w-4 h-4 text-amber-500" />;
      case 'error': return <Info className="w-4 h-4 text-red-500" />;
      default: return <Info className="w-4 h-4 text-slate-400" />;
    }
  };

  const handleLogout = async () => {
    setShowProfileMenu(false);
    try {
      await AuthService.signOut();
      router.push('/login');
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  // Get initials for avatar
  const initials = (user?.displayName || 'A')
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <header className="shrink-0 bg-white border-b border-slate-200 sticky top-0 z-30">
      <div className="flex items-center h-16 px-4 sm:px-6 gap-3">
        {/* ── Mobile hamburger ────────────────────────── */}
        <button
          onClick={onMenuClick}
          className="p-2 -ml-1 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 lg:hidden"
          aria-label="Open menu"
        >
          <Menu className="w-5 h-5" />
        </button>

        {/* ── Page title + breadcrumb ─────────────────── */}
        <div className="hidden sm:flex flex-col min-w-0">
          <h2 className="text-sm font-semibold text-slate-800 leading-tight truncate">
            {pageTitle}
          </h2>
          {crumbs.length > 1 && (
            <nav className="flex items-center gap-1 mt-0.5">
              {crumbs.map((c, i) => (
                <span key={c.segment} className="flex items-center gap-1">
                  {i > 0 && <ChevronRight className="w-3 h-3 text-slate-300" />}
                  <span
                    className={`text-xs ${
                      i === crumbs.length - 1
                        ? 'text-blue-600 font-medium'
                        : 'text-slate-400'
                    }`}
                  >
                    {c.label}
                  </span>
                </span>
              ))}
            </nav>
          )}
        </div>

        {/* ── Mobile title ────────────────────────────── */}
        <h2 className="text-sm font-semibold text-slate-800 sm:hidden truncate">
          {pageTitle}
        </h2>

        {/* ── Spacer ──────────────────────────────────── */}
        <div className="flex-1" />

        {/* ── Search (Command Palette) ─────────────── */}
        <CommandPalette />

        {/* ── Language switcher ────────────────────────── */}
        <LanguageSwitcher />

        {/* ── Notifications ───────────────────────────── */}
        <div className="relative" ref={notifRef}>
          <button
            onClick={() => { setShowNotifications((p) => !p); setShowProfileMenu(false); }}
            className="relative p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <Bell className="w-[18px] h-[18px]" />
            {unreadCount > 0 && (
                      <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] flex items-center justify-center bg-blue-600 text-white text-[10px] font-semibold rounded-full ring-2 ring-white px-1">
                {unreadCount}
              </span>
            )}
          </button>

          {/* Notification dropdown */}
          {showNotifications && (
            <div className="absolute right-0 mt-2 w-80 bg-white rounded-xl border border-slate-200 z-50 animate-slide-down overflow-hidden" style={{ boxShadow: 'var(--shadow-dropdown)' }}>
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-slate-900">Notifications</h3>
                  {unreadCount > 0 && (
                    <span className="px-1.5 py-0.5 bg-blue-50 text-blue-600 text-xs font-medium rounded-full">
                      {unreadCount} new
                    </span>
                  )}
                </div>
                {unreadCount > 0 && (
                  <button
                    onClick={markAllRead}
                    className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium"
                  >
                    <CheckCheck className="w-3.5 h-3.5" />
                    Mark all read
                  </button>
                )}
              </div>

              {/* List */}
              <div className="max-h-72 overflow-y-auto sidebar-scroll">
                {notifications.length === 0 ? (
                  <div className="px-4 py-8 text-center">
                    <Bell className="w-8 h-8 text-slate-200 mx-auto mb-2" />
                    <p className="text-sm text-slate-400">No notifications</p>
                  </div>
                ) : (
                  notifications.map((n) => (
                    <button
                      key={n.id}
                      onClick={() => markOneRead(n.id)}
                      className={`w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-slate-50 transition-colors border-b border-slate-100 last:border-0 ${
                        !n.read ? 'bg-blue-50' : ''
                      }`}
                    >
                      <div className="mt-0.5 w-8 h-8 rounded-lg bg-slate-50 flex items-center justify-center shrink-0">
                        {getNotifIcon(n.type)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm leading-tight truncate ${
                          !n.read ? 'font-medium text-slate-900' : 'font-normal text-slate-600'
                        }`}>
                          {n.title}
                        </p>
                        <p className="text-xs text-slate-400 mt-0.5 truncate">{n.message}</p>
                        <p className="text-xs text-slate-300 mt-1">{n.createdAt ? new Date(n.createdAt).toLocaleString() : ''}</p>
                      </div>
                      {!n.read && (
                        <span className="mt-2 w-2 h-2 bg-blue-600 rounded-full shrink-0" />
                      )}
                    </button>
                  ))
                )}
              </div>

              {/* Footer */}
              <div className="border-t border-slate-200">
                <button
                  onClick={() => { setShowNotifications(false); router.push('/notifications'); }}
                  className="w-full py-2.5 text-xs font-medium text-blue-600 hover:text-blue-700 hover:bg-slate-50 transition-colors"
                >
                  View all notifications
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ── Divider ─────────────────────────────────── */}
        <div className="hidden sm:block w-px h-7 bg-slate-200" />

        {/* ── Profile ─────────────────────────────────── */}
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setShowProfileMenu((p) => !p)}
            className="flex items-center gap-2.5 p-1.5 pr-3 rounded-xl hover:bg-slate-50 transition-colors"
          >
            {/* Avatar */}
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center">
              <span className="text-xs font-semibold text-white leading-none">{initials}</span>
            </div>

            {/* Name + role */}
            <div className="text-left hidden sm:block">
              <p className="text-sm font-medium text-slate-700 leading-tight truncate max-w-[120px]">
                {user?.displayName || 'Admin User'}
              </p>
              <p className="text-xs text-slate-400 leading-tight">
                {currentSchool?.name || user?.role || 'Admin'}
              </p>
            </div>

            <ChevronDown
              className={`w-3.5 h-3.5 text-slate-400 hidden sm:block transition-transform duration-150 ${
                showProfileMenu ? 'rotate-180' : ''
              }`}
            />
          </button>

          {/* ── Dropdown ────────────────────────────── */}
          {showProfileMenu && (
            <div className="absolute right-0 mt-2 w-60 bg-white rounded-xl border border-slate-200 py-1 z-50 animate-slide-down" style={{ boxShadow: 'var(--shadow-dropdown)' }}>
              {/* User info */}
              <div className="px-4 py-3 border-b border-slate-100">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-blue-600 flex items-center justify-center">
                    <span className="text-sm font-semibold text-white">{initials}</span>
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-900 truncate">
                      {user?.displayName || 'Admin User'}
                    </p>
                    <p className="text-xs text-slate-400 truncate">{user?.email || ''}</p>
                  </div>
                </div>
              </div>

              {/* Menu items */}
              <div className="py-1">
                <Link
                  href="/settings"
                  scroll={false}
                  onClick={() => setShowProfileMenu(false)}
                  className="flex items-center gap-3 px-4 py-2.5 text-sm text-slate-600 hover:bg-slate-50 hover:text-slate-800 transition-colors"
                >
                  <Settings className="w-4 h-4 text-slate-400" />
                  Settings
                </Link>
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                  Sign out
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
