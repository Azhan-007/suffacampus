/**
 * teacherService.ts
 *
 * Backend routes:
 *   GET  /teachers/:id          — get teacher profile by ID
 *   GET  /teacher-tasks?teacherId=&status= — list pending tasks
 *   GET  /teacher-activities?teacherId=&limit= — list recent activities
 */

import { apiFetch } from "./api";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface TeacherProfile {
  id: string;
  name: string;
  employeeId: string;
  designation: string;
  department: string;
  email: string;
  phone: string;
  alternatePhone?: string;
  dateOfBirth?: string;
  gender?: string;
  bloodGroup?: string;
  nationality?: string;
  religion?: string;
  address?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  emergencyContact?: string;
  emergencyContactName?: string;
  emergencyRelation?: string;
  qualification?: string;
  specialization?: string;
  experience?: string;
  joiningDate?: string;
  employmentType?: string;
  previousSchool?: string;
  classesAssigned?: string[];
  subjects?: string[];
  totalStudents?: number;
  workingHours?: string;
  bankName?: string;
  accountNumber?: string;
  accountHolderName?: string;
  ifscCode?: string;
  languages?: string[];
  hobbies?: string[];
  achievements?: string;
}

export interface PendingTask {
  id: string;
  type: "assignment" | "attendance" | "marks";
  title: string;
  class: string;
  dueDate: string;
  count?: number;
}

export interface TeacherActivity {
  id: string;
  type: string;
  title: string;
  time: string;
  icon: string;
  color: string;
}

export interface TeacherListItem {
  id: string;
  name: string;
  employeeId: string;
  designation: string;
  department: string;
  email: string;
  phone: string;
  qualification: string;
  specialization: string;
  experience: string;
  joiningDate: string;
  subjects: string[];
  classesAssigned: string[];
  totalStudents: number;
  alternatePhone?: string;
  dateOfBirth?: string;
  gender?: string;
  bloodGroup?: string;
  nationality?: string;
  religion?: string;
  address?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  emergencyContact?: string;
  emergencyContactName?: string;
  emergencyRelation?: string;
  employmentType?: string;
  previousSchool?: string;
  workingHours?: string;
  bankName?: string;
  accountNumber?: string;
  accountHolderName?: string;
  ifscCode?: string;
  languages?: string[];
  hobbies?: string[];
  achievements?: string;
}

// ─── Functions ───────────────────────────────────────────────────────────────

/** Get a teacher's profile by ID. Maps backend firstName/lastName to name. */
export async function getTeacherProfile(teacherId: string): Promise<TeacherProfile> {
  const raw = await apiFetch<any>(`/teachers/${teacherId}`);
  return {
    ...raw,
    name: raw.name || `${raw.firstName || ""} ${raw.lastName || ""}`.trim() || "",
  };
}

/** Get pending tasks for a teacher. Endpoint may not exist yet. */
export async function getTeacherPendingTasks(params: {
  teacherId: string;
  status?: string;
  limit?: number;
}): Promise<PendingTask[]> {
  try {
    return await apiFetch<PendingTask[]>("/teacher-tasks", {
      params: {
        teacherId: params.teacherId,
        status: params.status ?? "pending",
        limit: params.limit ?? 5,
      },
    });
  } catch {
    return [];
  }
}

/** Get recent activities for a teacher. Endpoint may not exist yet. */
export async function getTeacherActivities(params: {
  teacherId: string;
  limit?: number;
}): Promise<TeacherActivity[]> {
  try {
    return await apiFetch<TeacherActivity[]>("/teacher-activities", {
      params: {
        teacherId: params.teacherId,
        limit: params.limit ?? 5,
      },
    });
  } catch {
    return [];
  }
}

/** Get all teachers (admin). */
export async function getTeachers(): Promise<TeacherListItem[]> {
  return apiFetch<TeacherListItem[]>("/teachers");
}

/** Create a new teacher (admin). */
export async function createTeacher(
  data: Omit<TeacherListItem, "id">
): Promise<TeacherListItem> {
  return apiFetch<TeacherListItem>("/teachers", {
    method: "POST",
    body: data,
  });
}

/** Update an existing teacher (admin). */
export async function updateTeacher(
  id: string,
  data: Partial<Omit<TeacherListItem, "id">>
): Promise<TeacherListItem> {
  return apiFetch<TeacherListItem>(`/teachers/${id}`, {
    method: "PATCH",
    body: data,
  });
}

/** Delete a teacher (admin). */
export async function deleteTeacher(id: string): Promise<void> {
  await apiFetch<void>(`/teachers/${id}`, { method: "DELETE" });
}
