'use client';

import { useState, useEffect, useRef, useCallback, Fragment } from 'react';
import { useRouter } from 'next/navigation';
import {
  Search,
  X,
  Users,
  GraduationCap,
  Library,
  ArrowRight,
  Loader2,
  Command,
  CornerDownLeft,
  ArrowUpDown,
} from 'lucide-react';
import { SearchService, SearchResult, SearchableEntity } from '@/services/searchService';

/* ------------------------------------------------------------------ */
/*  Entity config                                                      */
/* ------------------------------------------------------------------ */

const ENTITY_META: Record<
  SearchableEntity,
  { icon: React.ElementType; color: string; bg: string; href: (id: string) => string }
> = {
  students: { icon: Users, color: 'text-blue-600', bg: 'bg-blue-50', href: (id) => `/students?highlight=${id}` },
  teachers: { icon: GraduationCap, color: 'text-emerald-600', bg: 'bg-emerald-50', href: (id) => `/teachers?highlight=${id}` },
  library:  { icon: Library, color: 'text-amber-600', bg: 'bg-amber-50', href: (id) => `/library?highlight=${id}` },
};

const ENTITY_LABELS: Record<SearchableEntity, string> = {
  students: 'Students',
  teachers: 'Teachers',
  library: 'Library',
};

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  // Open / close
  const openPalette = useCallback(() => {
    setOpen(true);
    setQuery('');
    setResults([]);
    setActiveIndex(0);
  }, []);

  const closePalette = useCallback(() => {
    setOpen(false);
    setQuery('');
    setResults([]);
  }, []);

  // Global hotkey: Ctrl+K / Cmd+K
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        openPalette();
      }
      if (e.key === 'Escape' && open) {
        closePalette();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, openPalette, closePalette]);

  // Auto-focus input
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
  }, [open]);

  // Debounced search
  useEffect(() => {
    if (!query.trim() || query.trim().length < 2) {
      setResults([]);
      setActiveIndex(0);
      return;
    }

    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const data = await SearchService.search(query.trim(), { limit: 15 });
        setResults(data);
        setActiveIndex(0);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 250);

    return () => clearTimeout(debounceRef.current);
  }, [query]);

  // Navigate on select
  const selectResult = useCallback(
    (result: SearchResult) => {
      const meta = ENTITY_META[result.entity];
      router.push(meta.href(result.id));
      closePalette();
    },
    [router, closePalette]
  );

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, results.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === 'Enter' && results[activeIndex]) {
        e.preventDefault();
        selectResult(results[activeIndex]);
      }
    },
    [results, activeIndex, selectResult]
  );

  // Scroll active into view
  useEffect(() => {
    const item = listRef.current?.querySelector(`[data-index="${activeIndex}"]`);
    item?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  // Group results by entity
  const grouped = results.reduce<Record<SearchableEntity, SearchResult[]>>((acc, r) => {
    (acc[r.entity] ??= []).push(r);
    return acc;
  }, {} as Record<SearchableEntity, SearchResult[]>);

  // Flat index mapping for keyboard nav
  let flatIndex = 0;

  if (!open) {
    return (
      <button
        onClick={openPalette}
        className="hidden md:flex items-center gap-2 rounded-xl bg-slate-100 border border-slate-200 hover:bg-white hover:shadow-sm transition-all px-3 py-2 w-56 group"
      >
        <Search className="w-4 h-4 text-slate-400 shrink-0" />
        <span className="text-sm text-slate-400 flex-1 text-left">Search...</span>
        <kbd className="hidden lg:inline-flex items-center gap-0.5 rounded-md bg-white border border-slate-200 px-1.5 py-0.5 text-[10px] font-medium text-slate-400 group-hover:bg-slate-50">
          <Command className="w-2.5 h-2.5" />K
        </kbd>
      </button>
    );
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-[2px] z-[60] animate-in fade-in duration-150"
        onClick={closePalette}
      />

      {/* Dialog */}
      <div className="fixed inset-x-0 top-[15vh] z-[61] flex justify-center px-4">
        <div className="w-full max-w-lg bg-white rounded-2xl border border-slate-200 overflow-hidden animate-in slide-in-from-top-4 fade-in duration-200"
          style={{ boxShadow: '0 25px 60px -12px rgba(0,0,0,0.25)' }}
        >
          {/* Search input */}
          <div className="flex items-center gap-3 px-4 border-b border-slate-100">
            <Search className="w-5 h-5 text-slate-400 shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Search students, teachers, books..."
              className="flex-1 py-4 text-sm text-slate-800 placeholder:text-slate-400 outline-none bg-transparent"
            />
            {loading && <Loader2 className="w-4 h-4 text-slate-300 animate-spin shrink-0" />}
            <button
              onClick={closePalette}
              className="p-1 rounded-md hover:bg-slate-100 text-slate-400"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Results */}
          <div ref={listRef} className="max-h-[50vh] overflow-y-auto">
            {query.trim().length >= 2 && !loading && results.length === 0 && (
              <div className="py-12 text-center">
                <Search className="w-8 h-8 text-slate-200 mx-auto mb-2" />
                <p className="text-sm text-slate-400">No results for &quot;{query}&quot;</p>
                <p className="text-xs text-slate-300 mt-1">Try a different search term</p>
              </div>
            )}

            {query.trim().length < 2 && !loading && (
              <div className="py-12 text-center">
                <Search className="w-8 h-8 text-slate-200 mx-auto mb-2" />
                <p className="text-sm text-slate-400">Type at least 2 characters to search</p>
              </div>
            )}

            {Object.entries(grouped).map(([entity, items]) => {
              const meta = ENTITY_META[entity as SearchableEntity];
              const Icon = meta.icon;
              return (
                <div key={entity}>
                  <div className="px-4 py-2 bg-slate-50 border-b border-slate-100">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                      {ENTITY_LABELS[entity as SearchableEntity]} ({items.length})
                    </span>
                  </div>
                  {items.map((r) => {
                    const idx = flatIndex++;
                    const isActive = idx === activeIndex;
                    return (
                      <button
                        key={r.id}
                        data-index={idx}
                        onClick={() => selectResult(r)}
                        onMouseEnter={() => setActiveIndex(idx)}
                        className={`
                          w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors
                          ${isActive ? 'bg-blue-50' : 'hover:bg-slate-50'}
                        `}
                      >
                        <div className={`w-8 h-8 rounded-lg ${meta.bg} flex items-center justify-center shrink-0`}>
                          <Icon className={`w-4 h-4 ${meta.color}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm truncate ${isActive ? 'text-blue-700 font-medium' : 'text-slate-700'}`}>
                            {r.name}
                          </p>
                          <p className="text-xs text-slate-400 truncate">{r.subtitle}</p>
                        </div>
                        {isActive && <ArrowRight className="w-4 h-4 text-blue-400 shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>

          {/* Footer hints */}
          <div className="flex items-center gap-4 px-4 py-2.5 border-t border-slate-100 bg-slate-50/50">
            <span className="flex items-center gap-1 text-[10px] text-slate-400">
              <ArrowUpDown className="w-3 h-3" /> Navigate
            </span>
            <span className="flex items-center gap-1 text-[10px] text-slate-400">
              <CornerDownLeft className="w-3 h-3" /> Select
            </span>
            <span className="flex items-center gap-1 text-[10px] text-slate-400">
              <span className="px-1 py-0.5 rounded border border-slate-200 bg-white text-[9px] font-medium">Esc</span> Close
            </span>
          </div>
        </div>
      </div>
    </>
  );
}
