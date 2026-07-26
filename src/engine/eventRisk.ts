export type EarningsTiming = 'none' | 'today' | 'tomorrow' | 'this_week' | 'unknown';

export type EventRiskInput = {
  ticker: string;
  earningsChecked: boolean;
  earningsTiming: EarningsTiming;
  eventNotes?: string;
  highImpactEventPending?: boolean;
  highImpactEventApproved?: boolean;
};

export type EventRiskResult = {
  allowed: boolean;
  reasons: string[];
};

/**
 * Blocks trades when earnings are today/tomorrow/unknown, or when a high-impact
 * event is pending without explicit plan approval.
 */
export function evaluateEventRisk(input: EventRiskInput): EventRiskResult {
  const reasons: string[] = [];
  const ticker = (input.ticker || '').trim();

  if (!ticker) {
    reasons.push('Ticker required for event-risk check.');
  }

  if (!input.earningsChecked) {
    reasons.push('Earnings check not completed.');
  } else if (input.earningsTiming === 'unknown') {
    reasons.push('Earnings timing unknown — treat as blocked until verified.');
  } else if (input.earningsTiming === 'today') {
    reasons.push('Earnings today — new trades blocked.');
  } else if (input.earningsTiming === 'tomorrow') {
    reasons.push('Earnings tomorrow — new trades blocked.');
  }

  if (input.highImpactEventPending && !input.highImpactEventApproved) {
    reasons.push('High-impact event pending and not approved in trade plan.');
  }

  return {
    allowed: reasons.length === 0,
    reasons,
  };
}
