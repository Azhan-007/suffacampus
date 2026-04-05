import { apiFetch } from '@/lib/api';
import { UserSession } from '@/types';

export class SessionService {
  static async getSessions(): Promise<UserSession[]> {
    try {
      return await apiFetch<UserSession[]>('/settings/sessions');
    } catch {
      return [];
    }
  }

  static async revokeSession(sessionId: string): Promise<void> {
    await apiFetch(`/settings/sessions/${sessionId}`, { method: 'DELETE' });
  }

  static async revokeAllOtherSessions(): Promise<void> {
    await apiFetch('/settings/sessions/revoke-others', { method: 'POST' });
  }
}
