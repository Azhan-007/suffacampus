import { apiFetch, ApiError } from '@/lib/api';
import { Result } from '@/types';

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

function deserializeResult(raw: Record<string, unknown>): Result {
  return {
    ...(raw as unknown as Result),
    createdAt: toDate(raw.createdAt),
    updatedAt: toDate(raw.updatedAt),
  };
}

// ---------------------------------------------------------------------------

export class ResultService {
  private static calculateGrade(percentage: number): string {
    if (percentage >= 90) return 'A+';
    if (percentage >= 80) return 'A';
    if (percentage >= 70) return 'B+';
    if (percentage >= 60) return 'B';
    if (percentage >= 50) return 'C';
    if (percentage >= 40) return 'D';
    return 'F';
  }

  private static calculateStatus(percentage: number): 'Pass' | 'Fail' {
    return percentage >= 40 ? 'Pass' : 'Fail';
  }

  /**
   * Get all results — backend: GET /results
   */
  static async getResults(): Promise<Result[]> {
    const raw = await apiFetch<Record<string, unknown>[]>('/results?limit=1000');
    return raw.map(deserializeResult);
  }

  /**
   * Get result by ID — backend: GET /results/:id
   */
  static async getResultById(id: string): Promise<Result | null> {
    try {
      const raw = await apiFetch<Record<string, unknown>>(`/results/${id}`);
      return deserializeResult(raw);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) return null;
      throw err;
    }
  }

  /**
   * Create new result — backend: POST /results
   * Percentage, grade, and status are calculated client-side before sending.
   */
  static async createResult(
    data: Omit<Result, 'id' | 'createdAt' | 'updatedAt' | 'percentage' | 'grade' | 'status'>
  ): Promise<string> {
    const percentage = Math.round((data.marksObtained / data.totalMarks) * 100);
    const grade = ResultService.calculateGrade(percentage);
    const status = ResultService.calculateStatus(percentage);

    const raw = await apiFetch<Record<string, unknown>>('/results', {
      method: 'POST',
      body: JSON.stringify({ ...data, percentage, grade, status }),
    });
    return raw.id as string;
  }

  /**
   * Update result — backend: PATCH /results/:id
   */
  static async updateResult(
    id: string,
    data: Partial<Omit<Result, 'id' | 'createdAt' | 'updatedAt'>>
  ): Promise<void> {
    const payload: Record<string, unknown> = { ...data };

    // Recalculate derived fields if marks changed
    if (data.marksObtained !== undefined || data.totalMarks !== undefined) {
      const existing = await ResultService.getResultById(id);
      if (existing) {
        const marksObtained = data.marksObtained ?? existing.marksObtained;
        const totalMarks = data.totalMarks ?? existing.totalMarks;
        const percentage = Math.round((marksObtained / totalMarks) * 100);
        payload.percentage = percentage;
        payload.grade = ResultService.calculateGrade(percentage);
        payload.status = ResultService.calculateStatus(percentage);
      }
    }

    await apiFetch(`/results/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  }

  /**
   * Delete result (soft-delete) — backend: DELETE /results/:id
   */
  static async deleteResult(id: string): Promise<void> {
    await apiFetch(`/results/${id}`, { method: 'DELETE' });
  }

  /**
   * Get result statistics — computed client-side.
   */
  static async getResultStats(): Promise<{
    totalResults: number;
    passCount: number;
    failCount: number;
    averagePercentage: number;
    gradeDistribution: { grade: string; count: number }[];
  }> {
    const results = await ResultService.getResults();

    const passCount = results.filter((r) => r.status === 'Pass').length;
    const failCount = results.filter((r) => r.status === 'Fail').length;
    const averagePercentage =
      results.length > 0
        ? Math.round(
            results.reduce((sum, r) => sum + r.percentage, 0) / results.length
          )
        : 0;

    const gradeMap = new Map<string, number>();
    results.forEach((r) => {
      gradeMap.set(r.grade, (gradeMap.get(r.grade) || 0) + 1);
    });

    const gradeOrder = ['A+', 'A', 'B+', 'B', 'C', 'D', 'F'];
    const gradeDistribution = Array.from(gradeMap.entries())
      .map(([grade, count]) => ({ grade, count }))
      .sort(
        (a, b) => gradeOrder.indexOf(a.grade) - gradeOrder.indexOf(b.grade)
      );

    return {
      totalResults: results.length,
      passCount,
      failCount,
      averagePercentage,
      gradeDistribution,
    };
  }

  /**
   * Get results by student — backend: GET /results/student/:studentId
   */
  static async getResultsByStudent(studentId: string): Promise<Result[]> {
    const raw = await apiFetch<Record<string, unknown>[]>(
      `/results/student/${studentId}?limit=1000`
    );
    return raw.map(deserializeResult);
  }

  /**
   * Get results by class — backend: GET /results?classId=…&sectionId=…
   */
  static async getResultsByClass(
    classId: string,
    sectionId?: string
  ): Promise<Result[]> {
    const params = new URLSearchParams({ classId, limit: '1000' });
    if (sectionId) params.set('sectionId', sectionId);

    const raw = await apiFetch<Record<string, unknown>[]>(`/results?${params}`);
    return raw.map(deserializeResult);
  }

  /**
   * Get results by exam — backend: GET /results?examType=…&examName=…
   */
  static async getResultsByExam(
    examType: string,
    examName?: string
  ): Promise<Result[]> {
    const params = new URLSearchParams({
      examType,
      limit: '1000',
    });
    if (examName) params.set('examName', examName);

    const raw = await apiFetch<Record<string, unknown>[]>(`/results?${params}`);
    return raw.map(deserializeResult);
  }
}
