'use client';

import { ReactNode } from 'react';

interface TableProps {
  headers: string[];
  children: ReactNode;
  loading?: boolean;
  rowCount?: number;
}

function TableSkeletonRow({ columns }: { columns: number }) {
  return (
    <tr className="animate-pulse">
      {Array.from({ length: columns }).map((_, index) => (
        <td key={index} className="px-6 py-4">
          <div className="h-4 w-full max-w-[120px] bg-slate-100 rounded" />
        </td>
      ))}
    </tr>
  );
}

export function Table({ headers, children, loading = false, rowCount = 5 }: TableProps) {
  return (
    <div className="overflow-x-auto scrollbar-thin rounded-xl bg-white border border-slate-200" role="region" aria-label="Data table" tabIndex={0} style={{ boxShadow: 'var(--shadow-card)' }}>
      <table className="min-w-full">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-100">
            {headers.map((header, index) => (
              <th
                key={index}
                scope="col"
                className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider first:pl-6 last:pr-6 sticky top-0 bg-slate-100"
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {loading
            ? Array.from({ length: rowCount }).map((_, index) => (
                <TableSkeletonRow key={index} columns={headers.length} />
              ))
            : children}
        </tbody>
      </table>
    </div>
  );
}

interface TableRowProps {
  children: ReactNode;
  onClick?: () => void;
  selected?: boolean;
  className?: string;
}

export function TableRow({ children, onClick, selected = false, className = '' }: TableRowProps) {
  return (
    <tr
      onClick={onClick}
      className={`group transition-colors duration-100 hover:bg-slate-50 ${onClick ? 'cursor-pointer' : ''} ${
        selected ? 'bg-blue-50 border-l-2 border-l-blue-600' : ''
      }`}
    >
      {children}
    </tr>
  );
}

interface TableCellProps {
  children: ReactNode;
  className?: string;
}

export function TableCell({ children, className = '' }: TableCellProps) {
  return (
    <td className={`px-6 py-[18px] text-sm text-slate-600 first:pl-6 last:pr-6 ${className}`}>
      {children}
    </td>
  );
}
