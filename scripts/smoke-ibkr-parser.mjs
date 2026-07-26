import { readFileSync } from 'fs';

// Compact-number smoke + source presence checks (TS modules load via Vite build).

function parseCompactNumber(raw) {
  if (!raw) return null;
  const cleaned = String(raw).replace(/[,$]/g, '').replace(/\s/g, '').trim();
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

const assert = (cond, msg) => {
  if (!cond) throw new Error(msg);
};

assert(parseCompactNumber('95.26K') === 95260, 'net liq');
assert(parseCompactNumber('-6.52K') === -6520, 'unrealized');
assert(parseCompactNumber('2.79K') === 2790, 'realized');
assert(parseCompactNumber('121.9K') === 121900, 'bp');

const src = readFileSync(new URL('../src/engine/ibkrOcrParser.ts', import.meta.url), 'utf8');
assert(src.includes('export function parseIbkrPortfolioText'), 'parser export present');
const scoreSrc = readFileSync(new URL('../src/engine/portfolioRiskScore.ts', import.meta.url), 'utf8');
assert(scoreSrc.includes('suggestedSetupCap'), 'score export present');
const helpSrc = readFileSync(new URL('../src/ui/fieldHelpCopy.ts', import.meta.url), 'utf8');
assert(helpSrc.includes('snapshotImport'), 'field help present');

console.log('smoke-ibkr-parser: OK');
