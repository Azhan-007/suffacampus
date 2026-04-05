'use client';

import { ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';

// ── Types ────────────────────────────────────────────────────────────

interface SortableHeaderProps<F extends string> {
  /** The field this column sorts by */
  field: F;
  /** Label text displayed in the header */
  label: string;
  /** Currently active sort field */
  sortField: F;
  /** Current sort direction */
  sortDir: 'asc' | 'desc';
  /** Called when the user clicks to toggle sort */
  onSort: (field: F) => void;
  /** Extra classes for the button */
  className?: string;
}

// ── Component ────────────────────────────────────────────────────────

/**
 * Sortable table column header.
 *
 * Replaces the duplicated `SortIcon` component + inline `onClick`
 * pattern found across every CRUD page.
 *
 * Usage:
 * ```tsx
 * <SortableHeader field="name" label="Name" {...sortProps} />
 * ```
 */
export default function SortableHeader<F extends string>({
  field,
  label,
  sortField,
  sortDir,
  onSort,
  className = '',
}: SortableHeaderProps<F>) {
  const isActive = sortField === field;

  return (
    <button
      onClick={() => onSort(field)}
      className={`inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-700 transition-colors ${className}`}
    >
      {label}
      {!isActive && <ArrowUpDown className="w-3 h-3 text-slate-300" />}
      {isActive && sortDir === 'asc' && <ArrowUp className="w-3 h-3 text-blue-500" />}
      {isActive && sortDir === 'desc' && <ArrowDown className="w-3 h-3 text-blue-500" />}
    </button>
  );
}
