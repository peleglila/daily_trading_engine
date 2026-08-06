export type IbkrPosition = {
  ticker: string;
  last?: number;
  change?: number;
  qty: number;
  pnl?: number;
  /** Manual — not from IBKR screenshot OCR */
  entryPrice?: number;
  /** Manual ISO date YYYY-MM-DD */
  entryDate?: string;
  /** Manual — initial technical stop at entry (risk heat) */
  initialStopPrice?: number;
  /** Manual — trailed / active stop (heat drops to 0 past BE) */
  activeStopPrice?: number;
  /** Confirmed live hard bracket in IBKR (GR-05) */
  hasLiveBracketOrder?: boolean;
};

export type IbkrPortfolioSnapshot = {
  netLiq: number | null;
  dailyChange: number | null;
  dailyChangePct: number | null;
  unrealizedPL: number | null;
  realizedPL: number | null;
  marketValue: number | null;
  excessLiquidity: number | null;
  buyingPower: number | null;
  maintMargin: number | null;
  sma: number | null;
  positions: IbkrPosition[];
  rawText: string;
  parseNotes: string[];
};

/** Parse values like 95.26K, -10.08K, 121.9K, 1.2M, 95261 */
export function parseCompactNumber(raw: string): number | null {
  if (!raw) return null;
  const cleaned = String(raw)
    .replace(/[,$]/g, '')
    .replace(/\s/g, '')
    .replace(/^[~©®•●◆◇]+/, '')
    .trim();
  const match = cleaned.match(/^([+-]?)(\d+(?:\.\d+)?)([KMB])?$/i);
  if (!match) {
    const asNum = Number(cleaned);
    return Number.isFinite(asNum) ? asNum : null;
  }
  const sign = match[1] === '-' ? -1 : 1;
  const n = Number(match[2]);
  const unit = (match[3] || '').toUpperCase();
  const mult = unit === 'K' ? 1e3 : unit === 'M' ? 1e6 : unit === 'B' ? 1e9 : 1;
  return sign * n * mult;
}

/** Full numeric tokens only — never split 18.18 into 18 */
function extractNumberTokens(line: string): string[] {
  return line.match(/[+-]?\d{1,3}(?:,\d{3})+(?:\.\d+)?|[+-]?\d+(?:\.\d+)?[KMB]?/gi) || [];
}

function findLabeledValue(text: string, labelPatterns: RegExp[]): number | null {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const joined = text.replace(/\s+/g, ' ');

  for (const re of labelPatterns) {
    const m = joined.match(re);
    if (m && m[1]) {
      const v = parseCompactNumber(m[1]);
      if (v != null) return v;
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const re of labelPatterns) {
      const same = line.match(re);
      if (same?.[1]) {
        const v = parseCompactNumber(same[1]);
        if (v != null) return v;
      }
    }
  }
  return null;
}

/**
 * IBKR mobile often prints metric labels on one row and values on the next:
 * MARKET VALUE  EXCESS LIQ  SMA  THETA
 * 95.46K        36.7K       58.41K  -
 */
function parseMetricGrid(text: string): Partial<Record<string, number | null>> {
  const out: Partial<Record<string, number | null>> = {};
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  const headerKeys: { re: RegExp; key: string }[] = [
    { re: /market\s*value/i, key: 'marketValue' },
    { re: /excess\s*liq/i, key: 'excessLiquidity' },
    { re: /\bSMA\b/i, key: 'sma' },
    { re: /maint\.?\s*mgn|maint(?:enance)?\s*margin/i, key: 'maintMargin' },
    { re: /buying\s*power/i, key: 'buyingPower' },
  ];

  for (let i = 0; i < lines.length - 1; i++) {
    const header = lines[i];
    const valueLine = lines[i + 1];
    const keysOnLine = headerKeys.filter((h) => h.re.test(header)).map((h) => h.key);
    if (keysOnLine.length < 2) continue;

    const nums = extractNumberTokens(valueLine)
      .map((t) => parseCompactNumber(t))
      .filter((n): n is number => n != null && Math.abs(n) >= 10);

    // Align left-to-right; skip tiny junk like SPX delta decimals when mixed
    const orderedKeys = headerKeys
      .filter((h) => h.re.test(header))
      .map((h) => h.key);

    // Prefer K-suffixed tokens from the raw value line for account metrics
    const rawTokens = extractNumberTokens(valueLine);
    const ranked = rawTokens
      .map((t) => ({ t, v: parseCompactNumber(t) }))
      .filter((x): x is { t: string; v: number } => x.v != null);

    let ki = 0;
    for (const token of ranked) {
      if (ki >= orderedKeys.length) break;
      // Skip pure small decimals that look like SPX delta (e.g. 37.661) when key expects liq/margin
      const key = orderedKeys[ki];
      if (
        !/[KMB]$/i.test(token.t) &&
        Math.abs(token.v) < 1000 &&
        token.t.includes('.') &&
        (key === 'buyingPower' || key === 'maintMargin' || key === 'excessLiquidity' || key === 'sma' || key === 'marketValue')
      ) {
        // still assign if it's the only remaining option later
        continue;
      }
      if (out[key] == null) out[key] = token.v;
      ki += 1;
    }

    // Fallback: positional fill for any still-null keys
    if (nums.length > 0) {
      orderedKeys.forEach((key, idx) => {
        if (out[key] == null && nums[idx] != null) out[key] = nums[idx];
      });
    }
  }

  return out;
}

const SKIP_TICKERS = new Set([
  'NET', 'SMA', 'USD', 'ILS', 'SPX', 'TOTAL', 'LAST', 'CHNG', 'P', 'L',
  'NASDAQ', 'NMS', 'NYSE', 'AMEX', 'ARCA', 'CBOE', 'VALUE', 'POWER',
  'CASH', 'LIQ', 'MGN', 'THETA', 'VEGA', 'DELTA', 'OPEN', 'HIGH', 'LOW',
  'HOME', 'TRADE', 'POSTION', 'POSITION', 'INSTRUMENT',
]);

/** Common OCR confusions for tickers seen on IBKR mobile */
function normalizeTicker(raw: string): string {
  let t = raw.toUpperCase().replace(/[^A-Z]/g, '');
  const fixes: Record<string, string> = {
    INTC: 'INTC',
    INTG: 'INTC',
    AMO: 'AMD',
    ANID: 'AMD',
  };
  // 1NTC / I N T C handled separately
  if (/^1NTC$|^INTG$/.test(t)) return 'INTC';
  return fixes[t] || t;
}

function looksLikePrice(n: number): boolean {
  return Number.isFinite(n) && n > 0 && n < 100000;
}

function looksLikeQty(n: number): boolean {
  return Number.isFinite(n) && n > 0 && n < 100000 && Number.isInteger(n);
}

/**
 * Extract positions by tokenizing each line after the ticker.
 * Expected IBKR order: Last, Chng, Position, P&L
 */
function extractPositions(text: string): IbkrPosition[] {
  const positions: IbkrPosition[] = [];
  const seen = new Set<string>();
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  const merged: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const tickerOnly = line.match(/^([A-Z0-9]{1,5})\s*(?:NASDAQ|NYSE|AMEX|NMS|[A-Za-z.]+)?$/i);
    if (tickerOnly && i + 1 < lines.length && /\d/.test(lines[i + 1])) {
      merged.push(`${line} ${lines[i + 1]}`);
      i += 1;
      continue;
    }
    merged.push(line);
  }

  for (const line of merged) {
    if (/cash\s*balances|instrument|market\s*value|buying\s*power|excess\s*liq|unrealized|realized/i.test(line)) {
      continue;
    }

    // Ticker at start (allow OCR junk like + or exchange gibberish after)
    const start = line.match(/^([A-Z0-9]{1,5})\b/i);
    if (!start) continue;
    let ticker = normalizeTicker(start[1]);
    // OCR: INTC may appear as garbled exchange line still starting with INTC
    if (!ticker || ticker.length < 2 || SKIP_TICKERS.has(ticker)) continue;
    if (seen.has(ticker)) continue;

    const afterTicker = line.slice(start[0].length);
    const tokens = extractNumberTokens(afterTicker)
      .map((t) => ({ t, v: parseCompactNumber(t) }))
      .filter((x): x is { t: string; v: number } => x.v != null);

    if (tokens.length < 2) continue;

    // Prefer: price(decimal), change, qty(int), pnl
    let last: number | undefined;
    let change: number | undefined;
    let qty: number | undefined;
    let pnl: number | undefined;

    const decimals = tokens.filter((x) => x.t.includes('.') && !/[KMB]$/i.test(x.t));
    const ints = tokens.filter((x) => !x.t.includes('.') && !/[KMB]$/i.test(x.t));

    if (decimals.length >= 1 && looksLikePrice(Math.abs(decimals[0].v))) {
      last = Math.abs(decimals[0].v);
    }
    if (decimals.length >= 2) {
      change = decimals[1].v;
    }

    // Qty: positive integer that is not a 4+ digit P&L; prefer mid-size counts
    const qtyCandidates = ints.filter((x) => looksLikeQty(Math.abs(x.v)) && Math.abs(x.v) < 100000);
    // P&L often has comma: -1,909
    const pnlComma = tokens.find((x) => /^-?\d{1,3}(?:,\d{3})+$/.test(x.t));
    if (pnlComma) pnl = pnlComma.v;

    if (qtyCandidates.length >= 1) {
      // If we have change-like small int from OCR of -18.18 split... we prevent that via full tokens.
      // Prefer the integer that is NOT the last token when last looks like P&L magnitude
      if (qtyCandidates.length === 1) {
        qty = Math.abs(Math.round(qtyCandidates[0].v));
      } else {
        // Typical: [... change ints? ..., qty, pnl]
        // Take the first positive int that isn't equal to rounded |change|
        const changeAbs = change != null ? Math.round(Math.abs(change)) : null;
        const pick =
          qtyCandidates.find((x) => changeAbs == null || Math.abs(x.v) !== changeAbs) ||
          qtyCandidates[0];
        qty = Math.abs(Math.round(pick.v));
        // Remaining large int → pnl if not set
        if (pnl == null) {
          const pnlCand = [...qtyCandidates].reverse().find((x) => Math.abs(x.v) !== qty);
          if (pnlCand && Math.abs(pnlCand.v) >= 10) pnl = pnlCand.v;
        }
      }
    }

    if (pnl == null && ints.length >= 2) {
      const lastInt = ints[ints.length - 1];
      if (Math.abs(lastInt.v) >= 10) pnl = lastInt.v;
    }

    // Sign recovery: red P&L often loses minus in OCR; if change is negative and pnl positive, flip
    if (pnl != null && pnl > 0 && change != null && change < 0) {
      pnl = -pnl;
    }

    if (qty == null || !looksLikeQty(qty)) continue;

    seen.add(ticker);
    positions.push({
      ticker,
      last,
      change,
      qty,
      pnl,
      entryPrice: undefined,
      entryDate: '',
    });
  }

  // Second pass: known tickers if still missing (OCR gaps / 1NTC)
  const blob = text.toUpperCase().replace(/\u2212/g, '-');
  for (const ticker of ['AMD', 'INTC', 'NVDA', 'TSLA', 'AAPL', 'MSFT', 'META', 'AMZN', 'GOOGL', 'SOUN', 'SMCI']) {
    if (seen.has(ticker)) continue;
    const flex = ticker === 'INTC' ? '(?:INTC|1NTC|INTG)' : ticker.split('').join('\\s*');
    const re = new RegExp(
      `${flex}[^\\n]*?((?:[+-]?\\d+\\.\\d+))[^\\n]*?([+-]?\\d+(?:\\.\\d+)?)[^\\n]*?\\b([+-]?\\d{1,6})\\b[^\\n]*?([+-]?\\d{1,3}(?:,\\d{3})+|[+-]?\\d{3,7})`,
      'i'
    );
    const m = blob.match(re);
    if (!m) continue;
    const last = parseCompactNumber(m[1]) ?? undefined;
    const change = parseCompactNumber(m[2]) ?? undefined;
    const qty = Math.abs(Number(String(m[3]).replace(/,/g, '')));
    let pnl = parseCompactNumber(m[4]) ?? undefined;
    if (pnl != null && pnl > 0 && change != null && change < 0) pnl = -pnl;
    if (!looksLikeQty(qty)) continue;
    seen.add(ticker);
    positions.push({
      ticker,
      last: last != null ? Math.abs(last) : undefined,
      change,
      qty: Math.round(qty),
      pnl,
      entryPrice: undefined,
      entryDate: '',
    });
  }

  return positions;
}

/**
 * Parse OCR text from an IBKR mobile Portfolio screenshot into structured fields.
 */
export function parseIbkrPortfolioText(ocrText: string): IbkrPortfolioSnapshot {
  const text = (ocrText || '').replace(/\u2212/g, '-');
  const parseNotes: string[] = [];
  const grid = parseMetricGrid(text);

  const netLiq =
    findLabeledValue(text, [
      /net\s*liq(?:uidation)?\s*[^\d+\-]*([+-]?\d+(?:\.\d+)?[KMB]?)/i,
    ]) ??
    (() => {
      const first = text.match(/(?:^|\n)\s*([+-]?\d+(?:\.\d+)?K)\b/i);
      return first ? parseCompactNumber(first[1]) : null;
    })();

  const dailyChange = findLabeledValue(text, [
    /([+-]?\d+(?:\.\d+)?[KMB]?)\s*\([+-]?\d+(?:\.\d+)?%\)/,
  ]);

  const dailyChangePctMatch = text.match(/\(([+-]?\d+(?:\.\d+)?)%\)/);
  const dailyChangePct = dailyChangePctMatch ? Number(dailyChangePctMatch[1]) : null;

  // Match Unrealized before Realized — "realized" is a substring of "unrealized"
  let unrealizedPL = findLabeledValue(text, [
    /\bunrealized\b\s*(?:P[&RL]+)?\s*[^\d+\-]*([+-]?\d+(?:\.\d+)?[KMB]?)/i,
    /([+-]?\d+(?:\.\d+)?[KMB]?)\s*\bunrealized\b/i,
  ]);

  let realizedPL = findLabeledValue(text, [
    /(?<![Uu]n)\brealized\b\s*(?:P[&RL]+)?\s*[^\d+\-]*([+-]?\d+(?:\.\d+)?[KMB]?)/i,
    /([+-]?\d+(?:\.\d+)?[KMB]?)\s*(?<![Uu]n)\brealized\b/i,
  ]);

  // OCR often drops the minus on Unrealized when the day is red
  if (
    unrealizedPL != null &&
    unrealizedPL > 0 &&
    dailyChange != null &&
    dailyChange < 0
  ) {
    unrealizedPL = -unrealizedPL;
    parseNotes.push('Unrealized P&L sign was inferred as negative (OCR often drops the minus).');
  }

  // OCR sometimes reads 2.79K as 279K (drops the decimal)
  const realizedRaw = text.match(/(?<![Uu]n)\brealized\b\s*(?:P[&RL]+)?\s*[^\d+\-]*([+-]?\d+(?:\.\d+)?[KMB]?)/i);
  if (
    realizedPL != null &&
    realizedRaw?.[1] &&
    /^\d{3,}K$/i.test(realizedRaw[1].replace(/^[+-]/, '')) &&
    netLiq != null &&
    Math.abs(realizedPL) > Math.abs(netLiq) * 0.15
  ) {
    realizedPL = realizedPL / 100;
    parseNotes.push('Realized P&L decimal was inferred (OCR often reads 2.79K as 279K) — verify.');
  } else if (realizedPL != null && netLiq != null && Math.abs(realizedPL) > Math.abs(netLiq) * 0.5) {
    parseNotes.push('Realized P&L looks unusually large vs Net Liq — verify (OCR may have dropped a decimal).');
  }

  const marketValue =
    grid.marketValue ??
    findLabeledValue(text, [/market\s*value\s*[^\d+\-]*([+-]?\d+(?:\.\d+)?[KMB]?)/i]);

  const excessLiquidity =
    grid.excessLiquidity ??
    findLabeledValue(text, [/excess\s*liq(?:uidity)?\s*[^\d+\-]*([+-]?\d+(?:\.\d+)?[KMB]?)/i]);

  const buyingPower =
    grid.buyingPower ??
    findLabeledValue(text, [/buying\s*power\s*[^\d+\-]*([+-]?\d+(?:\.\d+)?[KMB]?)/i]);

  const maintMargin =
    grid.maintMargin ??
    findLabeledValue(text, [
      /maint(?:enance)?\.?\s*mgn\s*[^\d+\-]*([+-]?\d+(?:\.\d+)?[KMB]?)/i,
      /maint(?:enance)?\s*margin\s*[^\d+\-]*([+-]?\d+(?:\.\d+)?[KMB]?)/i,
    ]);

  const sma =
    grid.sma ?? findLabeledValue(text, [/\bSMA\b\s*[^\d+\-]*([+-]?\d+(?:\.\d+)?[KMB]?)/i]);

  const positions = extractPositions(text);

  if (netLiq == null) parseNotes.push('Could not find Net Liquidation — enter manually.');
  if (realizedPL == null) parseNotes.push('Could not find Realized P&L — enter manually.');
  if (unrealizedPL == null) parseNotes.push('Could not find Unrealized P&L — enter manually.');
  if (positions.length === 0) {
    parseNotes.push('No positions detected — add rows manually (OCR often drops tickers).');
  } else if (positions.length === 1) {
    parseNotes.push('Only one position detected — check if another ticker (e.g. INTC) was missed and add it.');
  }

  if (
    unrealizedPL != null &&
    realizedPL != null &&
    Math.abs(unrealizedPL - realizedPL) < 1
  ) {
    parseNotes.push('Realized and Unrealized look identical — verify Realized (OCR often confuses them).');
  }

  return {
    netLiq,
    dailyChange,
    dailyChangePct,
    unrealizedPL,
    realizedPL,
    marketValue: marketValue ?? null,
    excessLiquidity: excessLiquidity ?? null,
    buyingPower: buyingPower ?? null,
    maintMargin: maintMargin ?? null,
    sma: sma ?? null,
    positions,
    rawText: text,
    parseNotes,
  };
}

export function emptySnapshot(): IbkrPortfolioSnapshot {
  return {
    netLiq: null,
    dailyChange: null,
    dailyChangePct: null,
    unrealizedPL: null,
    realizedPL: null,
    marketValue: null,
    excessLiquidity: null,
    buyingPower: null,
    maintMargin: null,
    sma: null,
    positions: [],
    rawText: '',
    parseNotes: [],
  };
}
