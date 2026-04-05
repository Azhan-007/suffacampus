'use client';

import { useQuery, useMutation, useQueryClient, UseQueryOptions } from '@tanstack/react-query';
import { apiFetch, ApiError } from '@/lib/api';

/* ------------------------------------------------------------------ */
/*  useApiQuery — Wraps apiFetch in React Query                        */
/*                                                                     */
/*  Replaces the manual useEffect + setInterval polling pattern with   */
/*  automatic caching, background refetch, stale-while-revalidate,     */
/*  and deduplication.                                                 */
/* ------------------------------------------------------------------ */

export interface UseApiQueryOptions<T> {
  /** React Query key, e.g. ['students', schoolId] */
  queryKey: (string | undefined)[];
  /** API path, e.g. '/students' */
  path: string;
  /** Transform the raw response before caching */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  select?: (data: any) => T;
  /** Enable/disable the query */
  enabled?: boolean;
  /** Refetch interval in ms (default: 30_000 = 30s, matching old polling) */
  refetchInterval?: number;
  /** Stale time in ms (default: 30_000) */
  staleTime?: number;
}

export function useApiQuery<T = unknown>(options: UseApiQueryOptions<T>) {
  const {
    queryKey,
    path,
    select,
    enabled = true,
    refetchInterval = 30_000,
    staleTime = 30_000,
  } = options;

  return useQuery<T, ApiError>({
    queryKey,
    queryFn: () => apiFetch<T>(path),
    select,
    enabled,
    refetchInterval,
    staleTime,
    refetchOnWindowFocus: true,
  });
}

/* ------------------------------------------------------------------ */
/*  useApiMutation — Wraps mutations with auto-invalidation            */
/* ------------------------------------------------------------------ */

export interface UseApiMutationOptions<TInput, TOutput = void> {
  /** API path (or function returning path from input) */
  path: string | ((input: TInput) => string);
  /** HTTP method */
  method?: 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  /** Query keys to invalidate on success */
  invalidateKeys?: string[][];
  /** Success callback */
  onSuccess?: (data: TOutput, input: TInput) => void;
  /** Error callback */
  onError?: (error: ApiError) => void;
}

export function useApiMutation<TInput = void, TOutput = void>(
  options: UseApiMutationOptions<TInput, TOutput>
) {
  const { path, method = 'POST', invalidateKeys = [], onSuccess, onError } = options;
  const queryClient = useQueryClient();

  return useMutation<TOutput, ApiError, TInput>({
    mutationFn: async (input: TInput) => {
      const resolvedPath = typeof path === 'function' ? path(input) : path;
      return apiFetch<TOutput>(resolvedPath, {
        method,
        ...(method !== 'DELETE' && input ? { body: JSON.stringify(input) } : {}),
      });
    },
    onSuccess: (data, input) => {
      // Invalidate cached queries
      invalidateKeys.forEach((key) =>
        queryClient.invalidateQueries({ queryKey: key })
      );
      onSuccess?.(data, input);
    },
    onError,
  });
}
