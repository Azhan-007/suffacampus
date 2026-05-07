/**
 * eventsService.ts
 *
 * Backend routes:
 *   GET    /events?upcoming=&limit=   — list events
 *   POST   /events                    — create event (admin)
 *   PATCH  /events/:id                — update event (admin)
 *   DELETE /events/:id                — delete event (admin)
 *
 * Backend Event model fields:
 *   id, title, description, eventDate, endDate, eventType,
 *   targetAudience, location, organizer, imageURL, isActive
 */

import { apiFetch } from "./api";

// ─── Types ───────────────────────────────────────────────────────────────────

/** Backend shape (matches Prisma Event model) */
interface BackendEvent {
  id: string;
  title: string;
  description: string;
  eventDate: string;
  endDate?: string | null;
  eventType: string;
  targetAudience?: string[];
  location?: string | null;
  organizer?: string | null;
  imageURL?: string | null;
  isActive: boolean;
}

/** Frontend shape used by mobile screens */
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
  eventType: string;
  isActive: boolean;
}

/** Derive icon & color from eventType for the UI */
function eventTypeToStyle(eventType: string): { icon: string; color: string } {
  const t = (eventType ?? "").toLowerCase();
  if (t === "academic") return { icon: "school", color: "#3B82F6" };
  if (t === "sports") return { icon: "sports-soccer", color: "#10B981" };
  if (t === "cultural") return { icon: "palette", color: "#8B5CF6" };
  if (t === "holiday") return { icon: "beach-access", color: "#F59E0B" };
  if (t === "exam") return { icon: "assignment", color: "#EF4444" };
  if (t === "meeting") return { icon: "groups", color: "#6366F1" };
  return { icon: "event", color: "#6B7280" };
}

function mapBackendEvent(e: BackendEvent): Event {
  const style = eventTypeToStyle(e.eventType);
  return {
    id: e.id,
    title: e.title,
    description: e.description,
    date: e.eventDate,
    startDate: e.eventDate,
    endDate: e.endDate ?? undefined,
    location: e.location ?? undefined,
    icon: style.icon,
    color: style.color,
    eventType: e.eventType,
    isActive: e.isActive,
  };
}

export interface CreateEventPayload {
  title: string;
  description: string;
  eventDate: string;
  endDate?: string;
  eventType: string;
  targetAudience?: string[];
  location?: string;
  isActive: boolean;
}

// ─── Functions ───────────────────────────────────────────────────────────────

/** Fetch events, optionally filtered. */
export async function getEvents(params?: {
  isActive?: boolean;
  upcoming?: boolean;
  limit?: number;
}): Promise<Event[]> {
  try {
    const query: Record<string, string | number | boolean | undefined> = {};
    if (params?.limit) query.limit = params.limit;
    if (params?.isActive || params?.upcoming) query.upcoming = true;
    const raw = await apiFetch<BackendEvent[]>("/events", { params: query });
    const list = Array.isArray(raw) ? raw : [];
    return list.map(mapBackendEvent);
  } catch {
    return [];
  }
}

/** Create a new event (admin). */
export async function createEvent(data: CreateEventPayload): Promise<Event> {
  const raw = await apiFetch<BackendEvent>("/events", { method: "POST", body: data });
  return mapBackendEvent(raw);
}

/** Update an event (admin). */
export async function updateEvent(
  id: string,
  data: Partial<CreateEventPayload>
): Promise<Event> {
  const raw = await apiFetch<BackendEvent>(`/events/${id}`, { method: "PATCH", body: data });
  return mapBackendEvent(raw);
}

/** Delete an event (admin). */
export async function deleteEvent(id: string): Promise<void> {
  await apiFetch<void>(`/events/${id}`, { method: "DELETE" });
}
