import React from 'react';
import { AlertTriangle, Award, Thermometer } from 'lucide-react';
import { RISK_GUARDRAILS, type GlobalRiskMetrics } from '../types/trading';

type Props = {
  metrics: GlobalRiskMetrics;
  lockoutLabel?: string;
};

/**
 * Sticky risk enforcement header:
 * Portfolio Heat / Execution Integrity Score / Lockout.
 */
export function RiskHeaderBar({ metrics, lockoutLabel }: Props) {
  const heat = metrics.totalPortfolioHeatPercent;
  const heatMax = RISK_GUARDRAILS.maxPortfolioHeatPct;
  const heatOver = metrics.heatOverCap;
  const heatPctFill = Math.min(100, (heat / heatMax) * 100);

  return (
    <div className="sticky top-0 z-40 border-b border-slate-700 bg-slate-950/95 text-white shadow-lg backdrop-blur">
      <div className="max-w-6xl mx-auto px-3 md:px-6 py-2.5 flex flex-col md:flex-row md:items-center gap-2 md:gap-4 text-xs md:text-sm">
        <div className="flex items-center gap-2 min-w-[220px] flex-1">
          <Thermometer className={`h-4 w-4 shrink-0 ${heatOver ? 'text-red-400' : 'text-emerald-400'}`} />
          <div className="flex-1">
            <div className="flex justify-between font-bold tracking-wide">
              <span className="text-slate-300 uppercase text-[10px]">Portfolio Heat</span>
              <span className={`font-mono ${heatOver ? 'text-red-300' : 'text-emerald-300'}`}>
                {heat.toFixed(2)}% / {heatMax.toFixed(1)}%
              </span>
            </div>
            <div className="mt-1 h-1.5 rounded-full bg-slate-800 overflow-hidden">
              <div
                className={`h-full ${heatOver ? 'bg-red-500' : heatPctFill > 70 ? 'bg-amber-400' : 'bg-emerald-400'}`}
                style={{ width: `${heatPctFill}%` }}
              />
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-slate-700 bg-slate-900 ml-auto">
          <Award className="h-4 w-4 text-indigo-400 shrink-0" />
          <div>
            <div className="text-[10px] uppercase font-bold tracking-wider text-slate-400">
              Execution Integrity
            </div>
            <div className="font-mono font-bold">
              {metrics.executionIntegrityScore.toFixed(0)}%
              <span className="text-slate-400 font-semibold text-[11px] ml-1">
                ({metrics.eisCompliantCount}/{metrics.eisTotalCount || RISK_GUARDRAILS.eisWindowTrades})
              </span>
            </div>
          </div>
        </div>

        {metrics.isLockoutActive && (
          <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-red-500 bg-red-950 text-red-100 font-bold animate-pulse">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span className="text-[11px] uppercase tracking-wide">
              48h Lockout{lockoutLabel ? ` · ${lockoutLabel}` : ''}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
