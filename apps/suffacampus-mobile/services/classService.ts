/**
 * classService.ts
 *
 * Backend routes:
 *   GET  /classes/all  — all classes for the school (unpaginated)
 */

import { apiFetch } from "./api";

export interface ClassSection {
  id: string;
  sectionName: string;
  capacity: number;
  teacherId?: string;
  teacherName?: string;
}

export interface ClassDocument {
  id: string;
  className: string;
  grade: number;
  sections: ClassSection[];
  capacity: number;
  isActive: boolean;
  schoolId: string;
}

/** A flattened class+section entry with actual Firestore IDs */
export interface ClassSectionEntry {
  classId: string;
  sectionId: string;
  label: string;        // e.g. "10A"
  className: string;    // e.g. "10"
  sectionName: string;  // e.g. "A"
}

/** Fetch all classes for the current school. */
export async function getAllClasses(): Promise<ClassDocument[]> {
  return apiFetch<ClassDocument[]>("/classes/all");
}

/**
 * Get flat class-section entries with real Firestore IDs.
 * Each entry has { classId, sectionId, label, className, sectionName }.
 */
export async function getClassSectionEntries(): Promise<ClassSectionEntry[]> {
  const classes = await getAllClasses();
  const entries: ClassSectionEntry[] = [];
  for (const cls of classes) {
    if (!cls.isActive) continue;
    for (const section of cls.sections) {
      entries.push({
        classId: cls.id,
        sectionId: section.id,
        label: `${cls.className}${section.sectionName}`,
        className: cls.className,
        sectionName: section.sectionName,
      });
    }
  }
  return entries.sort((a, b) => {
    const gradeA = parseInt(a.className) || 0;
    const gradeB = parseInt(b.className) || 0;
    if (gradeA !== gradeB) return gradeA - gradeB;
    return a.label.localeCompare(b.label);
  });
}

/**
 * Get flat class labels like ["10A", "10B", "9A", "9B"] from the API.
 * @deprecated Use getClassSectionEntries() instead for proper IDs.
 */
export async function getClassLabels(): Promise<string[]> {
  const entries = await getClassSectionEntries();
  return entries.map((e) => e.label);
}
