'use client';

import { ReactNode } from 'react';
import { AlertCircle, LucideIcon } from 'lucide-react';

interface FormFieldProps {
  label: string;
  required?: boolean;
  error?: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}

interface FormSectionProps {
  title: string;
  icon: LucideIcon;
  color?: 'blue' | 'violet' | 'emerald' | 'amber' | 'rose';
  children: ReactNode;
  className?: string;
}

const SECTION_COLORS = {
  blue:    { bg: 'bg-blue-50',    text: 'text-blue-600' },
  violet:  { bg: 'bg-violet-50',  text: 'text-violet-600' },
  emerald: { bg: 'bg-emerald-50', text: 'text-emerald-600' },
  amber:   { bg: 'bg-amber-50',   text: 'text-amber-600' },
  rose:    { bg: 'bg-rose-50',    text: 'text-rose-600' },
};

/**
 * FormField — lightweight wrapper for individual form fields.
 * Provides consistent label, error, and hint rendering.
 */
export function FormField({
  label,
  required,
  error,
  hint,
  children,
  className = '',
}: FormFieldProps) {
  return (
    <div className={`w-full ${className}`}>
      <label className="block text-sm font-medium text-slate-700 mb-1.5">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
      {error && (
        <p className="mt-1.5 text-xs text-red-500 flex items-center gap-1 animate-slide-down">
          <AlertCircle className="w-3 h-3 shrink-0" />
          {error}
        </p>
      )}
      {hint && !error && (
        <p className="mt-1.5 text-xs text-slate-400">{hint}</p>
      )}
    </div>
  );
}

/**
 * FormSection — groups related fields under a titled header with icon.
 */
export function FormSection({
  title,
  icon: Icon,
  color = 'blue',
  children,
  className = '',
}: FormSectionProps) {
  const c = SECTION_COLORS[color];
  return (
    <div className={className}>
      <div className="flex items-center gap-2 mb-4">
        <div className={`w-7 h-7 rounded-lg ${c.bg} flex items-center justify-center`}>
          <Icon className={`w-3.5 h-3.5 ${c.text}`} />
        </div>
        <h4 className="text-sm font-medium text-slate-700">{title}</h4>
      </div>
      {children}
    </div>
  );
}

export default FormField;
