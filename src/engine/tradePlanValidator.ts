export type SetupGrade = 'A' | 'B' | 'C' | 'no_trade';
export type AddType = 'not_allowed' | 'winner_add' | 'loser_add';

export type TradePlanInput = {
  setupGrade: SetupGrade;
  originalStop?: number;
  proposedStop?: number;
  entryPrice?: number;
  direction?: 'long' | 'short';
  isAdd?: boolean;
  addType?: AddType;
  addPrePlanned?: boolean;
  positionIsLosing?: boolean;
  combinedRiskR?: number;
  maxCombinedRiskR?: number;
  unrealizedGainPct?: number;
  unrealizedR?: number;
  profitProtectionPlan?: 'none' | 'partial' | 'move_stop' | 'preplanned_full_risk';
  profitProtectPct?: number;
  profitProtectR?: number;
  noLoserAfterPct?: number;
};

export type TradePlanResult = {
  allowed: boolean;
  reasons: string[];
  warnings: string[];
  profitProtectionRequired: boolean;
};

const DEFAULT_PROTECT_PCT = 15;
const DEFAULT_PROTECT_R = 2;
const DEFAULT_NO_LOSER_PCT = 20;

/**
 * Validates setup quality, adds, stop movement, and profit-protection rules
 * that map to recent large drawdowns (oversizing, add-to-loser, stop widening,
 * giving back large unrealized gains).
 */
export function validateTradePlan(input: TradePlanInput): TradePlanResult {
  const reasons: string[] = [];
  const warnings: string[] = [];
  const protectPct = input.profitProtectPct ?? DEFAULT_PROTECT_PCT;
  const protectR = input.profitProtectR ?? DEFAULT_PROTECT_R;
  const noLoserAfterPct = input.noLoserAfterPct ?? DEFAULT_NO_LOSER_PCT;

  if (input.setupGrade === 'C' || input.setupGrade === 'no_trade') {
    reasons.push('Setup grade is C / No Trade — size must be 0.');
  }

  // Stop can only move toward lower risk (never widen).
  if (
    input.originalStop != null &&
    input.proposedStop != null &&
    input.entryPrice != null &&
    Number(input.originalStop) > 0 &&
    Number(input.proposedStop) > 0 &&
    Number(input.entryPrice) > 0
  ) {
    const direction = input.direction || 'long';
    const originalDist = Math.abs(input.entryPrice - input.originalStop);
    const proposedDist = Math.abs(input.entryPrice - input.proposedStop);
    const widens =
      proposedDist > originalDist + 1e-9 ||
      (direction === 'long' && input.proposedStop < input.originalStop) ||
      (direction === 'short' && input.proposedStop > input.originalStop);

    if (widens) {
      reasons.push('Stop widened / lowered risk control — forbidden (Breaker D).');
    }
  }

  // Add-to-loser protection.
  if (input.isAdd) {
    if (!input.addPrePlanned) {
      reasons.push('Add not pre-planned before entry — blocked.');
    }
    if (input.addType === 'loser_add' || (input.positionIsLosing && input.addType !== 'winner_add')) {
      if (!input.addPrePlanned || input.addType !== 'loser_add') {
        reasons.push('Adding to a losing position is blocked unless pre-planned as loser_add.');
      }
    }
    if (input.addType === 'not_allowed') {
      reasons.push('Add type is not_allowed for this trade plan.');
    }
    const maxCombined = input.maxCombinedRiskR ?? 1;
    if (input.combinedRiskR != null && input.combinedRiskR > maxCombined) {
      reasons.push(
        `Combined risk ${input.combinedRiskR.toFixed(2)}R exceeds max ${maxCombined}R.`
      );
    }
  }

  const gainPct = Number(input.unrealizedGainPct) || 0;
  const unrealizedR = Number(input.unrealizedR) || 0;
  const profitProtectionRequired = gainPct >= protectPct || unrealizedR >= protectR;

  if (profitProtectionRequired) {
    const plan = input.profitProtectionPlan || 'none';
    if (plan === 'none') {
      reasons.push(
        `Profit protection required at +${protectPct}% or +${protectR}R — choose partial or move stop.`
      );
    } else {
      warnings.push(`Profit protection active (${plan}).`);
    }
  }

  if (gainPct >= noLoserAfterPct) {
    const plan = input.profitProtectionPlan || 'none';
    if (plan !== 'partial' && plan !== 'move_stop' && plan !== 'preplanned_full_risk') {
      reasons.push(
        `Unrealized +${noLoserAfterPct}%+: trade cannot become a loser without an explicit protection plan.`
      );
    }
  }

  return {
    allowed: reasons.length === 0,
    reasons,
    warnings,
    profitProtectionRequired,
  };
}
