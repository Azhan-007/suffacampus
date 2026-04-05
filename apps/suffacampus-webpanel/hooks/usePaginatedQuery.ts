'use client';

import { useState, useCallback, useMemo } from 'react';
import {
  useQuery,
  useQueryClient,
  keepPreviousData,
} from '@tanstack/react-query';
import {
  apiFetchPaginated,
  PaginationParams,
  PaginatedResponse,
  PaginationMeta,
} from '@/lib/api';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface UsePaginatedQueryOptions<TFilters extends Record<string, any> = {}> {
  /** API path, e.g. '/students' */
  path: string;
  /** React Query key prefix, e.g. ['students'] */
  queryKey: string[];
  /** Items per page (default 20) */
  pageSize?: number;
  /** Request total count from backend (default true on first page) */
  countOnFirstPage?: boolean;
  /** Default sort field */
  sortBy?: string;
  /** Default sort direction */
  sortOrder?: 'asc' | 'desc';
  /** Extra filter params merged into the request */
  filters?: TFilters;
  /** Enable/disable the query (default true) */
  enabled?: boolean;
  /** Refetch interval in ms (0 = disabled) */
  refetchInterval?: number;
}

export interface UsePaginatedQueryResult<T> {
  /** Current page data */
  data: T[];
  /** Whether the query is loading initially */
  isLoading: boolean;
  /** Whether a background refetch is happening */
  isFetching: boolean;
  /** Error, if any */
  error: Error | null;
  /** Pagination metadata from backend */
  pagination: PaginationMeta;
  /** Current page number (1-based, for display) */
  page: number;
  /** Items per page */
  pageSize: number;
  /** Go to next page (disabled when !hasMore) */
  nextPage: () => void;
  /** Go to previous page */
  prevPage: () => void;
  /** Reset to first page */
  firstPage: () => void;
  /** Whether there is a next page */
  hasNextPage: boolean;
  /** Whether there is a previous page */
  hasPrevPage: boolean;
  /** Manually refetch current page */
  refetch: () => void;
  /** Change page size */
  setPageSize: (size: number) => void;
  /** Sort controls */
  sortBy: string | undefined;
  sortOrder: 'asc' | 'desc';
  setSorting: (field: string, order?: 'asc' | 'desc') => void;
}

/* ------------------------------------------------------------------ */
/*  Hook                                                               */
/* ------------------------------------------------------------------ */

export function usePaginatedQuery<T, TFilters extends Record<string, any> = {}>(
  options: UsePaginatedQueryOptions<TFilters>
): UsePaginatedQueryResult<T> {
  const {
    path,
    queryKey,
    pageSize: defaultPageSize = 20,
    countOnFirstPage = true,
    sortBy: defaultSortBy,
    sortOrder: defaultSortOrder = 'desc',
    filters = {} as TFilters,
    enabled = true,
    refetchInterval = 0,
  } = options;

  const queryClient = useQueryClient();

  // Cursor stack — enables "previous page" navigation
  const [cursorStack, setCursorStack] = useState<(string | null)[]>([null]);
  const [pageSize, setPageSizeState] = useState(defaultPageSize);
  const [sortBy, setSortBy] = useState(defaultSortBy);
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>(defaultSortOrder);

  const page = cursorStack.length;
  const currentCursor = cursorStack[cursorStack.length - 1];

  // Build params for the API call
  const params = useMemo<PaginationParams>(() => {
    const p: PaginationParams = {
      limit: pageSize,
      cursor: currentCursor,
      sortBy,
      sortOrder,
      count: page === 1 && countOnFirstPage ? true : undefined,
      ...filters,
    };
    return p;
  }, [pageSize, currentCursor, sortBy, sortOrder, page, countOnFirstPage, filters]);

  // Stable query key includes all params that affect the result
  const fullQueryKey = useMemo(
    () => [...queryKey, params],
    [queryKey, params]
  );

  const { data: response, isLoading, isFetching, error, refetch } = useQuery<
    PaginatedResponse<T>,
    Error
  >({
    queryKey: fullQueryKey,
    queryFn: () => apiFetchPaginated<T>(path, params),
    enabled,
    placeholderData: keepPreviousData,
    refetchInterval: refetchInterval || undefined,
  });

  const data = response?.data ?? [];
  const pagination = response?.pagination ?? {
    cursor: null,
    hasMore: false,
    limit: pageSize,
  };

  // Navigation
  const nextPage = useCallback(() => {
    if (pagination.hasMore && pagination.cursor) {
      setCursorStack((prev) => [...prev, pagination.cursor]);
    }
  }, [pagination.hasMore, pagination.cursor]);

  const prevPage = useCallback(() => {
    setCursorStack((prev) => (prev.length > 1 ? prev.slice(0, -1) : prev));
  }, []);

  const firstPage = useCallback(() => {
    setCursorStack([null]);
  }, []);

  const setPageSize = useCallback(
    (size: number) => {
      setPageSizeState(size);
      setCursorStack([null]); // reset to first page
    },
    []
  );

  const setSorting = useCallback(
    (field: string, order?: 'asc' | 'desc') => {
      setSortBy(field);
      if (order) setSortOrder(order);
      else setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
      setCursorStack([null]); // reset to first page
    },
    []
  );

  return {
    data,
    isLoading,
    isFetching,
    error,
    pagination,
    page,
    pageSize,
    nextPage,
    prevPage,
    firstPage,
    hasNextPage: pagination.hasMore,
    hasPrevPage: cursorStack.length > 1,
    refetch,
    setPageSize,
    sortBy,
    sortOrder,
    setSorting,
  };
}
