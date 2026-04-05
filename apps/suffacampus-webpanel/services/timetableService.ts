import { apiFetch, ApiError } from '@/lib/api';
import { Timetable, Period } from '@/types';

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

function deserializeTimetable(raw: Record<string, unknown>): Timetable {
  return {
    ...(raw as unknown as Timetable),
    periods: Array.isArray(raw.periods)
      ? (raw.periods as Record<string, unknown>[]).map((p) => ({
          ...(p as unknown as Period),
        }))
      : [],
    createdAt: toDate(raw.createdAt),
    updatedAt: toDate(raw.updatedAt),
  };
}

// ---------------------------------------------------------------------------
// Service Functions — Backend: /timetable
// ---------------------------------------------------------------------------

/**
 * Get all timetables — backend: GET /timetable
 */
export const getTimetables = async (): Promise<Timetable[]> => {
  const raw = await apiFetch<Record<string, unknown>[]>('/timetable?limit=1000');
  return raw.map(deserializeTimetable);
};

/**
 * Get timetable by ID — backend: GET /timetable/:id
 */
export const getTimetableById = async (
  id: string
): Promise<Timetable | null> => {
  try {
    const raw = await apiFetch<Record<string, unknown>>(`/timetable/${id}`);
    return deserializeTimetable(raw);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  }
};

/**
 * Get timetables by class and optional section — backend: GET /timetable?classId=…&sectionId=…
 */
export const getTimetablesByClass = async (
  classId: string,
  sectionId?: string
): Promise<Timetable[]> => {
  const params = new URLSearchParams({ classId, limit: '1000' });
  if (sectionId) params.set('sectionId', sectionId);

  const raw = await apiFetch<Record<string, unknown>[]>(`/timetable?${params}`);
  return raw.map(deserializeTimetable);
};

/**
 * Create timetable — backend: POST /timetable
 */
export const createTimetable = async (
  data: Omit<Timetable, 'id' | 'createdAt' | 'updatedAt'>
): Promise<string> => {
  const raw = await apiFetch<Record<string, unknown>>('/timetable', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  return raw.id as string;
};

/**
 * Update timetable — backend: PATCH /timetable/:id
 */
export const updateTimetable = async (
  id: string,
  data: Partial<Omit<Timetable, 'id' | 'createdAt' | 'updatedAt'>>
): Promise<void> => {
  await apiFetch(`/timetable/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
};

/**
 * Delete timetable — backend: DELETE /timetable/:id
 */
export const deleteTimetable = async (id: string): Promise<void> => {
  await apiFetch(`/timetable/${id}`, { method: 'DELETE' });
};

/**
 * Get timetable statistics — computed client-side.
 */
export const getTimetableStats = async () => {
  const timetables = await getTimetables();

  const uniqueClasses = new Set(
    timetables.map((t) => `${t.classId}-${t.sectionId}`)
  ).size;

  const totalPeriods = timetables.reduce(
    (sum, t) => sum + t.periods.length,
    0
  );

  const uniqueTeachers = new Set(
    timetables.flatMap((t) => t.periods.map((p) => p.teacherId))
  ).size;

  const uniqueSubjects = new Set(
    timetables.flatMap((t) => t.periods.map((p) => p.subject))
  ).size;

  const daysWithTimetable = new Set(timetables.map((t) => t.day)).size;

  return {
    totalTimetables: timetables.length,
    uniqueClasses,
    totalPeriods,
    uniqueTeachers,
    uniqueSubjects,
    daysWithTimetable,
  };
};

// Barrel export for consumers using `TimetableService.xxx`
export const TimetableService = {
  getTimetables,
  getTimetableById,
  getTimetablesByClass,
  createTimetable,
  updateTimetable,
  deleteTimetable,
  getTimetableStats,
};
