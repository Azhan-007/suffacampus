import { apiFetch } from '@/lib/api';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface ChildSummary {
  studentId: string;
  name: string;
  class: string;
  section: string;
  rollNumber: string;
  photoURL?: string;
  attendanceRate: number | null;
  pendingFees: number;
  lastExamScore: string | null;
}

export interface AttendanceRecord {
  id: string;
  date: string;
  status: 'Present' | 'Absent' | 'Late' | 'Excused';
  remarks?: string;
  classId: string;
}

export interface FeeRecord {
  id: string;
  feeType: string;
  amount: number;
  status: 'Paid' | 'Pending' | 'Overdue';
  dueDate: string;
  paidDate?: string;
}

export interface ResultRecord {
  id: string;
  examName: string;
  examType: string;
  subject: string;
  obtainedMarks: number;
  totalMarks: number;
  grade?: string;
}

export interface EventRecord {
  id: string;
  title: string;
  description: string;
  date: string;
  eventType: string;
}

export interface ParentInvite {
  id: string;
  code: string;
  schoolId: string;
  studentId: string;
  studentName?: string;
  isActive: boolean;
  expiresAt: string;
  createdAt: string;
  redeemedBy?: string;
  redeemedAt?: string;
}

/* ------------------------------------------------------------------ */
/*  Service                                                            */
/* ------------------------------------------------------------------ */

export class ParentService {
  /**
   * Get summary cards for all linked children.
   */
  static async getChildren(): Promise<ChildSummary[]> {
    return apiFetch<ChildSummary[]>('/parent/children');
  }

  /**
   * Get attendance records for a specific child.
   */
  static async getChildAttendance(studentId: string): Promise<AttendanceRecord[]> {
    return apiFetch<AttendanceRecord[]>(`/parent/children/${studentId}/attendance`);
  }

  /**
   * Get fee records for a specific child.
   */
  static async getChildFees(studentId: string): Promise<FeeRecord[]> {
    return apiFetch<FeeRecord[]>(`/parent/children/${studentId}/fees`);
  }

  /**
   * Get exam results for a specific child.
   */
  static async getChildResults(studentId: string): Promise<ResultRecord[]> {
    return apiFetch<ResultRecord[]>(`/parent/children/${studentId}/results`);
  }

  /**
   * Get upcoming school events.
   */
  static async getEvents(): Promise<EventRecord[]> {
    return apiFetch<EventRecord[]>('/parent/events');
  }

  /**
   * Redeem an invite code to link a child.
   */
  static async linkChild(code: string): Promise<{ schoolId: string; studentId: string; studentName: string }> {
    return apiFetch('/parent/link', {
      method: 'POST',
      body: JSON.stringify({ code }),
    });
  }

  /* ─── Admin invite management ─────────────────────────────────── */

  /**
   * Generate a new parent invite code for a student (Admin only).
   */
  static async createInvite(studentId: string): Promise<ParentInvite> {
    return apiFetch<ParentInvite>('/parent/invites', {
      method: 'POST',
      body: JSON.stringify({ studentId }),
    });
  }

  /**
   * List all active parent invites for the school (Admin only).
   */
  static async getInvites(): Promise<ParentInvite[]> {
    return apiFetch<ParentInvite[]>('/parent/invites');
  }
}
