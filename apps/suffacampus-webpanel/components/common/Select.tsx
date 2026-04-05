'use client';

import { SelectHTMLAttributes, useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { ChevronDown, AlertCircle, Check, Search } from 'lucide-react';

interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'onChange'> {
  label?: string;
  error?: string;
  hint?: string;
  options: { value: string; label: string }[];
  placeholder?: string;
  onChange?: (e: { target: { value: string; name: string } }) => void;
  searchable?: boolean;
}

export default function Select({
  label,
  error,
  hint,
  options,
  placeholder = 'Select an option...',
  className = '',
  onChange,
  value,
  name = '',
  disabled,
  required,
  searchable: searchableProp,
  ...props
}: SelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Auto-enable search for lists with 6+ options
  const searchable = searchableProp ?? options.length >= 6;

  const selectedOption = useMemo(
    () => options.find((o) => o.value === String(value ?? '')),
    [options, value]
  );

  const filtered = useMemo(() => {
    if (!search) return options;
    const q = search.toLowerCase();
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, search]);

  // Close on click outside
  useEffect(() => {
    function onPointerDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, []);

  // Auto-focus search when opened
  useEffect(() => {
    if (isOpen && searchable) {
      requestAnimationFrame(() => searchRef.current?.focus());
    }
    if (isOpen) {
      // highlight current value
      const idx = filtered.findIndex((o) => o.value === String(value ?? ''));
      setHighlightedIndex(idx >= 0 ? idx : 0);
    }
    if (!isOpen) setSearch('');
  }, [isOpen, searchable, filtered, value]);

  // Scroll highlighted item into view
  useEffect(() => {
    if (!isOpen || highlightedIndex < 0) return;
    const listEl = listRef.current;
    if (!listEl) return;
    const item = listEl.children[highlightedIndex] as HTMLElement | undefined;
    item?.scrollIntoView({ block: 'nearest' });
  }, [highlightedIndex, isOpen]);

  const selectOption = useCallback(
    (optionValue: string) => {
      onChange?.({ target: { value: optionValue, name } });
      setIsOpen(false);
      requestAnimationFrame(() => triggerRef.current?.focus());
    },
    [onChange, name]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (disabled) return;

      switch (e.key) {
        case 'Enter':
        case ' ':
          e.preventDefault();
          if (!isOpen) {
            setIsOpen(true);
          } else if (highlightedIndex >= 0 && filtered[highlightedIndex]) {
            selectOption(filtered[highlightedIndex].value);
          }
          break;
        case 'ArrowDown':
          e.preventDefault();
          if (!isOpen) {
            setIsOpen(true);
          } else {
            setHighlightedIndex((i) => (i < filtered.length - 1 ? i + 1 : 0));
          }
          break;
        case 'ArrowUp':
          e.preventDefault();
          if (!isOpen) {
            setIsOpen(true);
          } else {
            setHighlightedIndex((i) => (i > 0 ? i - 1 : filtered.length - 1));
          }
          break;
        case 'Escape':
          e.preventDefault();
          setIsOpen(false);
          triggerRef.current?.focus();
          break;
        case 'Tab':
          setIsOpen(false);
          break;
      }
    },
    [isOpen, highlightedIndex, filtered, disabled, selectOption]
  );

  return (
    <div className="relative w-full" ref={containerRef} onKeyDown={handleKeyDown}>
      {label && (
        <label className="block text-sm font-medium text-slate-700 mb-1.5">
          {label}
          {required && <span className="text-red-500 ml-0.5">*</span>}
        </label>
      )}

      {/* Trigger button */}
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setIsOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label={label || placeholder}
        className={`relative w-full flex items-center justify-between px-3.5 h-11 bg-white border text-sm rounded-lg cursor-pointer transition-colors duration-150 text-left
          focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400
          disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-slate-50
          ${isOpen ? 'ring-2 ring-blue-500/20 border-blue-400' : ''}
          ${error ? 'border-red-300 bg-red-50 focus:ring-red-500/20 focus:border-red-400' : 'border-slate-200 hover:border-slate-300'}
          ${className}`}
      >
        <span className={selectedOption ? 'text-slate-900' : 'text-slate-400'}>
          {selectedOption?.label || placeholder}
        </span>
        <div className="flex items-center gap-1 ml-2 flex-shrink-0">
          {error && <AlertCircle className="w-4 h-4 text-red-400" />}
          <ChevronDown
            className={`w-4 h-4 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''} ${
              error ? 'text-red-400' : 'text-slate-400'
            }`}
          />
        </div>
      </button>

      {/* Dropdown panel */}
      {isOpen && (
        <div
          className="absolute z-[60] mt-1.5 w-full min-w-[180px] bg-white rounded-lg border border-slate-200 py-1 dropdown-animate"
          style={{
            boxShadow: 'var(--shadow-dropdown)',
            width: triggerRef.current?.offsetWidth,
            position: 'absolute',
          }}
        >
          {/* Search input */}
          {searchable && (
            <div className="px-2 pb-1.5 pt-1">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                <input
                  ref={searchRef}
                  type="text"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setHighlightedIndex(0);
                  }}
                  placeholder="Search..."
                  className="w-full pl-8 pr-3 py-2 text-sm bg-slate-50 border border-slate-100 rounded-lg focus:outline-none focus:bg-white focus:border-blue-200 transition-colors placeholder:text-slate-400"
                />
              </div>
            </div>
          )}

          {/* Options list */}
          <div
            ref={listRef}
            className="max-h-[240px] overflow-y-auto overscroll-contain py-0.5 scrollbar-thin"
            role="listbox"
          >
            {/* Placeholder option to clear */}
            <button
              type="button"
              role="option"
              aria-selected={!value || value === ''}
              onClick={() => selectOption('')}
              onMouseEnter={() => setHighlightedIndex(-1)}
              className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left transition-colors duration-75
                ${!value || value === '' ? 'text-blue-700 font-medium' : 'text-slate-400'}
                ${highlightedIndex === -1 ? 'bg-blue-50' : 'hover:bg-slate-50'}`}
            >
              <span className="flex-1 truncate">{placeholder}</span>
              {(!value || value === '') && (
                <Check className="w-3.5 h-3.5 text-blue-600 flex-shrink-0" />
              )}
            </button>

            {filtered.length === 0 ? (
              <div className="px-3 py-6 text-center text-sm text-slate-400">
                No options found
              </div>
            ) : (
              filtered.map((option, index) => {
                const isSelected = String(value ?? '') === option.value;
                const isHighlighted = index === highlightedIndex;
                return (
                  <button
                    key={option.value}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => selectOption(option.value)}
                    onMouseEnter={() => setHighlightedIndex(index)}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left transition-colors duration-75
                      ${isSelected ? 'text-blue-700 font-medium' : 'text-slate-700'}
                      ${isHighlighted ? 'bg-blue-50' : 'hover:bg-slate-50'}`}
                  >
                    <span className="flex-1 truncate">{option.label}</span>
                    {isSelected && (
                      <Check className="w-3.5 h-3.5 text-blue-600 flex-shrink-0" />
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}

      {error && (
        <p className="mt-1.5 text-xs text-red-500">{error}</p>
      )}
      {hint && !error && (
        <p className="mt-1.5 text-xs text-slate-400">{hint}</p>
      )}
    </div>
  );
}
