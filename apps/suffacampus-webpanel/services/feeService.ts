import { apiFetch, ApiError } from '@/lib/api';
import { Fee } from '@/types';

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

function deserializeFee(raw: Record<string, unknown>): Fee {
  return {
    ...(raw as unknown as Fee),
    dueDate: toDate(raw.dueDate),
    paidDate: raw.paidDate ? toDate(raw.paidDate) : undefined,
    createdAt: toDate(raw.createdAt),
    updatedAt: toDate(raw.updatedAt),
  };
}

// ---------------------------------------------------------------------------

export class FeeService {
  /**
   * Get all fees with optional filters — backend: GET /fees
   * schoolId is enforced server-side via the auth token (tenant guard).
   */
  static async getFees(
    _schoolId: string,
    filters?: {
      status?: string;
      studentId?: string;
      classId?: string;
      feeType?: string;
    }
  ): Promise<Fee[]> {
    const params = new URLSearchParams({ limit: '1000' });
    if (filters?.status) params.set('status', filters.status);
    if (filters?.studentId) params.set('studentId', filters.studentId);
    if (filters?.classId) params.set('classId', filters.classId);
    if (filters?.feeType) params.set('feeType', filters.feeType);

    const raw = await apiFetch<Record<string, unknown>[]>(`/fees?${params}`);
    return raw.map(deserializeFee);
  }

  /**
   * Get fee by ID — backend: GET /fees/:id
   */
  static async getFeeById(_schoolId: string, id: string): Promise<Fee | null> {
    try {
      const raw = await apiFetch<Record<string, unknown>>(`/fees/${id}`);
      return deserializeFee(raw);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) return null;
      throw err;
    }
  }

  /**
   * Create fee — backend: POST /fees
   */
  static async createFee(
    _schoolId: string,
    feeData: Omit<Fee, 'id' | 'schoolId' | 'createdAt' | 'updatedAt'>
  ): Promise<string> {
    const raw = await apiFetch<Record<string, unknown>>('/fees', {
      method: 'POST',
      body: JSON.stringify(feeData),
    });
    return raw.id as string;
  }

  /**
   * Update fee — backend: PATCH /fees/:id
   */
  static async updateFee(
    _schoolId: string,
    id: string,
    feeData: Partial<Omit<Fee, 'schoolId'>>
  ): Promise<void> {
    await apiFetch(`/fees/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(feeData),
    });
  }

  /**
   * Delete fee — backend: DELETE /fees/:id
   */
  static async deleteFee(_schoolId: string, id: string): Promise<void> {
    await apiFetch(`/fees/${id}`, { method: 'DELETE' });
  }

  /**
   * Get fee statistics — backend: GET /fees/stats
   */
  static async getFeeStats(
    _schoolId: string
  ): Promise<{
    total: number;
    collected: number;
    pending: number;
    overdue: number;
    partial: number;
    collectionRate: number;
  }> {
    try {
      const stats = await apiFetch<Record<string, number>>('/fees/stats');
      return {
        total: stats.total ?? 0,
        collected: stats.collected ?? 0,
        pending: stats.pending ?? 0,
        overdue: stats.overdue ?? 0,
        partial: stats.partial ?? 0,
        collectionRate: stats.collectionRate ?? 0,
      };
    } catch {
      return { total: 0, collected: 0, pending: 0, overdue: 0, partial: 0, collectionRate: 0 };
    }
  }

  /**
   * Get monthly fee collection data for dashboard charts.
   * Fetches all fees then groups client-side.
   */
  static async getMonthlyFeeCollection(
    schoolId: string,
    months: number = 6
  ): Promise<
    Array<{ name: string; collected: number; pending: number }>
  > {
    const monthNames = [
      'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
    ];
    const today = new Date();

    try {
      const fees = await FeeService.getFees(schoolId);
      return Array.from({ length: months }, (_, i) => {
        const monthIndex = (today.getMonth() - (months - 1 - i) + 12) % 12;
        const monthFees = fees.filter((fee) => {
          const feeMonth = new Date(fee.dueDate).getMonth();
          return feeMonth === monthIndex;
        });

        const collected = monthFees
          .filter((f) => f.status === 'Paid')
          .reduce((sum, f) => sum + f.amount, 0);
        const pending = monthFees
          .filter((f) => f.status !== 'Paid')
          .reduce((sum, f) => sum + (f.amount - (f.amountPaid || 0)), 0);

        return { name: monthNames[monthIndex], collected, pending };
      });
    } catch {
      return [];
    }
  }

  /**
   * Mark fee as paid — backend: PATCH /fees/:id
   */
  static async markAsPaid(
    schoolId: string,
    id: string,
    paymentData: {
      paymentMode: string;
      transactionId?: string;
      amountPaid: number;
    }
  ): Promise<void> {
    const fee = await FeeService.getFeeById(schoolId, id);
    if (!fee) throw new Error('Fee not found or access denied');

    const totalPaid = (fee.amountPaid || 0) + paymentData.amountPaid;
    const status = totalPaid >= fee.amount ? 'Paid' : 'Partial';

    await FeeService.updateFee(schoolId, id, {
      ...paymentData,
      amountPaid: totalPaid,
      status,
      paidDate: status === 'Paid' ? new Date() : fee.paidDate,
    });
  }
}
