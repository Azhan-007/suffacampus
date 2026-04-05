'use client';

import { InputHTMLAttributes, ReactNode, useId } from 'react';
import { AlertCircle } from 'lucide-react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  icon?: ReactNode;
}

export default function Input({
  label,
  error,
  hint,
  icon,
  className = '',
  id: propId,
  ...props
}: InputProps) {
  const autoId = useId();
  const inputId = propId || autoId;
  const errorId = error ? `${inputId}-error` : undefined;
  const hintId = hint && !error ? `${inputId}-hint` : undefined;
  const describedBy = [errorId, hintId].filter(Boolean).join(' ') || undefined;

  return (
    <div className="w-full">
      {label && (
        <label htmlFor={inputId} className="block text-sm font-medium text-slate-700 mb-1.5">
          {label}
          {props.required && <span className="text-red-500 ml-0.5">*</span>}
        </label>
      )}
      <div className="relative">
        {icon && (
          <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-slate-400">
            {icon}
          </div>
        )}
        <input
          id={inputId}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={`w-full px-3.5 h-11 bg-white border text-sm text-slate-900 placeholder:text-slate-400 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-colors duration-150 ${
            icon ? 'pl-10' : ''
          } ${
            error ? 'border-red-300 bg-red-50' : 'border-slate-200'
          } ${className}`}
          {...props}
        />
        {error && (
          <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
            <AlertCircle className="w-4 h-4 text-red-400" />
          </div>
        )}
      </div>
      {error && (
        <p id={errorId} className="mt-1.5 text-xs text-red-500" role="alert">{error}</p>
      )}
      {hint && !error && (
        <p id={hintId} className="mt-1.5 text-xs text-slate-400">{hint}</p>
      )}
    </div>
  );
}
