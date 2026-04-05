import { apiFetch } from '@/lib/api';
import {
  ApiKey,
  ApiKeyStatus,
  ApiKeyCreateRequest,
  ApiKeyCreateResponse,
  ApiUsageStats,
  ApiPermission,
  WebhookConfig,
} from '@/types';

// =============================================================================
// Helpers
// =============================================================================

function toDate(value: unknown): Date {
  if (!value) return new Date(0);
  if (value instanceof Date) return value;
  if (typeof value === 'string' || typeof value === 'number')
    return new Date(value);
  if (typeof value === 'object') {
    const v = value as Record<string, number>;
    if ('seconds' in v) return new Date(v.seconds * 1000);
    if ('_seconds' in v) return new Date(v._seconds * 1000);
  }
  return new Date(0);
}

function deserializeApiKey(raw: Record<string, unknown>): ApiKey {
  return {
    ...(raw as unknown as ApiKey),
    lastUsedAt: raw.lastUsedAt ? toDate(raw.lastUsedAt) : undefined,
    expiresAt: raw.expiresAt ? toDate(raw.expiresAt) : undefined,
    createdAt: toDate(raw.createdAt),
    updatedAt: toDate(raw.updatedAt),
  };
}

function deserializeWebhook(raw: Record<string, unknown>): WebhookConfig {
  return {
    ...(raw as unknown as WebhookConfig),
    lastTriggeredAt: raw.lastTriggeredAt
      ? toDate(raw.lastTriggeredAt)
      : undefined,
    createdAt: toDate(raw.createdAt),
  };
}

// =============================================================================
// Permission Groups (for UI display)
// =============================================================================

export interface PermissionGroup {
  category: string;
  icon: string;
  permissions: { value: ApiPermission; label: string; description: string }[];
}

export const PERMISSION_GROUPS: PermissionGroup[] = [
  {
    category: 'Students',
    icon: '👨‍🎓',
    permissions: [
      { value: 'students:read', label: 'Read Students', description: 'View student profiles and lists' },
      { value: 'students:write', label: 'Write Students', description: 'Create, update, delete students' },
    ],
  },
  {
    category: 'Teachers',
    icon: '👩‍🏫',
    permissions: [
      { value: 'teachers:read', label: 'Read Teachers', description: 'View teacher profiles' },
      { value: 'teachers:write', label: 'Write Teachers', description: 'Manage teacher records' },
    ],
  },
  {
    category: 'Classes',
    icon: '📚',
    permissions: [
      { value: 'classes:read', label: 'Read Classes', description: 'View class information' },
      { value: 'classes:write', label: 'Write Classes', description: 'Manage classes and sections' },
    ],
  },
  {
    category: 'Attendance',
    icon: '📋',
    permissions: [
      { value: 'attendance:read', label: 'Read Attendance', description: 'View attendance records' },
      { value: 'attendance:write', label: 'Write Attendance', description: 'Mark and update attendance' },
    ],
  },
  {
    category: 'Fees',
    icon: '💰',
    permissions: [
      { value: 'fees:read', label: 'Read Fees', description: 'View fee records and invoices' },
      { value: 'fees:write', label: 'Write Fees', description: 'Create and manage fees' },
    ],
  },
  {
    category: 'Events',
    icon: '📅',
    permissions: [
      { value: 'events:read', label: 'Read Events', description: 'View school events' },
      { value: 'events:write', label: 'Write Events', description: 'Manage school events' },
    ],
  },
  {
    category: 'Results',
    icon: '📊',
    permissions: [
      { value: 'results:read', label: 'Read Results', description: 'View exam results' },
      { value: 'results:write', label: 'Write Results', description: 'Manage exam results' },
    ],
  },
  {
    category: 'Library',
    icon: '📖',
    permissions: [
      { value: 'library:read', label: 'Read Library', description: 'View book inventory' },
      { value: 'library:write', label: 'Write Library', description: 'Manage library records' },
    ],
  },
  {
    category: 'Timetable',
    icon: '🗓️',
    permissions: [
      { value: 'timetable:read', label: 'Read Timetable', description: 'View schedules' },
      { value: 'timetable:write', label: 'Write Timetable', description: 'Manage schedules' },
    ],
  },
  {
    category: 'Settings',
    icon: '⚙️',
    permissions: [
      { value: 'settings:read', label: 'Read Settings', description: 'View school settings' },
      { value: 'settings:write', label: 'Write Settings', description: 'Modify school settings' },
    ],
  },
];

// =============================================================================
// Service
// =============================================================================

export class ApiKeyService {
  // ---------------------------------------------------------------------------
  // API Keys CRUD
  // ---------------------------------------------------------------------------

  /**
   * List all API keys for a school.
   * Backend: GET /api-keys
   */
  static async getApiKeys(_schoolId: string): Promise<ApiKey[]> {
    try {
      const raw = await apiFetch<Record<string, unknown>[]>('/api-keys');
      return raw.map(deserializeApiKey);
    } catch {
      return [];
    }
  }

  /**
   * Create a new API key.
   * Backend: POST /api-keys
   * Returns the full key (only shown once).
   */
  static async createApiKey(
    _schoolId: string,
    request: ApiKeyCreateRequest
  ): Promise<ApiKeyCreateResponse> {
    const raw = await apiFetch<Record<string, unknown>>('/api-keys', {
      method: 'POST',
      body: JSON.stringify(request),
    });

    return {
      apiKey: deserializeApiKey(raw.apiKey as Record<string, unknown>),
      rawKey: raw.rawKey as string,
    };
  }

  /**
   * Revoke an API key.
   * Backend: DELETE /api-keys/:id
   */
  static async revokeApiKey(_schoolId: string, keyId: string): Promise<void> {
    await apiFetch(`/api-keys/${keyId}`, { method: 'DELETE' });
  }

  /**
   * Update an API key (name, permissions, rate limit).
   * Backend: PATCH /api-keys/:id
   */
  static async updateApiKey(
    _schoolId: string,
    keyId: string,
    updates: Partial<Pick<ApiKey, 'name' | 'permissions' | 'rateLimit'>>
  ): Promise<ApiKey> {
    const raw = await apiFetch<Record<string, unknown>>(
      `/api-keys/${keyId}`,
      {
        method: 'PATCH',
        body: JSON.stringify(updates),
      }
    );

    return deserializeApiKey(raw);
  }

  // ---------------------------------------------------------------------------
  // Usage Statistics
  // ---------------------------------------------------------------------------

  /**
   * Get API usage statistics.
   * Backend: GET /api-keys/usage
   */
  static async getUsageStats(_schoolId: string): Promise<ApiUsageStats> {
    return await apiFetch<ApiUsageStats>('/api-keys/usage');
  }

  // ---------------------------------------------------------------------------
  // Webhooks
  // ---------------------------------------------------------------------------

  /**
   * Get webhook configurations.
   * Backend: GET /webhooks
   */
  static async getWebhooks(_schoolId: string): Promise<WebhookConfig[]> {
    try {
      const raw = await apiFetch<Record<string, unknown>[]>('/webhooks');
      return raw.map(deserializeWebhook);
    } catch {
      return [];
    }
  }

  /**
   * Create a webhook.
   * Backend: POST /webhooks
   */
  static async createWebhook(
    _schoolId: string,
    config: { url: string; events: string[] }
  ): Promise<WebhookConfig> {
    const raw = await apiFetch<Record<string, unknown>>('/webhooks', {
      method: 'POST',
      body: JSON.stringify(config),
    });

    return deserializeWebhook(raw);
  }

  /**
   * Delete a webhook.
   * Backend: DELETE /webhooks/:id
   */
  static async deleteWebhook(
    _schoolId: string,
    webhookId: string
  ): Promise<void> {
    await apiFetch(`/webhooks/${webhookId}`, { method: 'DELETE' });
  }

  // ---------------------------------------------------------------------------
  // Test endpoint (API playground — uses mock responses for sandbox preview)
  // ---------------------------------------------------------------------------

  /**
   * Test an API request (playground).
   * In production, proxies the request to the real backend.
   * In development, returns mock responses for the interactive API explorer UI.
   */
  static async testEndpoint(
    schoolId: string,
    method: string,
    path: string,
    body?: string
  ): Promise<{ status: number; data: unknown; time: number }> {
    const start = Date.now();

    // In production, proxy through the real backend
    if (process.env.NODE_ENV === "production") {
      try {
        const data = await apiFetch(`/schools/${schoolId}/api/test`, {
          method: "POST",
          body: JSON.stringify({ method, path, body }),
        });
        return { status: 200, data, time: Date.now() - start };
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Request failed";
        return {
          status: 500,
          data: { success: false, error: message },
          time: Date.now() - start,
        };
      }
    }

    // Development-only mock responses
    const mockResponses: Record<string, unknown> = {
      '/students': {
        success: true,
        data: [
          { id: 'stu_1', name: 'Rahul Sharma', class: '10-A', rollNo: 1 },
          { id: 'stu_2', name: 'Priya Patel', class: '10-A', rollNo: 2 },
        ],
        total: 2,
        page: 1,
        limit: 20,
      },
      '/teachers': {
        success: true,
        data: [
          { id: 'tch_1', name: 'Dr. Ananya Roy', subject: 'Mathematics', classes: ['10-A'] },
        ],
        total: 1,
      },
      '/classes': {
        success: true,
        data: [
          { id: 'cls_1', name: '10-A', section: 'A', students: 45 },
        ],
        total: 1,
      },
    };

    // Simulate network delay
    await new Promise((r) => setTimeout(r, 200 + Math.random() * 300));

    const cleanPath = path.replace(/^\/api\/v1/, '');
    const normPath = Object.keys(mockResponses).find((p) =>
      cleanPath.startsWith(p)
    );

    if (method === 'GET' && normPath) {
      return { status: 200, data: mockResponses[normPath], time: Date.now() - start };
    }

    if (method === 'POST') {
      return {
        status: 201,
        data: { success: true, data: { id: `new_${Date.now()}`, ...(body ? JSON.parse(body) : {}) }, message: 'Resource created successfully' },
        time: Date.now() - start,
      };
    }

    return { status: 200, data: { success: true, message: 'OK' }, time: Date.now() - start };
  }
}
