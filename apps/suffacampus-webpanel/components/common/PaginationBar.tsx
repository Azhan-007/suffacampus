'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import Select from './Select';
import { PAGE_SIZE_OPTIONS } from '@/lib/utils';

// ── Types ────────────────────────────────────────────────────────────

interface PaginationBarProps {
  /** Current page (1-indexed) */
  page: number;
  /** Total number of pages */
  totalPages: number;
  /** Callback to change the page */
  setPage: (page: number) => void;
  /** Current page size */
  pageSize: number;
  /** Callback to change page size */
  setPageSize: (size: number) => void;
  /** Total number of items (used for "Showing X–Y of Z") */
  totalItems: number;
  /** Whether to show the page size selector (default: true) */
  showPageSize?: boolean;
}

// ── Component ────────────────────────────────────────────────────────

/**
 * Reusable pagination bar with page numbers, prev/next, and page-size selector.
 *
 * Replaces the ~40-line pagination JSX block duplicated across every CRUD page.
 */
export default function PaginationBar({
  page,
  totalPages,
  setPage,
  pageSize,
  setPageSize,
  totalItems,
  showPageSize = true,
}: PaginationBarProps) {
  if (totalPages <= 1 && !showPageSize) return null;

  const startItem = totalItems > 0 ? (page - 1) * pageSize + 1 : 0;
  const endItem = Math.min(page * pageSize, totalItems);

  return (
    <div className="flex items-center justify-between px-5 py-3 border-t border-slate-100 bg-white">
      {/* Left: showing count + page size */}
      <div className="flex items-center gap-3">
        <p className="text-xs text-slate-400">
          {totalItems > 0 ? (
            <>
              Showing{' '}
              <span className="font-semibold text-slate-600">{startItem}</span>–
              <span className="font-semibold text-slate-600">{endItem}</span>{' '}
              of <span className="font-semibold text-slate-600">{totalItems}</span>
            </>
          ) : (
            <>
              Page <span className="font-semibold text-slate-600">{page}</span> of{' '}
              <span className="font-semibold text-slate-600">{totalPages}</span>
            </>
          )}
        </p>
        {showPageSize && (
          <div className="w-[100px]">
            <Select
              value={String(pageSize)}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPage(1);
              }}
              options={PAGE_SIZE_OPTIONS.map((n) => ({ value: String(n), label: `${n} rows` }))}
            />
          </div>
        )}
      </div>

      {/* Right: page numbers */}
      {totalPages > 1 && (
        <div className="flex items-center gap-1">
          <button
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
            className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-white hover:text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
            let num: number;
            if (totalPages <= 5) num = i + 1;
            else if (page <= 3) num = i + 1;
            else if (page >= totalPages - 2) num = totalPages - 4 + i;
            else num = page - 2 + i;
            return (
              <button
                key={num}
                onClick={() => setPage(num)}
                className={`w-8 h-8 rounded-lg text-xs font-medium transition-colors ${
                  page === num
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-500 hover:bg-white hover:text-slate-700 border border-transparent hover:border-slate-200'
                }`}
              >
                {num}
              </button>
            );
          })}
          <button
            disabled={page >= totalPages}
            onClick={() => setPage(page + 1)}
            className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-white hover:text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}
