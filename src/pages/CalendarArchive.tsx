import React, { useMemo, useState } from 'react';
import type { DayDocument, DayReview } from '../types/dayBook';
import { emptyReview, todayISO } from '../types/dayBook';
import { PROCESS_GRADES, processGradeMeta } from '../ui/processGrades';

type Props = {
  days: DayDocument[];
  onOpenDay: (date: string) => void;
  onReviewChange: (date: string, review: DayReview) => void;
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

function isoDate(year: number, month: number, day: number) {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function CalendarArchive({ days, onOpenDay, onReviewChange }: Props) {
  const [cursor, setCursor] = useState(() => {
    const n = new Date();
    return { y: n.getFullYear(), m: n.getMonth() };
  });
  const [selected, setSelected] = useState<string | null>(todayISO());

  const byDate = useMemo(() => {
    const map = new Map<string, DayDocument>();
    days.forEach((d) => map.set(d.date, d));
    return map;
  }, [days]);

  const cells = monthMatrix(cursor.y, cursor.m);
  const today = todayISO();
  const selectedDay = selected ? byDate.get(selected) : undefined;
  const review = selectedDay?.review || emptyReview();

  const writeReview = (patch: Partial<DayReview>) => {
    if (!selected) return;
    onReviewChange(selected, { ...review, ...patch });
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
      <section className="panel p-4 lg:col-span-3">
        <header className="flex items-center justify-between mb-4">
          <button
            type="button"
            className="btn-ghost"
            aria-label="Previous month"
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
            aria-label="Next month"
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
            const iso = isoDate(cursor.y, cursor.m, day);
            const saved = byDate.get(iso);
            const grade = processGradeMeta(saved?.review?.grade);
            const isToday = iso === today;
            const isSelected = selected === iso;
            return (
              <button
                key={iso}
                type="button"
                onClick={() => setSelected(iso)}
                onDoubleClick={() => onOpenDay(iso)}
                title="Click to review. Double-click to open the day."
                className={`day-btn aspect-square overflow-hidden rounded-xl border text-sm font-data flex flex-col items-center justify-center leading-tight transition-colors ${
                  grade ? `grade-${grade.id}` : 'border-[var(--line)] text-[var(--ink-mute)] hover:bg-white/60'
                } ${isToday ? 'day-today' : ''} ${isSelected ? 'day-selected' : ''}`}
              >
                <div className={isToday ? 'font-semibold text-[var(--ink)]' : ''}>{day}</div>
                {isToday && !grade && (
                  <div className="text-[9px] uppercase tracking-wide text-[var(--copper)]">Today</div>
                )}
                {grade && <div className="text-[9px] mt-0.5 font-semibold">{grade.tag}</div>}
              </button>
            );
          })}
        </div>
        <p className="mt-3 text-[11px] text-[var(--ink-mute)]">
          Click a day for the post-day review. Double-click to open the book.
        </p>
      </section>

      <section className="panel p-4 lg:col-span-2 space-y-3">
        <div>
          <p className="eyebrow">After the close</p>
          <h3 className="font-display text-xl">Post-day review</h3>
        </div>
        {!selected ? (
          <p className="text-sm text-[var(--ink-mute)]">Click a day to score how you traded it.</p>
        ) : (
          <>
            <div className="font-data text-sm text-[var(--ink)]">
              {new Date(selected + 'T12:00:00').toLocaleDateString(undefined, {
                weekday: 'long',
                month: 'long',
                day: 'numeric',
              })}
            </div>
            <p className="text-xs text-[var(--ink-mute)]">
              Score the session: were you focused, and did the plan hold?
            </p>
            <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Process grade">
              {PROCESS_GRADES.map((g) => {
                const on = review.grade === g.id;
                return (
                  <button
                    key={g.id}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => writeReview({ grade: on ? null : g.id })}
                    className={`rounded-xl border px-2.5 py-2 text-left ${on ? `grade-${g.id}` : 'border-[var(--line)] bg-white/70 hover:border-[var(--ink-mute)]'}`}
                  >
                    <div className="text-sm font-semibold">{g.label}</div>
                    <div className="text-[11px] text-[var(--ink-mute)] leading-snug mt-0.5">{g.blurb}</div>
                  </button>
                );
              })}
            </div>
            <label className="field normal-case tracking-normal">
              <span className="uppercase tracking-wider">What went right</span>
              <textarea
                className="input min-h-[88px] resize-y normal-case tracking-normal font-normal text-sm"
                placeholder="Waited for the setup, honored the stop, stayed at the desk…"
                value={review.wentRight}
                onChange={(e) => writeReview({ wentRight: e.target.value })}
              />
            </label>
            <label className="field normal-case tracking-normal">
              <span className="uppercase tracking-wider">What went wrong</span>
              <textarea
                className="input min-h-[88px] resize-y normal-case tracking-normal font-normal text-sm"
                placeholder="Chased, moved a stop, sized up, left the plan…"
                value={review.wentWrong}
                onChange={(e) => writeReview({ wentWrong: e.target.value })}
              />
            </label>
            <button type="button" className="btn-primary w-full" onClick={() => onOpenDay(selected)}>
              Open this day
            </button>
          </>
        )}
      </section>
    </div>
  );
}
