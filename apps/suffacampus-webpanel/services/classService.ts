import { apiFetch, ApiError } from '@/lib/api';
import { Class, Section } from '@/types';

type SectionPayload = {
  id?: string;
  sectionName: string;
  capacity: number;
  teacherId?: string | null;
  teacherName?: string | null;
};

type CreateClassPayload = {
  className: string;
  grade: number;
  capacity: number;
  isActive: boolean;
  sections: SectionPayload[];
};

type UpdateClassPayload = Partial<{
  className: string;
  grade: number;
  capacity: number;
  isActive: boolean;
  sections: SectionPayload[];
}>;

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

function toTeacherFieldValue(value: unknown): string | null | undefined {
  if (value === null) return null;
  if (typeof value !== 'string') return undefined;

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toSectionPayload(section: Partial<Section> | SectionPayload): SectionPayload {
  const sectionName = typeof section.sectionName === 'string' ? section.sectionName.trim() : '';
  const capacity = typeof section.capacity === 'number' ? section.capacity : Number(section.capacity ?? 0);
  const teacherId = toTeacherFieldValue(section.teacherId);
  const teacherName = toTeacherFieldValue(section.teacherName);

  return {
    ...(typeof section.id === 'string' && section.id.trim().length > 0 ? { id: section.id.trim() } : {}),
    sectionName,
    capacity,
    ...(teacherId !== undefined ? { teacherId } : {}),
    ...(teacherName !== undefined ? { teacherName } : {}),
  };
}

function deserializeClass(raw: Record<string, unknown>): Class {
  const sections = Array.isArray(raw.sections)
    ? (raw.sections as Record<string, unknown>[]).map((s) => ({
        ...(s as unknown as Section),
      }))
    : [];

  return {
    ...(raw as unknown as Class),
    sections,
    createdAt: toDate(raw.createdAt),
    updatedAt: toDate(raw.updatedAt),
  };
}

// ---------------------------------------------------------------------------
// Service Functions — Backend: /classes
// ---------------------------------------------------------------------------

/**
 * Get all active classes (unpaginated) — backend: GET /classes/all
 */
export const getClasses = async (): Promise<Class[]> => {
  const raw = await apiFetch<Record<string, unknown>[]>('/classes/all');
  return raw.map(deserializeClass);
};

/**
 * Get a single class by ID — backend: GET /classes/:id
 */
export const getClassById = async (id: string): Promise<Class | null> => {
  try {
    const raw = await apiFetch<Record<string, unknown>>(`/classes/${id}`);
    return deserializeClass(raw);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  }
};

/**
 * Create a new class — backend: POST /classes
 */
export const createClass = async (
  data: CreateClassPayload
): Promise<string> => {
  const raw = await apiFetch<Record<string, unknown>>('/classes', {
    method: 'POST',
    body: JSON.stringify({
      ...data,
      sections: data.sections.map(toSectionPayload),
    }),
  });
  return raw.id as string;
};

/**
 * Update a class — backend: PATCH /classes/:id
 */
export const updateClass = async (
  id: string,
  data: UpdateClassPayload
): Promise<void> => {
  const payload = data.sections
    ? { ...data, sections: data.sections.map(toSectionPayload) }
    : data;

  await apiFetch(`/classes/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
};

/**
 * Delete a class (soft-delete) — backend: DELETE /classes/:id
 */
export const deleteClass = async (id: string): Promise<void> => {
  await apiFetch(`/classes/${id}`, { method: 'DELETE' });
};

/**
 * Add a section to a class — backend: POST /classes/:id/sections
 */
export const addSection = async (
  classId: string,
  section: SectionPayload | Section
): Promise<void> => {
  await apiFetch(`/classes/${classId}/sections`, {
    method: 'POST',
    body: JSON.stringify(toSectionPayload(section)),
  });
};

/**
 * Update a section within a class.
 * Backend has no dedicated section-update route — fetch class,
 * merge sections, PATCH class.
 */
export const updateSection = async (
  classId: string,
  sectionId: string,
  data: Partial<Section>
): Promise<void> => {
  const classData = await getClassById(classId);
  if (!classData) throw new Error('Class not found');

  const updatedSections = classData.sections.map((s) =>
    s.id === sectionId ? toSectionPayload({ ...s, ...data }) : toSectionPayload(s)
  );
  await updateClass(classId, { sections: updatedSections });
};

/**
 * Delete a section — backend: DELETE /classes/:id/sections/:sectionId
 */
export const deleteSection = async (
  classId: string,
  sectionId: string
): Promise<void> => {
  await apiFetch(`/classes/${classId}/sections/${sectionId}`, {
    method: 'DELETE',
  });
};

/**
 * Get class statistics — computed client-side from getClasses().
 */
export const getClassStats = async () => {
  const classes = await getClasses();

  const totalClasses = classes.length;
  const totalSections = classes.reduce((sum, c) => sum + c.sections.length, 0);
  const totalCapacity = classes.reduce((sum, c) => sum + c.capacity, 0);
  const totalStudents = classes.reduce(
    (sum, c) =>
      sum + c.sections.reduce((s, sec) => s + sec.studentsCount, 0),
    0
  );
  const averageClassSize =
    totalSections > 0 ? Math.round(totalStudents / totalSections) : 0;
  const occupancyRate =
    totalCapacity > 0
      ? Math.round((totalStudents / totalCapacity) * 100)
      : 0;

  return {
    totalClasses,
    totalSections,
    totalCapacity,
    totalStudents,
    averageClassSize,
    occupancyRate,
  };
};

// Barrel export for consumers using `ClassService.xxx`
export const ClassService = {
  getClasses,
  getClassById,
  createClass,
  updateClass,
  deleteClass,
  addSection,
  updateSection,
  deleteSection,
  getClassStats,
};
