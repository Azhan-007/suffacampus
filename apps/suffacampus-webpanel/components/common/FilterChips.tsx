'use client';

import { X } from 'lucide-react';

// ── Types ────────────────────────────────────────────────────────────

export interface FilterChip {
  key: string;
  label: string;
  clear: () => void;
}

interface FilterChipsProps {
  /** Array of active filter chips */
  chips: FilterChip[];
  /** Called when "Clear all" is clicked */
  onClearAll: () => void;
}

// ── Component ────────────────────────────────────────────────────────

/**
 * Active-filter pills with individual dismiss and "Clear all" button.
 *
 * Renders nothing when `chips` is empty.
 */
export default function FilterChips({ chips, onClearAll }: FilterChipsProps) {
  if (chips.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 px-5 py-2.5 border-b border-slate-100 bg-slate-50/50">
      <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wider mr-1">
        Filters:
      </span>
      {chips.map((chip) => (
        <span
          key={chip.key}
          className="inline-flex items-center gap-1 px-2 py-0.5 bg-white rounded-md border border-slate-200 text-xs text-slate-600"
        >
          {chip.label}
          <button
            onClick={chip.clear}
            className="text-slate-400 hover:text-slate-600"
            aria-label={`Remove ${chip.label} filter`}
          >
            <X className="w-3 h-3" />
          </button>
        </span>
      ))}
      {chips.length > 1 && (
        <button
          onClick={onClearAll}
          className="text-[10px] text-blue-600 hover:text-blue-700 font-medium ml-1"
        >
          Clear all
        </button>
      )}
    </div>
  );
}
