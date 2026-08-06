import React, { useMemo, useState } from 'react';
import { Calculator, X, ShieldAlert } from 'lucide-react';
import { sizePreFlightTrade } from '../engine/riskEngine';
import { RISK_GUARDRAILS } from '../types/trading';

export type PreFlightDraft = {
  ticker: string;
  entryPrice: number;
  stopPrice: number;
  direction: 'long' | 'short';
  hasLiveBracketOrder: boolean;
};

type Props = {
  open: boolean;
  onClose: () => void;
  totalEquity: number;
  processAllowedRisk: number;
  currentPortfolioHeatPercent: number;
  initial?: Partial<PreFlightDraft>;
  onLogTrade: (payload: PreFlightDraft & { maxShares: number; dollarRisk: number }) => void;
};

/**
 * Mandatory pre-flight order sizer.
 * Hard caps: 0.5% risk / trade, 15% position weight, live bracket checkbox.
 */
export function PreFlightSizerModal({
  open,
  onClose,
  totalEquity,
  processAllowedRisk,
  currentPortfolioHeatPercent,
  initial,
  onLogTrade,
}: Props) {
  const [ticker, setTicker] = useState(initial?.ticker || '');
  const [entryPrice, setEntryPrice] = useState(initial?.entryPrice || 0);
  const [stopPrice, setStopPrice] = useState(initial?.stopPrice || 0);
  const [direction, setDirection] = useState<'long' | 'short'>(initial?.direction || 'long');
  const [hasLiveBracketOrder, setHasLiveBracketOrder] = useState(!!initial?.hasLiveBracketOrder);

  React.useEffect(() => {
    if (!open) return;
    setTicker(initial?.ticker || '');
    setEntryPrice(initial?.entryPrice || 0);
    setStopPrice(initial?.stopPrice || 0);
    setDirection(initial?.direction || 'long');
    setHasLiveBracketOrder(!!initial?.hasLiveBracketOrder);
  }, [open, initial?.ticker, initial?.entryPrice, initial?.stopPrice, initial?.direction, initial?.hasLiveBracketOrder]);

  const result = useMemo(
    () =>
      sizePreFlightTrade({
        ticker,
        entryPrice,
        stopPrice,
        direction,
        totalEquity,
        processAllowedRisk,
        hasLiveBracketOrder,
        currentPortfolioHeatPercent,
      }),
    [
      ticker,
      entryPrice,
      stopPrice,
      direction,
      totalEquity,
      processAllowedRisk,
      hasLiveBracketOrder,
      currentPortfolioHeatPercent,
    ]
  );

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm">
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 bg-slate-900 text-white">
          <div className="flex items-center gap-2">
            <Calculator className="h-5 w-5 text-blue-400" />
            <div>
              <h2 className="font-bold text-base">Pre-Flight Order Sizer</h2>
              <p className="text-[11px] text-slate-400">
                GR-01 {RISK_GUARDRAILS.maxRiskPerTradePct}% risk · GR-02 {RISK_GUARDRAILS.maxPositionWeightPct}% weight · GR-05 bracket
              </p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded hover:bg-slate-800" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-5 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase">Ticker</label>
              <input
                type="text"
                value={ticker}
                onChange={(e) => setTicker(e.target.value.toUpperCase())}
                className="mt-1 w-full p-2 border rounded-md font-mono bg-slate-50 uppercase"
                placeholder="AEHR"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase">Direction</label>
              <select
                value={direction}
                onChange={(e) => setDirection(e.target.value as 'long' | 'short')}
                className="mt-1 w-full p-2 border rounded-md bg-slate-50"
              >
                <option value="long">Long</option>
                <option value="short">Short</option>
              </select>
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase">Entry price</label>
              <input
                type="number"
                step="0.01"
                value={entryPrice || ''}
                onChange={(e) => setEntryPrice(Number(e.target.value))}
                className="mt-1 w-full p-2 border rounded-md font-mono bg-slate-50"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase">Technical stop</label>
              <input
                type="number"
                step="0.01"
                value={stopPrice || ''}
                onChange={(e) => setStopPrice(Number(e.target.value))}
                className="mt-1 w-full p-2 border rounded-md font-mono bg-slate-50"
              />
            </div>
          </div>

          <div className={`p-3 rounded-xl border ${result.withinLimits ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-200'}`}>
            <div className="flex justify-between text-sm font-bold">
              <span>Max shares</span>
              <span className="font-mono">{result.maxShares}</span>
            </div>
            <div className="flex justify-between text-xs mt-1">
              <span>Position $</span>
              <span className="font-mono">
                ${result.positionDollarValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                {' '}({result.percentOfEquity.toFixed(1)}% equity)
              </span>
            </div>
            <div className="flex justify-between text-xs mt-1">
              <span>Max risk $ (≤0.5%)</span>
              <span className="font-mono">
                ${result.maxRiskAmount.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </span>
            </div>
            {(result.cappedByWeight || result.cappedByRisk) && (
              <p className="text-[10px] text-amber-800 mt-2 font-semibold">
                {result.cappedByWeight
                  ? 'Sized by 15% position-weight ceiling.'
                  : 'Sized by 0.5% risk / process risk cap.'}
              </p>
            )}
          </div>

          {result.blockReasons.map((r) => (
            <div key={r} className="text-[11px] text-red-700 flex gap-1.5 items-start">
              <ShieldAlert className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              {r}
            </div>
          ))}

          <label className="flex items-start gap-2 p-3 rounded-lg border border-indigo-200 bg-indigo-50 cursor-pointer">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={hasLiveBracketOrder}
              onChange={(e) => setHasLiveBracketOrder(e.target.checked)}
            />
            <span className="text-sm text-indigo-950 font-semibold leading-snug">
              I have placed a live Bracket Stop-Loss order in IBKR
              <span className="block text-[11px] font-normal text-indigo-800 mt-0.5">
                Required (GR-05). Log Trade stays disabled until checked.
              </span>
            </span>
          </label>

          <button
            type="button"
            disabled={!result.canLogTrade}
            onClick={() => {
              if (!result.canLogTrade) return;
              onLogTrade({
                ticker: ticker.trim().toUpperCase(),
                entryPrice,
                stopPrice,
                direction,
                hasLiveBracketOrder,
                maxShares: result.maxShares,
                dollarRisk: result.dollarRisk,
              });
            }}
            className={`w-full font-bold py-3 rounded-lg text-sm ${
              result.canLogTrade
                ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                : 'bg-slate-200 text-slate-500 cursor-not-allowed'
            }`}
          >
            Log Trade
          </button>
        </div>
      </div>
    </div>
  );
}
