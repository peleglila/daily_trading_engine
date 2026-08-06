/**
 * Browser-friendly last-price fetch via our API proxy only.
 * Direct Yahoo from the browser is CORS-blocked and noisy in console.
 */

export type QuoteMap = Record<string, { price: number; source: 'live' | 'manual'; at: string }>;

const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:8787').replace(/\/$/, '');

export async function fetchQuote(symbol: string): Promise<number | null> {
  const ticker = symbol.trim().toUpperCase();
  if (!ticker) return null;
  try {
    const res = await fetch(`${API_URL}/api/quotes/${encodeURIComponent(ticker)}`, {
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { price?: number };
    return Number(json.price) > 0 ? Number(json.price) : null;
  } catch {
    return null;
  }
}

export async function fetchQuotes(tickers: string[]): Promise<QuoteMap> {
  const unique = [...new Set(tickers.map((t) => t.trim().toUpperCase()).filter(Boolean))];
  const out: QuoteMap = {};
  const at = new Date().toISOString();
  await Promise.all(
    unique.map(async (ticker) => {
      const price = await fetchQuote(ticker);
      if (price != null) out[ticker] = { price, source: 'live', at };
    })
  );
  return out;
}
