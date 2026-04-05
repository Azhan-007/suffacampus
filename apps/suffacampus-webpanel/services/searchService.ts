import { apiFetch } from '@/lib/api';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type SearchableEntity = 'students' | 'teachers' | 'library';

export interface SearchResult {
  id: string;
  entity: SearchableEntity;
  name: string;
  subtitle: string;
  score: number;
}

/* ------------------------------------------------------------------ */
/*  Service                                                            */
/* ------------------------------------------------------------------ */

export class SearchService {
  /**
   * Full-text search across students, teachers, and library books.
   */
  static async search(
    query: string,
    options?: {
      entities?: SearchableEntity[];
      limit?: number;
    }
  ): Promise<SearchResult[]> {
    const params = new URLSearchParams({ q: query });
    if (options?.entities?.length) {
      params.set('entities', options.entities.join(','));
    }
    if (options?.limit) {
      params.set('limit', String(options.limit));
    }
    return apiFetch<SearchResult[]>(`/search?${params.toString()}`);
  }

  /**
   * Trigger a reindex for a specific entity (admin only).
   */
  static async reindex(entity: SearchableEntity): Promise<{ indexed: number }> {
    return apiFetch(`/search/reindex/${entity}`, { method: 'POST' });
  }
}
