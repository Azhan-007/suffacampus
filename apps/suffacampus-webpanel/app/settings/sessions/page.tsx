'use client';

import { useEffect, useState, useCallback } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { SessionService } from '@/services/sessionService';
import { UserSession } from '@/types';
import Button from '@/components/common/Button';
import {
  Monitor, Smartphone, Tablet, Globe, MapPin, Clock,
  Shield, LogOut, AlertTriangle, CheckCircle2, RefreshCw,
  Laptop, Chrome,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { format, formatDistanceToNow } from 'date-fns';
import ConfirmDialog from '@/components/common/ConfirmDialog';

// ─── Device icon resolver ────────────────────────────────
function DeviceIcon({ device }: { device: string }) {
  const d = device.toLowerCase();
  if (d.includes('mobile') || d.includes('iphone') || d.includes('android'))
    return <Smartphone className="w-5 h-5" />;
  if (d.includes('tablet') || d.includes('ipad'))
    return <Tablet className="w-5 h-5" />;
  if (d.includes('laptop'))
    return <Laptop className="w-5 h-5" />;
  return <Monitor className="w-5 h-5" />;
}

function BrowserBadge({ browser }: { browser: string }) {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium bg-slate-100 text-slate-600 rounded-md">
      <Globe className="w-2.5 h-2.5" />
      {browser}
    </span>
  );
}

export default function SessionsPage() {
  const [sessions, setSessions] = useState<UserSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [revokeAllOpen, setRevokeAllOpen] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const fetchSessions = useCallback(async () => {
    try {
      const data = await SessionService.getSessions();
      setSessions(data);
    } catch {
      setSessions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchSessions(); }, [fetchSessions]);

  const handleRevoke = async (id: string) => {
    setRevokingId(id);
    try {
      await SessionService.revokeSession(id);
      setSessions(prev => prev.filter(s => s.id !== id));
      toast.success('Session revoked');
    } catch {
      toast.error('Failed to revoke session');
    } finally {
      setRevokingId(null);
    }
  };

  const handleRevokeAll = async () => {
    try {
      await SessionService.revokeAllOtherSessions();
      setSessions(prev => prev.filter(s => s.isCurrent));
      toast.success('All other sessions revoked');
    } catch {
      toast.error('Failed to revoke sessions');
    }
    setRevokeAllOpen(false);
  };

  const currentSession = sessions.find(s => s.isCurrent);
  const otherSessions = sessions.filter(s => !s.isCurrent);

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-[50vh]">
          <div className="text-center">
            <div className="w-10 h-10 border-[3px] border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm text-slate-400">Loading sessions...</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-semibold text-slate-900 tracking-tight">Active Sessions</h1>
            <p className="text-base text-slate-500 mt-1">Manage devices and sessions signed into your account</p>
          </div>
          {otherSessions.length > 0 && (
            <Button variant="danger" onClick={() => setRevokeAllOpen(true)}>
              <LogOut className="w-4 h-4 mr-1.5" />
              Revoke All Others
            </Button>
          )}
        </div>

        {/* Current Session */}
        {currentSession && (
          <div className="card p-6 border-2 border-green-200 bg-green-50/30">
            <div className="flex items-center gap-2 mb-4">
              <CheckCircle2 className="w-4 h-4 text-green-600" />
              <span className="text-xs font-semibold text-green-700 uppercase tracking-wider">Current Session</span>
            </div>
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center text-green-600">
                <DeviceIcon device={currentSession.device} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-lg font-semibold text-slate-900">{currentSession.device}</p>
                <div className="flex flex-wrap items-center gap-3 mt-1.5">
                  <BrowserBadge browser={currentSession.browser} />
                  <span className="text-xs text-slate-500">{currentSession.os}</span>
                  <span className="text-xs text-slate-400">•</span>
                  <span className="inline-flex items-center gap-1 text-xs text-slate-500">
                    <MapPin className="w-3 h-3" />
                    {currentSession.location || 'Unknown'}
                  </span>
                  <span className="text-xs text-slate-400">•</span>
                  <span className="text-xs text-slate-500">IP: {currentSession.ipAddress}</span>
                </div>
                <p className="text-xs text-green-600 font-medium mt-2 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                  Active now
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Other Sessions */}
        {otherSessions.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold text-slate-900 mb-3">
              Other Sessions ({otherSessions.length})
            </h2>
            <div className="space-y-3">
              {otherSessions.map(session => (
                <div key={session.id} className="card p-5 hover:shadow-md transition-shadow">
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center text-slate-500">
                      <DeviceIcon device={session.device} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-900">{session.device}</p>
                      <div className="flex flex-wrap items-center gap-2 mt-1">
                        <BrowserBadge browser={session.browser} />
                        <span className="text-xs text-slate-500">{session.os}</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-slate-400">
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="w-3 h-3" />
                          {session.location || 'Unknown'}
                        </span>
                        <span>•</span>
                        <span>IP: {session.ipAddress}</span>
                        <span>•</span>
                        <span className="inline-flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          Active {formatDistanceToNow(new Date(session.lastActiveAt), { addSuffix: true })}
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={() => handleRevoke(session.id)}
                      disabled={revokingId === session.id}
                      className="flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-600 bg-red-50 rounded-lg hover:bg-red-100 transition-colors disabled:opacity-50"
                    >
                      {revokingId === session.id ? (
                        <RefreshCw className="w-3 h-3 animate-spin" />
                      ) : (
                        <LogOut className="w-3 h-3" />
                      )}
                      Revoke
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {otherSessions.length === 0 && currentSession && (
          <div className="card p-8 text-center">
            <Shield className="w-10 h-10 text-green-500 mx-auto mb-3" />
            <p className="text-sm font-medium text-slate-900">Only this session is active</p>
            <p className="text-xs text-slate-500 mt-1">No other devices are signed into your account</p>
          </div>
        )}

        {/* Security tip */}
        <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-amber-900">Security Tip</p>
            <p className="text-xs text-amber-700 mt-0.5">
              If you see a device or location you don&apos;t recognize, revoke that session immediately and change your password.
            </p>
          </div>
        </div>
      </div>

      {/* Confirm revoke all */}
      <ConfirmDialog
        isOpen={revokeAllOpen}
        onClose={() => setRevokeAllOpen(false)}
        onConfirm={handleRevokeAll}
        title="Revoke All Other Sessions?"
        message="This will sign out all other devices. You will remain signed in on this device only."
        confirmText="Revoke All"
        type="danger"
      />
    </DashboardLayout>
  );
}
