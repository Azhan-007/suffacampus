/**
 * Unit tests for hooks — useApiQuery, useApiMutation, and useSchoolContext utilities.
 */

import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { useApiQuery, useApiMutation } from '@/hooks/useApiQuery';
import { requireSchoolId } from '@/hooks/useSchoolContext';

// ── Mock apiFetch ────────────────────────────────────────────────────

const mockApiFetch = jest.fn();
jest.mock('@/lib/api', () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
  ApiError: class ApiError extends Error {
    status: number;
    constructor(message: string, status = 500) {
      super(message);
      this.status = status;
    }
  },
}));

// ── React Query wrapper ──────────────────────────────────────────────

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children);
  };
}

// ═════════════════════════════════════════════════════════════════════

describe('useApiQuery', () => {
  beforeEach(() => {
    mockApiFetch.mockReset();
  });

  it('calls apiFetch with the given path', async () => {
    mockApiFetch.mockResolvedValueOnce([{ id: '1' }]);

    const { result } = renderHook(
      () => useApiQuery({ queryKey: ['test'], path: '/test' }),
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockApiFetch).toHaveBeenCalledWith('/test');
    expect(result.current.data).toEqual([{ id: '1' }]);
  });

  it('does not fetch when enabled = false', async () => {
    const { result } = renderHook(
      () => useApiQuery({ queryKey: ['nope'], path: '/nope', enabled: false }),
      { wrapper: createWrapper() },
    );

    // Give it a tick
    await new Promise((r) => setTimeout(r, 50));
    expect(mockApiFetch).not.toHaveBeenCalled();
    expect(result.current.isFetching).toBe(false);
  });

  it('applies select transform', async () => {
    mockApiFetch.mockResolvedValueOnce({ items: [1, 2, 3], total: 3 });

    const { result } = renderHook(
      () =>
        useApiQuery<number[]>({
          queryKey: ['select-test'],
          path: '/items',
          select: (data: { items: number[] }) => data.items,
        }),
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([1, 2, 3]);
  });

  it('exposes error on failure', async () => {
    mockApiFetch.mockRejectedValueOnce(new Error('Network error'));

    const { result } = renderHook(
      () => useApiQuery({ queryKey: ['fail'], path: '/fail' }),
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe('Network error');
  });
});

describe('useApiMutation', () => {
  beforeEach(() => {
    mockApiFetch.mockReset();
  });

  it('calls apiFetch with method and body', async () => {
    mockApiFetch.mockResolvedValueOnce({ ok: true });

    const { result } = renderHook(
      () =>
        useApiMutation<{ name: string }, { ok: boolean }>({
          path: '/create',
          method: 'POST',
        }),
      { wrapper: createWrapper() },
    );

    await act(async () => {
      result.current.mutate({ name: 'Test' });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockApiFetch).toHaveBeenCalledWith('/create', {
      method: 'POST',
      body: JSON.stringify({ name: 'Test' }),
    });
  });

  it('supports dynamic path from input', async () => {
    mockApiFetch.mockResolvedValueOnce(undefined);

    const { result } = renderHook(
      () =>
        useApiMutation<{ id: string }>({
          path: (input) => `/items/${input.id}`,
          method: 'DELETE',
        }),
      { wrapper: createWrapper() },
    );

    await act(async () => {
      result.current.mutate({ id: '42' });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockApiFetch).toHaveBeenCalledWith('/items/42', { method: 'DELETE' });
  });

  it('fires onSuccess callback', async () => {
    mockApiFetch.mockResolvedValueOnce({ id: '1' });
    const onSuccess = jest.fn();

    const { result } = renderHook(
      () =>
        useApiMutation<{ name: string }, { id: string }>({
          path: '/create',
          onSuccess,
        }),
      { wrapper: createWrapper() },
    );

    await act(async () => {
      result.current.mutate({ name: 'Foo' });
    });

    await waitFor(() => expect(onSuccess).toHaveBeenCalledWith({ id: '1' }, { name: 'Foo' }));
  });
});

// ── Pure utility functions from useSchoolContext ─────────────────────

describe('requireSchoolId', () => {
  it('returns the schoolId when provided', () => {
    expect(requireSchoolId('school-1')).toBe('school-1');
  });

  it('throws when schoolId is null', () => {
    expect(() => requireSchoolId(null)).toThrow('School context required');
  });
});
