export type PositionSizeInput = {
  entryPrice: number;
  stopPrice: number;
  allowedRisk: number;
  direction?: 'long' | 'short';
  requestedShares?: number;
};

export type PositionSizeResult = {
  shares: number;
  stopDistance: number;
  dollarRisk: number;
  withinLimits: boolean;
  blockReasons: string[];
};

export function computePositionSize(input: PositionSizeInput): PositionSizeResult {
  const blockReasons: string[] = [];
  const entry = Number(input.entryPrice);
  const stop = Number(input.stopPrice);
  const allowedRisk = Math.max(0, Number(input.allowedRisk) || 0);

  if (!(entry > 0)) blockReasons.push('Entry price must be greater than 0.');
  if (!(stop > 0)) blockReasons.push('Stop price must be greater than 0.');
  if (entry > 0 && stop > 0 && entry === stop) {
    blockReasons.push('Stop price cannot equal entry price.');
  }
  if (allowedRisk <= 0) {
    blockReasons.push('Allowed risk is 0 — trading blocked.');
  }

  const stopDistance = entry > 0 && stop > 0 ? Math.abs(entry - stop) : 0;
  const rawShares = stopDistance > 0 && allowedRisk > 0 ? Math.floor(allowedRisk / stopDistance) : 0;
  let shares = rawShares;

  if (input.requestedShares != null && Number(input.requestedShares) > 0) {
    const requested = Math.floor(Number(input.requestedShares));
    if (requested > rawShares) {
      blockReasons.push(
        `Requested ${requested} shares exceeds max ${rawShares} for allowed risk.`
      );
      shares = 0;
    } else {
      shares = requested;
    }
  }

  const dollarRisk = shares * stopDistance;
  const withinLimits = blockReasons.length === 0 && shares > 0;

  if (blockReasons.length === 0 && shares <= 0) {
    blockReasons.push('Stop distance too wide for allowed risk — size is 0.');
  }

  return {
    shares: withinLimits ? shares : Math.max(0, shares),
    stopDistance,
    dollarRisk: withinLimits ? dollarRisk : 0,
    withinLimits,
    blockReasons,
  };
}

/** Setup-grade multiplier for allowed risk. C and No Trade = 0. */
export function setupRiskFactor(setupGrade: string): number {
  switch (setupGrade) {
    case 'A':
      return 1.0;
    case 'B':
      return 0.5;
    case 'C':
    case 'no_trade':
    default:
      return 0;
  }
}
