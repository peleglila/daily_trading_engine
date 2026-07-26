export type RiskStatus = {
  level: number;
  risk: string;
  margin: boolean;
  maxPos: string;
  color: string;
  msg?: string;
};

export type RiskProfile = {
  drawdown: number;
  strictTier: number;
  activeTier: number;
  isRecoveryMode: boolean;
  riskPercent: number;
  riskStatus: RiskStatus;
  oneRValue: number;
  dailyMaxLossR: number;
  dailyMaxLossDollar: number;
  isDailyMaxLossBreached: boolean;
  isDrawdown: boolean;
  breakerCActive: boolean;
  breakerBLocked: boolean;
  breakerBWarning: boolean;
};

export function computeDrawdown(peakEquity: number, currentEquity: number): number {
  return peakEquity > 0 ? ((peakEquity - currentEquity) / peakEquity) * 100 : 0;
}

export function computeStrictTier(drawdown: number): number {
  if (drawdown >= 15) return 3;
  if (drawdown >= 10) return 2;
  if (drawdown >= 5) return 1;
  return 0;
}

export function computeActiveTier(strictTier: number, manualRiskTier: string | number): {
  activeTier: number;
  isRecoveryMode: boolean;
} {
  if (manualRiskTier !== 'auto') {
    return { activeTier: Number(manualRiskTier), isRecoveryMode: true };
  }
  return { activeTier: strictTier, isRecoveryMode: false };
}

export function computeRiskPercentAndStatus(activeTier: number): {
  riskPercent: number;
  riskStatus: RiskStatus;
} {
  if (activeTier === 3) {
    return {
      riskPercent: 0,
      riskStatus: {
        level: 3,
        risk: '0%',
        margin: false,
        maxPos: '0',
        color: 'bg-red-100 text-red-800 border-red-300',
        msg: 'HARD STOP. 1 Week Off + Paper Trade',
      },
    };
  }
  if (activeTier === 2) {
    return {
      riskPercent: 0.5,
      riskStatus: {
        level: 2,
        risk: '0.5%',
        margin: false,
        maxPos: 'Max 2',
        color: 'bg-orange-100 text-orange-800 border-orange-300',
        msg: 'Level 2 Drawdown',
      },
    };
  }
  if (activeTier === 1) {
    return {
      riskPercent: 0.75,
      riskStatus: {
        level: 1,
        risk: '0.75%',
        margin: false,
        maxPos: 'Normal',
        color: 'bg-yellow-100 text-yellow-800 border-yellow-300',
        msg: 'Level 1 Drawdown (No Margin)',
      },
    };
  }
  return {
    riskPercent: 1.0,
    riskStatus: {
      level: 0,
      risk: '1.0% - 1.5%',
      margin: true,
      maxPos: 'Portfolio Size',
      color: 'bg-green-100 text-green-800 border-green-300',
    },
  };
}

export function computeRiskProfile(inputs: {
  peakEquity: number;
  currentEquity: number;
  manualRiskTier: string | number;
  dailyRealizedPL: number;
  qqqStatus: string;
  spyStatus: string;
  last3R: number;
  dailyMaxLossR?: number;
}): RiskProfile {
  const dailyMaxLossR = inputs.dailyMaxLossR ?? 2;
  const drawdown = computeDrawdown(inputs.peakEquity, inputs.currentEquity);
  const strictTier = computeStrictTier(drawdown);
  const { activeTier, isRecoveryMode } = computeActiveTier(strictTier, inputs.manualRiskTier);
  const { riskPercent, riskStatus } = computeRiskPercentAndStatus(activeTier);
  const oneRValue = inputs.currentEquity * (riskPercent / 100);
  const dailyMaxLossDollar = oneRValue * dailyMaxLossR;
  const isDailyMaxLossBreached =
    dailyMaxLossDollar > 0 && inputs.dailyRealizedPL <= -dailyMaxLossDollar;
  const isDrawdown = drawdown >= 5;

  return {
    drawdown,
    strictTier,
    activeTier,
    isRecoveryMode,
    riskPercent,
    riskStatus,
    oneRValue,
    dailyMaxLossR,
    dailyMaxLossDollar,
    isDailyMaxLossBreached,
    isDrawdown,
    breakerCActive: isDrawdown && inputs.last3R < 2,
    breakerBLocked: inputs.qqqStatus === 'below50',
    breakerBWarning: inputs.qqqStatus === 'below21' || inputs.spyStatus === 'below21',
  };
}
