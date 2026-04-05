import { apiFetch } from '@/lib/api';
import { WebhookDelivery, WebhookConfig } from '@/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Webhook Service
// ---------------------------------------------------------------------------

export class WebhookService {
  /**
   * Get all configured webhooks for the current school.
   */
  static async getWebhooks(): Promise<WebhookConfig[]> {
    try {
      const raw = await apiFetch<Record<string, unknown>[]>('/webhooks');
      return raw.map((r) => ({
        ...(r as unknown as WebhookConfig),
        lastTriggeredAt: r.lastTriggeredAt ? toDate(r.lastTriggeredAt) : undefined,
        createdAt: toDate(r.createdAt),
      }));
    } catch {
      return [];
    }
  }

  /**
   * Get delivery logs for a specific webhook (or all webhooks).
   */
  static async getDeliveryLogs(options?: {
    webhookId?: string;
    status?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ data: WebhookDelivery[]; total: number }> {
    try {
      const params = new URLSearchParams();
      if (options?.webhookId) params.set('webhookId', options.webhookId);
      if (options?.status) params.set('status', options.status);
      if (options?.limit) params.set('limit', String(options.limit));
      if (options?.offset) params.set('offset', String(options.offset));

      const qs = params.toString();
      const raw = await apiFetch<{ deliveries: Record<string, unknown>[]; total: number }>(
        `/webhooks/deliveries${qs ? `?${qs}` : ''}`
      );

      return {
        data: (raw.deliveries || []).map((r) => ({
          ...(r as unknown as WebhookDelivery),
          nextRetryAt: r.nextRetryAt ? toDate(r.nextRetryAt) : undefined,
          createdAt: toDate(r.createdAt),
        })),
        total: raw.total || 0,
      };
    } catch {
      return { data: [], total: 0 };
    }
  }

  /**
   * Retry a failed delivery.
   */
  static async retryDelivery(deliveryId: string): Promise<void> {
    await apiFetch(`/webhooks/deliveries/${deliveryId}/retry`, { method: 'POST' });
  }

  /**
   * Get delivery detail by ID.
   */
  static async getDeliveryDetail(deliveryId: string): Promise<WebhookDelivery | null> {
    try {
      const raw = await apiFetch<Record<string, unknown>>(`/webhooks/deliveries/${deliveryId}`);
      return {
        ...(raw as unknown as WebhookDelivery),
        nextRetryAt: raw.nextRetryAt ? toDate(raw.nextRetryAt) : undefined,
        createdAt: toDate(raw.createdAt),
      };
    } catch {
      return null;
    }
  }
}
