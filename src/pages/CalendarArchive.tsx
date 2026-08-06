import React, { useMemo, useState } from 'react';
import type { DayDocument } from '../types/dayBook';

type Props = {
  days: DayDocument[];
  onOpenDay: (date: string) => void;
};

function monthMatrix(year: number, month: number) {
  const first = new Date(year, month, 1);
  const startPad = first.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < startPad; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

export function CalendarArchive({ days, onOpenDay }: Props) {
  const [cursor, setCursor] = useState(() => {
    const n = new Date();
    return { y: n.getFullYear(), m: n.getMonth() };
  });
  const [selected, setSelected] = useState<string | null>(null);

  const byDate = useMemo(() => {
    const map = new Map<string, DayDocument>();
    days.forEach((d) => map.set(d.date, d));
    return map;
  }, [days]);

  const cells = monthMatrix(cursor.y, cursor.m);
  const selectedDay = selected ? byDate.get(selected) : null;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
      <section className="panel p-4 lg:col-span-3">
        <header className="flex items-center justify-between mb-4">
          <button
            type="button"
            className="btn-ghost"
            onClick={() =>
              setCursor((c) => {
                const d = new Date(c.y, c.m - 1, 1);
                return { y: d.getFullYear(), m: d.getMonth() };
              })
            }
          >
            ←
          </button>
          <h2 className="font-display text-2xl">
            {new Date(cursor.y, cursor.m, 1).toLocaleDateString(undefined, {
              month: 'long',
              year: 'numeric',
            })}
          </h2>
          <button
            type="button"
            className="btn-ghost"
            onClick={() =>
              setCursor((c) => {
                const d = new Date(c.y, c.m + 1, 1);
                return { y: d.getFullYear(), m: d.getMonth() };
              })
            }
          >
            →
          </button>
        </header>
        <div className="grid grid-cols-7 gap-1 text-[10px] uppercase tracking-wider text-[var(--ink-mute)] font-data mb-1">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
            <div key={d} className="text-center p-1">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {cells.map((day, idx) => {
            if (day == null) return <div key={`e-${idx}`} className="aspect-square" />;
            const iso = `${cursor.y}-${String(cursor.m + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const saved = byDate.get(iso);
            return (
              <button
                key={iso}
                type="button"
                onClick={() => {
                  setSelected(iso);
                  if (saved) onOpenDay(iso);
                }}
                className={`aspect-square rounded-xl border text-sm font-data transition-colors ${
                  saved
                    ? 'border-[var(--copper)] bg-[var(--copper)]/10 text-[var(--ink)]'
                    : 'border-[var(--line)] text-[var(--ink-mute)] hover:bg-white/60'
                } ${selected === iso ? 'ring-2 ring-[var(--copper)]' : ''}`}
              >
                <div>{day}</div>
                {saved && (
                  <div className={`text-[9px] mt-0.5 ${((saved.book?.realizedPL || 0) + (saved.book?.unrealizedPL || 0)) >= 0 ? 'text-[var(--signal)]' : 'text-[var(--alert)]'}`}>
                    {saved.saved ? 'saved' : 'draft'}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </section>

      <section className="panel p-4 lg:col-span-2 space-y-3">
        <h3 className="font-display text-xl">Day review</h3>
        {!selectedDay ? (
          <p className="text-sm text-[var(--ink-mute)]">Select a saved day to review the book, plan, and heat.</p>
        ) : (
          <>
            <div className="font-data text-sm text-[var(--ink-mute)]">{selectedDay.date}</div>
            <div className="grid grid-cols-2 gap-2 font-data text-sm">
              <div className="rounded-xl bg-[var(--paper-deep)] p-3">
                <div className="text-[10px] uppercase text-[var(--ink-mute)]">Net Liq</div>
                <div className="text-lg font-semibold">
                  ${(selectedDay.book?.netLiq || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </div>
              </div>
              <div className="rounded-xl bg-[var(--paper-deep)] p-3">
                <div className="text-[10px] uppercase text-[var(--ink-mute)]">Heat</div>
                <div className="text-lg font-semibold">
                  {(selectedDay.metrics?.portfolioHeatPercent || 0).toFixed(2)}%
                </div>
              </div>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wider text-[var(--ink-mute)] mb-1">Game plan</div>
              <p className="text-sm whitespace-pre-wrap">{selectedDay.plan?.gamePlan || '—'}</p>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wider text-[var(--ink-mute)] mb-1">
                Positions ({selectedDay.book?.positions?.length || 0})
              </div>
              <ul className="space-y-1 font-data text-xs">
                {(selectedDay.book?.positions || []).map((p) => (
                  <li key={p.ticker} className="flex justify-between border-b border-[var(--line)] py-1">
                    <span>{p.ticker} × {p.qty}</span>
                    <span>stop {p.manualStop || '—'}</span>
                  </li>
                ))}
              </ul>
            </div>
            <button type="button" className="btn-primary w-full" onClick={() => onOpenDay(selectedDay.date)}>
              Open in Daily
            </button>
          </>
        )}
      </section>
    </div>
  );
}
