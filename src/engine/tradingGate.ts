import type { RiskProfile } from './riskCalculator';
import type { EventRiskResult } from './eventRisk';
import type { TradePlanResult } from './tradePlanValidator';
import { setupRiskFactor } from './positionSizer';

export type ScheduleWindow = {
  start: string; // HH:mm Israel time
  end: string;
  label: string;
};

export const DEFAULT_SCHEDULE: ScheduleWindow[] = [
  { start: '17:00', end: '18:00', label: 'Focused Window 1' },
  { start: '20:30', end: '22:45', label: 'Focused Window 2' },
];

export type WorkspaceMode = 'live' | 'planning';
export type GateMode = 'blocked' | 'prep' | 'trade' | 'manage_only' | 'planning';

export type TradingGateResult = {
  /** True only in Live mode when all schedule + process checks pass. */
  allowed: boolean;
  /** True in Planning mode when process checks pass (schedule ignored). */
  planningReady: boolean;
  workspaceMode: WorkspaceMode;
  mode: GateMode;
  reasons: string[];
  scheduleReasons: string[];
  processReasons: string[];
  warnings: string[];
  phase: 'premarket' | 'regular' | 'afterhours' | 'weekend';
  inApprovedWindow: boolean;
  activeWindowLabel: string | null;
  israelTimeLabel: string;
  etTimeLabel: string;
  /** Risk dollars available for sizing when process checks pass (works in planning). */
  allowedRisk: number;
  setupFactor: number;
  snapshotStale: boolean;
};

function parseHHmm(value: string): number {
  const [h, m] = value.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

function getZonedParts(date: Date, timeZone: string) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = Object.fromEntries(
    fmt.formatToParts(date).filter((p) => p.type !== 'literal').map((p) => [p.type, p.value])
  );
  let hour = Number(parts.hour);
  if (hour === 24) hour = 0;
  const minute = Number(parts.minute);
  return {
    weekday: parts.weekday,
    minutes: hour * 60 + minute,
    label: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
  };
}

export function getMarketPhase(now: Date = new Date()): {
  phase: TradingGateResult['phase'];
  et: ReturnType<typeof getZonedParts>;
  israel: ReturnType<typeof getZonedParts>;
} {
  const et = getZonedParts(now, 'America/New_York');
  const israel = getZonedParts(now, 'Asia/Jerusalem');
  const isWeekend = et.weekday === 'Sat' || et.weekday === 'Sun';

  if (isWeekend) {
    return { phase: 'weekend', et, israel };
  }

  const open = 9 * 60 + 30;
  const close = 16 * 60;
  if (et.minutes < open) return { phase: 'premarket', et, israel };
  if (et.minutes >= close) return { phase: 'afterhours', et, israel };
  return { phase: 'regular', et, israel };
}

export function isWithinSchedule(
  israelMinutes: number,
  schedule: ScheduleWindow[] = DEFAULT_SCHEDULE
): { inWindow: boolean; label: string | null } {
  for (const window of schedule) {
    const start = parseHHmm(window.start);
    const end = parseHHmm(window.end);
    if (israelMinutes >= start && israelMinutes < end) {
      return { inWindow: true, label: window.label };
    }
  }
  return { inWindow: false, label: null };
}

export type TradingGateInput = {
  now?: Date;
  schedule?: ScheduleWindow[];
  risk: RiskProfile;
  eventRisk: EventRiskResult;
  tradePlan: TradePlanResult;
  setupGrade: string;
  routine: {
    snapshotImported?: boolean;
    journal?: boolean;
    alerts?: boolean;
    orders?: boolean;
  };
  /** Live enforces windows. Planning ignores schedule so you can size before/after hours. */
  workspaceMode?: WorkspaceMode;
  requireRoutine?: boolean;
  /** ISO timestamp of last applied IBKR snapshot */
  snapshotImportedAt?: string | null;
  nowMs?: number;
};

/**
 * Composite pre-trade permission gate.
 * Planning mode: ignore schedule; still enforce risk/earnings/plan.
 * Live mode: schedule + process must both pass for execution.
 */
export function getTradingGate(input: TradingGateInput): TradingGateResult {
  const now = input.now ?? new Date();
  const schedule = input.schedule ?? DEFAULT_SCHEDULE;
  const workspaceMode: WorkspaceMode = input.workspaceMode ?? 'live';
  const isPlanning = workspaceMode === 'planning';
  const { phase, et, israel } = getMarketPhase(now);
  const { inWindow, label } = isWithinSchedule(israel.minutes, schedule);

  const scheduleReasons: string[] = [];
  if (phase === 'weekend') scheduleReasons.push('Weekend — markets closed.');
  if (phase === 'premarket') scheduleReasons.push('Premarket blocked — regular hours only.');
  if (phase === 'afterhours') scheduleReasons.push('After-hours blocked — regular hours only.');
  if (phase === 'regular' && !inWindow) {
    scheduleReasons.push('Outside approved trading windows (17:00–18:00 / 20:30–22:45 IDT).');
  }

  const processReasons: string[] = [];
  const warnings: string[] = [];
  const nowMs = input.nowMs ?? now.getTime();
  const snapAt = input.snapshotImportedAt ? Date.parse(input.snapshotImportedAt) : NaN;
  const snapshotStale =
    !input.routine.snapshotImported ||
    !Number.isFinite(snapAt) ||
    nowMs - snapAt > 18 * 60 * 60 * 1000;

  if (input.risk.isDailyMaxLossBreached) {
    processReasons.push('Daily max loss breached — stop trading.');
  }
  if (input.risk.activeTier === 3 || input.risk.riskPercent <= 0) {
    processReasons.push('Hard stop / Level 3 — risk is 0%.');
  }
  if (input.risk.breakerBLocked) {
    processReasons.push('Breaker B locked — QQQ below 50 SMA.');
  }

  // Routine required for Live execution only — planning can happen before prep is done.
  const requireRoutine = input.requireRoutine !== false && !isPlanning;
  if (requireRoutine) {
    if (!input.routine.snapshotImported) {
      processReasons.push('IBKR snapshot not imported — complete start-of-day OCR step.');
    } else if (snapshotStale) {
      processReasons.push('IBKR snapshot is stale (>18h) — re-import Portfolio screenshot.');
    }
    if (!input.routine.journal) processReasons.push('Journal / tagging not completed.');
    if (!input.routine.alerts) processReasons.push('TradingView alerts not set.');
  } else if (isPlanning && snapshotStale) {
    warnings.push('IBKR snapshot missing or stale (>18h) — import before trusting size.');
  }

  if (!input.eventRisk.allowed) {
    processReasons.push(...input.eventRisk.reasons);
  }
  if (!input.tradePlan.allowed) {
    processReasons.push(...input.tradePlan.reasons);
  }

  const setupFactor = setupRiskFactor(input.setupGrade);
  if (setupFactor <= 0) {
    if (!processReasons.some((r) => r.includes('Setup grade'))) {
      processReasons.push('Setup grade does not allow risk.');
    }
  }

  const processOk = processReasons.length === 0;
  const scheduleOk = scheduleReasons.length === 0;
  const planningReady = isPlanning && processOk;
  const allowed = !isPlanning && processOk && scheduleOk;

  let mode: GateMode = 'blocked';
  if (isPlanning) mode = planningReady ? 'planning' : 'blocked';
  else if (allowed) mode = 'trade';
  else if (phase === 'regular' && !inWindow) mode = 'manage_only';
  else if (phase === 'premarket') mode = 'prep';

  const baseRisk = input.risk.oneRValue;
  const allowedRisk = processOk ? baseRisk * setupFactor : 0;

  const reasons = isPlanning
    ? [...new Set(processReasons)]
    : [...new Set([...scheduleReasons, ...processReasons])];

  return {
    allowed,
    planningReady,
    workspaceMode,
    mode,
    reasons,
    scheduleReasons: [...new Set(scheduleReasons)],
    processReasons: [...new Set(processReasons)],
    warnings: [...new Set(warnings)],
    phase,
    inApprovedWindow: inWindow,
    activeWindowLabel: label,
    israelTimeLabel: israel.label,
    etTimeLabel: et.label,
    allowedRisk,
    setupFactor,
    snapshotStale,
  };
}
