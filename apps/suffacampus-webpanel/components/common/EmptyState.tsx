'use client';

import { ReactNode } from 'react';
import { Inbox } from 'lucide-react';

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
}

export default function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-20 px-4">
      <div className="mb-5">
        <div className="w-16 h-16 rounded-xl bg-slate-50 flex items-center justify-center text-slate-300">
          {icon || <Inbox className="w-8 h-8" />}
        </div>
      </div>
      <h3 className="text-base font-semibold text-slate-800 mb-1.5 text-center">{title}</h3>
      {description && (
        <p className="text-sm text-slate-500 mb-6 text-center max-w-sm leading-relaxed">
          {description}
        </p>
      )}
      {action && (
        <button
          onClick={action.onClick}
          className="bg-blue-600 text-white px-5 h-10 rounded-lg font-medium text-sm hover:bg-blue-700 transition-colors duration-150"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
