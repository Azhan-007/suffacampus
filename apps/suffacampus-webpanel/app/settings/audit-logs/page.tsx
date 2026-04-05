'use client';

import { useState } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { AuditService, AuditLog, AuditAction } from '@/services/auditService';
import { useApiQuery } from '@/hooks/useApiQuery';
import { useQuery } from '@tanstack/react-query';
import {
  ScrollText,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  ArrowLeft,
  Filter,
  Users,
  GraduationCap,
  School,
  CalendarDays,
  IndianRupee,
  Library,
  FileText,
  Settings,
  CreditCard,
  UserPlus,
  ClipboardList,
  Calendar,
  Shield,
} from 'lucide-react';
import Link from 'next/link';

/* ------------------------------------------------------------------ */
/*  Action display config                                              */
/* ------------------------------------------------------------------ */

const ACTION_GROUPS: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  STUDENT:       { label: 'Student',      icon: Users,         color: 'text-blue-600 bg-blue-50' },
  TEACHER:       { label: 'Teacher',      icon: GraduationCap, color: 'text-emerald-600 bg-emerald-50' },
  CLASS:         { label: 'Class',        icon: School,        color: 'text-indigo-600 bg-indigo-50' },
  SECTION:       { label: 'Class',        icon: School,        color: 'text-indigo-600 bg-indigo-50' },
  EVENT:         { label: 'Event',        icon: CalendarDays,  color: 'text-amber-600 bg-amber-50' },
  FEE:           { label: 'Fee',          icon: IndianRupee,   color: 'text-rose-600 bg-rose-50' },
  BOOK:          { label: 'Library',      icon: Library,       color: 'text-purple-600 bg-purple-50' },
  RESULT:        { label: 'Result',       icon: FileText,      color: 'text-cyan-600 bg-cyan-50' },
  TIMETABLE:     { label: 'Timetable',    icon: Calendar,      color: 'text-teal-600 bg-teal-50' },
  SETTINGS:      { label: 'Settings',     icon: Settings,      color: 'text-slate-600 bg-slate-100' },
  ATTENDANCE:    { label: 'Attendance',   icon: ClipboardList, color: 'text-blue-600 bg-blue-50' },
  PAYMENT:       { label: 'Payment',      icon: CreditCard,    color: 'text-emerald-600 bg-emerald-50' },
  SUBSCRIPTION:  { label: 'Subscription', icon: CreditCard,    color: 'text-violet-600 bg-violet-50' },
  WEBHOOK:       { label: 'System',       icon: Shield,        color: 'text-slate-500 bg-slate-100' },
  SCHOOL:        { label: 'School',       icon: School,        color: 'text-indigo-600 bg-indigo-50' },
  PLAN:          { label: 'Plan',         icon: CreditCard,    color: 'text-violet-600 bg-violet-50' },
  USER:          { label: 'User',         icon: Users,         color: 'text-blue-600 bg-blue-50' },
  INVOICE:       { label: 'Invoice',      icon: FileText,      color: 'text-amber-600 bg-amber-50' },
  REFUND:        { label: 'Refund',       icon: IndianRupee,   color: 'text-red-600 bg-red-50' },
  PARENT:        { label: 'Parent',       icon: UserPlus,      color: 'text-blue-600 bg-blue-50' },
};

function getActionGroup(action: string): { label: string; icon: React.ElementType; color: string } {
  // Extract entity keyword from action (e.g. "CREATE_STUDENT" → "STUDENT")
  const parts = action.split('_');
  const keyword = parts.slice(1).join('_'); // Take everything after the verb
  // Try direct match, then first keyword
  if (ACTION_GROUPS[keyword]) return ACTION_GROUPS[keyword];
  if (ACTION_GROUPS[parts[1]]) return ACTION_GROUPS[parts[1]];
  return { label: 'System', icon: Shield, color: 'text-slate-500 bg-slate-100' };
}

function formatAction(action: string): string {
  return action
    .split('_')
    .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
    .join(' ');
}

function formatTimestamp(ts: { _seconds: number; _nanoseconds: number } | string): string {
  if (typeof ts === 'string') return new Date(ts).toLocaleString();
  if (ts && '_seconds' in ts) return new Date(ts._seconds * 1000).toLocaleString();
  return '—';
}

const VERB_COLORS: Record<string, string> = {
  CREATE: 'text-emerald-600',
  UPDATE: 'text-blue-600',
  DELETE: 'text-red-600',
  MARK: 'text-amber-600',
  BULK: 'text-amber-600',
  ISSUE: 'text-purple-600',
  RETURN: 'text-teal-600',
  ADD: 'text-emerald-600',
  REMOVE: 'text-red-600',
  CHANGE: 'text-blue-600',
  PAYMENT: 'text-emerald-600',
  REDEEM: 'text-blue-600',
};

/* ------------------------------------------------------------------ */
/*  Filter options                                                     */
/* ------------------------------------------------------------------ */

const ACTION_FILTER_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'All actions' },
  { value: 'CREATE_STUDENT', label: 'Create Student' },
  { value: 'UPDATE_STUDENT', label: 'Update Student' },
  { value: 'DELETE_STUDENT', label: 'Delete Student' },
  { value: 'CREATE_TEACHER', label: 'Create Teacher' },
  { value: 'CREATE_FEE', label: 'Create Fee' },
  { value: 'PAYMENT_RECEIVED', label: 'Payment Received' },
  { value: 'MARK_ATTENDANCE', label: 'Mark Attendance' },
  { value: 'BULK_ATTENDANCE', label: 'Bulk Attendance' },
  { value: 'CREATE_EVENT', label: 'Create Event' },
  { value: 'UPDATE_SETTINGS', label: 'Update Settings' },
  { value: 'CREATE_PARENT_INVITE', label: 'Create Parent Invite' },
  { value: 'REDEEM_PARENT_INVITE', label: 'Redeem Parent Invite' },
];

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

const PAGE_SIZE = 25;

export default function AuditLogsPage() {
  const [page, setPage] = useState(0);
  const [actionFilter, setActionFilter] = useState('');

  const { data, isLoading: loading, refetch } = useQuery({
    queryKey: ['audit-logs', page, actionFilter],
    queryFn: () => AuditService.getLogs({
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
      action: actionFilter ? (actionFilter as AuditAction) : undefined,
    }),
    staleTime: 30_000,
    refetchInterval: 30_000,
  });

  const logs = data?.data ?? [];
  const total = data?.total ?? 0;

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Link
                href="/settings"
                className="text-xs text-slate-400 hover:text-slate-600 transition-colors"
              >
                <ArrowLeft className="w-3.5 h-3.5 inline mr-1" />
                Settings
              </Link>
            </div>
            <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
              <ScrollText className="w-5 h-5 text-blue-500" />
              Audit Logs
            </h1>
            <p className="text-sm text-slate-500 mt-0.5">
              Activity trail — who did what and when
            </p>
          </div>
          <button
            onClick={() => refetch()}
            className="p-2 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <Filter className="w-4 h-4" />
            <span className="text-xs font-medium">Filter:</span>
          </div>
          <select
            value={actionFilter}
            onChange={(e) => { setActionFilter(e.target.value); setPage(0); }}
            className="text-xs px-3 py-1.5 border border-slate-200 rounded-lg bg-white text-slate-600 outline-none focus:border-blue-400"
          >
            {ACTION_FILTER_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <span className="text-xs text-slate-400 ml-auto">
            {total} total entries
          </span>
        </div>

        {/* Table */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <RefreshCw className="w-5 h-5 text-slate-300 animate-spin" />
            </div>
          ) : logs.length === 0 ? (
            <div className="py-16 text-center">
              <ScrollText className="w-10 h-10 text-slate-200 mx-auto mb-3" />
              <p className="text-sm text-slate-400">No audit logs found</p>
              <p className="text-xs text-slate-300 mt-1">Activity will appear here as actions are performed</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-slate-400 border-b border-slate-100 bg-slate-50/50">
                    <th className="px-5 py-3 font-medium w-10"></th>
                    <th className="px-5 py-3 font-medium">Action</th>
                    <th className="px-5 py-3 font-medium">Performed By</th>
                    <th className="px-5 py-3 font-medium">Details</th>
                    <th className="px-5 py-3 font-medium">Timestamp</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => {
                    const group = getActionGroup(log.action);
                    const Icon = group.icon;
                    const verb = log.action.split('_')[0];
                    const verbColor = VERB_COLORS[verb] ?? 'text-slate-600';

                    return (
                      <tr key={log.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/50">
                        <td className="px-5 py-3">
                          <div className={`w-8 h-8 rounded-lg ${group.color} flex items-center justify-center`}>
                            <Icon className="w-4 h-4" />
                          </div>
                        </td>
                        <td className="px-5 py-3">
                          <span className={`text-sm font-medium ${verbColor}`}>
                            {formatAction(log.action)}
                          </span>
                        </td>
                        <td className="px-5 py-3">
                          <code className="text-xs bg-slate-100 rounded px-1.5 py-0.5 text-slate-600 font-mono">
                            {log.performedBy === 'system' ? 'System' : log.performedBy.slice(0, 12) + '...'}
                          </code>
                        </td>
                        <td className="px-5 py-3">
                          {Object.keys(log.metadata).length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {Object.entries(log.metadata).slice(0, 3).map(([k, v]) => (
                                <span
                                  key={k}
                                  className="inline-flex text-[10px] rounded-full bg-slate-100 text-slate-500 px-2 py-0.5"
                                >
                                  {k}: {typeof v === 'string' ? v.slice(0, 20) : JSON.stringify(v).slice(0, 20)}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-xs text-slate-300">—</span>
                          )}
                        </td>
                        <td className="px-5 py-3 text-xs text-slate-500 whitespace-nowrap">
                          {formatTimestamp(log.timestamp)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-5 py-3 border-t border-slate-100 bg-slate-50/30">
              <p className="text-xs text-slate-400">
                Page {page + 1} of {totalPages}
              </p>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className="p-1.5 rounded-md text-slate-400 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1}
                  className="p-1.5 rounded-md text-slate-400 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
