import React from 'react';
import { RISK_GUARDRAILS } from '../types/trading';

type Props = {
  heatPercent: number;
  netLiq: number;
  realizedPL: number;
  unrealizedPL: number;
  dayPL: number;
  openRiskDollars: number;
  securedPL?: number;
  baseEquity?: number;
  peakEquity?: number;
  asOf?: string | null;
  source?: string;
};

function money(n: number, digits = 0) {
  return n.toLocaleString(undefined, { maximumFractionDigits: digits });
}

export function HeatRail({
  heatPercent,
  netLiq,
  realizedPL,
  unrealizedPL,
  dayPL,
  openRiskDollars,
  securedPL = 0,
  baseEquity = 0,
  peakEquity = 0,
  asOf,
  source,
}: Props) {
  const max = RISK_GUARDRAILS.maxPortfolioHeatPct;
  const fill = Math.min(100, (heatPercent / max) * 100);
  const hot = heatPercent > max;
  const warm = !hot && fill > 70;
  const peak = Math.max(peakEquity, netLiq, 0);
  const drawdownPct = peak > 0 ? ((peak - netLiq) / peak) * 100 : 0;
  const vsBasePct = baseEquity > 0 ? ((netLiq - baseEquity) / baseEquity) * 100 : null;

  return (
    <section className="heat-rail rounded-2xl border border-[var(--ledger-border)] bg-[var(--ledger)] text-[var(--paper)] px-4 py-3 shadow-sm">
      <div className="flex flex-wrap items-end justify-between gap-3 mb-2">
        <div>
          <div className="font-display text-lg tracking-tight">Portfolio Heat</div>
          <div className="font-data text-xs text-[var(--paper-mute)] mt-0.5">
            {source || 'no import'} · {asOf ? new Date(asOf).toLocaleString() : '—'}
          </div>
        </div>
        <div className="font-data text-2xl font-semibold tabular-nums">
          <span className={hot ? 'text-[var(--alert)]' : warm ? 'text-[var(--copper)]' : 'text-[var(--signal)]'}>
            {heatPercent.toFixed(2)}%
          </span>
          <span className="text-[var(--paper-mute)] text-sm"> / {max.toFixed(1)}%</span>
        </div>
      </div>
      <div className="h-3 rounded-full bg-black/30 overflow-hidden">
        <div
          className={`h-full transition-all duration-500 ${
            hot ? 'bg-[var(--alert)]' : warm ? 'bg-[var(--copper)]' : 'bg-[var(--signal)]'
          }`}
          style={{ width: `${fill}%` }}
        />
      </div>
      <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-9 gap-3 font-data text-xs">
        <div>
          <div className="text-[var(--paper-mute)] uppercase tracking-wider">Net Liq</div>
          <div className="text-base font-semibold tabular-nums">${money(netLiq)}</div>
        </div>
        <div>
          <div className="text-[var(--paper-mute)] uppercase tracking-wider">Realized</div>
          <div className={`text-base font-semibold tabular-nums ${realizedPL >= 0 ? 'text-[var(--signal)]' : 'text-[var(--alert)]'}`}>
            {realizedPL >= 0 ? '+' : ''}${money(realizedPL)}
          </div>
        </div>
        <div>
          <div className="text-[var(--paper-mute)] uppercase tracking-wider">Unrealized</div>
          <div className={`text-base font-semibold tabular-nums ${unrealizedPL >= 0 ? 'text-[var(--signal)]' : 'text-[var(--alert)]'}`}>
            {unrealizedPL >= 0 ? '+' : ''}${money(unrealizedPL)}
          </div>
        </div>
        <div>
          <div className="text-[var(--paper-mute)] uppercase tracking-wider">Book P&L</div>
          <div className={`text-base font-semibold tabular-nums ${dayPL >= 0 ? 'text-[var(--signal)]' : 'text-[var(--alert)]'}`}>
            {dayPL >= 0 ? '+' : ''}${money(dayPL)}
          </div>
        </div>
        <div>
          <div className="text-[var(--paper-mute)] uppercase tracking-wider" title="P&L if all stops are hit">
            Secured
          </div>
          <div
            className={`text-base font-semibold tabular-nums ${
              securedPL >= 0 ? 'text-[var(--signal)]' : 'text-[var(--alert)]'
            }`}
          >
            {securedPL >= 0 ? '+' : ''}${money(securedPL)}
          </div>
        </div>
        <div>
          <div className="text-[var(--paper-mute)] uppercase tracking-wider">Open Risk</div>
          <div className="text-base font-semibold tabular-nums">${money(openRiskDollars)}</div>
        </div>
        <div>
          <div className="text-[var(--paper-mute)] uppercase tracking-wider">Base</div>
          <div className="text-base font-semibold tabular-nums">${money(baseEquity)}</div>
        </div>
        <div>
          <div className="text-[var(--paper-mute)] uppercase tracking-wider">ATH</div>
          <div className="text-base font-semibold tabular-nums">${money(peak)}</div>
        </div>
        <div>
          <div className="text-[var(--paper-mute)] uppercase tracking-wider">
            {vsBasePct != null ? 'vs Base / DD' : 'Drawdown'}
          </div>
          <div className="text-base font-semibold tabular-nums">
            {vsBasePct != null && (
              <span className={vsBasePct >= 0 ? 'text-[var(--signal)]' : 'text-[var(--alert)]'}>
                {vsBasePct >= 0 ? '+' : ''}
                {vsBasePct.toFixed(1)}%
              </span>
            )}
            {vsBasePct != null && <span className="text-[var(--paper-mute)]"> · </span>}
            <span className={drawdownPct > 0.05 ? 'text-[var(--alert)]' : 'text-[var(--paper)]'}>
              {drawdownPct.toFixed(1)}%
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
