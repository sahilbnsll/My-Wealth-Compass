/**
 * Universal instrument lookup — the single place the app resolves anything
 * investable. Everything (holdings, SIPs, transactions, research, plan,
 * portfolio search) goes through here so lookup logic never forks per page.
 *
 * Accepts: NSE symbol, BSE symbol, ISIN, AMFI scheme code, fund/stock/ETF name.
 * Resolves through AMFI's NAV feed and Yahoo's .NS / .BO listings.
 */
import { searchAmfiFunds, fetchAmfiNav, type NavRecord } from "./amfi.server";
import { fetchQuote, searchSymbols } from "./quotes.server";
import type { InstrumentHit, ResolvedInstrument } from "./instruments";

const ISIN_RE = /^IN[A-Z0-9]{10}$/i;
const SCHEME_CODE_RE = /^\d{4,8}$/;

function fundHit(f: NavRecord): InstrumentHit {
  return {
    kind: "mutual_fund",
    id: `fund:${f.schemeCode}`,
    name: f.name,
    symbol: f.schemeCode,
    isin: f.isin,
    price: f.nav,
    priceLabel: `NAV ₹${f.nav} · ${f.date}`,
    source: "amfi_nav",
    asOf: f.date,
  };
}

/** Ranked, merged search across both feeds. */
export async function searchInstrumentsAcrossFeeds(
  query: string,
  kinds: Array<"mutual_fund" | "stock" | "etf">,
): Promise<InstrumentHit[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const wantFunds = kinds.includes("mutual_fund");
  const wantSymbols = kinds.includes("stock") || kinds.includes("etf");

  const [funds, symbols] = await Promise.all([
    wantFunds ? searchAmfiFunds(q, 6).catch(() => [] as NavRecord[]) : Promise.resolve([] as NavRecord[]),
    wantSymbols ? searchSymbols(q, 6).catch(() => []) : Promise.resolve([]),
  ]);

  const fundHits = funds.map(fundHit);
  const symbolHits: InstrumentHit[] = symbols
    .filter((s) => kinds.includes(s.kind))
    .map((s) => ({
      kind: s.kind,
      id: `sym:${s.symbol}`,
      name: s.name,
      symbol: s.symbol,
      isin: null,
      price: null,
      priceLabel: [s.symbol, s.exchange].filter(Boolean).join(" · "),
      source: "yahoo_quote" as const,
      asOf: null,
    }));

  const merged: InstrumentHit[] = [];
  for (let i = 0; i < Math.max(fundHits.length, symbolHits.length); i += 1) {
    if (symbolHits[i]) merged.push(symbolHits[i]!);
    if (fundHits[i]) merged.push(fundHits[i]!);
  }
  return merged.slice(0, 10);
}

async function findFundBy(predicate: (n: NavRecord) => boolean): Promise<NavRecord | null> {
  try {
    const navs = await fetchAmfiNav();
    return navs.find(predicate) ?? null;
  } catch {
    return null;
  }
}

function fromFund(f: NavRecord): ResolvedInstrument {
  return {
    name: f.name,
    symbol: f.schemeCode,
    isin: f.isin,
    type: "mutual_fund",
    assetClass: guessFundAssetClass(f.name),
    price: f.nav,
    priceKind: "nav",
    currency: "INR",
    source: "amfi_nav",
    sourceLabel: "AMFI NAV feed",
    asOf: f.date || null,
  };
}

/** Best-effort asset class from a fund's own name; never invented beyond it. */
export function guessFundAssetClass(name: string): ResolvedInstrument["assetClass"] {
  const n = name.toLowerCase();
  if (/(liquid|overnight|money market)/.test(n)) return "cash";
  if (/(debt|bond|gilt|income|duration|credit risk|corporate bond)/.test(n)) return "debt";
  if (/(gold|silver|commodit)/.test(n)) return "gold";
  if (/(hybrid|balanced|multi asset|asset alloc)/.test(n)) return "other";
  return "equity";
}

/**
 * Resolve one identifier to a normalised instrument. Returns null when no
 * official feed recognises it — the caller then keeps manual entry.
 */
export async function resolveInstrumentQuery(rawQuery: string): Promise<ResolvedInstrument | null> {
  const query = rawQuery.trim();
  if (!query) return null;

  // 1. AMFI scheme code
  if (SCHEME_CODE_RE.test(query)) {
    const fund = await findFundBy((n) => n.schemeCode === query);
    if (fund) return fromFund(fund);
  }

  // 2. ISIN — funds first, then treat as a symbol search term
  if (ISIN_RE.test(query)) {
    const upper = query.toUpperCase();
    const fund = await findFundBy((n) => (n.isin ?? "").toUpperCase() === upper);
    if (fund) return fromFund(fund);
    const hits = await searchSymbols(upper, 1).catch(() => []);
    const hit = hits[0];
    if (hit) return await fromSymbol(hit.symbol, hit.name, hit.kind, upper);
  }

  // 3. Exchange symbol (with or without .NS / .BO)
  if (/^[A-Za-z0-9&.-]{1,20}$/.test(query) && !/\s/.test(query)) {
    const quote = await fetchQuote(query).catch(() => null);
    if (quote) {
      const named = await searchSymbols(quote.resolvedSymbol, 1).catch(() => []);
      return {
        name: named[0]?.name ?? quote.resolvedSymbol,
        symbol: quote.resolvedSymbol,
        isin: null,
        type: named[0]?.kind === "etf" ? "etf" : "stock",
        assetClass: named[0]?.kind === "etf" ? "equity" : "equity",
        price: quote.price,
        priceKind: "price",
        currency: quote.currency,
        source: "yahoo_quote",
        sourceLabel: "Yahoo Finance (delayed)",
        asOf: quote.marketTime,
      };
    }
  }

  // 4. Free-text name across both feeds
  const hits = await searchInstrumentsAcrossFeeds(query, ["mutual_fund", "stock", "etf"]);
  const first = hits[0];
  if (!first) return null;
  return await resolveHit(first);
}

async function fromSymbol(
  symbol: string,
  name: string,
  kind: "stock" | "etf",
  isin: string | null,
): Promise<ResolvedInstrument> {
  const quote = await fetchQuote(symbol).catch(() => null);
  return {
    name,
    symbol,
    isin,
    type: kind,
    assetClass: "equity",
    price: quote?.price ?? null,
    priceKind: "price",
    currency: quote?.currency ?? "INR",
    source: quote ? "yahoo_quote" : "none",
    sourceLabel: quote ? "Yahoo Finance (delayed)" : "No live price",
    asOf: quote?.marketTime ?? null,
  };
}

/** Turn a search hit into a fully normalised instrument (fetching price if needed). */
export async function resolveHit(hit: InstrumentHit): Promise<ResolvedInstrument> {
  if (hit.kind === "mutual_fund") {
    return {
      name: hit.name,
      symbol: hit.symbol,
      isin: hit.isin,
      type: "mutual_fund",
      assetClass: guessFundAssetClass(hit.name),
      price: hit.price,
      priceKind: "nav",
      currency: "INR",
      source: "amfi_nav",
      sourceLabel: "AMFI NAV feed",
      asOf: hit.asOf,
    };
  }
  return fromSymbol(hit.symbol, hit.name, hit.kind, null);
}
