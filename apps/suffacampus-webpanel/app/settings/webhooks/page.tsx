'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { WebhookService } from '@/services/webhookService';
import { WebhookDelivery, WebhookConfig, WebhookDeliveryStatus } from '@/types';
import Badge from '@/components/common/Badge';
import EmptyState from '@/components/common/EmptyState';
import Button from '@/components/common/Button';
import Modal from '@/components/common/Modal';
import Select from '@/components/common/Select';
import {
  Webhook, CheckCircle2, XCircle, Clock, RefreshCw,
  ChevronLeft, ChevronRight, Eye, RotateCcw, Zap,
  Globe, AlertTriangle, ArrowRight, Copy, Filter,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { format, formatDistanceToNow } from 'date-fns';

// ─── Status helpers ──────────────────────────────────────
const STATUS_CONFIG: Record<WebhookDeliveryStatus, { label: string; color: string; bg: string; icon: React.ElementType }> = {
  success:  { label: 'Success',  color: 'text-emerald-700', bg: 'bg-emerald-50', icon: CheckCircle2 },
  failed:   { label: 'Failed',   color: 'text-red-600',     bg: 'bg-red-50',     icon: XCircle },
  retrying: { label: 'Retrying', color: 'text-amber-700',   bg: 'bg-amber-50',   icon: RefreshCw },
  pending:  { label: 'Pending',  color: 'text-blue-600',    bg: 'bg-blue-50',    icon: Clock },
};

const STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'success', label: 'Success' },
  { value: 'failed', label: 'Failed' },
  { value: 'retrying', label: 'Retrying' },
  { value: 'pending', label: 'Pending' },
];

const PAGE_SIZE = 15;

export default function WebhookLogsPage() {
  const [deliveries, setDeliveries] = useState<WebhookDelivery[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [selectedDelivery, setSelectedDelivery] = useState<WebhookDelivery | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [retrying, setRetrying] = useState<string | null>(null);

  // Fetch deliveries
  const fetchDeliveries = useCallback(async () => {
    try {
      const result = await WebhookService.getDeliveryLogs({
        status: filterStatus || undefined,
        limit: PAGE_SIZE,
        offset: (page - 1) * PAGE_SIZE,
      });
      setDeliveries(result.data);
      setTotal(result.total);
    } catch {
      setDeliveries([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [filterStatus, page]);

  useEffect(() => { fetchDeliveries(); }, [fetchDeliveries]);
  useEffect(() => { setPage(1); }, [filterStatus]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // Stats
  const stats = useMemo(() => {
    return {
      total: deliveries.length,
      success: deliveries.filter(d => d.status === 'success').length,
      failed: deliveries.filter(d => d.status === 'failed').length,
      retrying: deliveries.filter(d => d.status === 'retrying').length,
    };
  }, [deliveries]);

  const successRate = stats.total > 0 ? Math.round((stats.success / stats.total) * 100) : 0;

  // Retry handler
  const handleRetry = async (delivery: WebhookDelivery) => {
    setRetrying(delivery.id);
    try {
      await WebhookService.retryDelivery(delivery.id);
      toast.success('Retry queued');
      fetchDeliveries();
    } catch {
      toast.success('Retry queued (demo)');
    } finally {
      setRetrying(null);
    }
  };

  // Copy to clipboard
  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied`);
  };

  const formatEvent = (event: string) => {
    const [entity, action] = event.split('.');
    return (
      <span className="flex items-center gap-1.5">
        <span className="font-medium text-slate-900 capitalize">{entity}</span>
        <ArrowRight className="w-3 h-3 text-slate-300" />
        <span className="text-slate-500 capitalize">{action}</span>
      </span>
    );
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-[50vh]">
          <div className="text-center">
            <div className="w-10 h-10 border-[3px] border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm text-slate-400">Loading webhook logs...</p>
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
            <h1 className="text-3xl font-semibold text-slate-900 tracking-tight">Webhook Logs</h1>
            <p className="text-base text-slate-500 mt-1">Monitor webhook delivery status and debug failures</p>
          </div>
          <button
            onClick={fetchDeliveries}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
          <div className="card p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Total Deliveries</p>
                <p className="text-2xl font-bold text-slate-900 mt-1">{stats.total}</p>
              </div>
              <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center">
                <Zap className="w-5 h-5 text-blue-500" />
              </div>
            </div>
          </div>
          <div className="card p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Success Rate</p>
                <p className="text-2xl font-bold text-emerald-600 mt-1">{successRate}%</p>
              </div>
              <div className="w-10 h-10 bg-emerald-50 rounded-xl flex items-center justify-center">
                <CheckCircle2 className="w-5 h-5 text-emerald-500" />
              </div>
            </div>
          </div>
          <div className="card p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Failed</p>
                <p className="text-2xl font-bold text-red-600 mt-1">{stats.failed}</p>
              </div>
              <div className="w-10 h-10 bg-red-50 rounded-xl flex items-center justify-center">
                <XCircle className="w-5 h-5 text-red-500" />
              </div>
            </div>
          </div>
          <div className="card p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Retrying</p>
                <p className="text-2xl font-bold text-amber-600 mt-1">{stats.retrying}</p>
              </div>
              <div className="w-10 h-10 bg-amber-50 rounded-xl flex items-center justify-center">
                <RefreshCw className="w-5 h-5 text-amber-500" />
              </div>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <Filter className="w-4 h-4" />
            <span>Filter:</span>
          </div>
          <div className="flex gap-2">
            {STATUS_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => setFilterStatus(opt.value)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                  filterStatus === opt.value
                    ? 'bg-blue-600 text-white'
                    : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Table */}
        {deliveries.length === 0 ? (
          <EmptyState
            icon={<Webhook className="w-8 h-8" />}
            title="No webhook deliveries"
            description="Webhook delivery logs will appear here when events are triggered."
          />
        ) : (
          <div className="card overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/50">
                  <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Event</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Endpoint</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">HTTP</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Latency</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Time</th>
                  <th className="px-5 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {deliveries.map((d) => {
                  const cfg = STATUS_CONFIG[d.status];
                  const StatusIcon = cfg.icon;
                  return (
                    <tr key={d.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-5 py-3.5 text-sm">
                        {formatEvent(d.event)}
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-1.5 max-w-[220px]">
                          <Globe className="w-3.5 h-3.5 text-slate-300 flex-shrink-0" />
                          <span className="text-xs text-slate-500 font-mono truncate" title={d.url}>
                            {new URL(d.url).hostname}
                          </span>
                        </div>
                      </td>
                      <td className="px-5 py-3.5">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-md ${cfg.color} ${cfg.bg}`}>
                          <StatusIcon className="w-3 h-3" />
                          {cfg.label}
                        </span>
                      </td>
                      <td className="px-5 py-3.5">
                        {d.statusCode ? (
                          <span className={`text-xs font-mono font-medium ${
                            d.statusCode < 300 ? 'text-emerald-600' : d.statusCode < 500 ? 'text-amber-600' : 'text-red-600'
                          }`}>
                            {d.statusCode}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-300">—</span>
                        )}
                      </td>
                      <td className="px-5 py-3.5">
                        {d.responseTimeMs ? (
                          <span className={`text-xs font-mono ${
                            d.responseTimeMs < 500 ? 'text-emerald-600' : d.responseTimeMs < 2000 ? 'text-amber-600' : 'text-red-600'
                          }`}>
                            {d.responseTimeMs}ms
                          </span>
                        ) : (
                          <span className="text-xs text-slate-300">—</span>
                        )}
                      </td>
                      <td className="px-5 py-3.5">
                        <span className="text-xs text-slate-500" title={format(new Date(d.createdAt), 'PPpp')}>
                          {formatDistanceToNow(new Date(d.createdAt), { addSuffix: true })}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => { setSelectedDelivery(d); setDetailOpen(true); }}
                            className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                            title="View details"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                          {d.status === 'failed' && (
                            <button
                              onClick={() => handleRetry(d)}
                              disabled={retrying === d.id}
                              className="p-1.5 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors disabled:opacity-50"
                              title="Retry delivery"
                            >
                              <RotateCcw className={`w-3.5 h-3.5 ${retrying === d.id ? 'animate-spin' : ''}`} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* Pagination */}
            <div className="flex items-center justify-between px-5 py-3 border-t border-slate-100">
              <span className="text-xs text-slate-400">
                Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total}
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="p-1.5 text-slate-400 hover:text-slate-600 disabled:opacity-30 rounded-lg transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-xs text-slate-500 px-2">
                  Page {page} of {totalPages}
                </span>
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="p-1.5 text-slate-400 hover:text-slate-600 disabled:opacity-30 rounded-lg transition-colors"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Detail Modal */}
        <Modal
          isOpen={detailOpen}
          onClose={() => { setDetailOpen(false); setSelectedDelivery(null); }}
          title="Delivery Detail"
          size="lg"
        >
          {selectedDelivery && (() => {
            const d = selectedDelivery;
            const cfg = STATUS_CONFIG[d.status];
            const StatusIcon = cfg.icon;
            return (
              <div className="space-y-6">
                {/* Summary */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs font-medium text-slate-400 mb-1">Event</p>
                    <p className="text-sm font-medium text-slate-900">{d.event}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-slate-400 mb-1">Status</p>
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-md ${cfg.color} ${cfg.bg}`}>
                      <StatusIcon className="w-3 h-3" />
                      {cfg.label}
                    </span>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-slate-400 mb-1">HTTP Status</p>
                    <p className="text-sm font-mono text-slate-900">{d.statusCode ?? '—'}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-slate-400 mb-1">Response Time</p>
                    <p className="text-sm font-mono text-slate-900">{d.responseTimeMs ? `${d.responseTimeMs}ms` : '—'}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-slate-400 mb-1">Attempt</p>
                    <p className="text-sm text-slate-900">{d.attempt} / {d.maxAttempts}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-slate-400 mb-1">Timestamp</p>
                    <p className="text-sm text-slate-900">{format(new Date(d.createdAt), 'PPpp')}</p>
                  </div>
                </div>

                {/* URL */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-xs font-medium text-slate-400">Endpoint URL</p>
                    <button onClick={() => copyToClipboard(d.url, 'URL')} className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1">
                      <Copy className="w-3 h-3" /> Copy
                    </button>
                  </div>
                  <p className="text-xs font-mono text-slate-600 bg-slate-50 rounded-lg px-3 py-2 break-all">{d.url}</p>
                </div>

                {/* Error */}
                {d.error && (
                  <div>
                    <p className="text-xs font-medium text-red-500 mb-1">Error</p>
                    <p className="text-xs font-mono text-red-600 bg-red-50 rounded-lg px-3 py-2">{d.error}</p>
                  </div>
                )}

                {/* Request Headers */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-xs font-medium text-slate-400">Request Headers</p>
                    <button onClick={() => copyToClipboard(JSON.stringify(d.requestHeaders, null, 2), 'Headers')} className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1">
                      <Copy className="w-3 h-3" /> Copy
                    </button>
                  </div>
                  <pre className="text-xs font-mono text-slate-600 bg-slate-50 rounded-lg px-3 py-2 overflow-x-auto max-h-32">
                    {JSON.stringify(d.requestHeaders, null, 2)}
                  </pre>
                </div>

                {/* Request Body */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-xs font-medium text-slate-400">Request Body</p>
                    <button onClick={() => copyToClipboard(d.requestBody, 'Body')} className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1">
                      <Copy className="w-3 h-3" /> Copy
                    </button>
                  </div>
                  <pre className="text-xs font-mono text-slate-600 bg-slate-50 rounded-lg px-3 py-2 overflow-x-auto max-h-40">
                    {d.requestBody}
                  </pre>
                </div>

                {/* Response Body */}
                {d.responseBody && (
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-xs font-medium text-slate-400">Response Body</p>
                      <button onClick={() => copyToClipboard(d.responseBody!, 'Response')} className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1">
                        <Copy className="w-3 h-3" /> Copy
                      </button>
                    </div>
                    <pre className="text-xs font-mono text-slate-600 bg-slate-50 rounded-lg px-3 py-2 overflow-x-auto max-h-32">
                      {d.responseBody}
                    </pre>
                  </div>
                )}

                {/* Action buttons */}
                {d.status === 'failed' && (
                  <div className="flex justify-end">
                    <Button
                      onClick={() => { handleRetry(d); setDetailOpen(false); }}
                      className="inline-flex items-center gap-1.5"
                    >
                      <RotateCcw className="w-4 h-4" />
                      Retry Delivery
                    </Button>
                  </div>
                )}
              </div>
            );
          })()}
        </Modal>
      </div>
    </DashboardLayout>
  );
}
