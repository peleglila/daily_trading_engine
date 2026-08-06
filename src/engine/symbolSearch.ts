export type SymbolHit = {
  symbol: string;
  fullSymbol: string;
  description: string;
  exchange: string;
  type: string;
};

const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:8787').replace(/\/$/, '');

/** Instant local matches — covers common US names without waiting on network. */
const LOCAL_UNIVERSE: Array<{ symbol: string; description: string; exchange: string; type: string }> = [
  { symbol: 'AAPL', description: 'Apple Inc.', exchange: 'NASDAQ', type: 'stock' },
  { symbol: 'MSFT', description: 'Microsoft Corporation', exchange: 'NASDAQ', type: 'stock' },
  { symbol: 'NVDA', description: 'NVIDIA Corporation', exchange: 'NASDAQ', type: 'stock' },
  { symbol: 'AMZN', description: 'Amazon.com Inc.', exchange: 'NASDAQ', type: 'stock' },
  { symbol: 'GOOGL', description: 'Alphabet Inc. Class A', exchange: 'NASDAQ', type: 'stock' },
  { symbol: 'GOOG', description: 'Alphabet Inc. Class C', exchange: 'NASDAQ', type: 'stock' },
  { symbol: 'META', description: 'Meta Platforms Inc.', exchange: 'NASDAQ', type: 'stock' },
  { symbol: 'TSLA', description: 'Tesla Inc.', exchange: 'NASDAQ', type: 'stock' },
  { symbol: 'AMD', description: 'Advanced Micro Devices', exchange: 'NASDAQ', type: 'stock' },
  { symbol: 'AVGO', description: 'Broadcom Inc.', exchange: 'NASDAQ', type: 'stock' },
  { symbol: 'NFLX', description: 'Netflix Inc.', exchange: 'NASDAQ', type: 'stock' },
  { symbol: 'CRM', description: 'Salesforce Inc.', exchange: 'NYSE', type: 'stock' },
  { symbol: 'ORCL', description: 'Oracle Corporation', exchange: 'NYSE', type: 'stock' },
  { symbol: 'ADBE', description: 'Adobe Inc.', exchange: 'NASDAQ', type: 'stock' },
  { symbol: 'INTC', description: 'Intel Corporation', exchange: 'NASDAQ', type: 'stock' },
  { symbol: 'QCOM', description: 'QUALCOMM Incorporated', exchange: 'NASDAQ', type: 'stock' },
  { symbol: 'MU', description: 'Micron Technology', exchange: 'NASDAQ', type: 'stock' },
  { symbol: 'SMCI', description: 'Super Micro Computer', exchange: 'NASDAQ', type: 'stock' },
  { symbol: 'ARM', description: 'Arm Holdings plc', exchange: 'NASDAQ', type: 'stock' },
  { symbol: 'PLTR', description: 'Palantir Technologies', exchange: 'NYSE', type: 'stock' },
  { symbol: 'COIN', description: 'Coinbase Global', exchange: 'NASDAQ', type: 'stock' },
  { symbol: 'HOOD', description: 'Robinhood Markets', exchange: 'NASDAQ', type: 'stock' },
  { symbol: 'UBER', description: 'Uber Technologies', exchange: 'NYSE', type: 'stock' },
  { symbol: 'SHOP', description: 'Shopify Inc.', exchange: 'NYSE', type: 'stock' },
  { symbol: 'SQ', description: 'Block Inc.', exchange: 'NYSE', type: 'stock' },
  { symbol: 'PYPL', description: 'PayPal Holdings', exchange: 'NASDAQ', type: 'stock' },
  { symbol: 'JPM', description: 'JPMorgan Chase', exchange: 'NYSE', type: 'stock' },
  { symbol: 'BAC', description: 'Bank of America', exchange: 'NYSE', type: 'stock' },
  { symbol: 'GS', description: 'Goldman Sachs', exchange: 'NYSE', type: 'stock' },
  { symbol: 'MS', description: 'Morgan Stanley', exchange: 'NYSE', type: 'stock' },
  { symbol: 'V', description: 'Visa Inc.', exchange: 'NYSE', type: 'stock' },
  { symbol: 'MA', description: 'Mastercard Inc.', exchange: 'NYSE', type: 'stock' },
  { symbol: 'XOM', description: 'Exxon Mobil', exchange: 'NYSE', type: 'stock' },
  { symbol: 'CVX', description: 'Chevron Corporation', exchange: 'NYSE', type: 'stock' },
  { symbol: 'LLY', description: 'Eli Lilly', exchange: 'NYSE', type: 'stock' },
  { symbol: 'UNH', description: 'UnitedHealth Group', exchange: 'NYSE', type: 'stock' },
  { symbol: 'JNJ', description: 'Johnson & Johnson', exchange: 'NYSE', type: 'stock' },
  { symbol: 'PFE', description: 'Pfizer Inc.', exchange: 'NYSE', type: 'stock' },
  { symbol: 'COST', description: 'Costco Wholesale', exchange: 'NASDAQ', type: 'stock' },
  { symbol: 'WMT', description: 'Walmart Inc.', exchange: 'NYSE', type: 'stock' },
  { symbol: 'HD', description: 'Home Depot', exchange: 'NYSE', type: 'stock' },
  { symbol: 'DIS', description: 'Walt Disney', exchange: 'NYSE', type: 'stock' },
  { symbol: 'BA', description: 'Boeing Company', exchange: 'NYSE', type: 'stock' },
  { symbol: 'CAT', description: 'Caterpillar Inc.', exchange: 'NYSE', type: 'stock' },
  { symbol: 'SPY', description: 'SPDR S&P 500 ETF', exchange: 'AMEX', type: 'etf' },
  { symbol: 'QQQ', description: 'Invesco QQQ Trust', exchange: 'NASDAQ', type: 'etf' },
  { symbol: 'IWM', description: 'iShares Russell 2000 ETF', exchange: 'AMEX', type: 'etf' },
  { symbol: 'DIA', description: 'SPDR Dow Jones Industrial Average', exchange: 'AMEX', type: 'etf' },
  { symbol: 'VTI', description: 'Vanguard Total Stock Market ETF', exchange: 'AMEX', type: 'etf' },
  { symbol: 'VOO', description: 'Vanguard S&P 500 ETF', exchange: 'AMEX', type: 'etf' },
  { symbol: 'TQQQ', description: 'ProShares UltraPro QQQ', exchange: 'NASDAQ', type: 'etf' },
  { symbol: 'SQQQ', description: 'ProShares UltraPro Short QQQ', exchange: 'NASDAQ', type: 'etf' },
  { symbol: 'SPXU', description: 'ProShares UltraPro Short S&P500', exchange: 'NYSE', type: 'etf' },
  { symbol: 'SOXL', description: 'Direxion Daily Semiconductor Bull 3X', exchange: 'NYSE', type: 'etf' },
  { symbol: 'SOXS', description: 'Direxion Daily Semiconductor Bear 3X', exchange: 'NYSE', type: 'etf' },
  { symbol: 'ARKK', description: 'ARK Innovation ETF', exchange: 'NYSE', type: 'etf' },
  { symbol: 'XLF', description: 'Financial Select Sector SPDR', exchange: 'AMEX', type: 'etf' },
  { symbol: 'XLE', description: 'Energy Select Sector SPDR', exchange: 'AMEX', type: 'etf' },
  { symbol: 'XLK', description: 'Technology Select Sector SPDR', exchange: 'AMEX', type: 'etf' },
  { symbol: 'GLD', description: 'SPDR Gold Shares', exchange: 'AMEX', type: 'etf' },
  { symbol: 'SLV', description: 'iShares Silver Trust', exchange: 'AMEX', type: 'etf' },
  { symbol: 'TLT', description: 'iShares 20+ Year Treasury Bond', exchange: 'NASDAQ', type: 'etf' },
  { symbol: 'HYG', description: 'iShares iBoxx High Yield Corporate Bond', exchange: 'NYSE', type: 'etf' },
  { symbol: 'UVXY', description: 'ProShares Ultra VIX Short-Term Futures', exchange: 'NYSE', type: 'etf' },
  { symbol: 'VIXY', description: 'ProShares VIX Short-Term Futures', exchange: 'NYSE', type: 'etf' },
];

function toHit(row: {
  symbol: string;
  description: string;
  exchange: string;
  type: string;
}): SymbolHit {
  const symbol = row.symbol.toUpperCase();
  const exchange = row.exchange.toUpperCase();
  return {
    symbol,
    fullSymbol: exchange && !symbol.includes(':') ? `${exchange}:${symbol}` : symbol,
    description: row.description,
    exchange,
    type: row.type,
  };
}

export function searchSymbolsLocal(q: string): SymbolHit[] {
  const upper = q.trim().toUpperCase();
  if (!upper) return [];
  return LOCAL_UNIVERSE.filter(
    (r) => r.symbol.startsWith(upper) || r.description.toUpperCase().includes(upper)
  )
    .slice(0, 12)
    .map(toHit);
}

function fromYahoo(json: unknown): SymbolHit[] {
  const quotes = (json as { quotes?: Record<string, unknown>[] })?.quotes;
  if (!Array.isArray(quotes)) return [];
  return quotes
    .slice(0, 12)
    .map((q) => {
      const symbol = String(q.symbol || '').toUpperCase();
      const exchange = String(q.exchange || q.exchDisp || '').toUpperCase();
      return toHit({
        symbol,
        description: String(q.shortname || q.longname || q.quoteType || symbol),
        exchange,
        type: String(q.quoteType || q.typeDisp || ''),
      });
    })
    .filter((h) => h.symbol);
}

function mergeHits(primary: SymbolHit[], secondary: SymbolHit[]): SymbolHit[] {
  const seen = new Set<string>();
  const out: SymbolHit[] = [];
  for (const hit of [...primary, ...secondary]) {
    const key = hit.symbol;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(hit);
    if (out.length >= 12) break;
  }
  return out;
}

async function searchViaApi(q: string): Promise<SymbolHit[]> {
  try {
    const res = await fetch(`${API_URL}/api/symbols/search?q=${encodeURIComponent(q)}`, {
      signal: AbortSignal.timeout(2500),
    });
    if (!res.ok) return [];
    const json = (await res.json()) as { hits?: SymbolHit[] };
    return Array.isArray(json.hits) ? json.hits : [];
  } catch {
    return [];
  }
}

async function searchYahooDirect(q: string): Promise<SymbolHit[]> {
  const yahooUrl =
    `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}` +
    `&quotesCount=12&newsCount=0&listsCount=0`;
  try {
    const res = await fetch(yahooUrl, { signal: AbortSignal.timeout(2500) });
    if (res.ok) return fromYahoo(await res.json());
  } catch {
    /* CORS or network */
  }
  // One short proxy attempt only (avoid multi-proxy waterfall)
  try {
    const res = await fetch(`https://corsproxy.io/?${encodeURIComponent(yahooUrl)}`, {
      signal: AbortSignal.timeout(3000),
    });
    if (res.ok) return fromYahoo(await res.json());
  } catch {
    /* ignore */
  }
  return [];
}

/**
 * Fast symbol autocomplete:
 * 1) local universe (instant)
 * 2) our API proxy → Yahoo (no CORS)
 * 3) Yahoo direct / single CORS proxy fallback
 */
export async function searchSymbols(query: string): Promise<SymbolHit[]> {
  const q = query.trim();
  if (q.length < 1) return [];

  const local = searchSymbolsLocal(q);
  const remote = await searchViaApi(q);
  if (remote.length) return mergeHits(remote, local);

  const yahoo = await searchYahooDirect(q);
  return mergeHits(yahoo.length ? yahoo : local, local);
}
