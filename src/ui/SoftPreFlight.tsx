import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Calculator, Loader2, Plus } from 'lucide-react';
import { softSizeShares } from '../engine/bookMetrics';
import { fetchQuote } from '../engine/quoteService';
import { RISK_GUARDRAILS } from '../types/trading';
import type { WatchlistItem } from '../types/dayBook';
import type { SymbolHit } from '../engine/symbolSearch';
import { SymbolSearchInput } from './SymbolSearchInput';

type Props = {
  equity: number;
  onAdd: (item: WatchlistItem) => void;
  onSelectTicker?: (ticker: string) => void;
};

export function SoftPreFlight({ equity, onAdd, onSelectTicker }: Props) {
  const [ticker, setTicker] = useState('');
  const [direction, setDirection] = useState<'long' | 'short'>('long');
  const [entry, setEntry] = useState(0);
  const [stop, setStop] = useState(0);
  const [allowedRiskPct, setAllowedRiskPct] = useState(RISK_GUARDRAILS.maxRiskPerTradePct);
  const [tactics, setTactics] = useState('');
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteNote, setQuoteNote] = useState('');
  const quoteReq = useRef(0);
  const directionRef = useRef(direction);
  directionRef.current = direction;

  const sized = useMemo(
    () => softSizeShares({ equity, entry, stop, allowedRiskPct, direction }),
    [equity, entry, stop, allowedRiskPct, direction]
  );

  const stopDist = entry > 0 && stop > 0 ? Math.abs(entry - stop) : 0;
  const riskDollars = Math.max(0, equity) * (Math.max(0, allowedRiskPct) / 100);

  const fillLivePrice = async (symbol: string) => {
    const t = symbol.trim().toUpperCase();
    if (t.length < 1) return;
    const req = ++quoteReq.current;
    setQuoteLoading(true);
    setQuoteNote('');
    try {
      const price = await fetchQuote(t);
      if (req !== quoteReq.current) return;
      if (price != null) {
        setEntry(price);
        setQuoteNote(`Live mark $${price.toFixed(2)} filled as entry`);
        setStop((prev) => {
          if (prev > 0) return prev;
          const pad = price * 0.01;
          const dir = directionRef.current;
          return Number((dir === 'short' ? price + pad : price - pad).toFixed(2));
        });
      } else {
        setQuoteNote('Could not fetch live price — enter entry manually');
      }
    } finally {
      if (req === quoteReq.current) setQuoteLoading(false);
    }
  };

  // Debounced quote + daily chart sync when ticker settles
  useEffect(() => {
    const t = ticker.trim().toUpperCase();
    if (!/^[A-Z][A-Z0-9.\-]{0,8}$/.test(t) || t.length < 1) return;
    const id = window.setTimeout(() => {
      onSelectTicker?.(t);
      void fillLivePrice(t);
    }, 450);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-quote on ticker change
  }, [ticker]);

  const add = () => {
    const t = ticker.trim().toUpperCase();
    if (!t || !(entry > 0) || !(stop > 0)) return;
    onAdd({
      id: `${Date.now()}`,
      ticker: t,
      entry,
      stop,
      allowedRiskPct,
      allowedRiskDollars: equity * (allowedRiskPct / 100),
      sharesPreview: sized.shares,
      tactics,
      direction,
    });
    setTactics('');
  };

  return (
    <section className="panel p-4 space-y-3">
      <header className="flex items-center gap-2">
        <Calculator className="h-4 w-4 text-[var(--copper)]" />
        <h3 className="font-display text-lg">Pre-Flight Sizer</h3>
        <span className="text-[11px] text-[var(--ink-mute)] ml-auto">
          Soft mode · suggested {RISK_GUARDRAILS.maxRiskPerTradePct}%
        </span>
      </header>
      <div className="grid grid-cols-2 gap-2">
        <label className="field relative z-20">
          <span>Ticker</span>
          <SymbolSearchInput
            value={ticker}
            onChange={(symbol: string, hit?: SymbolHit) => {
              const t = symbol.trim().toUpperCase();
              setTicker(t);
              if (hit) {
                onSelectTicker?.(t);
                void fillLivePrice(t);
              }
            }}
            placeholder="Type to search (SPY, AMD…)"
          />
        </label>
        <label className="field">
          <span>Direction</span>
          <select value={direction} onChange={(e) => setDirection(e.target.value as 'long' | 'short')} className="input">
            <option value="long">Long</option>
            <option value="short">Short</option>
          </select>
        </label>
        <label className="field">
          <span className="inline-flex items-center gap-1">
            Entry
            {quoteLoading && <Loader2 className="h-3 w-3 animate-spin" />}
          </span>
          <input
            type="number"
            step="0.01"
            value={entry || ''}
            onChange={(e) => setEntry(Number(e.target.value))}
            className="input font-data"
          />
        </label>
        <label className="field">
          <span>Stop</span>
          <input
            type="number"
            step="0.01"
            value={stop || ''}
            onChange={(e) => setStop(Number(e.target.value))}
            className="input font-data"
          />
        </label>
        <label className="field col-span-2">
          <span>Allowed risk % (editable)</span>
          <input
            type="number"
            step="0.05"
            value={allowedRiskPct}
            onChange={(e) => setAllowedRiskPct(Number(e.target.value))}
            className="input font-data"
          />
        </label>
        <label className="field col-span-2">
          <span>Entry tactics</span>
          <input
            value={tactics}
            onChange={(e) => setTactics(e.target.value)}
            placeholder="ORBfail reclaim · wait for VWAP hold…"
            className="input"
          />
        </label>
      </div>
      {quoteNote && (
        <p className="text-[11px] text-[var(--ink-mute)]">{quoteNote}</p>
      )}
      <div className="rounded-xl bg-[var(--paper-deep)] border border-[var(--line)] p-3 font-data text-sm">
        <div className="flex justify-between"><span>Max shares</span><strong>{sized.shares}</strong></div>
        <div className="flex justify-between text-[var(--ink-mute)] text-xs mt-1">
          <span>Position ${sized.positionValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
          <span>{sized.weightPct.toFixed(1)}% weight</span>
        </div>
        <div className="flex justify-between text-[var(--ink-mute)] text-[11px] mt-1">
          <span>Risk $ {riskDollars.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
          <span>Stop dist ${stopDist.toFixed(2)}</span>
        </div>
        {!(equity > 0) && (
          <div className="text-[11px] text-[var(--copper)] mt-1">
            Set Net Liquidation above — size needs account equity to compute shares.
          </div>
        )}
        {equity > 0 && entry > 0 && stop > 0 && stopDist === 0 && (
          <div className="text-[11px] text-[var(--copper)] mt-1">Entry and stop cannot be equal.</div>
        )}
        {sized.warnings.map((w) => (
          <div key={w} className="text-[11px] text-[var(--copper)] mt-1">{w}</div>
        ))}
      </div>
      <button type="button" onClick={add} className="btn-primary w-full inline-flex items-center justify-center gap-2">
        <Plus className="h-4 w-4" /> Add to today’s watchlist
      </button>
    </section>
  );
}
