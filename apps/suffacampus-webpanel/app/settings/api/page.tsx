'use client';

import { useState, useMemo, useCallback } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { ApiKeyService, PERMISSION_GROUPS } from '@/services/apiKeyService';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  API_ENDPOINTS,
  getApiCategories,
  getEndpointsByCategory,
  METHOD_COLORS,
  generateCurl,
  generateJsCode,
  generatePythonCode,
  WEBHOOK_EVENTS,
  API_BASE_URL,
} from '@/lib/apiDocs';
import { useAuthStore } from '@/store/authStore';

import {
  ApiKey,
  ApiUsageStats,
  ApiPermission,
  ApiEndpointDoc,
  WebhookConfig,
} from '@/types';
import Button from '@/components/common/Button';
import Modal from '@/components/common/Modal';
import Input from '@/components/common/Input';
import EmptyState from '@/components/common/EmptyState';
import toast from 'react-hot-toast';
import { getErrorMessage } from '@/lib/utils';
import { format } from 'date-fns';
import {
  Key,
  BookOpen,
  Play,
  Webhook,
  Plus,
  Copy,
  Trash2,
  Eye,
  EyeOff,
  Shield,
  Clock,
  Activity,
  Zap,
  Code2,
  Terminal,
  ChevronDown,
  ChevronRight,
  Search,
  AlertTriangle,
  CheckCircle,
  XCircle,
  ExternalLink,
  RotateCw,
  Send,
  Globe,
  Lock,
  Hash,
  BarChart3,
  TrendingUp,
  Server,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

// =============================================================================
// Types
// =============================================================================

type ActiveTab = 'docs' | 'keys' | 'playground' | 'webhooks';

const TABS: { id: ActiveTab; label: string; icon: React.ElementType }[] = [
  { id: 'docs', label: 'Documentation', icon: BookOpen },
  { id: 'keys', label: 'API Keys', icon: Key },
  { id: 'playground', label: 'Playground', icon: Play },
  { id: 'webhooks', label: 'Webhooks', icon: Webhook },
];

// =============================================================================
// Main Page Component
// =============================================================================

export default function ApiPage() {
  const { currentSchool, user } = useAuthStore();
  const schoolId = currentSchool?.id || user?.schoolId || '';
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<ActiveTab>('docs');

  // â”€â”€ Data fetching via React Query â”€â”€
  const { data: apiKeys = [], isLoading: keysLoading } = useQuery<ApiKey[]>({
    queryKey: ['api-keys', schoolId],
    queryFn: () => ApiKeyService.getApiKeys(schoolId),
    staleTime: 30_000,
  });
  const { data: usageStats = null, isLoading: statsLoading } = useQuery<ApiUsageStats | null>({
    queryKey: ['api-usage', schoolId],
    queryFn: () => ApiKeyService.getUsageStats(schoolId),
    staleTime: 30_000,
  });
  const { data: webhooks = [], isLoading: webhooksLoading } = useQuery<WebhookConfig[]>({
    queryKey: ['api-webhooks', schoolId],
    queryFn: () => ApiKeyService.getWebhooks(schoolId),
    staleTime: 30_000,
  });
  const loading = keysLoading || statsLoading || webhooksLoading;

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-full">
          <div className="text-center">
            <div className="w-12 h-12 border-[3px] border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm text-slate-400">Loading API console...</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-semibold text-slate-900 tracking-tight">
              API & Integrations
            </h1>
            <p className="text-base text-slate-500 mt-1">
              Manage API keys, explore endpoints, and configure webhooks
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 border border-emerald-200 rounded-lg text-xs font-medium text-emerald-700">
              <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
              API v1 Active
            </span>
          </div>
        </div>

        {/* Usage Stats Cards */}
        {usageStats && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <MiniStat
              label="Total Requests"
              value={usageStats.totalRequests.toLocaleString()}
              icon={Activity}
              color="blue"
            />
            <MiniStat
              label="Today"
              value={usageStats.requestsToday.toLocaleString()}
              icon={Zap}
              color="emerald"
            />
            <MiniStat
              label="Avg Response"
              value={`${usageStats.avgResponseTime}ms`}
              icon={Clock}
              color="violet"
            />
            <MiniStat
              label="Error Rate"
              value={`${usageStats.errorRate}%`}
              icon={AlertTriangle}
              color={usageStats.errorRate > 5 ? 'rose' : 'amber'}
            />
          </div>
        )}

        {/* Tabs */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden" style={{ boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}>
          <div className="border-b border-slate-200 px-5">
            <div className="flex gap-0">
              {TABS.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-4 py-3.5 text-sm font-medium border-b-2 transition-all ${
                    activeTab === tab.id
                      ? 'text-blue-600 border-blue-600'
                      : 'text-slate-500 border-transparent hover:text-slate-700 hover:border-slate-300'
                  }`}
                >
                  <tab.icon className="w-4 h-4" />
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          <div className="p-5">
            {activeTab === 'docs' && <DocsTab />}
            {activeTab === 'keys' && (
              <KeysTab
                apiKeys={apiKeys}
                schoolId={schoolId}
              />
            )}
            {activeTab === 'playground' && <PlaygroundTab schoolId={schoolId} />}
            {activeTab === 'webhooks' && (
              <WebhooksTab
                webhooks={webhooks}
                schoolId={schoolId}
              />
            )}
          </div>
        </div>

        {/* Usage Chart */}
        {usageStats && (
          <div
            className="bg-white rounded-xl border border-slate-200 overflow-hidden"
            style={{ boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}
          >
            <div className="px-5 py-3.5 border-b border-slate-100 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-blue-600" />
              <h3 className="text-[14px] font-semibold text-slate-700">
                API Usage â€” Last 30 Days
              </h3>
            </div>
            <div className="p-5">
              <div className="h-[200px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={usageStats.dailyUsage}>
                    <defs>
                      <linearGradient id="colorReqs" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#2563EB" stopOpacity={0.15} />
                        <stop offset="95%" stopColor="#2563EB" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 11, fill: '#94a3b8' }}
                      tickFormatter={(v: string) => v.slice(5)}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: '#94a3b8' }}
                      axisLine={false}
                      tickLine={false}
                      width={40}
                    />
                    <Tooltip
                      contentStyle={{
                        background: '#1e293b',
                        border: 'none',
                        borderRadius: 8,
                        fontSize: 12,
                        color: '#f8fafc',
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="requests"
                      stroke="#2563EB"
                      strokeWidth={2}
                      fill="url(#colorReqs)"
                      dot={false}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              {/* Top Endpoints */}
              <div className="mt-4 pt-4 border-t border-slate-100">
                <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
                  Top Endpoints
                </h4>
                <div className="space-y-2">
                  {usageStats.topEndpoints.map((ep) => (
                    <div
                      key={ep.endpoint}
                      className="flex items-center gap-3"
                    >
                      <code className="text-xs font-mono text-slate-600 flex-1 truncate">
                        {ep.endpoint}
                      </code>
                      <span className="text-xs text-slate-400 tabular-nums">
                        {ep.count.toLocaleString()} calls
                      </span>
                      <span className="text-xs text-slate-400 tabular-nums">
                        ~{ep.avgTime}ms
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

// =============================================================================
// Mini Stat Card
// =============================================================================

function MiniStat({
  label,
  value,
  icon: Icon,
  color,
}: {
  label: string;
  value: string;
  icon: React.ElementType;
  color: string;
}) {
  const colorMap: Record<string, string> = {
    blue: 'bg-blue-50 text-blue-600',
    emerald: 'bg-emerald-50 text-emerald-600',
    violet: 'bg-violet-50 text-violet-600',
    amber: 'bg-amber-50 text-amber-600',
    rose: 'bg-red-50 text-red-600',
  };

  return (
    <div
      className="bg-white rounded-xl border border-slate-200 p-4"
      style={{ boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}
    >
      <div className="flex items-center gap-3">
        <div
          className={`w-9 h-9 rounded-lg flex items-center justify-center ${colorMap[color] || colorMap.blue}`}
        >
          <Icon className="w-4.5 h-4.5" />
        </div>
        <div>
          <p className="text-xs font-medium text-slate-400">{label}</p>
          <p className="text-lg font-bold text-slate-800">{value}</p>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// Documentation Tab
// =============================================================================

function DocsTab() {
  const categories = useMemo(() => getApiCategories(), []);
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedEndpoint, setExpandedEndpoint] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [codeTab, setCodeTab] = useState<'curl' | 'javascript' | 'python'>('curl');

  const filteredEndpoints = useMemo(() => {
    let eps = selectedCategory
      ? getEndpointsByCategory(selectedCategory)
      : API_ENDPOINTS;
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      eps = eps.filter(
        (e) =>
          e.summary.toLowerCase().includes(q) ||
          e.path.toLowerCase().includes(q) ||
          e.description.toLowerCase().includes(q)
      );
    }
    return eps;
  }, [selectedCategory, searchTerm]);

  const toggleEndpoint = (key: string) => {
    setExpandedEndpoint((prev) => (prev === key ? null : key));
  };

  return (
    <div className="space-y-5">
      {/* Auth Info Banner */}
      <div className="flex items-start gap-3 p-4 bg-blue-50 border border-blue-100 rounded-xl">
        <Lock className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
        <div>
          <h4 className="text-sm font-semibold text-blue-800">Authentication</h4>
          <p className="text-xs text-blue-700 mt-1">
            All API requests require a Bearer token in the Authorization header.
            Use your API key or a Firebase ID token:
          </p>
          <code className="block mt-2 text-xs bg-blue-100 text-blue-800 px-3 py-2 rounded-lg font-mono">
            Authorization: Bearer ek_live_your_api_key_here
          </code>
          <p className="text-xs text-blue-600 mt-2">
            Base URL:{' '}
            <code className="font-mono bg-blue-100 px-1.5 py-0.5 rounded">
              {API_BASE_URL}
            </code>
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search endpoints..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 focus:bg-white transition-all"
          />
        </div>
        <div className="flex gap-1 flex-wrap">
          <button
            onClick={() => setSelectedCategory('')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
              !selectedCategory
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
            }`}
          >
            All
          </button>
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat === selectedCategory ? '' : cat)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                selectedCategory === cat
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Endpoint List */}
      <div className="space-y-2">
        {filteredEndpoints.map((ep) => {
          const key = `${ep.method}-${ep.path}`;
          const isExpanded = expandedEndpoint === key;
          const mc = METHOD_COLORS[ep.method] || METHOD_COLORS.GET;

          return (
            <div
              key={key}
              className="border border-slate-200 rounded-xl overflow-hidden"
            >
              {/* Header */}
              <button
                onClick={() => toggleEndpoint(key)}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition-colors"
              >
                <span
                  className={`text-xs font-bold px-2.5 py-0.5 rounded ${mc.bg} ${mc.text} ${mc.border} border`}
                >
                  {ep.method}
                </span>
                <code className="text-sm font-mono text-slate-700 flex-1 text-left truncate">
                  {ep.path}
                </code>
                <span className="text-xs text-slate-400 hidden sm:block">
                  {ep.summary}
                </span>
                {isExpanded ? (
                  <ChevronDown className="w-4 h-4 text-slate-400" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-slate-400" />
                )}
              </button>

              {/* Expanded Content */}
              {isExpanded && (
                <div className="border-t border-slate-200 bg-slate-50 p-4 space-y-4">
                  <p className="text-sm text-slate-600">{ep.description}</p>

                  {/* Permissions */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <Shield className="w-3.5 h-3.5 text-slate-400" />
                    {ep.permissions.map((p) => (
                      <span
                        key={p}
                        className="text-xs font-mono bg-violet-50 text-violet-600 px-2 py-0.5 rounded border border-violet-200"
                      >
                        {p}
                      </span>
                    ))}
                  </div>

                  {/* Parameters */}
                  {ep.parameters && ep.parameters.length > 0 && (
                    <div>
                      <h5 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                        Parameters
                      </h5>
                      <div className="bg-white rounded-lg border border-slate-200 divide-y divide-slate-100">
                        {ep.parameters.map((param) => (
                          <div
                            key={param.name}
                            className="flex items-start gap-3 px-3 py-2"
                          >
                            <code className="text-xs font-mono text-slate-800 font-semibold min-w-[80px]">
                              {param.name}
                            </code>
                            <span className="text-xs text-slate-400">
                              {param.in} Â· {param.type}
                              {param.required && (
                                <span className="text-red-500 ml-1">*</span>
                              )}
                            </span>
                            <span className="text-xs text-slate-500 flex-1">
                              {param.description}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Request Body */}
                  {ep.requestBody && (
                    <div>
                      <h5 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                        Request Body
                      </h5>
                      <pre className="bg-slate-900 text-slate-100 text-xs font-mono p-4 rounded-lg overflow-x-auto">
                        {JSON.stringify(ep.requestBody.example, null, 2)}
                      </pre>
                    </div>
                  )}

                  {/* Response */}
                  {ep.responses[0] && (
                    <div>
                      <h5 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                        Response ({ep.responses[0].status})
                      </h5>
                      <pre className="bg-slate-900 text-slate-100 text-xs font-mono p-4 rounded-lg overflow-x-auto">
                        {JSON.stringify(ep.responses[0].example, null, 2)}
                      </pre>
                    </div>
                  )}

                  {/* Code Examples */}
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <Code2 className="w-3.5 h-3.5 text-slate-400" />
                      <h5 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                        Code Examples
                      </h5>
                      <div className="flex gap-1 ml-auto">
                        {(['curl', 'javascript', 'python'] as const).map((t) => (
                          <button
                            key={t}
                            onClick={() => setCodeTab(t)}
                            className={`text-xs px-2 py-0.5 rounded ${
                              codeTab === t
                                ? 'bg-slate-700 text-white'
                                : 'bg-white text-slate-500 border border-slate-200 hover:bg-slate-100'
                            }`}
                          >
                            {t === 'curl' ? 'cURL' : t.charAt(0).toUpperCase() + t.slice(1)}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="relative">
                      <pre className="bg-slate-900 text-slate-100 text-xs font-mono p-4 rounded-lg overflow-x-auto">
                        {codeTab === 'curl' && generateCurl(ep)}
                        {codeTab === 'javascript' && generateJsCode(ep)}
                        {codeTab === 'python' && generatePythonCode(ep)}
                      </pre>
                      <button
                        onClick={() => {
                          const code =
                            codeTab === 'curl'
                              ? generateCurl(ep)
                              : codeTab === 'javascript'
                                ? generateJsCode(ep)
                                : generatePythonCode(ep);
                          navigator.clipboard.writeText(code);
                          toast.success('Copied to clipboard');
                        }}
                        className="absolute top-2 right-2 p-1.5 rounded-md bg-slate-700 hover:bg-slate-600 text-slate-300 transition-colors"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <p className="text-xs text-slate-400 text-center pt-2">
        {filteredEndpoints.length} endpoint{filteredEndpoints.length !== 1 ? 's' : ''} documented
      </p>
    </div>
  );
}

// =============================================================================
// API Keys Tab
// =============================================================================

function KeysTab({
  apiKeys,
  schoolId,
}: {
  apiKeys: ApiKey[];
  schoolId: string;
}) {
  const queryClient = useQueryClient();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [newKeyPerms, setNewKeyPerms] = useState<Set<ApiPermission>>(new Set());
  const [newKeyRateLimit, setNewKeyRateLimit] = useState(60);
  const [newKeyExpiry, setNewKeyExpiry] = useState(0);
  const [creating, setCreating] = useState(false);
  const [createdRawKey, setCreatedRawKey] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);

  const handleCreate = async () => {
    if (!newKeyName.trim()) {
      toast.error('Name is required');
      return;
    }
    if (newKeyPerms.size === 0) {
      toast.error('Select at least one permission');
      return;
    }
    setCreating(true);
    try {
      const result = await ApiKeyService.createApiKey(schoolId, {
        name: newKeyName.trim(),
        permissions: Array.from(newKeyPerms),
        rateLimit: newKeyRateLimit,
        expiresInDays: newKeyExpiry || undefined,
      });
      queryClient.invalidateQueries({ queryKey: ['api-keys', schoolId] });
      setCreatedRawKey(result.rawKey);
      toast.success('API key created');
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setCreating(false);
    }
  };

  const handleRevoke = async (keyId: string) => {
    setRevoking(keyId);
    try {
      await ApiKeyService.revokeApiKey(schoolId, keyId);
      queryClient.invalidateQueries({ queryKey: ['api-keys', schoolId] });
      toast.success('API key revoked');
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setRevoking(null);
    }
  };

  const closeCreateModal = () => {
    setShowCreateModal(false);
    setNewKeyName('');
    setNewKeyPerms(new Set());
    setNewKeyRateLimit(60);
    setNewKeyExpiry(0);
    setCreatedRawKey(null);
  };

  const togglePerm = (perm: ApiPermission) => {
    setNewKeyPerms((prev) => {
      const next = new Set(prev);
      if (next.has(perm)) next.delete(perm);
      else next.add(perm);
      return next;
    });
  };

  const activeKeys = apiKeys.filter((k) => k.status === 'active');
  const revokedKeys = apiKeys.filter((k) => k.status === 'revoked');

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-[15px] font-semibold text-slate-800">
            API Keys
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Create and manage API keys for third-party integrations
          </p>
        </div>
        <Button onClick={() => setShowCreateModal(true)}>
          <Plus className="w-4 h-4" />
          <span>Create Key</span>
        </Button>
      </div>

      {/* Active Keys */}
      {activeKeys.length > 0 ? (
        <div className="space-y-3">
          {activeKeys.map((key) => (
            <KeyCard
              key={key.id}
              apiKey={key}
              onRevoke={() => handleRevoke(key.id)}
              revoking={revoking === key.id}
            />
          ))}
        </div>
      ) : (
        <div className="p-8 text-center bg-slate-50 rounded-xl border border-slate-200">
          <Key className="w-10 h-10 text-slate-300 mx-auto mb-2" />
          <p className="text-sm text-slate-500">No active API keys</p>
          <p className="text-xs text-slate-400 mt-1">
            Create a key to start integrating with the SuffaCampus API
          </p>
        </div>
      )}

      {/* Revoked Keys */}
      {revokedKeys.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
            Revoked Keys
          </h4>
          <div className="space-y-2">
            {revokedKeys.map((key) => (
              <div
                key={key.id}
                className="flex items-center gap-3 px-4 py-3 bg-slate-50 rounded-lg border border-slate-200 opacity-60"
              >
                <Key className="w-4 h-4 text-slate-400" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-600 line-through">
                    {key.name}
                  </p>
                  <p className="text-xs text-slate-400 font-mono">{key.key}</p>
                </div>
                <span className="text-xs font-medium text-red-500 bg-red-50 px-2 py-0.5 rounded border border-red-200">
                  Revoked
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Create Key Modal */}
      <Modal
        isOpen={showCreateModal}
        onClose={closeCreateModal}
        title={createdRawKey ? 'API Key Created' : 'Create API Key'}
        subtitle={
          createdRawKey
            ? 'Save this key â€” it won\'t be shown again'
            : 'Configure permissions and rate limits'
        }
        size="lg"
      >
        {createdRawKey ? (
          <div className="p-5 space-y-4">
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle className="w-4 h-4 text-emerald-600" />
                <p className="text-sm font-semibold text-emerald-800">
                  Key created successfully
                </p>
              </div>
              <p className="text-xs text-emerald-700 mb-3">
                Copy this key now. For security, it will only be shown once.
              </p>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-sm font-mono bg-white text-slate-800 px-3 py-2 rounded-lg border border-emerald-200 break-all">
                  {createdRawKey}
                </code>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(createdRawKey);
                    toast.success('Copied!');
                  }}
                  className="p-2 rounded-lg bg-white border border-emerald-200 hover:bg-emerald-100 transition-colors"
                >
                  <Copy className="w-4 h-4 text-emerald-600" />
                </button>
              </div>
            </div>
            <div className="flex justify-end">
              <Button onClick={closeCreateModal}>Done</Button>
            </div>
          </div>
        ) : (
          <div className="p-5 space-y-5">
            {/* Name */}
            <Input
              label="Key Name"
              value={newKeyName}
              onChange={(e) => setNewKeyName(e.target.value)}
              placeholder="e.g., Mobile App, Accounting System"
            />

            {/* Permissions */}
            <div>
              <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider block mb-2">
                Permissions
              </label>
              <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
                {PERMISSION_GROUPS.map((group) => (
                  <div
                    key={group.category}
                    className="bg-slate-50 rounded-lg border border-slate-100 p-3"
                  >
                    <p className="text-xs font-semibold text-slate-600 mb-2 flex items-center gap-1.5">
                      <span>{group.icon}</span> {group.category}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {group.permissions.map((perm) => (
                        <label
                          key={perm.value}
                          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border cursor-pointer transition-all text-xs ${
                            newKeyPerms.has(perm.value)
                              ? 'bg-blue-50 border-blue-300 text-blue-700'
                              : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={newKeyPerms.has(perm.value)}
                            onChange={() => togglePerm(perm.value)}
                            className="w-3 h-3 rounded border-slate-300 text-blue-600 focus:ring-blue-500/20"
                          />
                          {perm.label}
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Rate Limit & Expiry */}
            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Rate Limit (requests/min)"
                type="number"
                value={String(newKeyRateLimit)}
                onChange={(e) =>
                  setNewKeyRateLimit(Math.max(1, parseInt(e.target.value) || 60))
                }
                placeholder="60"
              />
              <Input
                label="Expires In (days, 0 = never)"
                type="number"
                value={String(newKeyExpiry)}
                onChange={(e) =>
                  setNewKeyExpiry(Math.max(0, parseInt(e.target.value) || 0))
                }
                placeholder="0"
              />
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="secondary" onClick={closeCreateModal}>
                Cancel
              </Button>
              <Button onClick={handleCreate} disabled={creating}>
                {creating ? (
                  <>
                    <RotateCw className="w-4 h-4 animate-spin" />
                    <span>Creating...</span>
                  </>
                ) : (
                  <>
                    <Key className="w-4 h-4" />
                    <span>Create Key</span>
                  </>
                )}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

// Key Card component
function KeyCard({
  apiKey,
  onRevoke,
  revoking,
}: {
  apiKey: ApiKey;
  onRevoke: () => void;
  revoking: boolean;
}) {
  const [showPerms, setShowPerms] = useState(false);

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
          <Key className="w-4.5 h-4.5 text-blue-600" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h4 className="text-sm font-semibold text-slate-800">
              {apiKey.name}
            </h4>
            <span className="text-xs font-medium text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
              Active
            </span>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <code className="text-xs font-mono text-slate-500">{apiKey.key}</code>
            <span className="text-xs text-slate-400">Â·</span>
            <span className="text-xs text-slate-400">
              {apiKey.rateLimit} req/min
            </span>
            <span className="text-xs text-slate-400">Â·</span>
            <span className="text-xs text-slate-400">
              {apiKey.permissions.length} permissions
            </span>
            {apiKey.lastUsedAt && (
              <>
                <span className="text-xs text-slate-400">Â·</span>
                <span className="text-xs text-slate-400">
                  Last used{' '}
                  {format(new Date(apiKey.lastUsedAt), 'MMM dd, HH:mm')}
                </span>
              </>
            )}
          </div>

          {/* Expandable permissions */}
          <button
            onClick={() => setShowPerms(!showPerms)}
            className="text-xs text-blue-600 hover:text-blue-700 mt-2 flex items-center gap-1"
          >
            {showPerms ? (
              <ChevronDown className="w-3 h-3" />
            ) : (
              <ChevronRight className="w-3 h-3" />
            )}
            {showPerms ? 'Hide' : 'Show'} permissions
          </button>
          {showPerms && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {apiKey.permissions.map((p) => (
                <span
                  key={p}
                  className="text-xs font-mono bg-slate-50 text-slate-600 px-2 py-0.5 rounded border border-slate-200"
                >
                  {p}
                </span>
              ))}
            </div>
          )}
        </div>
        <button
          onClick={onRevoke}
          disabled={revoking}
          className="p-2 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-40"
          title="Revoke key"
        >
          {revoking ? (
            <RotateCw className="w-4 h-4 animate-spin" />
          ) : (
            <Trash2 className="w-4 h-4" />
          )}
        </button>
      </div>
    </div>
  );
}

// =============================================================================
// Playground Tab
// =============================================================================

function PlaygroundTab({ schoolId }: { schoolId: string }) {
  const [method, setMethod] = useState('GET');
  const [path, setPath] = useState('/api/v1/students');
  const [body, setBody] = useState('');
  const [response, setResponse] = useState<{
    status: number;
    data: unknown;
    time: number;
  } | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSend = async () => {
    setLoading(true);
    setResponse(null);
    try {
      const result = await ApiKeyService.testEndpoint(
        schoolId,
        method,
        path,
        body || undefined
      );
      setResponse(result);
    } catch (e) {
      setResponse({
        status: 500,
        data: { error: getErrorMessage(e) },
        time: 0,
      });
    } finally {
      setLoading(false);
    }
  };

  const quickEndpoints = [
    { method: 'GET', path: '/api/v1/students', label: 'List Students' },
    { method: 'GET', path: '/api/v1/teachers', label: 'List Teachers' },
    { method: 'GET', path: '/api/v1/classes', label: 'List Classes' },
    { method: 'GET', path: '/api/v1/attendance', label: 'Get Attendance' },
    { method: 'GET', path: '/api/v1/fees', label: 'List Fees' },
    {
      method: 'POST',
      path: '/api/v1/students',
      label: 'Create Student',
      body: JSON.stringify(
        { name: 'Test Student', classId: 'class-10', section: 'A', rollNo: 99 },
        null,
        2
      ),
    },
  ];

  return (
    <div className="space-y-5">
      {/* Quick Actions */}
      <div>
        <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
          Quick Try
        </h4>
        <div className="flex flex-wrap gap-2">
          {quickEndpoints.map((ep) => {
            const mc = METHOD_COLORS[ep.method] || METHOD_COLORS.GET;
            return (
              <button
                key={ep.label}
                onClick={() => {
                  setMethod(ep.method);
                  setPath(ep.path);
                  setBody(ep.body || '');
                  setResponse(null);
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 hover:border-slate-300 bg-white text-xs transition-all"
              >
                <span className={`font-bold ${mc.text}`}>{ep.method}</span>
                <span className="text-slate-600">{ep.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Request Builder */}
      <div className="bg-slate-50 rounded-xl border border-slate-200 p-4 space-y-3">
        <div className="flex gap-2">
          <select
            value={method}
            onChange={(e) => setMethod(e.target.value)}
            className="px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          >
            {['GET', 'POST', 'PATCH', 'PUT', 'DELETE'].map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
          <input
            type="text"
            value={path}
            onChange={(e) => setPath(e.target.value)}
            className="flex-1 px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm font-mono text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
            placeholder="/api/v1/students"
          />
          <Button onClick={handleSend} disabled={loading}>
            {loading ? (
              <RotateCw className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
            <span>Send</span>
          </Button>
        </div>

        {/* Body (for POST/PUT/PATCH) */}
        {['POST', 'PUT', 'PATCH'].includes(method) && (
          <div>
            <label className="text-xs font-medium text-slate-500 mb-1 block">
              Request Body (JSON)
            </label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              className="w-full h-32 px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm font-mono text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 resize-y"
              placeholder='{"name": "Test"}'
            />
          </div>
        )}
      </div>

      {/* Response */}
      {response && (
        <div className="bg-slate-900 rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-700">
            <div className="flex items-center gap-3">
              <span
                className={`text-xs font-bold px-2 py-0.5 rounded ${
                  response.status < 300
                    ? 'bg-emerald-500/20 text-emerald-400'
                    : response.status < 500
                      ? 'bg-amber-500/20 text-amber-400'
                      : 'bg-red-500/20 text-red-400'
                }`}
              >
                {response.status}
              </span>
              <span className="text-xs text-slate-400">{response.time}ms</span>
            </div>
            <button
              onClick={() => {
                navigator.clipboard.writeText(
                  JSON.stringify(response.data, null, 2)
                );
                toast.success('Copied');
              }}
              className="p-1 rounded hover:bg-slate-700 text-slate-400 transition-colors"
            >
              <Copy className="w-3.5 h-3.5" />
            </button>
          </div>
          <pre className="p-4 text-xs font-mono text-slate-100 overflow-x-auto max-h-96 overflow-y-auto">
            {JSON.stringify(response.data, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Webhooks Tab
// =============================================================================

function WebhooksTab({
  webhooks,
  schoolId,
}: {
  webhooks: WebhookConfig[];
  schoolId: string;
}) {
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [newUrl, setNewUrl] = useState('');
  const [selectedEvents, setSelectedEvents] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState(false);

  const handleCreate = async () => {
    if (!newUrl.trim()) {
      toast.error('URL is required');
      return;
    }
    if (selectedEvents.size === 0) {
      toast.error('Select at least one event');
      return;
    }
    setCreating(true);
    try {
      const wh = await ApiKeyService.createWebhook(schoolId, {
        url: newUrl.trim(),
        events: Array.from(selectedEvents),
      });
      queryClient.invalidateQueries({ queryKey: ['api-webhooks', schoolId] });
      toast.success('Webhook created');
      setShowCreate(false);
      setNewUrl('');
      setSelectedEvents(new Set());
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await ApiKeyService.deleteWebhook(schoolId, id);
      queryClient.invalidateQueries({ queryKey: ['api-webhooks', schoolId] });
      toast.success('Webhook deleted');
    } catch (e) {
      toast.error(getErrorMessage(e));
    }
  };

  const toggleEvent = (ev: string) => {
    setSelectedEvents((prev) => {
      const next = new Set(prev);
      if (next.has(ev)) next.delete(ev);
      else next.add(ev);
      return next;
    });
  };

  const eventsByCategory = useMemo(() => {
    const map: Record<string, typeof WEBHOOK_EVENTS> = {};
    WEBHOOK_EVENTS.forEach((ev) => {
      if (!map[ev.category]) map[ev.category] = [];
      map[ev.category].push(ev);
    });
    return map;
  }, []);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-[15px] font-semibold text-slate-800">
            Webhooks
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Get notified when events happen in your school
          </p>
        </div>
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="w-4 h-4" />
          <span>Add Webhook</span>
        </Button>
      </div>

      {/* Info Banner */}
      <div className="flex items-start gap-3 p-4 bg-violet-50 border border-violet-100 rounded-xl">
        <Globe className="w-5 h-5 text-violet-600 flex-shrink-0 mt-0.5" />
        <div className="text-xs text-violet-700">
          <p className="font-semibold text-violet-800 mb-1">How Webhooks Work</p>
          <p>
            When an event occurs (e.g., a fee is paid), we send an HTTP POST
            request to your endpoint with the event details. Your server should
            respond with a 2xx status code within 10 seconds.
          </p>
          <p className="mt-1.5">
            Each webhook includes an{' '}
            <code className="bg-violet-100 px-1 py-0.5 rounded font-mono">
              X-SuffaCampus-Signature
            </code>{' '}
            header for verification.
          </p>
        </div>
      </div>

      {/* Existing Webhooks */}
      {webhooks.length > 0 ? (
        <div className="space-y-3">
          {webhooks.map((wh) => (
            <div
              key={wh.id}
              className="bg-white rounded-xl border border-slate-200 p-4"
            >
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-lg bg-violet-50 flex items-center justify-center flex-shrink-0">
                  <Webhook className="w-4.5 h-4.5 text-violet-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <code className="text-sm font-mono text-slate-700 truncate">
                      {wh.url}
                    </code>
                    <span
                      className={`text-xs font-medium px-2 py-0.5 rounded border ${
                        wh.status === 'active'
                          ? 'text-emerald-600 bg-emerald-50 border-emerald-200'
                          : 'text-slate-500 bg-slate-50 border-slate-200'
                      }`}
                    >
                      {wh.status}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {wh.events.map((ev) => (
                      <span
                        key={ev}
                        className="text-xs bg-slate-50 text-slate-600 px-2 py-0.5 rounded border border-slate-200"
                      >
                        {ev}
                      </span>
                    ))}
                  </div>
                  <div className="flex items-center gap-3 mt-2 text-xs text-slate-400">
                    {wh.lastTriggeredAt && (
                      <span>
                        Last triggered{' '}
                        {format(new Date(wh.lastTriggeredAt), 'MMM dd, HH:mm')}
                      </span>
                    )}
                    <span>
                      Secret: <code className="font-mono">{wh.secret}</code>
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => handleDelete(wh.id)}
                  className="p-2 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="p-8 text-center bg-slate-50 rounded-xl border border-slate-200">
          <Webhook className="w-10 h-10 text-slate-300 mx-auto mb-2" />
          <p className="text-sm text-slate-500">No webhooks configured</p>
        </div>
      )}

      {/* Create Webhook Modal */}
      <Modal
        isOpen={showCreate}
        onClose={() => setShowCreate(false)}
        title="Add Webhook"
        subtitle="Configure a new webhook endpoint"
        size="lg"
      >
        <div className="p-5 space-y-5">
          <Input
            label="Endpoint URL"
            value={newUrl}
            onChange={(e) => setNewUrl(e.target.value)}
            placeholder="https://your-server.com/webhooks/SuffaCampus"
          />

          <div>
            <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider block mb-2">
              Events to Subscribe
            </label>
            <div className="space-y-3 max-h-48 overflow-y-auto">
              {Object.entries(eventsByCategory).map(([cat, evts]) => (
                <div key={cat} className="bg-slate-50 rounded-lg border border-slate-100 p-3">
                  <p className="text-xs font-semibold text-slate-600 mb-2">{cat}</p>
                  <div className="flex flex-wrap gap-2">
                    {evts.map((ev) => (
                      <label
                        key={ev.value}
                        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border cursor-pointer transition-all text-xs ${
                          selectedEvents.has(ev.value)
                            ? 'bg-violet-50 border-violet-300 text-violet-700'
                            : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={selectedEvents.has(ev.value)}
                          onChange={() => toggleEvent(ev.value)}
                          className="w-3 h-3 rounded border-slate-300 text-violet-600 focus:ring-violet-500/20"
                        />
                        {ev.label}
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setShowCreate(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={creating}>
              {creating ? (
                <>
                  <RotateCw className="w-4 h-4 animate-spin" />
                  <span>Creating...</span>
                </>
              ) : (
                <>
                  <Webhook className="w-4 h-4" />
                  <span>Create Webhook</span>
                </>
              )}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Webhook Payload Example */}
      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <div className="flex items-center gap-2 mb-3">
          <Code2 className="w-4 h-4 text-slate-500" />
          <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Example Webhook Payload
          </h4>
        </div>
        <pre className="bg-slate-900 text-slate-100 text-xs font-mono p-4 rounded-lg overflow-x-auto">
          {JSON.stringify(
            {
              id: 'evt_abc123',
              type: 'fee.paid',
              timestamp: '2026-02-25T10:30:00Z',
              schoolId: 'sch_xyz',
              data: {
                feeId: 'fee_001',
                studentName: 'Rahul Sharma',
                amount: 5000,
                paymentMethod: 'upi',
                transactionId: 'pay_live_abc123',
              },
            },
            null,
            2
          )}
        </pre>
      </div>
    </div>
  );
}

