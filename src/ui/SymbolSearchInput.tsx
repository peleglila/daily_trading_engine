import React, { useEffect, useId, useRef, useState } from 'react';
import { Loader2, Search } from 'lucide-react';
import { searchSymbols, searchSymbolsLocal, type SymbolHit } from '../engine/symbolSearch';

type Props = {
  value: string;
  onChange: (symbol: string, hit?: SymbolHit) => void;
  placeholder?: string;
  className?: string;
};

export function SymbolSearchInput({ value, onChange, placeholder = 'Search symbol…', className = '' }: Props) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [hits, setHits] = useState<SymbolHit[]>([]);
  const [active, setActive] = useState(0);

  useEffect(() => {
    setQuery(value);
  }, [value]);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 1) {
      setHits([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setHits(searchSymbolsLocal(q));
    setActive(0);
    setLoading(true);
    const t = window.setTimeout(() => {
      searchSymbols(q)
        .then((rows) => {
          if (cancelled) return;
          setHits(rows);
          setActive(0);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 180);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [query]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const pick = (hit: SymbolHit) => {
    onChange(hit.symbol, hit);
    setQuery(hit.symbol);
    setOpen(false);
  };

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--ink-mute)]" />
        <input
          value={query}
          autoComplete="off"
          spellCheck={false}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          placeholder={placeholder}
          className="input font-data uppercase"
          style={{ paddingLeft: '2.25rem', paddingRight: '2.25rem' }}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            const next = e.target.value.toUpperCase();
            setQuery(next);
            onChange(next.replace(/[^A-Z0-9.\-]/g, ''));
            setOpen(true);
          }}
          onKeyDown={(e) => {
            if (!open || hits.length === 0) return;
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setActive((i) => Math.min(i + 1, hits.length - 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActive((i) => Math.max(i - 1, 0));
            } else if (e.key === 'Enter') {
              e.preventDefault();
              pick(hits[active]);
            } else if (e.key === 'Escape') {
              setOpen(false);
            }
          }}
        />
        {loading && (
          <Loader2 className="absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-[var(--ink-mute)]" />
        )}
      </div>

      {open && query.trim().length > 0 && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-30 mt-1 max-h-64 w-full overflow-auto rounded-xl border border-[var(--line)] bg-white shadow-lg"
        >
          {hits.length === 0 && !loading && (
            <li className="px-3 py-2 text-xs text-[var(--ink-mute)]">No symbols found</li>
          )}
          {hits.map((hit, idx) => (
            <li key={`${hit.fullSymbol}-${idx}`} role="option" aria-selected={idx === active}>
              <button
                type="button"
                className={`flex w-full items-start gap-2 px-3 py-2 text-left hover:bg-[var(--paper-deep)] ${
                  idx === active ? 'bg-[var(--paper-deep)]' : ''
                }`}
                onMouseEnter={() => setActive(idx)}
                onClick={() => pick(hit)}
              >
                <span className="font-data text-sm font-semibold text-[var(--ink)] min-w-[4.5rem]">
                  {hit.symbol}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs text-[var(--ink)]">{hit.description}</span>
                  <span className="block text-[10px] uppercase tracking-wide text-[var(--ink-mute)]">
                    {hit.exchange || '—'}{hit.type ? ` · ${hit.type}` : ''}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
