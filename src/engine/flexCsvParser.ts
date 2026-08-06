import type { BookPosition, DailyBook } from '../types/dayBook';

function num(raw: unknown): number | null {
  if (raw == null || raw === '') return null;
  const n = Number(String(raw).replace(/[,$"]/g, '').trim());
  return Number.isFinite(n) ? n : null;
}

function detectDelimiter(headerLine: string): string {
  const commas = (headerLine.match(/,/g) || []).length;
  const semis = (headerLine.match(/;/g) || []).length;
  const tabs = (headerLine.match(/\t/g) || []).length;
  if (tabs >= commas && tabs >= semis) return '\t';
  if (semis > commas) return ';';
  return ',';
}

function splitLine(line: string, delim: string): string[] {
  const out: string[] = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (q && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else q = !q;
      continue;
    }
    if (ch === delim && !q) {
      out.push(cur.trim());
      cur = '';
      continue;
    }
    cur += ch;
  }
  out.push(cur.trim());
  return out;
}

function col(headers: string[], aliases: string[]): number {
  for (const a of aliases) {
    const i = headers.findIndex((h) => h === a || h.includes(a));
    if (i >= 0) return i;
  }
  return -1;
}

function bareCell(line: string): string {
  return line.replace(/^"|"$/g, '').trim();
}

/**
 * Flex often emits single-column summary blocks before the positions table:
 *   "TotalRealizedPnl"
 *   "1611.53"
 *   "0"
 *   ...
 */
function parseSummarySections(lines: string[]): {
  realizedPL: number | null;
  netLiq: number | null;
  notes: string[];
} {
  const notes: string[] = [];
  let realizedPL: number | null = null;
  let netLiq: number | null = null;

  for (let i = 0; i < lines.length; i++) {
    const label = bareCell(lines[i]).toLowerCase().replace(/\s+/g, '');
    if (!label) continue;

    const isRealized =
      label === 'totalrealizedpnl' ||
      label === 'realizedpnl' ||
      label === 'realizedpandl' ||
      label === 'realizedpl';
    const isNetLiq =
      label === 'netliquidation' ||
      label === 'netliq' ||
      label === 'netliquidationvalue' ||
      label === 'totalnetliquidation' ||
      label === 'nav' ||
      label === 'netassetvalue' ||
      label === 'endingvalue' ||
      label === 'equitywithloanvalue';

    if (!isRealized && !isNetLiq) continue;

    // Collect following numeric single-cell rows until a multi-column header
    const values: number[] = [];
    for (let j = i + 1; j < lines.length; j++) {
      const cells = splitLine(lines[j], detectDelimiter(lines[j]));
      if (cells.length >= 3) break; // hit table header
      const v = num(bareCell(lines[j]));
      if (v == null) {
        if (cells.length === 1 && bareCell(lines[j]) && !/^-?\d/.test(bareCell(lines[j]))) break;
        continue;
      }
      values.push(v);
    }

    if (!values.length) continue;
    // Prefer first non-zero, else last (often the total row)
    const picked = values.find((v) => Math.abs(v) > 1e-9) ?? values[values.length - 1];
    if (isRealized) {
      realizedPL = picked;
      notes.push(`Flex realized P&L: $${picked.toFixed(2)}`);
    }
    if (isNetLiq) {
      netLiq = picked;
      notes.push(`Flex Net Liq: $${picked.toFixed(2)}`);
    }
  }

  // Free-text fallback anywhere in file
  if (netLiq == null) {
    const blob = lines.join('\n');
    const netMatch = blob.match(/net\s*liq(?:uidation)?[^\d\-]*([+-]?\d[\d,]*(?:\.\d+)?)/i);
    if (netMatch) netLiq = num(netMatch[1]);
  }
  if (realizedPL == null) {
    const blob = lines.join('\n');
    const m = blob.match(/total\s*realized\s*p(?:&)?n?l[^\d\-]*([+-]?\d[\d,]*(?:\.\d+)?)/i);
    if (m) realizedPL = num(m[1]);
  }

  return { realizedPL, netLiq, notes };
}

function findPositionsHeader(lines: string[]): { index: number; delim: string; headers: string[] } | null {
  for (let i = 0; i < lines.length; i++) {
    const delim = detectDelimiter(lines[i]);
    const headers = splitLine(lines[i], delim).map((h) => h.toLowerCase().replace(/"/g, ''));
    const hasSym = headers.some((h) => h === 'symbol' || h === 'ticker' || h.includes('underlying'));
    const hasQty = headers.some((h) => h === 'quantity' || h === 'qty' || h === 'position' || h === 'shares');
    if (hasSym && hasQty && headers.length >= 2) {
      return { index: i, delim, headers };
    }
  }
  return null;
}

/**
 * Parse IBKR Flex CSV / Activity statement style position exports.
 * Handles summary blocks (TotalRealizedPnl) + Open Positions tables
 * with CostBasisPrice / MarkPrice / FifoPnlUnrealized.
 */
export function parseFlexOrCsv(text: string): {
  book: Partial<DailyBook>;
  positions: BookPosition[];
  notes: string[];
} {
  const notes: string[] = [];
  const lines = text
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (!lines.length) {
    return { book: {}, positions: [], notes: ['Empty file'] };
  }

  const summary = parseSummarySections(lines);
  notes.push(...summary.notes);

  const table = findPositionsHeader(lines);
  if (!table) {
    notes.push('Could not find Symbol/Quantity columns — check this is a positions CSV.');
    return {
      book: {
        realizedPL: summary.realizedPL ?? undefined,
        netLiq: summary.netLiq ?? undefined,
        importSource: text.includes('<FlexQueryResponse') ? 'flex' : 'csv',
        asOf: new Date().toISOString(),
      },
      positions: [],
      notes,
    };
  }

  const { headers, delim, index: headerIndex } = table;
  const iSym = col(headers, ['symbol', 'ticker', 'underlying']);
  const iQty = col(headers, ['quantity', 'qty', 'position', 'shares']);
  const iEntry = col(headers, [
    'cost basis price',
    'costbasisprice',
    'cost price',
    'avg price',
    'average price',
    'costbasis',
    'open price',
  ]);
  const iMark = col(headers, [
    'mark price',
    'markprice',
    'last',
    'close price',
    'price',
    'value price',
  ]);
  const iFifo = col(headers, [
    'fifopnlunrealized',
    'fifo pnl unrealized',
    'unrealized pnl',
    'unrealized p&l',
    'fifopnl',
  ]);
  const iValue = col(headers, ['position value', 'value', 'market value', 'positionvalue']);
  const iSide = col(headers, ['side', 'direction', 'long/short']);

  const positions: BookPosition[] = [];
  for (const line of lines.slice(headerIndex + 1)) {
    const row = splitLine(line, delim);
    // Skip stray single-column summary rows after the table
    if (row.length < 2) continue;

    const ticker = String(row[iSym] || '')
      .toUpperCase()
      .replace(/[^A-Z0-9.]/g, '');
    if (!ticker || ticker === 'TOTAL' || ticker === 'SYMBOL' || ticker === 'CLIENTACCOUNTID') continue;

    const qtyRaw = num(row[iQty]);
    if (qtyRaw == null || qtyRaw === 0) continue;
    const qty = Math.abs(qtyRaw);

    let entry = iEntry >= 0 ? num(row[iEntry]) : null;
    let lastMark = iMark >= 0 ? num(row[iMark]) : null;
    if ((entry == null || entry <= 0) && iValue >= 0) {
      const mv = num(row[iValue]);
      if (mv != null && qty > 0) entry = Math.abs(mv) / qty;
    }
    if ((lastMark == null || lastMark <= 0) && iValue >= 0) {
      const mv = num(row[iValue]);
      if (mv != null && qty > 0) lastMark = Math.abs(mv) / qty;
    }
    entry = entry && entry > 0 ? entry : lastMark || 0;
    lastMark = lastMark && lastMark > 0 ? lastMark : entry;

    let direction: 'long' | 'short' = qtyRaw >= 0 ? 'long' : 'short';
    if (iSide >= 0) {
      const s = String(row[iSide] || '').toLowerCase();
      if (s.includes('short')) direction = 'short';
      if (s.includes('long')) direction = 'long';
    }

    const fifo = iFifo >= 0 ? num(row[iFifo]) : null;
    const unrealized =
      fifo != null
        ? fifo
        : direction === 'long'
          ? (lastMark - entry) * qty
          : (entry - lastMark) * qty;

    positions.push({
      ticker,
      direction,
      qty,
      entry,
      lastMark,
      markSource: 'import',
      markAt: new Date().toISOString(),
      manualStop: null,
      unrealized,
      pnl: unrealized,
    });
  }

  const unrealizedPL = positions.reduce((s, p) => s + (p.unrealized || 0), 0);

  if (positions.length === 0) notes.push('No positions parsed from CSV.');
  else {
    notes.push(`Parsed ${positions.length} positions.`);
    if (iFifo >= 0) notes.push(`Unrealized (Fifo): $${unrealizedPL.toFixed(2)}`);
  }

  return {
    book: {
      netLiq: summary.netLiq ?? undefined,
      realizedPL: summary.realizedPL ?? undefined,
      unrealizedPL,
      positions,
      importSource: text.includes('<FlexQueryResponse') || /totalrealizedpnl/i.test(text) ? 'flex' : 'csv',
      asOf: new Date().toISOString(),
    },
    positions,
    notes,
  };
}
