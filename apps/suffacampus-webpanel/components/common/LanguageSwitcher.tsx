'use client';

import { useState, useRef, useEffect } from 'react';
import { Globe } from 'lucide-react';
import { useTranslation, SUPPORTED_LOCALES } from '@/components/providers/I18nProvider';

/**
 * Compact language switcher dropdown.
 * Shows a globe icon + current language code; clicking opens a dropdown
 * with all supported languages in their native script.
 */
export default function LanguageSwitcher() {
  const { locale, setLocale } = useTranslation();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const current = SUPPORTED_LOCALES.find((l) => l.code === locale);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((p) => !p)}
        className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-colors"
        aria-label="Change language"
        title="Change language"
      >
        <Globe className="h-4 w-4" />
        <span className="uppercase tracking-wider text-xs">{locale}</span>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 min-w-[180px] rounded-lg border border-slate-200 bg-white py-1 shadow-xl animate-in fade-in slide-in-from-top-1 duration-150">
          {SUPPORTED_LOCALES.map((l) => (
            <button
              key={l.code}
              onClick={() => {
                setLocale(l.code);
                setOpen(false);
              }}
              className={`flex w-full items-center gap-3 px-3 py-2 text-sm transition-colors ${
                l.code === locale
                  ? 'bg-blue-50 text-blue-600'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              <span className="w-6 text-center font-mono text-xs uppercase tracking-wider text-slate-400">
                {l.code}
              </span>
              <span>{l.nativeLabel}</span>
              <span className="ml-auto text-xs text-slate-400">{l.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
