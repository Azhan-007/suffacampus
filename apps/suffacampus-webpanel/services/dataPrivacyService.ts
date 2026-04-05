import { apiFetch } from '@/lib/api';
import { DataRequest, DataRequestType, PrivacySettings } from '@/types';

function toDate(value: unknown): Date {
  if (!value) return new Date(0);
  if (value instanceof Date) return value;
  if (typeof value === 'string' || typeof value === 'number') return new Date(value);
  if (typeof value === 'object') {
    const v = value as Record<string, number>;
    if ('seconds' in v) return new Date(v.seconds * 1000);
    if ('_seconds' in v) return new Date(v._seconds * 1000);
  }
  return new Date(0);
}

export class DataPrivacyService {
  /**
   * Get all data requests for the current school.
   */
  static async getDataRequests(): Promise<DataRequest[]> {
    try {
      const raw = await apiFetch<Record<string, unknown>[]>('/data-privacy/requests');
      return raw.map((r) => ({
        ...(r as unknown as DataRequest),
        expiresAt: r.expiresAt ? toDate(r.expiresAt) : undefined,
        processedAt: r.processedAt ? toDate(r.processedAt) : undefined,
        createdAt: toDate(r.createdAt),
      }));
    } catch {
      return [];
    }
  }

  /**
   * Create a new data export/deletion request.
   */
  static async createDataRequest(data: {
    type: DataRequestType;
    scope: string[];
    reason?: string;
  }): Promise<DataRequest> {
    return apiFetch<DataRequest>('/data-privacy/requests', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  /**
   * Get privacy settings.
   */
  static async getPrivacySettings(): Promise<PrivacySettings> {
    try {
      return await apiFetch<PrivacySettings>('/data-privacy/settings');
    } catch {
      return {
        dataRetentionDays: 365,
        anonymizeInactiveAfterDays: 730,
        autoDeleteBackupsAfterDays: 90,
        consentRequired: false,
        cookieBannerEnabled: false,
      };
    }
  }

  /**
   * Update privacy settings.
   */
  static async updatePrivacySettings(settings: Partial<PrivacySettings>): Promise<void> {
    await apiFetch('/data-privacy/settings', {
      method: 'PATCH',
      body: JSON.stringify(settings),
    });
  }

  /**
   * Download exported data.
   */
  static async downloadExport(requestId: string): Promise<string> {
    const result = await apiFetch<{ downloadUrl: string }>(`/data-privacy/requests/${requestId}/download`);
    return result.downloadUrl;
  }
}
