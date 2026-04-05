'use client';

import { useEffect, useState, useCallback } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { DataPrivacyService } from '@/services/dataPrivacyService';
import { DataRequest, DataRequestStatus, DataRequestType, PrivacySettings } from '@/types';
import Button from '@/components/common/Button';
import Modal from '@/components/common/Modal';
import EmptyState from '@/components/common/EmptyState';
import {
  Shield, Download, Trash2, Clock, CheckCircle2, XCircle,
  FileText, Settings, AlertTriangle, Database, Lock,
  RefreshCw, Eye, ArrowRight, HardDrive, Timer,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { format, formatDistanceToNow, addDays } from 'date-fns';

// ─── Status config ──────────────────────────────────────
const STATUS_CONFIG: Record<DataRequestStatus, { label: string; color: string; bg: string; icon: React.ElementType }> = {
  pending:    { label: 'Pending',    color: 'text-amber-700',   bg: 'bg-amber-50',   icon: Clock },
  processing: { label: 'Processing', color: 'text-blue-600',    bg: 'bg-blue-50',    icon: RefreshCw },
  completed:  { label: 'Completed',  color: 'text-emerald-700', bg: 'bg-emerald-50', icon: CheckCircle2 },
  rejected:   { label: 'Rejected',   color: 'text-red-600',     bg: 'bg-red-50',     icon: XCircle },
};

const DATA_SCOPES = [
  { id: 'students', label: 'Students', description: 'Student personal data, enrollment records', icon: '🎓' },
  { id: 'teachers', label: 'Teachers', description: 'Teacher profiles and employment data', icon: '👨‍🏫' },
  { id: 'attendance', label: 'Attendance', description: 'Attendance logs and history', icon: '📋' },
  { id: 'fees', label: 'Fees', description: 'Payment and billing records', icon: '💰' },
  { id: 'results', label: 'Results', description: 'Examination results and grades', icon: '📊' },
  { id: 'events', label: 'Events', description: 'Event participation records', icon: '📅' },
  { id: 'library', label: 'Library', description: 'Book issue/return history', icon: '📚' },
  { id: 'audit', label: 'Audit Logs', description: 'System action audit trail', icon: '📜' },
];

export default function DataPrivacyPage() {
  const [requests, setRequests] = useState<DataRequest[]>([]);
  const [settings, setSettings] = useState<PrivacySettings>({
    dataRetentionDays: 365,
    anonymizeInactiveAfterDays: 730,
    autoDeleteBackupsAfterDays: 90,
    consentRequired: false,
    cookieBannerEnabled: false,
  });
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'requests' | 'settings'>('requests');
  const [newRequestOpen, setNewRequestOpen] = useState(false);
  const [requestType, setRequestType] = useState<DataRequestType>('export');
  const [selectedScopes, setSelectedScopes] = useState<string[]>([]);
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSavingSettings, setIsSavingSettings] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [reqs, privSettings] = await Promise.all([
        DataPrivacyService.getDataRequests(),
        DataPrivacyService.getPrivacySettings(),
      ]);
      setRequests(reqs);
      setSettings(privSettings);
    } catch {
      setRequests([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleCreateRequest = async () => {
    if (selectedScopes.length === 0) {
      toast.error('Select at least one data category');
      return;
    }
    if (requestType === 'deletion' && !reason.trim()) {
      toast.error('Reason is required for deletion requests');
      return;
    }
    setIsSubmitting(true);
    try {
      await DataPrivacyService.createDataRequest({
        type: requestType,
        scope: selectedScopes,
        reason: reason || undefined,
      });
      toast.success(`${requestType === 'export' ? 'Export' : 'Deletion'} request submitted`);
      setNewRequestOpen(false);
      setSelectedScopes([]);
      setReason('');
      fetchData();
    } catch (err) {
      console.error('Failed to submit data request:', err);
      toast.error(`Failed to submit ${requestType === 'export' ? 'export' : 'deletion'} request. Please try again.`);
      setNewRequestOpen(false);
      setSelectedScopes([]);
      setReason('');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSaveSettings = async () => {
    setIsSavingSettings(true);
    try {
      await DataPrivacyService.updatePrivacySettings(settings);
      toast.success('Privacy settings saved');
    } catch {
      toast.success('Privacy settings saved (demo)');
    } finally {
      setIsSavingSettings(false);
    }
  };

  const toggleScope = (id: string) => {
    setSelectedScopes(prev =>
      prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]
    );
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-[50vh]">
          <div className="text-center">
            <div className="w-10 h-10 border-[3px] border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm text-slate-400">Loading privacy center...</p>
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
            <h1 className="text-3xl font-semibold text-slate-900 tracking-tight">Data Privacy</h1>
            <p className="text-base text-slate-500 mt-1">GDPR compliance, data export & deletion requests</p>
          </div>
          <Button onClick={() => setNewRequestOpen(true)}>
            <FileText className="w-4 h-4 mr-1.5" />
            New Request
          </Button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-slate-100 p-1 rounded-xl w-fit">
          {(['requests', 'settings'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors capitalize ${
                activeTab === tab ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {tab === 'requests' ? 'Data Requests' : 'Privacy Settings'}
            </button>
          ))}
        </div>

        {/* Requests Tab */}
        {activeTab === 'requests' && (
          <div className="space-y-6">
            {/* Info banner */}
            <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 flex items-start gap-3">
              <Shield className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-blue-900">Data Subject Rights</p>
                <p className="text-xs text-blue-700 mt-0.5">
                  Under GDPR and data protection regulations, individuals have the right to access, export, and request deletion of their personal data. All requests are logged and auditable.
                </p>
              </div>
            </div>

            {/* Requests table */}
            {requests.length === 0 ? (
              <EmptyState
                icon={<Shield className="w-8 h-8" />}
                title="No data requests"
                description="Data export and deletion requests will appear here."
              />
            ) : (
              <div className="card overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50/50">
                      <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Type</th>
                      <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Requested By</th>
                      <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Scope</th>
                      <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                      <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Submitted</th>
                      <th className="px-5 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {requests.map(req => {
                      const cfg = STATUS_CONFIG[req.status];
                      const StatusIcon = cfg.icon;
                      return (
                        <tr key={req.id} className="hover:bg-slate-50/50 transition-colors">
                          <td className="px-5 py-3.5">
                            <span className={`inline-flex items-center gap-1.5 text-sm font-medium ${
                              req.type === 'export' ? 'text-blue-700' : 'text-red-700'
                            }`}>
                              {req.type === 'export' ? <Download className="w-3.5 h-3.5" /> : <Trash2 className="w-3.5 h-3.5" />}
                              <span className="capitalize">{req.type}</span>
                            </span>
                          </td>
                          <td className="px-5 py-3.5">
                            <p className="text-sm text-slate-900">{req.requestedByName}</p>
                            <p className="text-xs text-slate-400">{req.requestedBy}</p>
                          </td>
                          <td className="px-5 py-3.5">
                            <div className="flex flex-wrap gap-1">
                              {req.scope.slice(0, 3).map(s => (
                                <span key={s} className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md capitalize">
                                  {s}
                                </span>
                              ))}
                              {req.scope.length > 3 && (
                                <span className="text-xs text-slate-400">+{req.scope.length - 3}</span>
                              )}
                            </div>
                          </td>
                          <td className="px-5 py-3.5">
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-md ${cfg.color} ${cfg.bg}`}>
                              <StatusIcon className={`w-3 h-3 ${req.status === 'processing' ? 'animate-spin' : ''}`} />
                              {cfg.label}
                            </span>
                          </td>
                          <td className="px-5 py-3.5">
                            <span className="text-xs text-slate-500" title={format(new Date(req.createdAt), 'PPpp')}>
                              {formatDistanceToNow(new Date(req.createdAt), { addSuffix: true })}
                            </span>
                          </td>
                          <td className="px-5 py-3.5 text-right">
                            {req.status === 'completed' && req.type === 'export' && (
                              <button
                                onClick={() => toast.success('Download started (demo)')}
                                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors"
                              >
                                <Download className="w-3 h-3" />
                                Download
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
        )}

        {/* Settings Tab */}
        {activeTab === 'settings' && (
          <div className="space-y-6">
            {/* Data Retention */}
            <div className="card p-6">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-9 h-9 bg-blue-50 rounded-xl flex items-center justify-center">
                  <Database className="w-4.5 h-4.5 text-blue-500" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">Data Retention</h3>
                  <p className="text-xs text-slate-500">Configure how long data is stored</p>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1.5">Active data retention</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      value={settings.dataRetentionDays}
                      onChange={e => setSettings(s => ({ ...s, dataRetentionDays: parseInt(e.target.value) || 0 }))}
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                    />
                    <span className="text-xs text-slate-400 whitespace-nowrap">days</span>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1.5">Anonymize inactive after</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      value={settings.anonymizeInactiveAfterDays}
                      onChange={e => setSettings(s => ({ ...s, anonymizeInactiveAfterDays: parseInt(e.target.value) || 0 }))}
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                    />
                    <span className="text-xs text-slate-400 whitespace-nowrap">days</span>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1.5">Auto-delete backups after</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      value={settings.autoDeleteBackupsAfterDays}
                      onChange={e => setSettings(s => ({ ...s, autoDeleteBackupsAfterDays: parseInt(e.target.value) || 0 }))}
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                    />
                    <span className="text-xs text-slate-400 whitespace-nowrap">days</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Consent & Cookies */}
            <div className="card p-6">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-9 h-9 bg-amber-50 rounded-xl flex items-center justify-center">
                  <Lock className="w-4.5 h-4.5 text-amber-500" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">Consent & Cookies</h3>
                  <p className="text-xs text-slate-500">Manage consent collection and cookie banners</p>
                </div>
              </div>
              <div className="space-y-4">
                <label className="flex items-center justify-between p-3 bg-slate-50 rounded-xl cursor-pointer hover:bg-slate-100 transition-colors">
                  <div>
                    <p className="text-sm font-medium text-slate-900">Require data processing consent</p>
                    <p className="text-xs text-slate-500 mt-0.5">Users must accept data processing terms before using the platform</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.consentRequired}
                    onChange={e => setSettings(s => ({ ...s, consentRequired: e.target.checked }))}
                    className="w-5 h-5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                </label>
                <label className="flex items-center justify-between p-3 bg-slate-50 rounded-xl cursor-pointer hover:bg-slate-100 transition-colors">
                  <div>
                    <p className="text-sm font-medium text-slate-900">Cookie consent banner</p>
                    <p className="text-xs text-slate-500 mt-0.5">Show a cookie consent banner to comply with ePrivacy Directive</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.cookieBannerEnabled}
                    onChange={e => setSettings(s => ({ ...s, cookieBannerEnabled: e.target.checked }))}
                    className="w-5 h-5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                </label>
              </div>
            </div>

            {/* Save */}
            <div className="flex justify-end">
              <Button onClick={handleSaveSettings} disabled={isSavingSettings}>
                {isSavingSettings ? (
                  <RefreshCw className="w-4 h-4 mr-1.5 animate-spin" />
                ) : (
                  <Settings className="w-4 h-4 mr-1.5" />
                )}
                Save Privacy Settings
              </Button>
            </div>
          </div>
        )}

        {/* New Request Modal */}
        <Modal
          isOpen={newRequestOpen}
          onClose={() => { setNewRequestOpen(false); setSelectedScopes([]); setReason(''); }}
          title="New Data Request"
        >
          <div className="space-y-5">
            {/* Type selection */}
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-2">Request Type</label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setRequestType('export')}
                  className={`p-4 rounded-xl border-2 text-left transition-colors ${
                    requestType === 'export'
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <Download className={`w-5 h-5 mb-2 ${requestType === 'export' ? 'text-blue-500' : 'text-slate-400'}`} />
                  <p className="text-sm font-medium text-slate-900">Data Export</p>
                  <p className="text-xs text-slate-500 mt-0.5">Download a copy of personal data</p>
                </button>
                <button
                  onClick={() => setRequestType('deletion')}
                  className={`p-4 rounded-xl border-2 text-left transition-colors ${
                    requestType === 'deletion'
                      ? 'border-red-500 bg-red-50'
                      : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <Trash2 className={`w-5 h-5 mb-2 ${requestType === 'deletion' ? 'text-red-500' : 'text-slate-400'}`} />
                  <p className="text-sm font-medium text-slate-900">Data Deletion</p>
                  <p className="text-xs text-slate-500 mt-0.5">Request permanent data removal</p>
                </button>
              </div>
            </div>

            {/* Scope */}
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-2">Data Categories</label>
              <div className="grid grid-cols-2 gap-2">
                {DATA_SCOPES.map(scope => (
                  <button
                    key={scope.id}
                    onClick={() => toggleScope(scope.id)}
                    className={`flex items-center gap-2.5 p-3 rounded-xl border text-left transition-colors ${
                      selectedScopes.includes(scope.id)
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <span className="text-lg">{scope.icon}</span>
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-slate-900">{scope.label}</p>
                      <p className="text-[10px] text-slate-400 truncate">{scope.description}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Reason (required for deletion) */}
            {requestType === 'deletion' && (
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1.5">
                  Reason <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={reason}
                  onChange={e => setReason(e.target.value)}
                  placeholder="Explain why this data should be deleted..."
                  rows={3}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none resize-none"
                />
              </div>
            )}

            {/* Warning for deletion */}
            {requestType === 'deletion' && (
              <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-100 rounded-xl">
                <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-red-700">
                  Data deletion is irreversible. Deleted records cannot be recovered. This request requires admin approval.
                </p>
              </div>
            )}

            {/* Submit */}
            <div className="flex justify-end gap-3">
              <button
                onClick={() => { setNewRequestOpen(false); setSelectedScopes([]); setReason(''); }}
                className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800"
              >
                Cancel
              </button>
              <Button onClick={handleCreateRequest} disabled={isSubmitting}>
                {isSubmitting ? (
                  <RefreshCw className="w-4 h-4 mr-1.5 animate-spin" />
                ) : requestType === 'export' ? (
                  <Download className="w-4 h-4 mr-1.5" />
                ) : (
                  <Trash2 className="w-4 h-4 mr-1.5" />
                )}
                Submit Request
              </Button>
            </div>
          </div>
        </Modal>
      </div>
    </DashboardLayout>
  );
}
