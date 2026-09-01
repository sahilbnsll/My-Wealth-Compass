/**
 * Free stock/ETF quote feed.
 *
 * Yahoo Finance's public chart endpoint needs no API key and covers NSE (.NS)
 * and BSE (.BO) listings. Quotes are delayed, not real-time — every price we
 * store records that provenance so the UI can show it honestly.
 */
export const QUOTE_SOURCE = "Yahoo Finance (delayed)";
export const QUOTE_SOURCE_URL = "https://finance.yahoo.com/";

export type Quote = {
  symbol: string;
  resolvedSymbol: string;
  price: number;
  currency: string;
  previousClose: number | null;
  changePct: number | null;
  marketTime: string | null;
};

/** Turn a user-entered symbol into Yahoo candidates, NSE first. */
export function symbolCandidates(raw: string): string[] {
  const s = raw.trim().toUpperCase();
  if (!s) return [];
  if (/\.(NS|BO)$/.test(s)) return [s];
  if (/^[\^]/.test(s)) return [s];
  return [`${s}.NS`, `${s}.BO`];
}

async function fetchOne(symbol: string): Promise<Quote | null> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=5d`;
  const res = await fetch(url, {
    headers: { accept: "application/json", "user-agent": "Mozilla/5.0 (compatible; InvestIntel/1.0)" },
  });
  if (!res.ok) return null;
  const json = (await res.json()) as {
    chart?: { result?: Array<{ meta?: Record<string, unknown> }> | null; error?: unknown };
  };
  const meta = json.chart?.result?.[0]?.meta;
  if (!meta) return null;
  const price = Number(meta["regularMarketPrice"]);
  if (!Number.isFinite(price) || price <= 0) return null;
  const prev = Number(meta["chartPreviousClose"] ?? meta["previousClose"]);
  const ts = Number(meta["regularMarketTime"]);
  return {
    symbol,
    resolvedSymbol: String(meta["symbol"] ?? symbol),
    price,
    currency: String(meta["currency"] ?? "INR"),
    previousClose: Number.isFinite(prev) ? prev : null,
    changePct: Number.isFinite(prev) && prev > 0 ? ((price - prev) / prev) * 100 : null,
    marketTime: Number.isFinite(ts) ? new Date(ts * 1000).toISOString() : null,
  };
}

/** Resolve one symbol, trying NSE then BSE. Returns null when nothing matches. */
export async function fetchQuote(raw: string): Promise<Quote | null> {
  for (const candidate of symbolCandidates(raw)) {
    try {
      const q = await fetchOne(candidate);
      if (q) return { ...q, symbol: raw.trim().toUpperCase() };
    } catch {
      // try the next exchange suffix
    }
  }
  return null;
}

/** Fetch many symbols with light concurrency so we stay polite to the feed. */
export async function fetchQuotes(symbols: string[]): Promise<Map<string, Quote>> {
  const out = new Map<string, Quote>();
  const unique = [...new Set(symbols.map((s) => s.trim().toUpperCase()).filter(Boolean))];
  const batchSize = 5;
  for (let i = 0; i < unique.length; i += batchSize) {
    const batch = unique.slice(i, i + batchSize);
    const results = await Promise.all(batch.map((s) => fetchQuote(s)));
    results.forEach((q, idx) => {
      if (q) out.set(batch[idx]!, q);
    });
  }
  return out;
}

/** Headline Indian indices, for market context on the dashboard. */
export const INDEX_SYMBOLS = [
  { symbol: "^NSEI", label: "NIFTY 50" },
  { symbol: "^NSEBANK", label: "NIFTY Bank" },
  { symbol: "^BSESN", label: "SENSEX" },
] as const;

export type SymbolHit = {
  symbol: string;
  name: string;
  exchange: string | null;
  kind: "stock" | "etf";
};

/**
 * Search Yahoo's public symbol directory, restricted to Indian listings.
 * No API key; results are names + tickers only (no prices).
 */
export async function searchSymbols(query: string, limit = 6): Promise<SymbolHit[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const url = `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=20&newsCount=0`;
  try {
    const res = await fetch(url, {
      headers: { accept: "application/json", "user-agent": "Mozilla/5.0 (compatible; InvestIntel/1.0)" },
    });
    if (!res.ok) return [];
    const json = (await res.json()) as {
      quotes?: Array<Record<string, unknown>>;
    };
    const out: SymbolHit[] = [];
    for (const row of json.quotes ?? []) {
      const symbol = String(row["symbol"] ?? "");
      if (!/\.(NS|BO)$/.test(symbol)) continue;
      const type = String(row["quoteType"] ?? "").toUpperCase();
      if (type !== "EQUITY" && type !== "ETF") continue;
      out.push({
        symbol,
        name: String(row["longname"] ?? row["shortname"] ?? symbol),
        exchange: row["exchange"] ? String(row["exchange"]) : null,
        kind: type === "ETF" ? "etf" : "stock",
      });
      if (out.length >= limit) break;
    }
    return out;
  } catch {
    return [];
  }
}
