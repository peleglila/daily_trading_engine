import React, { useEffect, useRef } from 'react';
import { Maximize2, Minimize2 } from 'lucide-react';

type Props = {
  symbol: string;
  title?: string;
  height?: number;
  expanded?: boolean;
  onToggleExpand?: () => void;
  onCapture?: (blob: Blob) => void;
  /** Extra control beside the title (e.g. SPY ↔ QQQ switch). */
  headerAddon?: React.ReactNode;
};

declare global {
  interface Window {
    TradingView?: {
      widget: new (opts: Record<string, unknown>) => { remove?: () => void };
    };
  }
}

let tvScriptPromise: Promise<void> | null = null;

function loadTvScript() {
  if (window.TradingView) return Promise.resolve();
  if (tvScriptPromise) return tvScriptPromise;
  tvScriptPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://s3.tradingview.com/tv.js';
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Failed to load TradingView'));
    document.head.appendChild(s);
  });
  return tvScriptPromise;
}

/** Use bare ticker for indices/ETFs (SPY, QQQ). Keep EXCHANGE:SYMBOL if already provided. */
export function resolveTvSymbol(symbol: string): string {
  const raw = String(symbol || '').trim();
  if (!raw) return 'SPY';
  if (raw.includes(':')) return raw;
  return raw.toUpperCase();
}

/**
 * TradingView Advanced Chart (daily).
 */
export function TvChartPanel({
  symbol,
  title,
  height = 360,
  expanded,
  onToggleExpand,
  onCapture,
  headerAddon,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const idRef = useRef(`tv_${Math.random().toString(36).slice(2)}`);
  const tvSymbol = resolveTvSymbol(symbol);
  const chartHeight = expanded ? Math.max(height, 560) : height;

  useEffect(() => {
    let cancelled = false;
    let widget: { remove?: () => void } | null = null;
    loadTvScript()
      .then(() => {
        if (cancelled || !containerRef.current || !window.TradingView) return;
        containerRef.current.innerHTML = '';
        const el = document.createElement('div');
        el.id = idRef.current;
        el.style.height = `${chartHeight}px`;
        containerRef.current.appendChild(el);
        widget = new window.TradingView.widget({
          autosize: true,
          symbol: tvSymbol,
          interval: 'D',
          timezone: 'America/New_York',
          theme: 'light',
          style: '1',
          locale: 'en',
          toolbar_bg: '#E7EDF4',
          enable_publishing: false,
          allow_symbol_change: true,
          container_id: idRef.current,
          hide_side_toolbar: false,
          studies: [],
        });
      })
      .catch(() => {
        if (containerRef.current) {
          containerRef.current.innerHTML =
            '<div class="p-4 text-sm text-[var(--ink-mute)]">TradingView failed to load. Use “Open chart”.</div>';
        }
      });
    return () => {
      cancelled = true;
      try {
        widget?.remove?.();
      } catch {
        /* ignore */
      }
    };
  }, [tvSymbol, chartHeight]);

  const openTv = () => {
    window.open(
      `https://www.tradingview.com/chart/?symbol=${encodeURIComponent(tvSymbol)}&interval=D`,
      '_blank'
    );
  };

  return (
    <section className={`panel overflow-hidden h-full ${expanded ? 'ring-2 ring-[var(--copper)]/40' : ''}`}>
      <header className="flex items-center justify-between gap-2 px-4 py-3 border-b border-[var(--line)]">
        <div className="flex items-center gap-3 min-w-0">
          <div className="min-w-0">
            <h3 className="font-display text-base">{title || tvSymbol}</h3>
            <p className="text-[11px] text-[var(--ink-mute)]">
              Daily chart · symbol={tvSymbol}
            </p>
          </div>
          {headerAddon}
        </div>
        <div className="flex items-center gap-2">
          {onToggleExpand && (
            <button
              type="button"
              onClick={onToggleExpand}
              className="btn-ghost text-xs inline-flex items-center gap-1"
              title={expanded ? 'Restore equal size' : 'Expand this chart'}
            >
              {expanded ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
              {expanded ? 'Restore' : 'Expand'}
            </button>
          )}
          <button type="button" onClick={openTv} className="btn-ghost text-xs">
            Open chart
          </button>
          {onCapture && (
            <label className="btn-secondary text-xs cursor-pointer">
              Save snapshot
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (file) onCapture(file);
                  e.target.value = '';
                }}
              />
            </label>
          )}
        </div>
      </header>
      <div ref={containerRef} style={{ height: chartHeight }} className="bg-white" />
    </section>
  );
}
