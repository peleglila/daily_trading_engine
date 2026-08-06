export type ImportSource = 'flex' | 'csv' | 'ocr' | 'manual' | 'none';

export type BookPosition = {
  ticker: string;
  direction: 'long' | 'short';
  qty: number;
  entry: number;
  lastMark: number;
  markSource?: 'live' | 'import' | 'manual';
  markAt?: string;
  manualStop?: number | null;
  unrealized?: number;
  pnl?: number;
};

export type DailyBook = {
  netLiq: number;
  /** Starting / base account size (curve anchor). */
  baseEquity?: number;
  /** All-time high (ATH) account size. */
  peakEquity?: number;
  realizedPL: number;
  unrealizedPL: number;
  positions: BookPosition[];
  importSource: ImportSource;
  asOf: string | null;
};

/** Account-level knobs persisted across days. */
export type AccountSettings = {
  baseEquity: number;
  peakEquity: number;
};

export type WatchlistItem = {
  id: string;
  ticker: string;
  entry: number;
  stop: number;
  allowedRiskPct: number;
  allowedRiskDollars: number;
  sharesPreview: number;
  tactics: string;
  direction: 'long' | 'short';
};

export type DayPlan = {
  gamePlan: string;
  watchlist: WatchlistItem[];
};

export type DayMetrics = {
  portfolioHeatPercent: number;
  openRiskDollars: number;
  /** Sum of P&L if every position exits at its stop. */
  securedPL: number;
  missingStopCount: number;
};

export type DayDocument = {
  date: string;
  book: DailyBook;
  plan: DayPlan;
  metrics: DayMetrics;
  saved: boolean;
  updatedAt?: string;
};

export function emptyBook(): DailyBook {
  return {
    netLiq: 0,
    baseEquity: 0,
    peakEquity: 0,
    realizedPL: 0,
    unrealizedPL: 0,
    positions: [],
    importSource: 'none',
    asOf: null,
  };
}

export function emptyAccountSettings(): AccountSettings {
  return { baseEquity: 0, peakEquity: 0 };
}

export function emptyPlan(): DayPlan {
  return { gamePlan: '', watchlist: [] };
}

export function todayISO() {
  return new Date().toISOString().split('T')[0];
}
