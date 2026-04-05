import { apiFetch } from '@/lib/api';
import { SchoolSettings } from '@/types';

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

function deserializeSettings(raw: Record<string, unknown>): SchoolSettings {
  return {
    ...(raw as unknown as SchoolSettings),
    createdAt: toDate(raw.createdAt),
    updatedAt: toDate(raw.updatedAt),
  };
}

// ---------------------------------------------------------------------------

export class SettingsService {
  /**
   * Get school settings — backend: GET /settings
   */
  static async getSettings(): Promise<SchoolSettings> {
    try {
      const raw = await apiFetch<Record<string, unknown>>('/settings');
      return deserializeSettings(raw);
    } catch {
      return SettingsService.getDefaultSettings();
    }
  }

  /**
   * Update school settings — backend: PATCH /settings
   */
  static async updateSettings(
    updates: Partial<Omit<SchoolSettings, 'id' | 'createdAt'>>
  ): Promise<void> {
    await apiFetch('/settings', {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
  }

  /**
   * Reset settings to default — PATCH /settings with defaults
   */
  static async resetToDefaults(): Promise<void> {
    const defaults = SettingsService.getDefaultSettings();
    const { id, createdAt, ...rest } = defaults;
    await SettingsService.updateSettings(rest);
  }

  /**
   * Poll for settings changes every 30 seconds.
   */
  static subscribeToSettings(
    callback: (settings: SchoolSettings) => void
  ): () => void {
    let cancelled = false;

    const poll = async () => {
      if (cancelled) return;
      try {
        const settings = await SettingsService.getSettings();
        if (!cancelled) callback(settings);
      } catch (err) {
        console.error('subscribeToSettings: poll error', err);
        if (!cancelled) callback(SettingsService.getDefaultSettings());
      }
    };

    poll();
    const intervalId = setInterval(poll, 30_000);
    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }

  /**
   * Get default settings (fallback when none exist yet)
   */
  private static getDefaultSettings(): SchoolSettings {
    return {
      id: 'school-settings',
      schoolName: 'Your School Name',
      schoolCode: 'SCH001',
      address: '',
      city: '',
      state: '',
      pincode: '',
      phone: '',
      email: '',
      website: '',
      logoURL: undefined,
      primaryColor: '#4A90D9',
      secondaryColor: '#E6F4FE',
      currentSession: '2025-2026',
      sessionStartMonth: 4,
      sessionEndMonth: 3,
      currency: 'INR',
      dateFormat: 'DD/MM/YYYY',
      timeFormat: '12h',
      timezone: 'Asia/Kolkata',
      emailNotifications: true,
      smsNotifications: false,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  /**
   * Upload school logo — backend: POST /uploads/photos (multipart)
   */
  static async uploadLogo(file: File): Promise<string> {
    const token = (await import('@/lib/firebase')).auth.currentUser
      ? await (await import('@/lib/firebase')).auth.currentUser!.getIdToken()
      : null;

    const formData = new FormData();
    formData.append('file', file);

    const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? (process.env.NODE_ENV === 'development' ? 'http://localhost:5000/api/v1' : (() => { throw new Error('NEXT_PUBLIC_API_URL is not set'); })());
    const res = await fetch(`${BASE_URL}/uploads/photos`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData,
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error((body as any)?.error?.message ?? 'Logo upload failed');
    }

    const data = await res.json();
    return (data as any).data?.url ?? (data as any).url ?? '';
  }

  /** Get available academic sessions */
  static getAvailableSessions(): string[] {
    const currentYear = new Date().getFullYear();
    const sessions = [];
    for (let i = -2; i <= 2; i++) {
      const startYear = currentYear + i;
      sessions.push(`${startYear}-${startYear + 1}`);
    }
    return sessions;
  }

  /** Get supported currencies */
  static getSupportedCurrencies() {
    return [
      { value: 'INR', label: 'Indian Rupee (₹)' },
      { value: 'USD', label: 'US Dollar ($)' },
      { value: 'EUR', label: 'Euro (€)' },
      { value: 'GBP', label: 'British Pound (£)' },
    ];
  }

  /** Get supported timezones */
  static getSupportedTimezones() {
    return [
      { value: 'Asia/Kolkata', label: 'India (IST)' },
      { value: 'America/New_York', label: 'Eastern Time (US)' },
      { value: 'America/Los_Angeles', label: 'Pacific Time (US)' },
      { value: 'Europe/London', label: 'London (GMT)' },
      { value: 'Asia/Dubai', label: 'Dubai (GST)' },
      { value: 'Asia/Singapore', label: 'Singapore (SGT)' },
    ];
  }

  /** Validate settings data */
  static validateSettings(
    settings: Partial<SchoolSettings>
  ): { isValid: boolean; errors: Record<string, string> } {
    const errors: Record<string, string> = {};

    if (settings.schoolName && settings.schoolName.trim().length < 3) {
      errors.schoolName = 'School name must be at least 3 characters';
    }
    if (settings.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(settings.email)) {
      errors.email = 'Invalid email address';
    }
    if (settings.phone && !/^\+?[\d\s-]{8,15}$/.test(settings.phone)) {
      errors.phone = 'Invalid phone number';
    }
    if (settings.pincode && !/^\d{5,6}$/.test(settings.pincode)) {
      errors.pincode = 'Invalid pincode';
    }

    return { isValid: Object.keys(errors).length === 0, errors };
  }
}
