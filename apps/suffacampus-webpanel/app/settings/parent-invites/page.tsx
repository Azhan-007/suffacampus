'use client';

import { useEffect, useState, useCallback } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { ParentService, ParentInvite } from '@/services/parentService';
import { StudentService } from '@/services/studentService';
import { Student } from '@/types';
import { useAuthStore } from '@/store/authStore';
import {
  UserPlus,
  Copy,
  CheckCircle2,
  RefreshCw,
  Clock,
  Search,
  Users,
  ArrowLeft,
  Loader2,
  XCircle,
} from 'lucide-react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { getErrorMessage } from '@/lib/utils';

/* ------------------------------------------------------------------ */
/*  Student picker for invite generation                               */
/* ------------------------------------------------------------------ */

interface StudentOption {
  id: string;
  name: string;
  class?: string;
  section?: string;
  rollNumber?: string;
}

function StudentPicker({
  onSelect,
  disabled,
  schoolId,
}: {
  onSelect: (student: StudentOption) => void;
  disabled: boolean;
  schoolId: string;
}) {
  const [query, setQuery] = useState('');
  const [students, setStudents] = useState<StudentOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  const search = useCallback(async (q: string) => {
    if (q.length < 2) { setStudents([]); return; }
    setLoading(true);
    try {
      const data = await StudentService.getStudents(schoolId);
      const filtered = data.filter((s: Student) =>
        `${s.firstName} ${s.lastName}`.toLowerCase().includes(q.toLowerCase()) ||
        s.rollNumber?.toLowerCase().includes(q.toLowerCase())
      ).slice(0, 8);
      setStudents(
        filtered.map((s: Student) => ({
          id: s.id,
          name: `${s.firstName} ${s.lastName}`,
          class: s.classId,
          section: s.sectionId,
          rollNumber: s.rollNumber,
        }))
      );
    } catch {
      setStudents([]);
    } finally {
      setLoading(false);
    }
  }, [schoolId]);

  useEffect(() => {
    const t = setTimeout(() => search(query), 250);
    return () => clearTimeout(t);
  }, [query, search]);

  return (
    <div className="relative">
      <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-100">
        <Search className="w-4 h-4 text-slate-400 shrink-0" />
        <input
          type="text"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder="Search student by name or roll number..."
          disabled={disabled}
          className="flex-1 text-sm text-slate-700 placeholder:text-slate-400 outline-none bg-transparent disabled:opacity-50"
        />
        {loading && <Loader2 className="w-4 h-4 text-slate-300 animate-spin" />}
      </div>

      {open && students.length > 0 && (
        <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
          {students.map((s) => (
            <button
              key={s.id}
              onClick={() => { onSelect(s); setQuery(s.name); setOpen(false); }}
              className="w-full text-left flex items-center gap-2 px-3 py-2.5 hover:bg-slate-50 transition-colors border-b border-slate-50 last:border-0"
            >
              <div className="w-7 h-7 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center text-xs font-bold shrink-0">
                {s.name.charAt(0)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-slate-700 truncate">{s.name}</p>
                <p className="text-xs text-slate-400">
                  {s.class} {s.section} {s.rollNumber ? `• Roll ${s.rollNumber}` : ''}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main page                                                          */
/* ------------------------------------------------------------------ */

export default function ParentInvitesPage() {
  const { currentSchool } = useAuthStore();
  const [invites, setInvites] = useState<ParentInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [selectedStudent, setSelectedStudent] = useState<StudentOption | null>(null);

  const fetchInvites = useCallback(async () => {
    try {
      const data = await ParentService.getInvites();
      setInvites(data);
    } catch {
      // Silent — may fail in demo mode
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchInvites(); }, [fetchInvites]);

  const generateInvite = async () => {
    if (!selectedStudent) {
      toast.error('Please select a student first');
      return;
    }
    setGenerating(true);
    try {
      const invite = await ParentService.createInvite(selectedStudent.id);
      toast.success(`Invite code generated: ${invite.code}`);
      setSelectedStudent(null);
      fetchInvites();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setGenerating(false);
    }
  };

  const copyCode = async (code: string, id: string) => {
    await navigator.clipboard.writeText(code);
    setCopiedId(id);
    toast.success('Code copied to clipboard');
    setTimeout(() => setCopiedId(null), 2000);
  };

  const isExpired = (expiresAt: string) => new Date(expiresAt) < new Date();

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
            <h1 className="text-xl font-bold text-slate-900">Parent Invite Codes</h1>
            <p className="text-sm text-slate-500 mt-0.5">
              Generate invite codes that parents can use to link their accounts with students
            </p>
          </div>
          <button
            onClick={fetchInvites}
            className="p-2 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
            title="Refresh"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        {/* Generate new invite */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h2 className="text-sm font-semibold text-slate-800 mb-3 flex items-center gap-2">
            <UserPlus className="w-4 h-4 text-blue-500" />
            Generate New Invite Code
          </h2>
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1">
              <StudentPicker
                onSelect={setSelectedStudent}
                disabled={generating}
                schoolId={currentSchool?.id ?? ''}
              />
              {selectedStudent && (
                <p className="text-xs text-emerald-600 mt-1.5 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" />
                  Selected: {selectedStudent.name}
                  {selectedStudent.class ? ` (${selectedStudent.class} ${selectedStudent.section ?? ''})` : ''}
                </p>
              )}
            </div>
            <button
              onClick={generateInvite}
              disabled={generating || !selectedStudent}
              className="shrink-0 flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {generating ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <UserPlus className="w-4 h-4" />
              )}
              Generate Code
            </button>
          </div>
        </div>

        {/* Active invites list */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100">
            <h2 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
              <Users className="w-4 h-4 text-slate-500" />
              Active Invites
              <span className="text-xs text-slate-400 font-normal">({invites.length})</span>
            </h2>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="w-5 h-5 text-slate-300 animate-spin" />
            </div>
          ) : invites.length === 0 ? (
            <div className="py-12 text-center">
              <UserPlus className="w-8 h-8 text-slate-200 mx-auto mb-2" />
              <p className="text-sm text-slate-400">No active invites</p>
              <p className="text-xs text-slate-300 mt-1">Generate a code above to get started</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-slate-400 border-b border-slate-100 bg-slate-50/50">
                    <th className="px-5 py-2.5 font-medium">Code</th>
                    <th className="px-5 py-2.5 font-medium">Student</th>
                    <th className="px-5 py-2.5 font-medium">Created</th>
                    <th className="px-5 py-2.5 font-medium">Expires</th>
                    <th className="px-5 py-2.5 font-medium">Status</th>
                    <th className="px-5 py-2.5 font-medium w-20"></th>
                  </tr>
                </thead>
                <tbody>
                  {invites.map((invite) => {
                    const expired = isExpired(invite.expiresAt);
                    const redeemed = !!invite.redeemedBy;
                    return (
                      <tr key={invite.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/50">
                        <td className="px-5 py-3">
                          <code className="px-2 py-1 bg-slate-100 rounded text-xs font-mono font-bold text-slate-700 tracking-widest">
                            {invite.code}
                          </code>
                        </td>
                        <td className="px-5 py-3 text-slate-700">
                          {invite.studentName ?? invite.studentId}
                        </td>
                        <td className="px-5 py-3 text-slate-500 text-xs">
                          {new Date(invite.createdAt).toLocaleDateString()}
                        </td>
                        <td className="px-5 py-3 text-xs">
                          <span className={`flex items-center gap-1 ${expired ? 'text-red-500' : 'text-slate-500'}`}>
                            <Clock className="w-3 h-3" />
                            {new Date(invite.expiresAt).toLocaleDateString()}
                          </span>
                        </td>
                        <td className="px-5 py-3">
                          {redeemed ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 text-emerald-600 px-2 py-0.5 text-xs font-medium">
                              <CheckCircle2 className="w-3 h-3" /> Redeemed
                            </span>
                          ) : expired ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-red-50 text-red-500 px-2 py-0.5 text-xs font-medium">
                              <XCircle className="w-3 h-3" /> Expired
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 text-blue-600 px-2 py-0.5 text-xs font-medium">
                              <Clock className="w-3 h-3" /> Active
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-3">
                          {!redeemed && !expired && (
                            <button
                              onClick={() => copyCode(invite.code, invite.id)}
                              className="p-1.5 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
                              title="Copy code"
                            >
                              {copiedId === invite.id ? (
                                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                              ) : (
                                <Copy className="w-4 h-4" />
                              )}
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
