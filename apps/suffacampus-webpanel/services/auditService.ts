import { apiFetch } from '@/lib/api';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type AuditAction =
  | 'CREATE_STUDENT' | 'UPDATE_STUDENT' | 'DELETE_STUDENT'
  | 'CREATE_TEACHER' | 'UPDATE_TEACHER' | 'DELETE_TEACHER'
  | 'CREATE_CLASS' | 'UPDATE_CLASS' | 'DELETE_CLASS' | 'ADD_SECTION' | 'REMOVE_SECTION'
  | 'CREATE_EVENT' | 'UPDATE_EVENT' | 'DELETE_EVENT'
  | 'CREATE_FEE' | 'UPDATE_FEE' | 'DELETE_FEE'
  | 'CREATE_BOOK' | 'UPDATE_BOOK' | 'DELETE_BOOK' | 'ISSUE_BOOK' | 'RETURN_BOOK'
  | 'CREATE_RESULT' | 'UPDATE_RESULT' | 'DELETE_RESULT'
  | 'CREATE_TIMETABLE' | 'UPDATE_TIMETABLE' | 'DELETE_TIMETABLE'
  | 'UPDATE_SETTINGS'
  | 'MARK_ATTENDANCE' | 'BULK_ATTENDANCE' | 'PAYMENT_RECEIVED' | 'SUBSCRIPTION_UPGRADED' | 'WEBHOOK_RETRY'
  | 'CREATE_SCHOOL' | 'UPDATE_SCHOOL' | 'DELETE_SCHOOL' | 'CHANGE_PLAN'
  | 'CREATE_USER' | 'UPDATE_USER' | 'DELETE_USER'
  | 'SUBSCRIPTION_STATUS_CHANGE' | 'INVOICE_CREATED' | 'PAYMENT_FAILED' | 'REFUND_CREATED'
  | 'CREATE_PARENT_INVITE' | 'REDEEM_PARENT_INVITE';

export interface AuditLog {
  id: string;
  action: AuditAction;
  performedBy: string;
  schoolId: string;
  timestamp: { _seconds: number; _nanoseconds: number } | string;
  metadata: Record<string, unknown>;
}

export interface AuditLogResponse {
  data: AuditLog[];
  total: number;
}

/* ------------------------------------------------------------------ */
/*  Service                                                            */
/* ------------------------------------------------------------------ */

export class AuditService {
  /**
   * Fetch paginated audit logs for the current school.
   */
  static async getLogs(options?: {
    limit?: number;
    offset?: number;
    action?: AuditAction;
    performedBy?: string;
  }): Promise<AuditLogResponse> {
    const params = new URLSearchParams();
    if (options?.limit) params.set('limit', String(options.limit));
    if (options?.offset) params.set('offset', String(options.offset));
    if (options?.action) params.set('action', options.action);
    if (options?.performedBy) params.set('performedBy', options.performedBy);
    const qs = params.toString();

    // The backend returns { data: [...], pagination: { total } }
    // apiFetch unwraps `success` envelope, but pagination is on the response
    const raw = await apiFetch<any>(`/audit-logs${qs ? `?${qs}` : ''}`);

    // Handle both paginated shape and simple array
    if (Array.isArray(raw)) {
      return { data: raw, total: raw.length };
    }
    return {
      data: raw.data ?? raw,
      total: raw.pagination?.total ?? raw.total ?? 0,
    };
  }
}
