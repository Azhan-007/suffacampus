/**
 * eventsService.ts
 *
 * Backend routes:
 *   GET    /events?isActive=&limit=   — list events
 *   POST   /events                    — create event (admin)
 *   PUT    /events/:id                — update event (admin)
 *   DELETE /events/:id                — delete event (admin)
 */

import { apiFetch } from "./api";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface Event {
  id: string;
  title: string;
  description: string;
  date: string;
  startDate: string;
  endDate?: string;
  location?: string;
  icon: string;
  color: string;
  isActive: boolean;
}

export interface CreateEventPayload {
  title: string;
  description: string;
  date: string;
  startDate: string;
  endDate?: string;
  location?: string;
  icon: string;
  color: string;
  isActive: boolean;
}

// ─── Functions ───────────────────────────────────────────────────────────────

/** Fetch events, optionally filtered. Backend supports `upcoming` and `eventType`. */
export async function getEvents(params?: {
  isActive?: boolean;
  upcoming?: boolean;
  limit?: number;
}): Promise<Event[]> {
  try {
    // Backend uses `upcoming`, not `isActive`
    const query: Record<string, string | number | boolean | undefined> = {};
    if (params?.limit) query.limit = params.limit;
    if (params?.isActive || params?.upcoming) query.upcoming = true;
    return await apiFetch<Event[]>("/events", { params: query });
  } catch {
    return [];
  }
}

/** Create a new event (admin). */
export async function createEvent(data: CreateEventPayload): Promise<Event> {
  return apiFetch<Event>("/events", { method: "POST", body: data });
}

/** Update an event (admin). */
export async function updateEvent(
  id: string,
  data: Partial<CreateEventPayload>
): Promise<Event> {
  return apiFetch<Event>(`/events/${id}`, { method: "PATCH", body: data });
}

/** Delete an event (admin). */
export async function deleteEvent(id: string): Promise<void> {
  await apiFetch<void>(`/events/${id}`, { method: "DELETE" });
}
