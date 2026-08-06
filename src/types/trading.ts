/**
 * Risk Enforcement & Portfolio Heat schemas (spec v2).
 * Capital preservation + execution integrity over P&L.
 */

/** GR-01, GR-02, GR-03, GR-05, GR-06 hard thresholds (sector GR-04 removed) */
export const RISK_GUARDRAILS = {
  /** Max risk per trade as fraction of equity (0.50%) */
  maxRiskPerTradePct: 0.5,
  /** Max position weight as fraction of equity (15%) */
  maxPositionWeightPct: 15,
  /** Max cumulative open portfolio heat (2.0%) */
  maxPortfolioHeatPct: 2,
  /** Stop-tamper lockout duration */
  lockoutHours: 48,
  /** Rolling window for Execution Integrity Score */
  eisWindowTrades: 30,
} as const;

export interface PositionRiskData {
  // Portfolio OCR / IBKR Input Fields
  ticker: string;
  shares: number;
  avgPrice: number;
  currentPrice: number;
  marketValue: number;
  netLiqPercent: number;
  // Extended Risk Fields
  initialStopPrice: number;
  activeStopPrice: number;
  hasLiveBracketOrder: boolean;
  // Auto-Calculated Risk Metrics
  openRiskDollars: number;
  riskPercentOfEquity: number;
}

export interface GlobalRiskMetrics {
  totalEquityUSD: number;
  totalPortfolioHeatPercent: number;
  executionIntegrityScore: number;
  eisCompliantCount: number;
  eisTotalCount: number;
  isLockoutActive: boolean;
  lockoutExpirationTimestamp?: number;
  heatOverCap: boolean;
}

export type TradeComplianceRecord = {
  id: number;
  ticker: string;
  compliant: boolean;
  timestamp: number;
  reason?: string;
};

export type PreFlightSizerInput = {
  ticker: string;
  entryPrice: number;
  stopPrice: number;
  direction?: 'long' | 'short';
  totalEquity: number;
  /** Soft/process risk from gate (drawdown tier × setup × discipline). */
  processAllowedRisk?: number;
  hasLiveBracketOrder: boolean;
  /** Current open heat % before this trade (blocks if would exceed 2%). */
  currentPortfolioHeatPercent?: number;
  proposedOpenRiskDollars?: number;
};

export type PreFlightSizerResult = {
  maxShares: number;
  positionDollarValue: number;
  percentOfEquity: number;
  maxRiskAmount: number;
  stopDistance: number;
  dollarRisk: number;
  cappedByWeight: boolean;
  cappedByRisk: boolean;
  withinLimits: boolean;
  blockReasons: string[];
  canLogTrade: boolean;
};
