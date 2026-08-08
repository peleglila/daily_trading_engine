import React, { useMemo } from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
} from 'recharts';

type Point = { date: string; equity: number; dayPL?: number };

type Props = {
  series: Point[];
  baseEquity?: number;
  peakEquity?: number;
};

export function PnLChart({ series, baseEquity = 0, peakEquity = 0 }: Props) {
  const data = useMemo(() => {
    if (baseEquity > 0 && series.length > 0 && series[0].date !== 'Base') {
      return [{ date: 'Base', equity: baseEquity }, ...series];
    }
    if (baseEquity > 0 && series.length === 0) {
      return [{ date: 'Base', equity: baseEquity }];
    }
    return series;
  }, [series, baseEquity]);

  const peak = Math.max(
    peakEquity,
    baseEquity,
    ...data.map((d) => d.equity),
    0
  );

  return (
    <section className="panel p-4">
      <div className="flex items-baseline justify-between gap-2 mb-3">
        <h3 className="font-display text-lg">Equity curve</h3>
        <div className="font-data text-[11px] text-[var(--ink-mute)]">
          {baseEquity > 0 && <span>Base ${baseEquity.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>}
          {baseEquity > 0 && peak > 0 && <span> · </span>}
          {peak > 0 && <span>ATH ${peak.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>}
        </div>
      </div>
      {data.length < 2 ? (
        <p className="text-sm text-[var(--ink-mute)]">
          Set Base + ATH below, import today’s book, and save a few days to build the curve.
        </p>
      ) : (
        <div className="h-64 md:h-72">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data}>
              <defs>
                <linearGradient id="eqFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#2F6F78" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#2F6F78" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#d5dde8" strokeDasharray="3 3" />
              <XAxis dataKey="date" tick={{ fontSize: 10, fontFamily: 'IBM Plex Mono, monospace' }} />
              <YAxis
                tick={{ fontSize: 10, fontFamily: 'IBM Plex Mono, monospace' }}
                domain={[
                  (min: number) => Math.min(min, baseEquity > 0 ? baseEquity * 0.95 : min),
                  (max: number) => Math.max(max, peak > 0 ? peak * 1.02 : max),
                ]}
                width={64}
              />
              <Tooltip
                contentStyle={{
                  background: '#152033',
                  border: 'none',
                  borderRadius: 12,
                  color: '#E7EDF4',
                  fontFamily: 'IBM Plex Mono, monospace',
                  fontSize: 12,
                }}
                formatter={(value: number) => [`$${Number(value).toLocaleString()}`, 'Equity']}
              />
              {baseEquity > 0 && (
                <ReferenceLine
                  y={baseEquity}
                  stroke="#8A94A6"
                  strokeDasharray="4 4"
                  label={{ value: 'Base', fill: '#8A94A6', fontSize: 10, position: 'insideTopRight' }}
                />
              )}
              {peak > 0 && (
                <ReferenceLine
                  y={peak}
                  stroke="#B87333"
                  strokeDasharray="4 4"
                  label={{ value: 'ATH', fill: '#B87333', fontSize: 10, position: 'insideTopRight' }}
                />
              )}
              <Area type="monotone" dataKey="equity" stroke="#2F6F78" fill="url(#eqFill)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}
