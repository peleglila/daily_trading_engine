import React from 'react';
import { AlertTriangle, LineChart, Plus, Trash2 } from 'lucide-react';
import type { BookPosition } from '../types/dayBook';
import { positionOpenRisk, positionSecuredPL } from '../engine/bookMetrics';

type Props = {
  positions: BookPosition[];
  netLiq: number;
  onChange: (next: BookPosition[]) => void;
  onOpenChart: (ticker: string) => void;
};

function emptyPosition(): BookPosition {
  return {
    ticker: '',
    direction: 'long',
    qty: 0,
    entry: 0,
    lastMark: 0,
    markSource: 'manual',
    markAt: new Date().toISOString(),
    manualStop: null,
    unrealized: 0,
    pnl: 0,
  };
}

export function PositionsTable({ positions, netLiq, onChange, onOpenChart }: Props) {
  const update = (idx: number, patch: Partial<BookPosition>) => {
    onChange(positions.map((p, i) => (i === idx ? { ...p, ...patch } : p)));
  };

  const remove = (idx: number) => {
    onChange(positions.filter((_, i) => i !== idx));
  };

  const add = () => {
    onChange([...positions, emptyPosition()]);
  };

  const securedTotal = positions.reduce((s, p) => s + (positionSecuredPL(p) ?? 0), 0);
  const riskTotal = positions.reduce((s, p) => s + positionOpenRisk(p), 0);

  return (
    <div className="panel overflow-x-auto">
      <table className="w-full text-sm font-data">
        <thead>
          <tr className="text-[10px] uppercase tracking-wider text-[var(--ink-mute)] border-b border-[var(--line)]">
            <th className="text-left p-3">Symbol</th>
            <th className="text-left p-3">Dir</th>
            <th className="text-right p-3">Entry</th>
            <th className="text-right p-3">Mark</th>
            <th className="text-right p-3">Unrealized</th>
            <th className="text-right p-3">Qty</th>
            <th className="text-right p-3">Stop</th>
            <th className="text-right p-3" title="P&L if stopped out at SL vs entry">
              Secured
            </th>
            <th className="text-right p-3">Risk $</th>
            <th className="text-right p-3">Risk %</th>
            <th className="text-right p-3">Dist</th>
            <th className="text-right p-3 w-16" />
          </tr>
        </thead>
        <tbody>
          {positions.length === 0 && (
            <tr>
              <td colSpan={12} className="p-6 text-sm text-[var(--ink-mute)] text-center">
                No open positions — import Flex/CSV or add a row manually.
              </td>
            </tr>
          )}
          {positions.map((p, idx) => {
            const risk = positionOpenRisk(p);
            const secured = positionSecuredPL(p);
            const riskPct = netLiq > 0 ? (risk / netLiq) * 100 : 0;
            const mark = Number(p.lastMark) || 0;
            const stop = Number(p.manualStop) || 0;
            const dist = stop > 0 && mark > 0 ? ((mark - stop) / mark) * 100 : null;
            const unreal = Number(p.unrealized) || 0;
            const cost = (Number(p.entry) || 0) * Math.abs(Number(p.qty) || 0);
            const unrealPct = cost > 0 ? (unreal / cost) * 100 : 0;
            const missingStop = !(stop > 0);

            return (
              <tr key={idx} className="border-b border-[var(--line)]/70 hover:bg-white/40">
                <td className="p-2">
                  <div className="flex items-center gap-1">
                    {missingStop && p.ticker && (
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-[var(--copper)]" />
                    )}
                    <input
                      className="input-compact w-20 font-semibold uppercase"
                      value={p.ticker}
                      placeholder="TICKER"
                      onChange={(e) =>
                        update(idx, {
                          ticker: e.target.value.toUpperCase().replace(/[^A-Z0-9.\-]/g, ''),
                        })
                      }
                    />
                    <button
                      type="button"
                      disabled={!p.ticker}
                      onClick={() => onOpenChart(p.ticker)}
                      className="p-1 text-[var(--ink-mute)] hover:text-[var(--copper)] disabled:opacity-30"
                      title="Open daily chart"
                    >
                      <LineChart className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </td>
                <td className="p-2">
                  <select
                    className="input-compact"
                    value={p.direction}
                    onChange={(e) => update(idx, { direction: e.target.value as 'long' | 'short' })}
                  >
                    <option value="long">long</option>
                    <option value="short">short</option>
                  </select>
                </td>
                <td className="p-2 text-right">
                  <input
                    type="number"
                    step="0.01"
                    className="input-compact text-right w-24"
                    value={p.entry || ''}
                    onChange={(e) =>
                      update(idx, { entry: e.target.value === '' ? 0 : Number(e.target.value) })
                    }
                  />
                </td>
                <td className="p-2 text-right">
                  <input
                    type="number"
                    step="0.01"
                    className="input-compact text-right w-24"
                    value={p.lastMark || ''}
                    onChange={(e) =>
                      update(idx, {
                        lastMark: e.target.value === '' ? 0 : Number(e.target.value),
                        markSource: 'manual',
                        markAt: new Date().toISOString(),
                      })
                    }
                  />
                </td>
                <td
                  className={`p-2.5 text-right tabular-nums font-semibold ${
                    unreal >= 0 ? 'text-[var(--signal)]' : 'text-[var(--alert)]'
                  }`}
                >
                  {unreal >= 0 ? '+' : ''}$
                  {unreal.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  <div className="text-[10px] opacity-70">{unrealPct.toFixed(1)}%</div>
                </td>
                <td className="p-2 text-right">
                  <input
                    type="number"
                    className="input-compact text-right w-20"
                    value={p.qty || ''}
                    onChange={(e) =>
                      update(idx, { qty: e.target.value === '' ? 0 : Number(e.target.value) })
                    }
                  />
                </td>
                <td className="p-2 text-right">
                  <input
                    type="number"
                    step="0.01"
                    placeholder="Stop"
                    className={`input-compact text-right w-24 ${missingStop ? 'ring-1 ring-[var(--copper)]' : ''}`}
                    value={p.manualStop ?? ''}
                    onChange={(e) =>
                      update(idx, {
                        manualStop: e.target.value === '' ? null : Number(e.target.value),
                      })
                    }
                  />
                </td>
                <td
                  className={`p-2.5 text-right tabular-nums font-semibold ${
                    secured == null
                      ? 'text-[var(--ink-mute)]'
                      : secured >= 0
                        ? 'text-[var(--signal)]'
                        : 'text-[var(--alert)]'
                  }`}
                  title="P&L if exit at stop vs entry"
                >
                  {secured == null
                    ? '—'
                    : `${secured >= 0 ? '+' : ''}$${secured.toLocaleString(undefined, {
                        maximumFractionDigits: 0,
                      })}`}
                </td>
                <td className="p-2.5 text-right tabular-nums">
                  {risk > 0 ? `$${risk.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : '—'}
                </td>
                <td className="p-2.5 text-right tabular-nums">
                  {risk > 0 ? `${riskPct.toFixed(2)}%` : '—'}
                </td>
                <td className="p-2.5 text-right tabular-nums text-[var(--ink-mute)]">
                  {dist == null ? '—' : `${dist.toFixed(1)}%`}
                </td>
                <td className="p-2 text-right">
                  <button
                    type="button"
                    onClick={() => remove(idx)}
                    className="p-1 text-[var(--ink-mute)] hover:text-[var(--alert)]"
                    title="Delete position"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
        {positions.length > 0 && (
          <tfoot>
            <tr className="border-t border-[var(--line)] bg-[var(--paper-deep)]/60 text-xs font-semibold">
              <td className="p-2.5" colSpan={7}>
                Totals
              </td>
              <td
                className={`p-2.5 text-right tabular-nums ${
                  securedTotal >= 0 ? 'text-[var(--signal)]' : 'text-[var(--alert)]'
                }`}
              >
                {securedTotal >= 0 ? '+' : ''}$
                {securedTotal.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </td>
              <td className="p-2.5 text-right tabular-nums">
                ${riskTotal.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </td>
              <td className="p-2.5 text-right tabular-nums text-[var(--ink-mute)]" colSpan={3}>
                {netLiq > 0 ? `${((riskTotal / netLiq) * 100).toFixed(2)}% heat` : '—'}
              </td>
            </tr>
          </tfoot>
        )}
      </table>
      <div className="border-t border-[var(--line)] p-2">
        <button
          type="button"
          onClick={add}
          className="btn-ghost text-xs inline-flex items-center gap-1"
        >
          <Plus className="h-3.5 w-3.5" /> Add position
        </button>
      </div>
    </div>
  );
}
