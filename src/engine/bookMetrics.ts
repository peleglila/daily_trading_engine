import { RISK_GUARDRAILS } from '../types/trading';
import type { BookPosition, DailyBook, DayMetrics } from '../types/dayBook';

export function positionOpenRisk(p: BookPosition): number {
  const stop = Number(p.manualStop);
  const entry = Number(p.entry);
  const qty = Math.abs(Number(p.qty) || 0);
  if (!(stop > 0) || !(entry > 0) || !(qty > 0)) return 0;
  if (p.direction === 'short') return Math.max(0, (stop - entry) * qty);
  return Math.max(0, (entry - stop) * qty);
}

/**
 * P&L if the position is closed at the stop (vs entry).
 * Positive = stop locks a gain; negative = stop defines remaining loss.
 */
export function positionSecuredPL(p: BookPosition): number | null {
  const stop = Number(p.manualStop);
  const entry = Number(p.entry);
  const qty = Math.abs(Number(p.qty) || 0);
  if (!(stop > 0) || !(entry > 0) || !(qty > 0)) return null;
  if (p.direction === 'short') return (entry - stop) * qty;
  return (stop - entry) * qty;
}

export function positionUnrealized(p: BookPosition): number {
  const entry = Number(p.entry) || 0;
  const mark = Number(p.lastMark) || entry;
  const qty = Math.abs(Number(p.qty) || 0);
  if (p.direction === 'short') return (entry - mark) * qty;
  return (mark - entry) * qty;
}

export function recomputeBook(book: DailyBook): DailyBook {
  const positions = (book.positions || []).map((p) => {
    const unrealized = positionUnrealized(p);
    return { ...p, unrealized, pnl: unrealized };
  });
  const unrealizedPL = positions.reduce((s, p) => s + (p.unrealized || 0), 0);
  // Do not auto-mutate peakEquity here — that breaks mid-edit of ATH / Base fields.
  return { ...book, positions, unrealizedPL };
}

/** Raise ATH only when current equity clearly exceeds it (e.g. after Net Liq edit / import). */
export function raisePeakIfNeeded(book: DailyBook): DailyBook {
  const net = Number(book.netLiq) || 0;
  const peak = Number(book.peakEquity) || 0;
  if (net > peak) return { ...book, peakEquity: net };
  return book;
}

export function computeDayMetrics(book: DailyBook): DayMetrics {
  const positions = book.positions || [];
  const openRiskDollars = positions.reduce((s, p) => s + positionOpenRisk(p), 0);
  const securedPL = positions.reduce((s, p) => {
    const v = positionSecuredPL(p);
    return s + (v ?? 0);
  }, 0);
  const equity = Math.max(0, Number(book.netLiq) || 0);
  const portfolioHeatPercent = equity > 0 ? (openRiskDollars / equity) * 100 : 0;
  const missingStopCount = positions.filter((p) => !(Number(p.manualStop) > 0)).length;
  return {
    portfolioHeatPercent,
    openRiskDollars,
    securedPL,
    missingStopCount,
  };
}

export function softSizeShares(input: {
  equity: number;
  entry: number;
  stop: number;
  allowedRiskPct: number;
  direction?: 'long' | 'short';
}): { shares: number; dollarRisk: number; positionValue: number; weightPct: number; warnings: string[] } {
  const warnings: string[] = [];
  const equity = Math.max(0, Number(input.equity) || 0);
  const entry = Number(input.entry) || 0;
  const stop = Number(input.stop) || 0;
  const riskPct = Math.max(0, Number(input.allowedRiskPct) || 0);
  const stopDist = entry > 0 && stop > 0 ? Math.abs(entry - stop) : 0;
  const riskDollars = equity * (riskPct / 100);
  let shares = stopDist > 0 && riskDollars > 0 ? Math.floor(riskDollars / stopDist) : 0;
  let positionValue = shares * entry;
  const weightCeiling = equity * (RISK_GUARDRAILS.maxPositionWeightPct / 100);
  if (entry > 0 && positionValue > weightCeiling) {
    shares = Math.floor(weightCeiling / entry);
    positionValue = shares * entry;
    warnings.push(`Capped to ${RISK_GUARDRAILS.maxPositionWeightPct}% position weight.`);
  }
  if (riskPct > RISK_GUARDRAILS.maxRiskPerTradePct) {
    warnings.push(`Risk ${riskPct}% is above suggested ${RISK_GUARDRAILS.maxRiskPerTradePct}% hint.`);
  }
  const dollarRisk = shares * stopDist;
  const weightPct = equity > 0 ? (positionValue / equity) * 100 : 0;
  return { shares, dollarRisk, positionValue, weightPct, warnings };
}
