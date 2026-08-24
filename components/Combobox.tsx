'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronsUpDown, Search, Check } from 'lucide-react';

export interface ComboboxOption {
  value: string;
  label: React.ReactNode;
  /** Plain text to filter against, for options whose label isn't a bare string. */
  searchText?: string;
}

interface Props {
  value: string;
  options: ComboboxOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  /** Options beyond this count get a filter box in the popup. */
  searchThreshold?: number;
}

export default function Combobox({
  value, options, onChange, disabled, placeholder = 'Select…', className = '', searchThreshold = 8,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [rect, setRect] = useState<{ top: number; left: number; width: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const searchable = options.length > searchThreshold;
  const selected = options.find((o) => o.value === value) ?? null;

  const filtered = useMemo(() => {
    if (!searchable || !query.trim()) return options;
    const q = query.trim().toLowerCase();
    return options.filter((o) =>
      (o.searchText ?? (typeof o.label === 'string' ? o.label : o.value)).toLowerCase().includes(q));
  }, [options, query, searchable]);

  // Position the portalled popup against the trigger; re-measure on scroll/resize
  // since the trigger can live inside scrolling panels the popup itself escapes.
  useEffect(() => {
    if (!open) return;
    const update = () => {
      const r = triggerRef.current?.getBoundingClientRect();
      if (r) setRect({ top: r.bottom + 6, left: r.left, width: r.width });
    };
    update();
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t) || popupRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const raf = requestAnimationFrame(() => (searchable ? searchRef.current : popupRef.current)?.focus());
    return () => cancelAnimationFrame(raf);
  }, [open, searchable]);

  const openMenu = () => {
    setQuery('');
    setActiveIndex(Math.max(0, options.findIndex((o) => o.value === value)));
    setOpen(true);
  };

  const commit = (v: string) => {
    onChange(v);
    setOpen(false);
    triggerRef.current?.focus();
  };

  const onListKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { setOpen(false); triggerRef.current?.focus(); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIndex((i) => Math.min(i + 1, filtered.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIndex((i) => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); const opt = filtered[activeIndex]; if (opt) commit(opt.value); }
  };

  return (
    <>
      <button
        type="button"
        ref={triggerRef}
        className={`combobox-trigger${className ? ` ${className}` : ''}`}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => (open ? setOpen(false) : openMenu())}
      >
        <span className="combobox-value">{selected ? selected.label : placeholder}</span>
        <ChevronsUpDown size={13} className="combobox-caret" />
      </button>
      {open && rect && createPortal(
        <div
          ref={popupRef}
          className="combobox-popup"
          style={{ top: rect.top, left: rect.left, width: rect.width }}
          role="listbox"
          tabIndex={-1}
          onKeyDown={onListKeyDown}
        >
          {searchable && (
            <div className="combobox-search">
              <Search size={12} />
              <input
                ref={searchRef}
                value={query}
                onChange={(e) => { setQuery(e.target.value); setActiveIndex(0); }}
                placeholder="Search…"
                aria-label="Search options"
              />
            </div>
          )}
          <div className="combobox-list">
            {filtered.length === 0 && <div className="combobox-empty">No matches</div>}
            {filtered.map((opt, i) => (
              <div
                key={opt.value}
                role="option"
                aria-selected={opt.value === value}
                className={`combobox-option${opt.value === value ? ' selected' : ''}${i === activeIndex ? ' active' : ''}`}
                onMouseEnter={() => setActiveIndex(i)}
                onClick={() => commit(opt.value)}
              >
                <span>{opt.label}</span>
                {opt.value === value && <Check size={13} />}
              </div>
            ))}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
