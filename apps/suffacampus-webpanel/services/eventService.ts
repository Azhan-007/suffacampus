import { apiFetch, ApiError } from '@/lib/api';
import { Event } from '@/types';

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

function deserializeEvent(raw: Record<string, unknown>): Event {
  return {
    ...(raw as unknown as Event),
    eventDate: toDate(raw.eventDate),
    endDate: raw.endDate ? toDate(raw.endDate) : undefined,
    createdAt: toDate(raw.createdAt),
    updatedAt: toDate(raw.updatedAt),
  };
}

// ---------------------------------------------------------------------------

export class EventService {
  /**
   * Get all events — backend: GET /events
   * schoolId is enforced server-side via the auth token (tenant guard).
   */
  static async getEvents(_schoolId: string): Promise<Event[]> {
    const raw = await apiFetch<Record<string, unknown>[]>('/events?limit=1000');
    return raw.map(deserializeEvent);
  }

  /**
   * Get event by ID — backend: GET /events/:id
   */
  static async getEventById(_schoolId: string, id: string): Promise<Event | null> {
    try {
      const raw = await apiFetch<Record<string, unknown>>(`/events/${id}`);
      return deserializeEvent(raw);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) return null;
      throw err;
    }
  }

  /**
   * Create a new event — backend: POST /events
   */
  static async createEvent(
    _schoolId: string,
    data: Omit<Event, 'id' | 'schoolId' | 'createdAt' | 'updatedAt'>
  ): Promise<string> {
    const raw = await apiFetch<Record<string, unknown>>('/events', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return raw.id as string;
  }

  /**
   * Update event — backend: PATCH /events/:id
   */
  static async updateEvent(
    _schoolId: string,
    id: string,
    data: Partial<Omit<Event, 'id' | 'schoolId' | 'createdAt' | 'updatedAt'>>
  ): Promise<void> {
    await apiFetch(`/events/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  /**
   * Soft-delete event — backend: DELETE /events/:id
   */
  static async deleteEvent(_schoolId: string, id: string): Promise<void> {
    await apiFetch(`/events/${id}`, { method: 'DELETE' });
  }

  /**
   * Get upcoming events — backend: GET /events?upcoming=true
   */
  static async getUpcomingEvents(
    _schoolId: string,
    limitCount: number = 5
  ): Promise<Event[]> {
    const raw = await apiFetch<Record<string, unknown>[]>(
      `/events?upcoming=true&limit=${limitCount}`
    );
    return raw.map(deserializeEvent);
  }

  /**
   * Poll for upcoming events every 30 seconds.
   */
  static subscribeToUpcomingEvents(
    schoolId: string,
    callback: (events: Event[]) => void,
    limitCount: number = 5
  ): () => void {
    let cancelled = false;

    const poll = async () => {
      if (cancelled) return;
      try {
        const events = await EventService.getUpcomingEvents(schoolId, limitCount);
        if (!cancelled) callback(events);
      } catch (err) {
        console.error('subscribeToUpcomingEvents: poll error', err);
        if (!cancelled) callback([]);
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
   * Get events statistics — computed client-side.
   */
  static async getEventStats(schoolId: string): Promise<{
    totalEvents: number;
    upcomingEvents: number;
    pastEvents: number;
    typeDistribution: { type: string; count: number }[];
  }> {
    const events = await EventService.getEvents(schoolId);
    const now = new Date();

    const totalEvents = events.length;
    const upcomingEvents = events.filter((e) => e.eventDate >= now).length;
    const pastEvents = events.filter((e) => e.eventDate < now).length;

    const typeMap = new Map<string, number>();
    events.forEach((e) => {
      typeMap.set(e.eventType, (typeMap.get(e.eventType) || 0) + 1);
    });

    const typeDistribution = Array.from(typeMap.entries())
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count);

    return { totalEvents, upcomingEvents, pastEvents, typeDistribution };
  }

  /**
   * Get events by type — backend: GET /events?eventType=…
   */
  static async getEventsByType(
    _schoolId: string,
    eventType: string
  ): Promise<Event[]> {
    const raw = await apiFetch<Record<string, unknown>[]>(
      `/events?eventType=${encodeURIComponent(eventType)}&limit=1000`
    );
    return raw.map(deserializeEvent);
  }

  /**
   * Get recent events (past 7 days) — computed client-side.
   */
  static async getRecentEvents(schoolId: string): Promise<Event[]> {
    const events = await EventService.getEvents(schoolId);
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    return events
      .filter((e) => e.eventDate >= sevenDaysAgo)
      .sort((a, b) => b.eventDate.getTime() - a.eventDate.getTime());
  }
}
