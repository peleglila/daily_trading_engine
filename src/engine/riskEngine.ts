import {
  RISK_GUARDRAILS,
  type GlobalRiskMetrics,
  type PositionRiskData,
  type PreFlightSizerInput,
  type PreFlightSizerResult,
  type TradeComplianceRecord,
} from '../types/trading';

export type RawPositionForRisk = {
  ticker?: string;
  shares?: number;
  qty?: number;
  avgPrice?: number;
  entryPrice?: number;
  currentPrice?: number;
  last?: number;
  marketValue?: number;
  initialStopPrice?: number;
  activeStopPrice?: number;
  stopPrice?: number;
  hasLiveBracketOrder?: boolean;
};

/**
 * Open risk for one position. Trailed stop past breakeven → 0 risk.
 * R_open,i = max(0, (P_entry - P_active_stop) × Shares)
 */
export function computeOpenRiskDollars(
  avgPrice: number,
  activeStopPrice: number,
  shares: number
): number {
  const entry = Number(avgPrice) || 0;
  const stop = Number(activeStopPrice) || 0;
  const qty = Math.abs(Number(shares) || 0);
  if (!(entry > 0) || !(stop > 0) || !(qty > 0)) return 0;
  return Math.max(0, (entry - stop) * qty);
}

export function enrichPositionRisk(
  raw: RawPositionForRisk,
  totalEquity: number
): PositionRiskData {
  const shares = Math.abs(Number(raw.shares ?? raw.qty) || 0);
  const avgPrice = Number(raw.avgPrice ?? raw.entryPrice) || 0;
  const currentPrice = Number(raw.currentPrice ?? raw.last) || avgPrice;
  const marketValue =
    Number(raw.marketValue) > 0
      ? Number(raw.marketValue)
      : currentPrice > 0
        ? currentPrice * shares
        : avgPrice * shares;
  const equity = Math.max(0, Number(totalEquity) || 0);
  const initialStopPrice = Number(raw.initialStopPrice ?? raw.stopPrice) || 0;
  const activeStopPrice =
    Number(raw.activeStopPrice ?? raw.initialStopPrice ?? raw.stopPrice) || 0;
  const openRiskDollars = computeOpenRiskDollars(avgPrice, activeStopPrice, shares);

  return {
    ticker: String(raw.ticker || '').toUpperCase(),
    shares,
    avgPrice,
    currentPrice,
    marketValue,
    netLiqPercent: equity > 0 ? (marketValue / equity) * 100 : 0,
    initialStopPrice,
    activeStopPrice,
    hasLiveBracketOrder: !!raw.hasLiveBracketOrder,
    openRiskDollars,
    riskPercentOfEquity: equity > 0 ? (openRiskDollars / equity) * 100 : 0,
  };
}

export function computeExecutionIntegrityScore(
  records: TradeComplianceRecord[],
  windowSize: number = RISK_GUARDRAILS.eisWindowTrades
): { score: number; compliant: number; total: number } {
  const window = (records || []).slice(0, windowSize);
  const total = window.length;
  if (total === 0) return { score: 100, compliant: 0, total: 0 };
  const compliant = window.filter((r) => r.compliant).length;
  return {
    score: (compliant / total) * 100,
    compliant,
    total,
  };
}

export function isLockoutActive(
  lockoutExpirationTimestamp: number | null | undefined,
  nowMs: number = Date.now()
): boolean {
  if (lockoutExpirationTimestamp == null) return false;
  return Number(lockoutExpirationTimestamp) > nowMs;
}

export function createLockoutExpiration(
  fromMs: number = Date.now(),
  hours: number = RISK_GUARDRAILS.lockoutHours
): number {
  return fromMs + hours * 60 * 60 * 1000;
}

/**
 * Portfolio heat, EIS, lockout flags.
 * H% = (Σ R_open,i / Equity) × 100 — hard ceiling GR-03 = 2%.
 */
export function calculateRiskMetrics(
  positions: RawPositionForRisk[],
  totalEquity: number,
  options: {
    tradeCompliance?: TradeComplianceRecord[];
    lockoutExpirationTimestamp?: number | null;
    nowMs?: number;
  } = {}
): GlobalRiskMetrics {
  const equity = Math.max(0, Number(totalEquity) || 0);
  const enriched = (positions || []).map((p) => enrichPositionRisk(p, equity));
  const totalOpenRisk = enriched.reduce((sum, p) => sum + p.openRiskDollars, 0);
  const totalPortfolioHeatPercent = equity > 0 ? (totalOpenRisk / equity) * 100 : 0;

  const eis = computeExecutionIntegrityScore(options.tradeCompliance || []);
  const nowMs = options.nowMs ?? Date.now();
  const lockoutTs = options.lockoutExpirationTimestamp ?? undefined;
  const lockoutOn = isLockoutActive(lockoutTs, nowMs);

  return {
    totalEquityUSD: equity,
    totalPortfolioHeatPercent,
    executionIntegrityScore: eis.score,
    eisCompliantCount: eis.compliant,
    eisTotalCount: eis.total,
    isLockoutActive: lockoutOn,
    lockoutExpirationTimestamp: lockoutOn ? Number(lockoutTs) : undefined,
    heatOverCap: totalPortfolioHeatPercent > RISK_GUARDRAILS.maxPortfolioHeatPct,
  };
}

/**
 * GR-01 / GR-02 Pre-flight sizing:
 * Max Risk $ = Equity × 0.005 (also capped by processAllowedRisk if lower)
 * Max Shares = floor(Max Risk $ / |Entry - Stop|)
 * If Position $ > Equity × 0.15 → shrink shares to weight ceiling.
 */
export function sizePreFlightTrade(input: PreFlightSizerInput): PreFlightSizerResult {
  const blockReasons: string[] = [];
  const equity = Math.max(0, Number(input.totalEquity) || 0);
  const entry = Number(input.entryPrice) || 0;
  const stop = Number(input.stopPrice) || 0;
  const hardCapRisk = equity * (RISK_GUARDRAILS.maxRiskPerTradePct / 100);
  const processRisk =
    input.processAllowedRisk != null && Number.isFinite(input.processAllowedRisk)
      ? Math.max(0, Number(input.processAllowedRisk))
      : hardCapRisk;
  const maxRiskAmount = Math.min(hardCapRisk, processRisk);

  if (!String(input.ticker || '').trim()) blockReasons.push('Ticker is required.');
  if (!(entry > 0)) blockReasons.push('Entry price must be greater than 0.');
  if (!(stop > 0)) blockReasons.push('Technical stop price must be greater than 0.');
  if (entry > 0 && stop > 0 && entry === stop) {
    blockReasons.push('Stop price cannot equal entry price.');
  }
  if (equity <= 0) blockReasons.push('Account equity is required for sizing.');
  if (maxRiskAmount <= 0) blockReasons.push('Allowed risk is 0 — trading blocked.');

  const direction = input.direction || 'long';
  if (entry > 0 && stop > 0) {
    if (direction === 'long' && stop >= entry) {
      blockReasons.push('Long stop must be below entry.');
    }
    if (direction === 'short' && stop <= entry) {
      blockReasons.push('Short stop must be above entry.');
    }
  }

  const stopDistance = entry > 0 && stop > 0 ? Math.abs(entry - stop) : 0;
  let maxShares =
    stopDistance > 0 && maxRiskAmount > 0
      ? Math.floor(maxRiskAmount / stopDistance)
      : 0;
  let cappedByRisk = maxShares > 0;
  let cappedByWeight = false;

  let positionDollarValue = maxShares * entry;
  const weightCeiling = equity * (RISK_GUARDRAILS.maxPositionWeightPct / 100);
  if (entry > 0 && positionDollarValue > weightCeiling) {
    maxShares = Math.floor(weightCeiling / entry);
    positionDollarValue = maxShares * entry;
    cappedByWeight = true;
    cappedByRisk = false;
  }

  const dollarRisk = maxShares * stopDistance;
  const percentOfEquity = equity > 0 ? (positionDollarValue / equity) * 100 : 0;

  // GR-03: proposed trade must not push heat over 2%
  const currentHeat = Number(input.currentPortfolioHeatPercent) || 0;
  const proposedRisk =
    input.proposedOpenRiskDollars != null
      ? Number(input.proposedOpenRiskDollars)
      : dollarRisk;
  const proposedHeatPct =
    equity > 0 ? currentHeat + (proposedRisk / equity) * 100 : currentHeat;
  if (proposedHeatPct > RISK_GUARDRAILS.maxPortfolioHeatPct + 1e-9) {
    blockReasons.push(
      `Portfolio heat would reach ${proposedHeatPct.toFixed(2)}% (max ${RISK_GUARDRAILS.maxPortfolioHeatPct}%).`
    );
  }

  if (blockReasons.length === 0 && maxShares <= 0) {
    blockReasons.push('Stop distance too wide for 0.5% risk / 15% weight caps — size is 0.');
  }

  const withinLimits = blockReasons.length === 0 && maxShares > 0;
  const canLogTrade = withinLimits && !!input.hasLiveBracketOrder;

  if (!input.hasLiveBracketOrder) {
    // Informational — hard block on Log only (GR-05)
  }

  return {
    maxShares: withinLimits ? maxShares : Math.max(0, maxShares),
    positionDollarValue: withinLimits ? positionDollarValue : maxShares * entry,
    percentOfEquity,
    maxRiskAmount,
    stopDistance,
    dollarRisk: withinLimits ? dollarRisk : 0,
    cappedByWeight,
    cappedByRisk,
    withinLimits,
    blockReasons,
    canLogTrade,
  };
}

/** Build EIS-friendly records from daily archive history when no trade log exists. */
export function complianceFromHistory(
  history: Array<{ executionType?: string; id?: number; date?: string; ticker?: string }>
): TradeComplianceRecord[] {
  return (history || []).map((h, idx) => ({
    id: h.id ?? idx,
    ticker: h.ticker || 'SESSION',
    compliant: h.executionType === 'perfect',
    timestamp: h.id ?? Date.now() - idx,
    reason: h.executionType === 'mistake' ? 'Archived as execution mistake' : undefined,
  }));
}
