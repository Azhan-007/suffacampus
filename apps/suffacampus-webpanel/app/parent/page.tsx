'use client';

import { useState } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { ParentService, ChildSummary, AttendanceRecord, FeeRecord, ResultRecord, EventRecord } from '@/services/parentService';
import { useAuthStore } from '@/store/authStore';
import { useQuery } from '@tanstack/react-query';
import {
  Users,
  ClipboardCheck,
  IndianRupee,
  FileText,
  CalendarDays,
  ChevronRight,
  RefreshCw,
  UserPlus,
  GraduationCap,
  AlertCircle,
  CheckCircle,
  Clock,
  XCircle,
  TrendingUp,
} from 'lucide-react';
import Link from 'next/link';
import toast from 'react-hot-toast';

/* ------------------------------------------------------------------ */
/*  Sub-components                                                     */
/* ------------------------------------------------------------------ */

function ChildCard({
  child,
  selected,
  onClick,
}: {
  child: ChildSummary;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`
        w-full text-left rounded-xl border p-4 transition-all duration-200
        ${selected
          ? 'border-blue-500 bg-blue-50/50 ring-1 ring-blue-200'
          : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm'
        }
      `}
    >
      <div className="flex items-center gap-3">
        <div className={`
          w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold
          ${selected ? 'bg-blue-100 text-blue-600' : 'bg-slate-100 text-slate-600'}
        `}>
          {child.name.charAt(0)}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-900 truncate">{child.name}</p>
          <p className="text-xs text-slate-500">
            {child.class} {child.section} {child.rollNumber ? `• Roll ${child.rollNumber}` : ''}
          </p>
        </div>
        <ChevronRight className={`w-4 h-4 shrink-0 ${selected ? 'text-blue-500' : 'text-slate-300'}`} />
      </div>

      {/* Quick stats */}
      <div className="flex gap-3 mt-3 pt-3 border-t border-slate-100">
        <div className="flex-1 text-center">
          <p className="text-xs text-slate-400">Attendance</p>
          <p className={`text-sm font-bold ${
            child.attendanceRate !== null
              ? child.attendanceRate >= 75 ? 'text-emerald-600' : 'text-amber-600'
              : 'text-slate-400'
          }`}>
            {child.attendanceRate !== null ? `${child.attendanceRate}%` : '—'}
          </p>
        </div>
        <div className="flex-1 text-center">
          <p className="text-xs text-slate-400">Pending Fees</p>
          <p className={`text-sm font-bold ${child.pendingFees > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
            {child.pendingFees > 0 ? `₹${child.pendingFees.toLocaleString()}` : '₹0'}
          </p>
        </div>
        <div className="flex-1 text-center">
          <p className="text-xs text-slate-400">Last Exam</p>
          <p className="text-sm font-bold text-slate-700">{child.lastExamScore ?? '—'}</p>
        </div>
      </div>
    </button>
  );
}

function StatBadge({ icon: Icon, label, value, color }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string | number; color: string }) {
  const colors: Record<string, string> = {
    blue: 'bg-blue-50 text-blue-700 border-blue-200',
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    amber: 'bg-amber-50 text-amber-700 border-amber-200',
    red: 'bg-red-50 text-red-700 border-red-200',
  };
  return (
    <div className={`flex items-center gap-2.5 rounded-lg border px-3 py-2.5 ${colors[color] ?? colors.blue}`}>
      <Icon className="w-4 h-4 shrink-0" />
      <div>
        <p className="text-[10px] uppercase tracking-wider opacity-70">{label}</p>
        <p className="text-sm font-bold">{value}</p>
      </div>
    </div>
  );
}

function AttendanceStatusBadge({ status }: { status: string }) {
  const map: Record<string, { color: string; icon: React.ComponentType<{ className?: string }> }> = {
    Present: { color: 'text-emerald-600 bg-emerald-50', icon: CheckCircle },
    Absent:  { color: 'text-red-600 bg-red-50', icon: XCircle },
    Late:    { color: 'text-amber-600 bg-amber-50', icon: Clock },
    Excused: { color: 'text-blue-600 bg-blue-50', icon: AlertCircle },
  };
  const { color, icon: StatusIcon } = map[status] ?? map.Present;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${color}`}>
      <StatusIcon className="w-3 h-3" /> {status}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function ParentPortalPage() {
  const { user } = useAuthStore();
  const [selectedChild, setSelectedChild] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'attendance' | 'fees' | 'results' | 'events'>('attendance');

  // ── Data fetching via React Query ──
  const { data: children = [], isLoading: loading } = useQuery<ChildSummary[]>({
    queryKey: ['parent-children'],
    queryFn: () => ParentService.getChildren(),
    staleTime: 30_000,
    refetchInterval: 30_000,
  });

  // Auto-select first child once loaded
  const effectiveChild = selectedChild ?? (children.length > 0 ? children[0].studentId : null);

  // Child detail queries — only the active tab fetches
  const { data: attendance = [], isLoading: attendanceLoading } = useQuery<AttendanceRecord[]>({
    queryKey: ['parent-attendance', effectiveChild],
    queryFn: () => ParentService.getChildAttendance(effectiveChild!),
    enabled: !!effectiveChild && activeTab === 'attendance',
    staleTime: 30_000,
  });
  const { data: fees = [], isLoading: feesLoading } = useQuery<FeeRecord[]>({
    queryKey: ['parent-fees', effectiveChild],
    queryFn: () => ParentService.getChildFees(effectiveChild!),
    enabled: !!effectiveChild && activeTab === 'fees',
    staleTime: 30_000,
  });
  const { data: results = [], isLoading: resultsLoading } = useQuery<ResultRecord[]>({
    queryKey: ['parent-results', effectiveChild],
    queryFn: () => ParentService.getChildResults(effectiveChild!),
    enabled: !!effectiveChild && activeTab === 'results',
    staleTime: 30_000,
  });
  const { data: events = [], isLoading: eventsLoading } = useQuery<EventRecord[]>({
    queryKey: ['parent-events'],
    queryFn: () => ParentService.getEvents(),
    enabled: activeTab === 'events',
    staleTime: 30_000,
  });

  const detailLoading = (activeTab === 'attendance' && attendanceLoading) ||
    (activeTab === 'fees' && feesLoading) ||
    (activeTab === 'results' && resultsLoading) ||
    (activeTab === 'events' && eventsLoading);

  const selectedChildData = children.find((c) => c.studentId === effectiveChild);

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-full">
          <div className="text-center">
            <div className="w-12 h-12 border-[3px] border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm text-slate-400">Loading parent portal...</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (children.length === 0) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center h-[60vh] text-center">
          <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center mb-4">
            <UserPlus className="w-8 h-8 text-blue-500" />
          </div>
          <h2 className="text-lg font-semibold text-slate-800 mb-2">No Children Linked</h2>
          <p className="text-sm text-slate-500 max-w-sm mb-6">
            You haven&apos;t linked any children to your account yet. Use an invite code from your school to get started.
          </p>
          <Link
            href="/parent/link"
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            <UserPlus className="w-4 h-4" />
            Link a Child
          </Link>
        </div>
      </DashboardLayout>
    );
  }

  const tabs = [
    { key: 'attendance' as const, label: 'Attendance', icon: ClipboardCheck },
    { key: 'fees' as const, label: 'Fees', icon: IndianRupee },
    { key: 'results' as const, label: 'Results', icon: FileText },
    { key: 'events' as const, label: 'Events', icon: CalendarDays },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-900">Parent Portal</h1>
            <p className="text-sm text-slate-500 mt-0.5">
              Welcome back, {user?.displayName?.split(' ')[0] ?? 'Parent'}
            </p>
          </div>
          <Link
            href="/parent/link"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors"
          >
            <UserPlus className="w-3.5 h-3.5" />
            Link Child
          </Link>
        </div>

        {/* Children selector grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {children.map((child) => (
            <ChildCard
              key={child.studentId}
              child={child}
              selected={effectiveChild === child.studentId}
              onClick={() => setSelectedChild(child.studentId)}
            />
          ))}
        </div>

        {/* Detail section */}
        {selectedChildData && (
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            {/* Child header */}
            <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/50">
              <div className="flex items-center gap-3">
                <GraduationCap className="w-5 h-5 text-blue-600" />
                <div>
                  <h2 className="text-sm font-semibold text-slate-900">{selectedChildData.name}</h2>
                  <p className="text-xs text-slate-500">
                    {selectedChildData.class} {selectedChildData.section}
                  </p>
                </div>
              </div>

              {/* Stat badges */}
              <div className="flex flex-wrap gap-2 mt-3">
                <StatBadge
                  icon={TrendingUp}
                  label="Attendance"
                  value={selectedChildData.attendanceRate !== null ? `${selectedChildData.attendanceRate}%` : 'N/A'}
                  color={selectedChildData.attendanceRate !== null && selectedChildData.attendanceRate >= 75 ? 'emerald' : 'amber'}
                />
                <StatBadge
                  icon={IndianRupee}
                  label="Pending Fees"
                  value={selectedChildData.pendingFees > 0 ? `₹${selectedChildData.pendingFees.toLocaleString()}` : '₹0'}
                  color={selectedChildData.pendingFees > 0 ? 'red' : 'emerald'}
                />
                <StatBadge
                  icon={FileText}
                  label="Last Score"
                  value={selectedChildData.lastExamScore ?? 'N/A'}
                  color="blue"
                />
              </div>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-slate-200 px-2">
              {tabs.map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`
                    flex items-center gap-1.5 px-4 py-3 text-xs font-medium border-b-2 transition-colors
                    ${activeTab === tab.key
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-slate-400 hover:text-slate-600'
                    }
                  `}
                >
                  <tab.icon className="w-3.5 h-3.5" />
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Tab content */}
            <div className="p-5 min-h-[200px]">
              {detailLoading ? (
                <div className="flex items-center justify-center py-12">
                  <RefreshCw className="w-5 h-5 text-slate-300 animate-spin" />
                </div>
              ) : (
                <>
                  {/* Attendance tab */}
                  {activeTab === 'attendance' && (
                    <div className="space-y-2">
                      {attendance.length === 0 ? (
                        <p className="text-sm text-slate-400 text-center py-8">No attendance records found</p>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="text-left text-xs text-slate-400 border-b border-slate-100">
                                <th className="pb-2 font-medium">Date</th>
                                <th className="pb-2 font-medium">Status</th>
                                <th className="pb-2 font-medium">Remarks</th>
                              </tr>
                            </thead>
                            <tbody>
                              {attendance.slice(0, 30).map((a) => (
                                <tr key={a.id} className="border-b border-slate-50 last:border-0">
                                  <td className="py-2.5 text-slate-700">{a.date}</td>
                                  <td className="py-2.5"><AttendanceStatusBadge status={a.status} /></td>
                                  <td className="py-2.5 text-slate-400 text-xs">{a.remarks ?? '—'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Fees tab */}
                  {activeTab === 'fees' && (
                    <div className="space-y-2">
                      {fees.length === 0 ? (
                        <p className="text-sm text-slate-400 text-center py-8">No fee records found</p>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="text-left text-xs text-slate-400 border-b border-slate-100">
                                <th className="pb-2 font-medium">Type</th>
                                <th className="pb-2 font-medium">Amount</th>
                                <th className="pb-2 font-medium">Due Date</th>
                                <th className="pb-2 font-medium">Status</th>
                              </tr>
                            </thead>
                            <tbody>
                              {fees.map((f) => (
                                <tr key={f.id} className="border-b border-slate-50 last:border-0">
                                  <td className="py-2.5 text-slate-700">{f.feeType}</td>
                                  <td className="py-2.5 font-semibold text-slate-800">₹{f.amount.toLocaleString()}</td>
                                  <td className="py-2.5 text-slate-500 text-xs">{f.dueDate}</td>
                                  <td className="py-2.5">
                                    <span className={`
                                      inline-flex rounded-full px-2 py-0.5 text-xs font-medium
                                      ${f.status === 'Paid' ? 'bg-emerald-50 text-emerald-600' :
                                        f.status === 'Overdue' ? 'bg-red-50 text-red-600' :
                                        'bg-amber-50 text-amber-600'}
                                    `}>
                                      {f.status}
                                    </span>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Results tab */}
                  {activeTab === 'results' && (
                    <div className="space-y-2">
                      {results.length === 0 ? (
                        <p className="text-sm text-slate-400 text-center py-8">No exam results found</p>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="text-left text-xs text-slate-400 border-b border-slate-100">
                                <th className="pb-2 font-medium">Exam</th>
                                <th className="pb-2 font-medium">Subject</th>
                                <th className="pb-2 font-medium">Marks</th>
                                <th className="pb-2 font-medium">Grade</th>
                              </tr>
                            </thead>
                            <tbody>
                              {results.map((r) => {
                                const pct = r.totalMarks > 0 ? Math.round((r.obtainedMarks / r.totalMarks) * 100) : 0;
                                return (
                                  <tr key={r.id} className="border-b border-slate-50 last:border-0">
                                    <td className="py-2.5">
                                      <p className="text-slate-700">{r.examName}</p>
                                      <p className="text-[10px] text-slate-400">{r.examType}</p>
                                    </td>
                                    <td className="py-2.5 text-slate-600">{r.subject}</td>
                                    <td className="py-2.5">
                                      <span className="font-semibold text-slate-800">{r.obtainedMarks}</span>
                                      <span className="text-slate-400">/{r.totalMarks}</span>
                                      <span className={`ml-1.5 text-xs font-medium ${
                                        pct >= 80 ? 'text-emerald-600' :
                                        pct >= 60 ? 'text-blue-600' :
                                        pct >= 40 ? 'text-amber-600' : 'text-red-600'
                                      }`}>
                                        ({pct}%)
                                      </span>
                                    </td>
                                    <td className="py-2.5">
                                      <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
                                        {r.grade ?? '—'}
                                      </span>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Events tab */}
                  {activeTab === 'events' && (
                    <div className="space-y-3">
                      {events.length === 0 ? (
                        <p className="text-sm text-slate-400 text-center py-8">No upcoming events</p>
                      ) : (
                        events.map((e) => (
                          <div key={e.id} className="flex gap-3 p-3 rounded-lg bg-slate-50 border border-slate-100">
                            <div className="w-10 h-10 rounded-lg bg-blue-100 text-blue-600 flex flex-col items-center justify-center text-[10px] font-bold shrink-0">
                              <span>{new Date(e.date).getDate()}</span>
                              <span className="uppercase">{new Date(e.date).toLocaleString('en', { month: 'short' })}</span>
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-slate-800">{e.title}</p>
                              <p className="text-xs text-slate-500 line-clamp-2">{e.description}</p>
                              <span className="inline-flex mt-1 rounded-full bg-blue-50 text-blue-600 px-2 py-0.5 text-[10px] font-medium">
                                {e.eventType}
                              </span>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
