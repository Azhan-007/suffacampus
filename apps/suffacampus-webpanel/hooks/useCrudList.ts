'use client';

import { useState, useMemo, useCallback, useEffect } from 'react';
import type { FilterChip } from '@/components/common/FilterChips';

// ── Types ────────────────────────────────────────────────────────────

export type SortDir = 'asc' | 'desc';

export interface UseCrudListOptions<T, SortField extends string> {
  /** Full data array (from React Query, demo store, etc.) */
  items: T[];
  /** Default sort field */
  defaultSortField: SortField;
  /** Default sort direction (default: 'asc') */
  defaultSortDir?: SortDir;
  /** Default page size (default: 10) */
  defaultPageSize?: number;

  /**
   * Filter function — receives the full list and the current search term,
   * and should return the filtered subset.
   * Called inside useMemo, so any external filter state should be in the deps array provided.
   */
  filterFn: (items: T[], searchTerm: string) => T[];
  /** Memo deps for filterFn (filter state values) */
  filterDeps: unknown[];

  /**
   * Comparator function for sorting.
   * Should return a number like `localeCompare` or `a - b`.
   * The hook handles asc/desc inversion automatically.
   */
  compareFn: (a: T, b: T, field: SortField) => number;
}

export interface UseCrudListReturn<T, SortField extends string> {
  // ── Search ──
  searchTerm: string;
  setSearchTerm: (term: string) => void;

  // ── Sort ──
  sortField: SortField;
  sortDir: SortDir;
  toggleSort: (field: SortField) => void;
  /** Spread these onto <SortableHeader> */
  sortProps: { sortField: SortField; sortDir: SortDir; onSort: (field: SortField) => void };

  // ── Pagination ──
  page: number;
  setPage: (page: number) => void;
  pageSize: number;
  setPageSize: (size: number) => void;
  totalPages: number;

  // ── Derived data ──
  filtered: T[];
  sorted: T[];
  paginated: T[];

  // ── Selection ──
  selectedIds: Set<string>;
  setSelectedIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  allOnPageSelected: boolean;
  someOnPageSelected: boolean;
  toggleSelect: (id: string) => void;
  toggleSelectAll: () => void;
  clearSelection: () => void;

  // ── Helpers ──
  /** Builds the search chip for the filter chips bar */
  searchChip: FilterChip | null;
}

// ── Hook ─────────────────────────────────────────────────────────────

/**
 * Encapsulates the search → filter → sort → paginate → select pipeline
 * that is identical across every CRUD page.
 *
 * Each page only needs to provide:
 * 1. `filterFn` — the entity-specific filter logic
 * 2. `compareFn` — the entity-specific sort comparator
 * 3. Their own entity-specific filter state (class, status, etc.)
 */
export function useCrudList<T extends { id: string }, SortField extends string>(
  options: UseCrudListOptions<T, SortField>,
): UseCrudListReturn<T, SortField> {
  const {
    items,
    defaultSortField,
    defaultSortDir = 'asc',
    defaultPageSize = 10,
    filterFn,
    filterDeps,
    compareFn,
  } = options;

  // ── Search state ──
  const [searchTerm, setSearchTerm] = useState('');

  // ── Sort state ──
  const [sortField, setSortField] = useState<SortField>(defaultSortField);
  const [sortDir, setSortDir] = useState<SortDir>(defaultSortDir);

  // ── Pagination state ──
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(defaultPageSize);

  // ── Selection state ──
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // ── Filter → Sort → Paginate pipeline ──

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const filtered = useMemo(() => filterFn(items, searchTerm), [items, searchTerm, ...filterDeps]);

  const sorted = useMemo(() => {
    const list = [...filtered];
    list.sort((a, b) => {
      const cmp = compareFn(a, b, sortField);
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return list;
  }, [filtered, sortField, sortDir, compareFn]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));

  const paginated = useMemo(() => {
    const start = (page - 1) * pageSize;
    return sorted.slice(start, start + pageSize);
  }, [sorted, page, pageSize]);

  // ── Reset page when filters/sort change ──
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setPage(1); }, [searchTerm, sortField, sortDir, ...filterDeps]);

  // ── Sort toggle ──
  const toggleSort = useCallback((field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  }, [sortField]);

  // ── Selection helpers ──
  const allOnPageSelected = paginated.length > 0 && paginated.every((item) => selectedIds.has(item.id));
  const someOnPageSelected = paginated.some((item) => selectedIds.has(item.id));

  const toggleSelectAll = useCallback(() => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allOnPageSelected) {
        paginated.forEach((item) => next.delete(item.id));
      } else {
        paginated.forEach((item) => next.add(item.id));
      }
      return next;
    });
  }, [allOnPageSelected, paginated]);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  // ── Search chip ──
  const searchChip: FilterChip | null = searchTerm
    ? { key: 'search', label: `"${searchTerm}"`, clear: () => setSearchTerm('') }
    : null;

  return {
    searchTerm,
    setSearchTerm,
    sortField,
    sortDir,
    toggleSort,
    sortProps: { sortField, sortDir, onSort: toggleSort },
    page,
    setPage,
    pageSize,
    setPageSize,
    totalPages,
    filtered,
    sorted,
    paginated,
    selectedIds,
    setSelectedIds,
    allOnPageSelected,
    someOnPageSelected,
    toggleSelect,
    toggleSelectAll,
    clearSelection,
    searchChip,
  };
}
