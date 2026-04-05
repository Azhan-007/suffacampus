'use client';

import { useState } from 'react';
import { useAuthStore } from '@/store/authStore';
import {
  ScrollText,
  Building2,
  Search,
  ChevronRight,
} from 'lucide-react';

export default function SuperAdminAuditLogsPage() {
  const { availableSchools } = useAuthStore();
  const [searchTerm, setSearchTerm] = useState('');

  const filteredSchools = availableSchools.filter((s) =>
    s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.code.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* ── Header ────────────────────────────────── */}
      <div>
        <h1 className="text-3xl font-semibold text-slate-900 tracking-tight">Audit Logs</h1>
        <p className="text-base text-slate-500 mt-1">
          View activity logs for each school on the platform
        </p>
      </div>

      {/* ── Info Banner ───────────────────────────── */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-5">
        <div className="flex items-start gap-3">
          <ScrollText className="w-5 h-5 text-blue-600 mt-0.5 shrink-0" />
          <div>
            <h3 className="text-sm font-semibold text-blue-800">Platform Audit Trail</h3>
            <p className="text-sm text-blue-600 mt-1">
              Select a school below to view its detailed activity log. Each school maintains an independent audit trail
              of all user actions, logins, data changes, and system events.
            </p>
          </div>
        </div>
      </div>

      {/* ── Search ────────────────────────────────── */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
        <input
          type="text"
          placeholder="Search schools..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300 transition-colors"
        />
      </div>

      {/* ── School List ───────────────────────────── */}
      <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
        {filteredSchools.length === 0 ? (
          <div className="text-center py-16">
            <Building2 className="w-12 h-12 text-slate-200 mx-auto mb-3" />
            <p className="text-slate-500 font-medium">
              {availableSchools.length === 0 ? 'No schools registered yet' : 'No matching schools'}
            </p>
            <p className="text-sm text-slate-400 mt-1">
              {availableSchools.length === 0
                ? 'Create a school first to start collecting audit logs'
                : 'Try a different search term'}
            </p>
          </div>
        ) : (
          filteredSchools.map((school) => (
            <a
              key={school.id}
              href={`/settings/audit-logs?schoolId=${school.id}`}
              className="flex items-center justify-between px-5 py-4 hover:bg-slate-50 transition-colors group"
            >
              <div className="flex items-center gap-3">
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                  style={{ backgroundColor: school.primaryColor || '#6366f1' }}
                >
                  <Building2 className="w-5 h-5 text-white" />
                </div>
                <div>
                  <p className="font-medium text-slate-700 group-hover:text-blue-600 transition-colors">
                    {school.name}
                  </p>
                  <p className="text-sm text-slate-400">{school.code} &middot; {school.city}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 text-slate-300 group-hover:text-blue-500">
                <span className="text-sm hidden sm:inline">View Logs</span>
                <ChevronRight className="w-4 h-4" />
              </div>
            </a>
          ))
        )}
      </div>
    </div>
  );
}
