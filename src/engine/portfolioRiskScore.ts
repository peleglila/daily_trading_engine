import type { IbkrPosition } from './ibkrOcrParser';

export type PortfolioRiskGrade = 'green' | 'yellow' | 'red';
export type SetupCap = 'A' | 'B' | 'C' | 'no_trade';

export type PortfolioRiskScoreInput = {
  peakEquity: number;
  currentEquity: number;
  dailyRealizedPL: number;
  unrealizedPL: number;
  oneRValue: number;
  dailyMaxLossDollar: number;
  excessLiquidity: number;
  buyingPower: number;
  maintMargin: number;
  positions: IbkrPosition[];
};

export type PortfolioRiskScoreResult = {
  score: number;
  grade: PortfolioRiskGrade;
  reasons: string[];
  suggestedSetupCap: SetupCap;
  openRiskEstimateR: number;
  drawdownPct: number;
  concentrationPct: number;
  marginUtilizationPct: number;
};

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

/**
 * 0–100 portfolio health score from IBKR snapshot + cockpit risk params.
 * Higher = healthier. Also suggests a setup-grade cap for Plan & Size.
 */
export function computePortfolioRiskScore(input: PortfolioRiskScoreInput): PortfolioRiskScoreResult {
  const reasons: string[] = [];
  let score = 100;

  const equity = Math.max(0, Number(input.currentEquity) || 0);
  const peak = Math.max(equity, Number(input.peakEquity) || 0);
  const drawdownPct = peak > 0 ? ((peak - equity) / peak) * 100 : 0;

  if (drawdownPct >= 15) {
    score -= 40;
    reasons.push(`Hard drawdown ${drawdownPct.toFixed(1)}% (≥15%).`);
  } else if (drawdownPct >= 10) {
    score -= 25;
    reasons.push(`Level-2 drawdown ${drawdownPct.toFixed(1)}%.`);
  } else if (drawdownPct >= 5) {
    score -= 12;
    reasons.push(`Level-1 drawdown ${drawdownPct.toFixed(1)}%.`);
  }

  const dailyMax = Math.abs(Number(input.dailyMaxLossDollar) || 0);
  const realized = Number(input.dailyRealizedPL) || 0;
  if (dailyMax > 0 && realized <= -dailyMax) {
    score -= 35;
    reasons.push('Daily max loss (-2R) breached on realized P&L.');
  } else if (dailyMax > 0 && realized <= -0.7 * dailyMax) {
    score -= 15;
    reasons.push('Realized P&L near daily loss limit.');
  }

  const unrealized = Number(input.unrealizedPL) || 0;
  const unrealizedPct = equity > 0 ? (Math.abs(unrealized) / equity) * 100 : 0;
  if (unrealized < 0 && unrealizedPct >= 8) {
    score -= 20;
    reasons.push(`Open unrealized loss ${unrealizedPct.toFixed(1)}% of equity.`);
  } else if (unrealized < 0 && unrealizedPct >= 4) {
    score -= 10;
    reasons.push(`Open unrealized drag ${unrealizedPct.toFixed(1)}% of equity.`);
  }

  const oneR = Number(input.oneRValue) || 0;
  // Never divide by a fake $1 R — that turns unrealized $ into a bogus "R" figure
  const openRiskEstimateR =
    unrealized < 0 && oneR > 0 ? Math.abs(unrealized) / oneR : 0;

  // Concentration from positions
  let largestNotional = 0;
  for (const p of input.positions || []) {
    const last = Number(p.last) || 0;
    const qty = Math.abs(Number(p.qty) || 0);
    const notional = last > 0 ? last * qty : Math.abs(Number(p.pnl) || 0);
    if (notional > largestNotional) largestNotional = notional;
  }
  const concentrationPct = equity > 0 ? (largestNotional / equity) * 100 : 0;
  if (concentrationPct >= 50) {
    score -= 18;
    reasons.push(`High concentration ~${concentrationPct.toFixed(0)}% in one name.`);
  } else if (concentrationPct >= 30) {
    score -= 8;
    reasons.push(`Elevated concentration ~${concentrationPct.toFixed(0)}%.`);
  }

  const maint = Math.max(0, Number(input.maintMargin) || 0);
  const excess = Number(input.excessLiquidity);
  const marginUtilizationPct = equity > 0 && maint > 0 ? (maint / equity) * 100 : 0;
  if (marginUtilizationPct >= 70) {
    score -= 20;
    reasons.push(`Margin utilization high (${marginUtilizationPct.toFixed(0)}% of equity).`);
  } else if (marginUtilizationPct >= 50) {
    score -= 10;
    reasons.push(`Margin utilization elevated (${marginUtilizationPct.toFixed(0)}%).`);
  }

  if (Number.isFinite(excess) && equity > 0 && excess < equity * 0.25) {
    score -= 12;
    reasons.push('Excess liquidity buffer is thin relative to equity.');
  }

  const bp = Number(input.buyingPower) || 0;
  if (equity > 0 && bp > equity * 1.5 && maint > equity * 0.4) {
    score -= 8;
    reasons.push('Leverage / buying power elevated vs equity.');
  }

  score = clamp(Math.round(score), 0, 100);

  let grade: PortfolioRiskGrade = 'green';
  if (score < 45) grade = 'red';
  else if (score < 70) grade = 'yellow';

  let suggestedSetupCap: SetupCap = 'A';
  if (score < 40 || drawdownPct >= 15) suggestedSetupCap = 'no_trade';
  else if (score < 55 || drawdownPct >= 10) suggestedSetupCap = 'C';
  else if (score < 70 || drawdownPct >= 5) suggestedSetupCap = 'B';

  if (reasons.length === 0) {
    reasons.push('Snapshot looks constructive — no major portfolio stress flags.');
  }

  return {
    score,
    grade,
    reasons,
    suggestedSetupCap,
    openRiskEstimateR: Math.round(openRiskEstimateR * 10) / 10,
    drawdownPct,
    concentrationPct,
    marginUtilizationPct,
  };
}
