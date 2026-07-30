export type DisciplineHistoryEntry = {
  executionType?: string;
  mistakeCategory?: string;
  date?: string; // DD/MM/YYYY from archive
  id?: number;
};

export type SetupCap = 'A' | 'B' | 'C';

export type DisciplinePenaltyResult = {
  factor: 1 | 0.5 | 0;
  reason: string;
  maxSetupCap: SetupCap;
  mistakeCount: number;
};

function parseArchiveDate(displayDate: string | undefined): Date | null {
  if (!displayDate) return null;
  // DD/MM/YYYY
  const m = String(displayDate).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const d = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const y = Number(m[3]);
  const dt = new Date(y, mo, d);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

function isSameLocalDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/**
 * Rolling discipline cut from recent archived days.
 * 0 mistakes → full size; 1 → half + max B; ≥2 → half + warn;
 * last mistake archived today → factor 0 for the rest of that calendar day (Breaker A light).
 */
export function computeDisciplinePenalty(
  history: DisciplineHistoryEntry[],
  now: Date = new Date()
): DisciplinePenaltyResult {
  const recent = (history || []).slice(0, 5);
  const mistakes = recent.filter((h) => h.executionType === 'mistake');
  const mistakeCount = mistakes.length;

  if (mistakeCount === 0) {
    return { factor: 1, reason: '', maxSetupCap: 'A', mistakeCount: 0 };
  }

  const lastMistake = mistakes[0];
  const lastDate = parseArchiveDate(lastMistake?.date);
  if (lastDate && isSameLocalDay(lastDate, now)) {
    return {
      factor: 0,
      reason: 'Breaker A: mistake archived today — no new risk until tomorrow.',
      maxSetupCap: 'C',
      mistakeCount,
    };
  }

  if (mistakeCount === 1) {
    return {
      factor: 0.5,
      reason: 'Discipline cut: 1 mistake in last 5 sessions — half size, max setup B.',
      maxSetupCap: 'B',
      mistakeCount,
    };
  }

  return {
    factor: 0.5,
    reason: `Discipline cut: ${mistakeCount} mistakes in last 5 sessions — half size, max setup B.`,
    maxSetupCap: 'B',
    mistakeCount,
  };
}
