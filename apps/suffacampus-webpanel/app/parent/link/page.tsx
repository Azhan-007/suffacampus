'use client';

import { useState } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { ParentService } from '@/services/parentService';
import { UserPlus, ArrowLeft, CheckCircle2, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { getErrorMessage } from '@/lib/utils';

export default function LinkChildPage() {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = code.trim().toUpperCase();
    if (!trimmed) {
      toast.error('Please enter an invite code');
      return;
    }

    setLoading(true);
    try {
      await ParentService.linkChild(trimmed);
      setSuccess(true);
      toast.success('Child linked successfully!');
      setTimeout(() => router.push('/parent'), 2000);
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <div className="w-full max-w-md">
          {/* Back link */}
          <Link
            href="/parent"
            className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-600 transition-colors mb-6"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to Parent Portal
          </Link>

          <div className="bg-white rounded-xl border border-slate-200 p-6">
            {success ? (
              <div className="text-center py-6">
                <div className="w-14 h-14 bg-emerald-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <CheckCircle2 className="w-7 h-7 text-emerald-500" />
                </div>
                <h2 className="text-lg font-semibold text-slate-900 mb-1">Child Linked!</h2>
                <p className="text-sm text-slate-500">Redirecting to your portal...</p>
              </div>
            ) : (
              <>
                <div className="text-center mb-6">
                  <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center mx-auto mb-3">
                    <UserPlus className="w-6 h-6 text-blue-500" />
                  </div>
                  <h2 className="text-lg font-semibold text-slate-900">Link a Child</h2>
                  <p className="text-sm text-slate-500 mt-1">
                    Enter the invite code provided by your child&apos;s school
                  </p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <label htmlFor="inviteCode" className="block text-xs font-medium text-slate-500 mb-1.5">
                      Invite Code
                    </label>
                    <input
                      id="inviteCode"
                      type="text"
                      value={code}
                      onChange={(e) => setCode(e.target.value.toUpperCase())}
                      placeholder="e.g. A1B2C3"
                      maxLength={10}
                      autoFocus
                      className="w-full px-4 py-3 text-center text-lg font-mono tracking-[0.3em] rounded-lg border border-slate-200 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 outline-none transition-all placeholder:text-slate-300 placeholder:tracking-normal placeholder:font-sans placeholder:text-sm"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={loading || !code.trim()}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Linking...
                      </>
                    ) : (
                      <>
                        <UserPlus className="w-4 h-4" />
                        Link Child
                      </>
                    )}
                  </button>
                </form>

                <p className="text-[11px] text-slate-400 text-center mt-4">
                  Ask your school administrator for an invite code. Each code can only be used once and expires after 7 days.
                </p>
              </>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
