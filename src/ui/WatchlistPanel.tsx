import React, { useEffect, useState } from 'react';
import { LineChart, Plus, Trash2 } from 'lucide-react';
import { softSizeShares } from '../engine/bookMetrics';
import { RISK_GUARDRAILS } from '../types/trading';
import type { WatchlistItem } from '../types/dayBook';

type Props = {
  items: WatchlistItem[];
  equity: number;
  onChange: (items: WatchlistItem[]) => void;
  onOpenChart: (ticker: string) => void;
};

function sizeWatchItem(item: WatchlistItem, equity: number): WatchlistItem {
  const sized = softSizeShares({
    equity,
    entry: Number(item.entry) || 0,
    stop: Number(item.stop) || 0,
    allowedRiskPct: Number(item.allowedRiskPct) || 0,
    direction: item.direction,
  });
  return {
    ...item,
    sharesPreview: sized.shares,
    allowedRiskDollars: sized.dollarRisk,
    positionValue: sized.positionValue,
  };
}

function blankItem(ticker: string): WatchlistItem {
  return {
    id: `${ticker}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    ticker,
    entry: 0,
    stop: 0,
    allowedRiskPct: RISK_GUARDRAILS.maxRiskPerTradePct,
    allowedRiskDollars: 0,
    sharesPreview: 0,
    positionValue: 0,
    tactics: '',
    direction: 'long',
  };
}

function parseNames(raw: string) {
  const seen = new Set<string>();
  const tickers: string[] = [];
  for (const part of raw.split(/[\s,;]+/)) {
    const ticker = part.trim().toUpperCase().replace(/[^A-Z0-9.\-]/g, '');
    if (!ticker || seen.has(ticker)) continue;
    if (!/^[A-Z][A-Z0-9.\-]{0,9}$/.test(ticker)) continue;
    seen.add(ticker);
    tickers.push(ticker);
  }
  return tickers;
}

function money(n: number) {
  return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

export function WatchlistPanel({ items, equity, onChange, onOpenChart }: Props) {
  const [names, setNames] = useState('');
  const [addNote, setAddNote] = useState('');

  useEffect(() => {
    const next = items.map((w) => sizeWatchItem(w, equity));
    const changed = next.some(
      (w, i) =>
        w.sharesPreview !== items[i].sharesPreview ||
        w.allowedRiskDollars !== items[i].allowedRiskDollars ||
        (w.positionValue || 0) !== (items[i].positionValue || 0)
    );
    if (changed) onChange(next);
    // Recalc stored size when account equity changes. Edits recalc in update().
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [equity]);

  const update = (id: string, patch: Partial<WatchlistItem>) => {
    onChange(items.map((w) => (w.id === id ? sizeWatchItem({ ...w, ...patch }, equity) : w)));
  };

  const remove = (id: string) => {
    onChange(items.filter((w) => w.id !== id));
  };

  const addNames = () => {
    const tickers = parseNames(names);
    if (!tickers.length) {
      setAddNote('Type tickers separated by commas.');
      return;
    }
    const existing = new Set(items.map((w) => w.ticker));
    const fresh = tickers.filter((t) => !existing.has(t));
    if (!fresh.length) {
      setAddNote('Those names are already on the list.');
      return;
    }
    onChange([...fresh.map(blankItem), ...items]);
    setNames('');
    setAddNote(
      fresh.length === tickers.length
        ? `Added ${fresh.join(', ')}.`
        : `Added ${fresh.join(', ')}. Skipped names already listed.`
    );
  };

  return (
    <section className="panel overflow-hidden">
      <div className="px-4 pt-4 pb-3 space-y-2">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h3 className="font-display text-lg">Today’s Watchlist</h3>
            <p className="text-xs text-[var(--ink-mute)] mt-0.5">
              Add names, then fill entry, stop, and tactic. Shares, risk, and position update on every change.
              Risk % starts at {RISK_GUARDRAILS.maxRiskPerTradePct}%.
            </p>
          </div>
        </div>
        <form
          className="flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            addNames();
          }}
        >
          <input
            className="input flex-1 min-w-[16rem] font-data uppercase"
            placeholder="AAPL, MSFT, NVDA"
            aria-label="Comma-separated tickers"
            value={names}
            onChange={(e) => setNames(e.target.value.toUpperCase())}
          />
          <button type="submit" className="btn-secondary inline-flex items-center gap-1.5">
            <Plus className="h-4 w-4" /> Add names
          </button>
        </form>
        {addNote && <p className="text-[11px] font-data text-[var(--ink-mute)]">{addNote}</p>}
        {!(equity > 0) && items.length > 0 && (
          <p className="text-[11px] text-[var(--copper)]">
            Set Net Liq above — shares, risk, and position need account equity.
          </p>
        )}
      </div>
      {items.length === 0 ? (
        <p className="px-4 pb-4 text-sm text-[var(--ink-mute)]">
          No names yet. Add a comma-separated list here, or size one setup in Pre-Flight.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] table-fixed text-sm font-data">
            <colgroup>
              <col className="w-[7.5rem]" />
              <col className="w-[5.5rem]" />
              <col className="w-[6.5rem]" />
              <col className="w-[6.5rem]" />
              <col className="w-[5.5rem]" />
              <col className="w-[4.5rem]" />
              <col className="w-[5.5rem]" />
              <col className="w-[6.5rem]" />
              <col />
              <col className="w-12" />
            </colgroup>
            <thead>
              <tr className="text-[10px] uppercase tracking-wider text-[var(--ink-mute)] border-y border-[var(--line)]">
                <th className="text-left px-3 py-2">Symbol</th>
                <th className="text-left px-3 py-2">Dir</th>
                <th className="text-right px-3 py-2">Entry</th>
                <th className="text-right px-3 py-2">Stop</th>
                <th className="text-right px-3 py-2">Risk %</th>
                <th className="text-right px-3 py-2">Shares</th>
                <th className="text-right px-3 py-2">Risk $</th>
                <th className="text-right px-3 py-2">Position</th>
                <th className="text-left px-3 py-2">Tactic</th>
                <th className="text-right px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {items.map((w) => {
                const sized = sizeWatchItem(w, equity);
                const view = softSizeShares({
                  equity,
                  entry: Number(w.entry) || 0,
                  stop: Number(w.stop) || 0,
                  allowedRiskPct: Number(w.allowedRiskPct) || 0,
                  direction: w.direction,
                });
                const stopSide =
                  w.entry > 0 && w.stop > 0 && w.direction === 'long' && w.stop >= w.entry
                    ? 'Long stop should sit below entry.'
                    : w.entry > 0 && w.stop > 0 && w.direction === 'short' && w.stop <= w.entry
                      ? 'Short stop should sit above entry.'
                      : '';
                const hint = [...view.warnings, stopSide].filter(Boolean).join(' ');
                return (
                  <tr key={w.id} className="border-b border-[var(--line)]/70 hover:bg-white/40">
                    <td className="px-2 py-2">
                      <div className="flex items-center gap-1.5">
                        <input
                          className="input-compact w-full min-w-0 font-semibold uppercase"
                          value={w.ticker}
                          onChange={(e) =>
                            update(w.id, {
                              ticker: e.target.value.toUpperCase().replace(/[^A-Z0-9.\-]/g, ''),
                            })
                          }
                        />
                        <button
                          type="button"
                          disabled={!w.ticker}
                          onClick={() => onOpenChart(w.ticker)}
                          className="shrink-0 p-1 text-[var(--ink-mute)] hover:text-[var(--copper)] disabled:opacity-30"
                          title="Open daily chart"
                        >
                          <LineChart className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                    <td className="px-2 py-2">
                      <select
                        className="input-compact w-full"
                        value={w.direction}
                        onChange={(e) =>
                          update(w.id, { direction: e.target.value as 'long' | 'short' })
                        }
                      >
                        <option value="long">long</option>
                        <option value="short">short</option>
                      </select>
                    </td>
                    <td className="px-2 py-2">
                      <input
                        type="number"
                        step="0.01"
                        className="input-compact w-full text-right"
                        value={w.entry || ''}
                        onChange={(e) =>
                          update(w.id, { entry: e.target.value === '' ? 0 : Number(e.target.value) })
                        }
                      />
                    </td>
                    <td className="px-2 py-2">
                      <input
                        type="number"
                        step="0.01"
                        className="input-compact w-full text-right"
                        value={w.stop || ''}
                        onChange={(e) =>
                          update(w.id, { stop: e.target.value === '' ? 0 : Number(e.target.value) })
                        }
                      />
                    </td>
                    <td className="px-2 py-2">
                      <input
                        type="number"
                        step="0.05"
                        className="input-compact w-full text-right"
                        value={w.allowedRiskPct || ''}
                        onChange={(e) =>
                          update(w.id, {
                            allowedRiskPct: e.target.value === '' ? 0 : Number(e.target.value),
                          })
                        }
                      />
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums font-semibold" title={hint || 'Sized from entry, stop, and risk %'}>
                      {sized.sharesPreview > 0 ? sized.sharesPreview : '—'}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums" title={hint || undefined}>
                      {sized.allowedRiskDollars > 0 ? `$${money(sized.allowedRiskDollars)}` : '—'}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums" title={hint || undefined}>
                      {(sized.positionValue || 0) > 0 ? (
                        <>
                          <div>${money(sized.positionValue || 0)}</div>
                          <div className="text-[10px] text-[var(--ink-mute)]">{view.weightPct.toFixed(1)}%</div>
                        </>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-2 py-2">
                      <input
                        className="input-compact w-full"
                        value={w.tactics}
                        placeholder="ORB, VWAP hold…"
                        onChange={(e) => update(w.id, { tactics: e.target.value })}
                      />
                    </td>
                    <td className="px-2 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => remove(w.id)}
                        className="p-1 text-[var(--ink-mute)] hover:text-[var(--alert)]"
                        title="Remove"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
