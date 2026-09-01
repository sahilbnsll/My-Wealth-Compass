/**
 * Macro data providers: India CPI inflation, the RBI policy (repo) rate and
 * headline equity index levels.
 *
 * Every provider is free and keyless. Each returns the source it came from,
 * the date the observation refers to, and an honest confidence level so the
 * dashboard can show how much weight a number deserves.
 */

export type Confidence = "high" | "medium" | "low";

export type MacroPoint = {
  symbol: string;
  kind: "inflation" | "policy_rate" | "index" | "index_return" | "commodity" | "fx";
  label: string;
  value: number;
  currency: string;
  unit: "pct" | "index" | "currency";
  dataDate: string | null;
  source: string;
  sourceUrl: string;
  sourceType: "official" | "public" | "third_party";
  freshness: "current" | "delayed" | "eod" | "stale";
  confidence: Confidence;
  note: string;
};

const DBNOMICS = "https://api.db.nomics.world/v22/series";

type DbnSeries = { period: string[]; value: (number | null)[]; series_name?: string };

async function dbnomicsLatest(path: string): Promise<{ period: string; value: number } | null> {
  const res = await fetch(`${DBNOMICS}/${path}?observations=1`, {
    headers: { accept: "application/json" },
  });
  if (!res.ok) return null;
  const json = (await res.json()) as { series?: { docs?: DbnSeries[] } };
  const doc = json.series?.docs?.[0];
  if (!doc) return null;
  for (let i = doc.value.length - 1; i >= 0; i--) {
    const v = doc.value[i];
    const p = doc.period[i];
    if (typeof v === "number" && Number.isFinite(v) && p) return { period: p, value: v };
  }
  return null;
}

/** Age of an observation in months, used to decide freshness and confidence. */
function monthsOld(period: string): number {
  const [y, m] = period.split("-");
  const d = new Date(Number(y), m ? Number(m) - 1 : 0, 1);
  const now = new Date();
  return (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth());
}

function gradeByAge(age: number): { freshness: MacroPoint["freshness"]; confidence: Confidence } {
  if (age <= 2) return { freshness: "current", confidence: "high" };
  if (age <= 6) return { freshness: "delayed", confidence: "medium" };
  return { freshness: "stale", confidence: "low" };
}

/** India headline CPI inflation, year-on-year, monthly (IMF CPI database). */
export async function fetchCpiInflation(): Promise<MacroPoint | null> {
  const monthly = await dbnomicsLatest("IMF/CPI/M.IN.PCPI_PC_CP_A_PT").catch(() => null);
  if (monthly) {
    const age = monthsOld(monthly.period);
    const grade = gradeByAge(age);
    return {
      symbol: "IN_CPI_YOY",
      kind: "inflation",
      label: "India CPI inflation (year-on-year)",
      value: Number(monthly.value.toFixed(2)),
      currency: "INR",
      unit: "pct",
      dataDate: `${monthly.period}-01`,
      source: "IMF Consumer Price Index database, via DBnomics",
      sourceUrl: "https://db.nomics.world/IMF/CPI",
      sourceType: "official",
      freshness: grade.freshness,
      confidence: grade.confidence,
      note:
        age <= 2
          ? "Official monthly print, compiled by the IMF from MoSPI releases."
          : `Latest available print is ${age} months old, so treat it as a trend indicator rather than the current rate.`,
    };
  }

  // Fallback: World Bank annual CPI inflation, reliable but a year behind.
  const res = await fetch(
    "https://api.worldbank.org/v2/country/IND/indicator/FP.CPI.TOTL.ZG?format=json&per_page=5&mrnev=1",
    { headers: { accept: "application/json" } },
  );
  if (!res.ok) return null;
  const json = (await res.json()) as unknown;
  const rows = Array.isArray(json) ? ((json[1] ?? []) as { date: string; value: number | null }[]) : [];
  const hit = rows.find((r) => typeof r.value === "number");
  if (!hit || hit.value === null) return null;
  return {
    symbol: "IN_CPI_YOY",
    kind: "inflation",
    label: "India CPI inflation (annual average)",
    value: Number(hit.value.toFixed(2)),
    currency: "INR",
    unit: "pct",
    dataDate: `${hit.date}-12-31`,
    source: "World Bank, Inflation consumer prices (annual %)",
    sourceUrl: "https://data.worldbank.org/indicator/FP.CPI.TOTL.ZG?locations=IN",
    sourceType: "official",
    freshness: "stale",
    confidence: "medium",
    note: `Annual average for ${hit.date}. Used because the monthly series was unavailable.`,
  };
}

/** RBI policy repo rate, end-of-day (BIS central bank policy rates). */
export async function fetchPolicyRate(): Promise<MacroPoint | null> {
  const daily =
    (await dbnomicsLatest("BIS/WS_CBPOL/D.IN").catch(() => null)) ??
    (await dbnomicsLatest("BIS/WS_CBPOL/M.IN").catch(() => null)) ??
    (await dbnomicsLatest("IMF/IFS/M.IN.FPOLM_PA").catch(() => null));
  if (!daily) return null;
  const period = daily.period.length === 7 ? `${daily.period}-01` : daily.period;
  const age = monthsOld(daily.period.slice(0, 7));
  const grade = gradeByAge(age);
  return {
    symbol: "IN_REPO_RATE",
    kind: "policy_rate",
    label: "RBI policy repo rate",
    value: Number(daily.value.toFixed(2)),
    currency: "INR",
    unit: "pct",
    dataDate: period,
    source: "BIS central bank policy rates, via DBnomics",
    sourceUrl: "https://db.nomics.world/BIS/WS_CBPOL",
    sourceType: "official",
    freshness: grade.freshness,
    confidence: grade.confidence,
    note:
      age <= 2
        ? "End-of-period policy rate as published by the BIS from RBI announcements."
        : `Last published observation is ${age} months old; check the RBI monetary policy statement for any change since.`,
  };
}

const YAHOO_CHART = "https://query1.finance.yahoo.com/v8/finance/chart";

export const MACRO_INDICES = [
  { symbol: "^NSEI", label: "NIFTY 50" },
  { symbol: "^NSEBANK", label: "NIFTY Bank" },
  { symbol: "^BSESN", label: "SENSEX" },
  { symbol: "^CNXIT", label: "NIFTY IT" },
] as const;

export type IndexPoint = {
  point: MacroPoint;
  /** Trailing one-year price return, percent, when a year of history exists. */
  oneYearReturnPct: number | null;
  changePct: number | null;
};

/** Index level plus trailing 1-year return, from Yahoo's public chart endpoint. */
export async function fetchIndex(symbol: string, label: string): Promise<IndexPoint | null> {
  const url = `${YAHOO_CHART}/${encodeURIComponent(symbol)}?interval=1mo&range=1y`;
  const res = await fetch(url, {
    headers: { accept: "application/json", "user-agent": "Mozilla/5.0 (compatible; InvestIntel/1.0)" },
  });
  if (!res.ok) return null;
  const json = (await res.json()) as {
    chart?: {
      result?: Array<{
        meta?: Record<string, unknown>;
        indicators?: { quote?: Array<{ close?: (number | null)[] }> };
      }>;
    };
  };
  const result = json.chart?.result?.[0];
  const meta = result?.meta;
  if (!meta) return null;
  const price = Number(meta["regularMarketPrice"]);
  if (!Number.isFinite(price) || price <= 0) return null;
  const closes = (result?.indicators?.quote?.[0]?.close ?? []).filter(
    (c): c is number => typeof c === "number" && Number.isFinite(c),
  );
  const yearAgo = closes[0] ?? null;
  const prev = Number(meta["chartPreviousClose"] ?? meta["previousClose"]);
  const ts = Number(meta["regularMarketTime"]);
  const dataDate = Number.isFinite(ts) ? new Date(ts * 1000).toISOString().slice(0, 10) : null;

  return {
    oneYearReturnPct: yearAgo && yearAgo > 0 ? Number((((price - yearAgo) / yearAgo) * 100).toFixed(2)) : null,
    changePct: Number.isFinite(prev) && prev > 0 ? Number((((price - prev) / prev) * 100).toFixed(2)) : null,
    point: {
      symbol,
      kind: "index",
      label,
      value: Number(price.toFixed(2)),
      currency: String(meta["currency"] ?? "INR"),
      unit: "index",
      dataDate,
      source: "Yahoo Finance chart API (delayed)",
      sourceUrl: `https://finance.yahoo.com/quote/${encodeURIComponent(symbol)}`,
      sourceType: "third_party",
      freshness: "delayed",
      confidence: "medium",
      note: "Delayed by up to 15 minutes and unofficial. Good for context, not for execution decisions.",
    },
  };
}

export async function fetchAllIndices(): Promise<IndexPoint[]> {
  const out: IndexPoint[] = [];
  for (const idx of MACRO_INDICES) {
    try {
      const hit = await fetchIndex(idx.symbol, idx.label);
      if (hit) out.push(hit);
    } catch {
      // A single failing index should not sink the whole refresh.
    }
  }
  return out;
}

/** Fetch everything the macro dashboard shows, tolerating individual failures. */
export async function fetchMacroSet(): Promise<{ points: MacroPoint[]; failures: string[] }> {
  const points: MacroPoint[] = [];
  const failures: string[] = [];

  const cpi = await fetchCpiInflation().catch(() => null);
  if (cpi) points.push(cpi);
  else failures.push("CPI inflation");

  const repo = await fetchPolicyRate().catch(() => null);
  if (repo) points.push(repo);
  else failures.push("RBI policy rate");

  const commodities = await fetchCommoditiesFx().catch(() => []);
  if (commodities.length === 0) failures.push("Gold, silver and USD-INR");
  points.push(...commodities);

  const indices = await fetchAllIndices();
  if (indices.length === 0) failures.push("Equity indices");
  for (const i of indices) {
    points.push(i.point);
    if (i.oneYearReturnPct !== null) {
      points.push({
        ...i.point,
        symbol: `${i.point.symbol}_1Y`,
        kind: "index_return",
        label: `${i.point.label} — trailing 1-year return`,
        value: i.oneYearReturnPct,
        unit: "pct",
        confidence: "medium",
        note: "Price return only, computed from monthly closes. Excludes dividends.",
      });
    }
  }

  return { points, failures };
}

/* ------------------------------------------------------------------ *
 * Commodities and FX: gold, silver, USD-INR
 * ------------------------------------------------------------------ */

const COMMODITY_FX = [
  { symbol: "GC=F", label: "Gold", unitNote: "US dollars per troy ounce" },
  { symbol: "SI=F", label: "Silver", unitNote: "US dollars per troy ounce" },
  { symbol: "USDINR=X", label: "USD / INR", unitNote: "Rupees per US dollar" },
] as const;

/**
 * Spot gold, spot silver and the rupee, from Yahoo's public quote endpoint.
 * Nothing is derived or estimated here: each point is the quoted level with
 * the source, quote currency and timestamp attached. If a feed is down the
 * point is simply absent, and the UI says so rather than inventing a level.
 */
export async function fetchCommoditiesFx(): Promise<MacroPoint[]> {
  const out: MacroPoint[] = [];
  for (const c of COMMODITY_FX) {
    try {
      const url = `${YAHOO_CHART}/${encodeURIComponent(c.symbol)}?interval=1d&range=5d`;
      const res = await fetch(url, {
        headers: { accept: "application/json", "user-agent": "Mozilla/5.0 (compatible; InvestIntel/1.0)" },
      });
      if (!res.ok) continue;
      const json = (await res.json()) as { chart?: { result?: Array<{ meta?: Record<string, unknown> }> } };
      const meta = json.chart?.result?.[0]?.meta;
      if (!meta) continue;
      const price = Number(meta["regularMarketPrice"]);
      if (!Number.isFinite(price) || price <= 0) continue;
      const ts = Number(meta["regularMarketTime"]);
      out.push({
        symbol: c.symbol,
        kind: c.symbol === "USDINR=X" ? "fx" : "commodity",
        label: c.label,
        value: Number(price.toFixed(4)),
        currency: String(meta["currency"] ?? (c.symbol === "USDINR=X" ? "INR" : "USD")),
        unit: "currency",
        dataDate: Number.isFinite(ts) ? new Date(ts * 1000).toISOString().slice(0, 10) : null,
        source: "Yahoo Finance quote API (delayed)",
        sourceUrl: `https://finance.yahoo.com/quote/${encodeURIComponent(c.symbol)}`,
        sourceType: "third_party",
        freshness: "delayed",
        confidence: "medium",
        note: `${c.unitNote}. Delayed and unofficial; Indian physical gold and silver prices also carry import duty, GST and local premiums, which this level excludes.`,
      });
    } catch {
      // One dead feed should not sink the refresh.
    }
  }
  return out;
}
