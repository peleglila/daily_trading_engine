import React from 'react';
import { LineChart, Trash2 } from 'lucide-react';
import type { WatchlistItem } from '../types/dayBook';

type Props = {
  items: WatchlistItem[];
  onChange: (items: WatchlistItem[]) => void;
  onOpenChart: (ticker: string) => void;
};

export function WatchlistPanel({ items, onChange, onOpenChart }: Props) {
  const update = (id: string, patch: Partial<WatchlistItem>) => {
    onChange(items.map((w) => (w.id === id ? { ...w, ...patch } : w)));
  };

  const remove = (id: string) => {
    onChange(items.filter((w) => w.id !== id));
  };

  return (
    <section className="panel overflow-hidden">
      <div className="px-4 pt-4 pb-2">
        <h3 className="font-display text-lg">Today’s Watchlist</h3>
      </div>
      {items.length === 0 ? (
        <p className="px-4 pb-4 text-sm text-[var(--ink-mute)]">
          Size a setup in Pre-Flight and add it here.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] table-fixed text-sm font-data">
            <colgroup>
              <col className="w-[7.5rem]" />
              <col className="w-[5.5rem]" />
              <col className="w-[7rem]" />
              <col className="w-[7rem]" />
              <col className="w-[6rem]" />
              <col className="w-[6rem]" />
              <col />
              <col className="w-12" />
            </colgroup>
            <thead>
              <tr className="text-[10px] uppercase tracking-wider text-[var(--ink-mute)] border-y border-[var(--line)]">
                <th className="text-left px-3 py-2">Symbol</th>
                <th className="text-left px-3 py-2">Dir</th>
                <th className="text-right px-3 py-2">Entry</th>
                <th className="text-right px-3 py-2">Stop</th>
                <th className="text-right px-3 py-2">Shares</th>
                <th className="text-right px-3 py-2">Risk %</th>
                <th className="text-left px-3 py-2">Tactics</th>
                <th className="text-right px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {items.map((w) => (
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
                      className="input-compact w-full text-right"
                      value={w.sharesPreview || ''}
                      onChange={(e) =>
                        update(w.id, {
                          sharesPreview: e.target.value === '' ? 0 : Number(e.target.value),
                        })
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
                  <td className="px-2 py-2">
                    <input
                      className="input-compact w-full"
                      value={w.tactics}
                      placeholder="—"
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
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
