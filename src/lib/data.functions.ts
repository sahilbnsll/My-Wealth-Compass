import { createServerFn } from "@tanstack/react-start";
import { requireUnlocked } from "./gate.server";
import { TRANSACTION_KINDS, type Transaction as LedgerTransaction } from "./finance/ledger";
import type { ParsedTransaction } from "./import/transactions";
import type {
  AssetClass,
  Assumptions,
  Holding,
  PlannedInvestment,
  Profile,
  ScenarioName,
} from "./finance/types";

async function db() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

const num = (v: unknown): number | null =>
  v === null || v === undefined || v === "" ? null : Number(v);

export type Goal = {
  id: string;
  name: string;
  current_cost: number;
  target_date: string | null;
  inflation_pct: number | null;
  current_savings: number;
  expected_return_pct: number | null;
  equity_allocation_pct: number | null;
  priority: string | null;
  notes: string | null;
  is_demo: boolean;
};

export type AssumptionRow = {
  key: string;
  scenario: ScenarioName;
  value: number;
  unit: string | null;
  rationale: string | null;
  source: string | null;
  reviewed_at?: string | null;
  updated_at?: string | null;

};

export type MarketRow = {
  symbol: string;
  kind: string;
  label: string | null;
  value: number;
  currency: string;
  data_date: string | null;
  source: string;
  source_url: string | null;
  source_type: string;
  freshness: string;
  fetched_at: string;
};

export type Workspace = {
  profile: Profile;
  holdings: Holding[];
  transactions: LedgerTransaction[];
  planned: PlannedInvestment[];
  goals: Goal[];
  assumptions: Record<ScenarioName, Assumptions>;
  assumptionRows: AssumptionRow[];
  market: MarketRow[];
};

const EMPTY_PROFILE: Profile = {
  current_age: null,
  retirement_age: null,
  planning_age: null,
  monthly_income: null,
  annual_bonus: null,
  monthly_expenses: null,
  essential_monthly_expenses: null,
  existing_cash: null,
  existing_debt: null,
  dependents: null,
  job_stability: null,
  expected_salary_growth: null,
  risk_tolerance: null,
  investment_horizon_years: null,
  tax_regime: null,
  location: null,
  emergency_months_target: null,
  notes: null,
};

const ASSUMPTION_KEYS = [
  "equity_return",
  "debt_return",
  "gold_return",
  "cash_return",
  "inflation",
  "sip_step_up",
] as const;

function groupAssumptions(rows: AssumptionRow[]): Record<ScenarioName, Assumptions> {
  const base: Assumptions = {
    equity_return: 10.5,
    debt_return: 6.5,
    gold_return: 6.5,
    cash_return: 3.5,
    inflation: 5.5,
    sip_step_up: 10,
  };
  const out = {
    conservative: { ...base },
    base: { ...base },
    optimistic: { ...base },
  } as Record<ScenarioName, Assumptions>;
  for (const r of rows) {
    if (!(r.scenario in out)) continue;
    if (!ASSUMPTION_KEYS.includes(r.key as (typeof ASSUMPTION_KEYS)[number])) continue;
    out[r.scenario][r.key as keyof Assumptions] = Number(r.value);
  }
  return out;
}

export const loadWorkspace = createServerFn({ method: "GET" }).handler(async (): Promise<Workspace> => {
  await requireUnlocked();
  const { fetchWorkspace } = await import("./workspace.server");
  return fetchWorkspace();
});

export const saveProfile = createServerFn({ method: "POST" })
  .inputValidator((data: Partial<Profile>) => data)
  .handler(async ({ data }) => {
    await requireUnlocked();
    const supabase = await db();
    const { error } = await supabase
      .from("profile")
      .update({ ...data })
      .eq("id", "singleton");
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export type HoldingInput = Omit<Holding, "id"> & { id?: string };

export const saveHolding = createServerFn({ method: "POST" })
  .inputValidator((data: HoldingInput) => data)
  .handler(async ({ data }) => {
    await requireUnlocked();
    const supabase = await db();
    const { id, ...rest } = data;
    if (id) {
      const { error } = await supabase.from("holdings").update(rest).eq("id", id);
      if (error) throw new Error(error.message);
      return { ok: true as const, id };
    }
    const { data: inserted, error } = await supabase.from("holdings").insert(rest).select("id").single();
    if (error) throw new Error(error.message);
    return { ok: true as const, id: (inserted as { id: string }).id };
  });

export const deleteHolding = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string }) => data)
  .handler(async ({ data }) => {
    await requireUnlocked();
    const supabase = await db();
    const { error } = await supabase.from("holdings").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export type PlannedInput = Omit<PlannedInvestment, "id"> & { id?: string };

function validatePlannedInput(data: PlannedInput) {
  const name = data.name.trim();
  if (!name || name.length > 160) throw new Error("Enter a SIP or fund name under 160 characters.");
  if (!Number.isFinite(data.monthly_amount) || data.monthly_amount < 0 || data.monthly_amount > 1_000_000_000) {
    throw new Error("Amount must be a valid number between ₹0 and ₹100 crore.");
  }
  if (!["monthly", "quarterly", "annual", "one_time"].includes(data.frequency)) {
    throw new Error("Choose a valid contribution frequency.");
  }
  if (!Number.isFinite(data.annual_step_up_pct) || data.annual_step_up_pct < 0 || data.annual_step_up_pct > 100) {
    throw new Error("Annual step-up must be between 0% and 100%.");
  }
  for (const date of [data.start_date, data.end_date]) {
    if (date !== null && !/^\\d{4}-\\d{2}-\\d{2}$/.test(date)) throw new Error("Use a valid date.");
  }
  if (data.start_date && data.end_date && data.end_date < data.start_date) {
    throw new Error("End date cannot be before start date.");
  }
}

export const savePlanned = createServerFn({ method: "POST" })
  .inputValidator((data: PlannedInput) => data)
  .handler(async ({ data }) => {
    await requireUnlocked();
    validatePlannedInput(data);
    const supabase = await db();
    const { id, ...rest } = data;
    const clean = { ...rest, name: data.name.trim() };
    if (id) {
      const { error } = await supabase.from("planned_investments").update(clean).eq("id", id);
      if (error) throw new Error(error.message);
      return { ok: true as const, id };
    }
    const { data: inserted, error } = await supabase
      .from("planned_investments")
      .insert(clean)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { ok: true as const, id: (inserted as { id: string }).id };
  });

export const deletePlanned = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string }) => data)
  .handler(async ({ data }) => {
    await requireUnlocked();
    const supabase = await db();
    const { error } = await supabase.from("planned_investments").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const saveAssumption = createServerFn({ method: "POST" })
  .inputValidator((data: { key: string; scenario: ScenarioName; value: number; rationale?: string }) => data)
  .handler(async ({ data }) => {
    await requireUnlocked();
    const supabase = await db();
    const { error } = await supabase.from("assumptions").upsert(
      {
        key: data.key,
        scenario: data.scenario,
        value: data.value,
        unit: "pct",
        ...(data.rationale ? { rationale: data.rationale } : {}),
        source: "User-configurable planning assumption",
      },
      { onConflict: "key,scenario" },
    );
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

/** Manual price update for one holding, recorded with its provenance. */
export const setHoldingPrice = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string; price?: number | null; value?: number | null; source?: string }) => data)
  .handler(async ({ data }) => {
    await requireUnlocked();
    const supabase = await db();
    const { error } = await supabase
      .from("holdings")
      .update({
        ...(data.price !== undefined ? { current_price: data.price } : {}),
        ...(data.value !== undefined ? { current_value: data.value } : {}),
        price_source: data.source ?? "manual",
        price_updated_at: new Date().toISOString(),
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export type AllocationTotals = Record<AssetClass, number>;

/** Refresh mutual-fund NAVs from the official AMFI daily feed (matched by ISIN or scheme code). */
export const refreshNavPrices = createServerFn({ method: "POST" }).handler(async () => {
  await requireUnlocked();
  const supabase = await db();
  const { fetchAmfiNav } = await import("./amfi.server");

  const { data: rows, error } = await supabase
    .from("holdings")
    .select("id,isin,symbol,quantity,instrument_type");
  if (error) throw new Error(error.message);

  const funds = ((rows ?? []) as Record<string, unknown>[]).filter((r) => r["instrument_type"] === "mutual_fund");
  if (funds.length === 0) return { ok: true as const, updated: 0, unmatched: [] as string[], asOf: null as string | null };

  const navs = await fetchAmfiNav();
  const byIsin = new Map(navs.filter((n) => n.isin).map((n) => [n.isin as string, n]));
  const byCode = new Map(navs.map((n) => [n.schemeCode, n]));

  const now = new Date().toISOString();
  let updated = 0;
  const unmatched: string[] = [];
  let asOf: string | null = navs[0]?.date ?? null;

  for (const f of funds) {
    const isin = (f["isin"] as string | null)?.trim().toUpperCase() ?? null;
    const symbol = (f["symbol"] as string | null)?.trim() ?? null;
    const hit = (isin ? byIsin.get(isin) : undefined) ?? (symbol ? byCode.get(symbol) : undefined);
    if (!hit) {
      unmatched.push(String(f["id"]));
      continue;
    }
    const qty = f["quantity"] === null || f["quantity"] === undefined ? null : Number(f["quantity"]);
    const { error: upErr } = await supabase
      .from("holdings")
      .update({
        current_price: hit.nav,
        ...(qty ? { current_value: Number((qty * hit.nav).toFixed(2)) } : {}),
        price_source: "amfi",
        price_updated_at: now,
      })
      .eq("id", String(f["id"]));
    if (upErr) throw new Error(upErr.message);
    asOf = hit.date || asOf;
    updated += 1;
  }

  await supabase.from("market_data").upsert(
    {
      symbol: "AMFI_NAV_FEED",
      kind: "feed",
      label: "AMFI daily NAV feed",
      value: updated,
      fetched_at: now,
      data_date: asOf,
      freshness: "current",
      source_type: "official_feed",
      source: "AMFI daily NAV file",
      source_url: AMFI_SOURCE,
    },
    { onConflict: "symbol" },
  );

  return { ok: true as const, updated, unmatched, asOf };
});

const AMFI_SOURCE = "https://www.amfiindia.com/spages/NAVAll.txt";

export type GoalInput = Omit<Goal, "id"> & { id?: string };

export const saveGoal = createServerFn({ method: "POST" })
  .inputValidator((data: GoalInput) => data)
  .handler(async ({ data }) => {
    await requireUnlocked();
    const supabase = await db();
    const { id, ...rest } = data;
    if (id) {
      const { error } = await supabase.from("goals").update(rest).eq("id", id);
      if (error) throw new Error(error.message);
      return { ok: true as const, id };
    }
    const { data: inserted, error } = await supabase.from("goals").insert(rest).select("id").single();
    if (error) throw new Error(error.message);
    return { ok: true as const, id: (inserted as { id: string }).id };
  });

export const deleteGoal = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string }) => data)
  .handler(async ({ data }) => {
    await requireUnlocked();
    const supabase = await db();
    const { error } = await supabase.from("goals").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export type SnapshotRow = {
  id: string;
  taken_on: string;
  total_value: number;
  invested: number;
  unrealised_gain: number;
  allocation: Record<string, number>;
};

export const loadSnapshots = createServerFn({ method: "GET" }).handler(async (): Promise<SnapshotRow[]> => {
  await requireUnlocked();
  const supabase = await db();
  const { data, error } = await supabase
    .from("snapshots")
    .select("id,taken_on,total_value,invested,unrealised_gain,allocation")
    .order("taken_on", { ascending: true });
  if (error) throw new Error(error.message);
  return ((data ?? []) as Record<string, unknown>[]).map((s) => ({
    id: String(s["id"]),
    taken_on: String(s["taken_on"]),
    total_value: Number(s["total_value"] ?? 0),
    invested: Number(s["invested"] ?? 0),
    unrealised_gain: Number(s["unrealised_gain"] ?? 0),
    allocation: (s["allocation"] ?? {}) as Record<string, number>,
  }));
});

/** Freeze today's portfolio position so history builds up over time. */
export const captureSnapshot = createServerFn({ method: "POST" }).handler(async () => {
  await requireUnlocked();
  const supabase = await db();
  const { summarisePortfolio } = await import("./finance/portfolio");

  const { data: rows, error } = await supabase.from("holdings").select("*");
  if (error) throw new Error(error.message);
  const summary = summarisePortfolio((rows ?? []) as unknown as Holding[]);
  const takenOn = new Date().toISOString().slice(0, 10);

  const { error: upErr } = await supabase.from("snapshots").upsert(
    {
      taken_on: takenOn,
      total_value: Number(summary.totalValue.toFixed(2)),
      invested: Number(summary.invested.toFixed(2)),
      unrealised_gain: Number(summary.unrealisedGain.toFixed(2)),
      allocation: summary.byAssetClass as unknown as Record<string, number>,
      payload: { holdings: summary.holdings.length },
    },
    { onConflict: "taken_on" },
  );
  if (upErr) throw new Error(upErr.message);
  return { ok: true as const, takenOn, totalValue: summary.totalValue };
});

/* ------------------------------------------------------------------ *
 * Broker statement import
 * ------------------------------------------------------------------ */

export type ImportRow = {
  name: string;
  symbol: string | null;
  isin: string | null;
  instrument_type: string;
  asset_class: string;
  quantity: number | null;
  avg_price: number | null;
  current_price: number | null;
  cost_basis: number | null;
  current_value: number | null;
};

/**
 * Insert or update holdings parsed from a broker statement.
 * Matching is by ISIN first, then symbol, then exact name, so re-importing a
 * fresh statement refreshes existing rows rather than duplicating them.
 */
export const importHoldings = createServerFn({ method: "POST" })
  .inputValidator((data: { rows: ImportRow[]; source?: string }) => data)
  .handler(async ({ data }) => {
    await requireUnlocked();
    const supabase = await db();
    const { data: existingRaw, error } = await supabase.from("holdings").select("id,name,symbol,isin");
    if (error) throw new Error(error.message);
    const existing = (existingRaw ?? []) as { id: string; name: string; symbol: string | null; isin: string | null }[];

    const byIsin = new Map(existing.filter((h) => h.isin).map((h) => [h.isin!.toUpperCase(), h.id]));
    const bySymbol = new Map(existing.filter((h) => h.symbol).map((h) => [h.symbol!.toUpperCase(), h.id]));
    const byName = new Map(existing.map((h) => [h.name.trim().toLowerCase(), h.id]));

    const now = new Date().toISOString();
    const source = data.source ?? "broker_statement";
    let created = 0;
    let updated = 0;

    for (const row of data.rows) {
      const payload = {
        name: row.name,
        symbol: row.symbol,
        isin: row.isin,
        instrument_type: row.instrument_type,
        asset_class: row.asset_class,
        quantity: row.quantity,
        avg_price: row.avg_price,
        current_price: row.current_price,
        cost_basis: row.cost_basis,
        current_value: row.current_value,
        price_source: source,
        price_updated_at: now,
      };
      const match =
        (row.isin ? byIsin.get(row.isin.toUpperCase()) : undefined) ??
        (row.symbol ? bySymbol.get(row.symbol.toUpperCase()) : undefined) ??
        byName.get(row.name.trim().toLowerCase());

      if (match) {
        const { error: upErr } = await supabase.from("holdings").update(payload).eq("id", match);
        if (upErr) throw new Error(upErr.message);
        updated++;
      } else {
        const { data: ins, error: insErr } = await supabase.from("holdings").insert(payload).select("id").single();
        if (insErr) throw new Error(insErr.message);
        const id = (ins as { id: string }).id;
        if (row.isin) byIsin.set(row.isin.toUpperCase(), id);
        if (row.symbol) bySymbol.set(row.symbol.toUpperCase(), id);
        byName.set(row.name.trim().toLowerCase(), id);
        created++;
      }
    }

    return { ok: true as const, created, updated };
  });


/**
 * Commit only reconciled, new transaction rows from a broker statement.
 * Existing rows are checked again server-side so the import remains safe if
 * another tab changed the ledger after the preview was rendered.
 */
export const importTransactions = createServerFn({ method: "POST" })
  .inputValidator((data: { rows: ParsedTransaction[]; source?: string }) => data)
  .handler(async ({ data }) => {
    await requireUnlocked();
    const supabase = await db();
    const { data: existingRaw, error } = await supabase
      .from("transactions")
      .select("id,external_id,name,kind,trade_date,amount,holding_id,isin,symbol");
    if (error) throw new Error(error.message);

    const existing = (existingRaw ?? []) as {
      id: string; external_id: string | null; name: string; kind: string; trade_date: string;
      amount: number; holding_id: string | null; isin: string | null; symbol: string | null;
    }[];
    const externalIds = new Set(existing.flatMap((t) => (t.external_id ? [t.external_id] : [])));
    const signatures = new Set(existing.map((t) => [t.name.trim().toLowerCase(), t.kind, t.trade_date, Math.round(Math.abs(Number(t.amount)) * 100)].join("|")));
    const { data: holdingRows } = await supabase.from("holdings").select("id,name,isin,symbol");
    const holdings = (holdingRows ?? []) as { id: string; name: string; isin: string | null; symbol: string | null }[];
    const normalise = (value: string) => value.toLowerCase().replace(/\b(direct|regular|plan|growth|option|scheme|fund)\b/g, " ").replace(/[^a-z0-9]+/g, " ").trim();
    const source = data.source ?? "broker_statement";
    let created = 0;
    let skipped = 0;

    for (const row of data.rows) {
      const signature = [row.name.trim().toLowerCase(), row.kind, row.trade_date, Math.round(Math.abs(row.amount) * 100)].join("|");
      if ((row.external_id && externalIds.has(row.external_id)) || signatures.has(signature)) {
        skipped++;
        continue;
      }
      const holding = holdings.find((h) =>
        (row.isin && h.isin?.toUpperCase() === row.isin.toUpperCase()) ||
        (row.symbol && h.symbol?.toUpperCase() === row.symbol.toUpperCase()) ||
        normalise(h.name) === normalise(row.name),
      );
      const { confidence: _confidence, reason: _reason, ...transaction } = row;
      const { error: insertError } = await supabase.from("transactions").insert({
        ...transaction,
        holding_id: holding?.id ?? null,
        source,
      });
      if (insertError) throw new Error(insertError.message);
      created++;
      if (row.external_id) externalIds.add(row.external_id);
      signatures.add(signature);
    }
    return { ok: true as const, created, skipped };
  });

/* ------------------------------------------------------------------ *
 * Live stock quotes
 * ------------------------------------------------------------------ */

/** Look up one symbol without saving it — used by the holding form. */
export const lookupQuote = createServerFn({ method: "POST" })
  .inputValidator((data: { symbol: string }) => data)
  .handler(async ({ data }) => {
    await requireUnlocked();
    const { fetchQuote } = await import("./quotes.server");
    const quote = await fetchQuote(data.symbol);
    if (!quote) return { ok: false as const, reason: `No quote found for "${data.symbol}" on NSE or BSE.` };
    return { ok: true as const, quote };
  });

/** Search the AMFI feed by fund name — powers the fund picker on the holding form. */
export const searchFunds = createServerFn({ method: "POST" })
  .inputValidator((data: { query: string }) => data)
  .handler(async ({ data }) => {
    await requireUnlocked();
    const { searchAmfiFunds } = await import("./amfi.server");
    const hits = await searchAmfiFunds(data.query, 8);
    return hits.map((h) => ({
      schemeCode: h.schemeCode,
      isin: h.isin,
      name: h.name,
      nav: h.nav,
      date: h.date,
    }));
  });

/**
 * Universal instrument lookup — one search box and one resolver across mutual
 * funds (AMFI) and listed stocks/ETFs (Yahoo). All lookup logic lives in
 * instruments.server.ts so no page duplicates it.
 */
export type { InstrumentHit, ResolvedInstrument, InstrumentKind } from "./instruments";

export const searchInstruments = createServerFn({ method: "POST" })
  .inputValidator((data: { query: string; kinds?: Array<"mutual_fund" | "stock" | "etf"> }) => data)
  .handler(async ({ data }): Promise<import("./instruments").InstrumentHit[]> => {
    await requireUnlocked();
    const kinds = data.kinds ?? ["mutual_fund", "stock", "etf"];
    const { searchInstrumentsAcrossFeeds } = await import("./instruments.server");
    return searchInstrumentsAcrossFeeds(data.query, kinds);
  });

/**
 * Resolve any identifier — NSE/BSE symbol, ISIN, AMFI scheme code or a name —
 * into one normalised instrument with its live NAV/price and provenance.
 */
export const resolveInstrument = createServerFn({ method: "POST" })
  .inputValidator((data: { query: string }) => data)
  .handler(async ({ data }): Promise<import("./instruments").ResolvedInstrument | null> => {
    await requireUnlocked();
    const { resolveInstrumentQuery } = await import("./instruments.server");
    return resolveInstrumentQuery(data.query);
  });



/** Refresh every stock/ETF holding that carries a symbol. */
export const refreshStockQuotes = createServerFn({ method: "POST" }).handler(async () => {
  await requireUnlocked();
  const supabase = await db();
  const { fetchQuotes, QUOTE_SOURCE, QUOTE_SOURCE_URL, INDEX_SYMBOLS, fetchQuote } = await import("./quotes.server");

  const { data: rows, error } = await supabase
    .from("holdings")
    .select("id,symbol,quantity,instrument_type")
    .in("instrument_type", ["stock", "etf"]);
  if (error) throw new Error(error.message);

  const targets = ((rows ?? []) as { id: string; symbol: string | null; quantity: number | null }[]).filter(
    (h) => h.symbol && h.symbol.trim() !== "",
  );
  const quotes = await fetchQuotes(targets.map((t) => t.symbol!));
  const now = new Date().toISOString();

  let updated = 0;
  const unmatched: string[] = [];
  for (const h of targets) {
    const q = quotes.get(h.symbol!.trim().toUpperCase());
    if (!q) {
      unmatched.push(h.symbol!);
      continue;
    }
    const { error: upErr } = await supabase
      .from("holdings")
      .update({
        current_price: q.price,
        ...(h.quantity ? { current_value: Number((h.quantity * q.price).toFixed(2)) } : {}),
        price_source: "yahoo_quote",
        price_updated_at: now,
      })
      .eq("id", h.id);
    if (upErr) throw new Error(upErr.message);
    updated++;

    await supabase.from("market_data").upsert(
      {
        symbol: q.resolvedSymbol,
        kind: "equity_quote",
        label: h.symbol,
        value: q.price,
        currency: q.currency,
        data_date: (q.marketTime ?? now).slice(0, 10),
        fetched_at: now,
        freshness: "delayed",
        source_type: "public",
        source: QUOTE_SOURCE,
        source_url: QUOTE_SOURCE_URL,
      },
      { onConflict: "symbol" },
    );
  }

  // Index levels give market context alongside the holdings refresh.
  for (const idx of INDEX_SYMBOLS) {
    const q = await fetchQuote(idx.symbol);
    if (!q) continue;
    await supabase.from("market_data").upsert(
      {
        symbol: idx.symbol,
        kind: "index",
        label: idx.label,
        value: q.price,
        currency: q.currency,
        data_date: (q.marketTime ?? now).slice(0, 10),
        fetched_at: now,
        freshness: "delayed",
        source_type: "public",
        source: QUOTE_SOURCE,
        source_url: QUOTE_SOURCE_URL,
      },
      { onConflict: "symbol" },
    );
  }

  return { ok: true as const, updated, unmatched, skipped: targets.length === 0 };
});

/* ------------------------------------------------------------------ *
 * Macro data: CPI inflation, RBI policy rate, equity indices
 * ------------------------------------------------------------------ */

export type MacroPointRow = MarketRow & { confidence: string; note: string | null; unit?: string };

export const loadMacro = createServerFn({ method: "GET" }).handler(async (): Promise<MacroPointRow[]> => {
  await requireUnlocked();
  const supabase = await db();
  const { data, error } = await supabase
    .from("market_data")
    .select("*")
    .in("kind", ["inflation", "policy_rate", "index", "index_return", "commodity", "fx"])
    .order("kind", { ascending: true });
  if (error) throw new Error(error.message);
  return ((data ?? []) as Record<string, unknown>[]).map((m) => ({
    symbol: String(m["symbol"]),
    kind: String(m["kind"]),
    label: (m["label"] as string | null) ?? null,
    value: Number(m["value"]),
    currency: String(m["currency"] ?? "INR"),
    data_date: (m["data_date"] as string | null) ?? null,
    source: String(m["source"]),
    source_url: (m["source_url"] as string | null) ?? null,
    source_type: String(m["source_type"]),
    freshness: String(m["freshness"]),
    fetched_at: String(m["fetched_at"]),
    confidence: String(m["confidence"] ?? "medium"),
    note: (m["note"] as string | null) ?? null,
  }));
});

/** Pull fresh CPI, policy-rate and index data and store it with provenance. */
export async function runMacroRefresh() {
  const supabase = await db();
  const { fetchMacroSet } = await import("./macro.server");
  const { points, failures } = await fetchMacroSet();
  const now = new Date().toISOString();

  for (const p of points) {
    const { error } = await supabase.from("market_data").upsert(
      {
        symbol: p.symbol,
        kind: p.kind,
        label: p.label,
        value: p.value,
        currency: p.currency,
        data_date: p.dataDate,
        fetched_at: now,
        freshness: p.freshness,
        source_type: p.sourceType,
        source: p.source,
        source_url: p.sourceUrl,
        confidence: p.confidence,
        note: p.note,
      },
      { onConflict: "symbol" },
    );
    if (error) throw new Error(error.message);
  }
  return { updated: points.length, failures };
}

export const refreshMacro = createServerFn({ method: "POST" }).handler(async () => {
  await requireUnlocked();
  const res = await runMacroRefresh();
  return { ok: true as const, ...res };
});

/* ------------------------------------------------------------------ *
 * Scheduled snapshots
 * ------------------------------------------------------------------ */

export type SnapshotSchedule = {
  jobName: string;
  schedule: string | null;
  active: boolean;
  lastRunAt: string | null;
  lastStatus: string | null;
  latestSnapshot: string | null;
  totalSnapshots: number;
};

/** Status of the daily snapshot job that runs inside the database. */
export const snapshotSchedule = createServerFn({ method: "GET" }).handler(
  async (): Promise<SnapshotSchedule> => {
    await requireUnlocked();
    const supabase = await db();
    const { data: rows, error } = await supabase
      .from("snapshots")
      .select("taken_on")
      .order("taken_on", { ascending: false })
      .limit(1);
    if (error) throw new Error(error.message);
    const { count } = await supabase.from("snapshots").select("id", { count: "exact", head: true });

    let lastRunAt: string | null = null;
    let lastStatus: string | null = null;
    let schedule: string | null = "30 18 * * *";
    let active = true;
    try {
      const settings = await supabase
        .from("app_settings")
        .select("value")
        .eq("key", "snapshot_schedule")
        .maybeSingle();
      const v = (settings.data as { value?: Record<string, unknown> } | null)?.value ?? {};
      lastRunAt = (v["lastRunAt"] as string | null) ?? null;
      lastStatus = (v["lastStatus"] as string | null) ?? null;
      if (typeof v["schedule"] === "string") schedule = v["schedule"] as string;
      if (typeof v["active"] === "boolean") active = v["active"] as boolean;
    } catch {
      // Settings are optional metadata; the cron job runs regardless.
    }

    return {
      jobName: "daily-portfolio-snapshot",
      schedule,
      active,
      lastRunAt,
      lastStatus,
      latestSnapshot: ((rows ?? [])[0] as { taken_on?: string } | undefined)?.taken_on ?? null,
      totalSnapshots: count ?? 0,
    };
  },
);

/* ------------------------------------------------------------------ *
 * Tax settings
 * ------------------------------------------------------------------ */

const TAX_SETTINGS_KEY = "tax_settings";

export const loadTaxSettings = createServerFn({ method: "GET" }).handler(async () => {
  await requireUnlocked();
  const supabase = await db();
  const { DEFAULT_TAX_SETTINGS } = await import("./finance/tax");
  const { data, error } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", TAX_SETTINGS_KEY)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const v = ((data as { value?: Record<string, unknown> } | null)?.value ?? {}) as Record<string, unknown>;
  return {
    marginalRatePct: Number(v["marginalRatePct"] ?? DEFAULT_TAX_SETTINGS.marginalRatePct),
    dividendYieldPct: Number(v["dividendYieldPct"] ?? DEFAULT_TAX_SETTINGS.dividendYieldPct),
  };
});

export const saveTaxSettings = createServerFn({ method: "POST" })
  .inputValidator((data: { marginalRatePct: number; dividendYieldPct: number }) => data)
  .handler(async ({ data }) => {
    await requireUnlocked();
    const supabase = await db();
    const { error } = await supabase
      .from("app_settings")
      .upsert({ key: TAX_SETTINGS_KEY, value: data }, { onConflict: "key" });
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

/* ── Transaction ledger ─────────────────────────────────────────────────── */

export const loadTransactions = createServerFn({ method: "GET" }).handler(
  async (): Promise<LedgerTransaction[]> => {
    await requireUnlocked();
    const supabase = await db();
    const { data, error } = await supabase
      .from("transactions")
      .select("*")
      .order("trade_date", { ascending: false })
      .limit(2000);
    if (error) throw new Error(error.message);
    return ((data ?? []) as Record<string, unknown>[]).map(toLedgerTransaction);
  },
);

function toLedgerTransaction(row: Record<string, unknown>): LedgerTransaction {
  return {
    id: String(row["id"]),
    holding_id: (row["holding_id"] as string | null) ?? null,
    kind: row["kind"] as LedgerTransaction["kind"],
    trade_date: String(row["trade_date"]),
    settlement_date: (row["settlement_date"] as string | null) ?? null,
    name: String(row["name"]),
    symbol: (row["symbol"] as string | null) ?? null,
    isin: (row["isin"] as string | null) ?? null,
    asset_class: row["asset_class"] as AssetClass,
    instrument_type: row["instrument_type"] as LedgerTransaction["instrument_type"],
    quantity: num(row["quantity"]),
    price: num(row["price"]),
    amount: Number(row["amount"] ?? 0),
    fees: Number(row["fees"] ?? 0),
    taxes: Number(row["taxes"] ?? 0),
    currency: String(row["currency"] ?? "INR"),
    source: String(row["source"] ?? "manual"),
    external_id: (row["external_id"] as string | null) ?? null,
    notes: (row["notes"] as string | null) ?? null,
  };
}

export type TransactionInput = Omit<LedgerTransaction, "id"> & { id?: string };

function validateTransaction(data: TransactionInput) {
  if (!TRANSACTION_KINDS.includes(data.kind)) throw new Error("Choose a valid transaction type.");
  const name = data.name.trim();
  if (!name || name.length > 160) throw new Error("Enter an instrument name under 160 characters.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data.trade_date)) throw new Error("Use a valid trade date.");
  if (data.settlement_date && !/^\d{4}-\d{2}-\d{2}$/.test(data.settlement_date)) {
    throw new Error("Use a valid settlement date.");
  }
  for (const [label, value] of [
    ["Amount", data.amount],
    ["Fees", data.fees],
    ["Taxes", data.taxes],
  ] as const) {
    if (!Number.isFinite(value) || value < 0 || value > 1_000_000_000) {
      throw new Error(`${label} must be between ₹0 and ₹100 crore.`);
    }
  }
  if (data.quantity !== null && (!Number.isFinite(data.quantity) || data.quantity < 0)) {
    throw new Error("Quantity cannot be negative.");
  }
  if (data.price !== null && (!Number.isFinite(data.price) || data.price < 0)) {
    throw new Error("Price cannot be negative.");
  }
  const needsUnits = data.kind === "bonus";
  if (needsUnits && !data.quantity) throw new Error("Bonus units need a quantity.");
}

export const saveTransaction = createServerFn({ method: "POST" })
  .inputValidator((data: TransactionInput) => data)
  .handler(async ({ data }) => {
    await requireUnlocked();
    validateTransaction(data);
    const supabase = await db();
    const { id, ...rest } = data;
    const clean = { ...rest, name: data.name.trim() };
    if (id) {
      const { error } = await supabase.from("transactions").update(clean).eq("id", id);
      if (error) throw new Error(error.message);
      return { ok: true as const, id };
    }
    const { data: inserted, error } = await supabase
      .from("transactions")
      .insert(clean)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { ok: true as const, id: (inserted as { id: string }).id };
  });

export const deleteTransaction = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string }) => data)
  .handler(async ({ data }) => {
    await requireUnlocked();
    const supabase = await db();
    const { error } = await supabase.from("transactions").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

/** Full workspace export — every row this app stores, as plain JSON. */
export const exportWorkspace = createServerFn({ method: "GET" }).handler(async () => {
  await requireUnlocked();
  const supabase = await db();
  const tables = [
    "profile",
    "holdings",
    "planned_investments",
    "goals",
    "assumptions",
    "market_data",
    "snapshots",
    "transactions",
  ] as const;
  const out: Record<string, Record<string, unknown>[]> = {};
  for (const table of tables) {
    const { data, error } = await supabase.from(table).select("*");
    if (error) throw new Error(error.message);
    out[table] = (data ?? []) as Record<string, unknown>[];
  }
  return { exported_at: new Date().toISOString(), tables: JSON.parse(JSON.stringify(out)) as Record<string, Record<string, string | number | boolean | null>[]> };
});

/* ------------------------------------------------------------------ *
 * Data health: what each external source is for, and how fresh it is
 * ------------------------------------------------------------------ */

export type SourceHealth = {
  id: string;
  name: string;
  purpose: string;
  status: "ok" | "stale" | "unconfigured" | "unavailable";
  detail: string;
  lastRefresh: string | null;
  records: number;
  url: string | null;
};

const STALE_AFTER_HOURS = 30;

function ageHours(iso: string | null): number | null {
  if (!iso) return null;
  return (Date.now() - new Date(iso).getTime()) / 3_600_000;
}

/** Freshness and purpose of every external feed the app depends on. */
export const dataHealth = createServerFn({ method: "GET" }).handler(async (): Promise<SourceHealth[]> => {
  await requireUnlocked();
  const supabase = await db();

  const [{ data: market }, { data: holdings }] = await Promise.all([
    supabase.from("market_data").select("symbol,kind,source,fetched_at,freshness"),
    supabase.from("holdings").select("id,instrument_type,price_source,price_updated_at"),
  ]);

  const rows = (market ?? []) as Record<string, unknown>[];
  const hold = (holdings ?? []) as Record<string, unknown>[];
  const latest = (pred: (r: Record<string, unknown>) => boolean) =>
    rows.filter(pred).reduce<string | null>((acc, r) => {
      const f = r["fetched_at"] as string | null;
      return !acc || (f && f > acc) ? (f ?? acc) : acc;
    }, null);

  const grade = (last: string | null, records: number, ok: string, empty: string): Pick<SourceHealth, "status" | "detail"> => {
    if (!last || records === 0) return { status: "unavailable", detail: empty };
    const age = ageHours(last) ?? 0;
    return age > STALE_AFTER_HOURS
      ? { status: "stale", detail: `Last refreshed ${Math.round(age / 24)} day(s) ago. Refresh before relying on it.` }
      : { status: "ok", detail: ok };
  };

  const navHoldings = hold.filter((h) => String(h["price_source"] ?? "").toLowerCase().includes("amfi"));
  const navLast = navHoldings.reduce<string | null>((acc, h) => {
    const t = h["price_updated_at"] as string | null;
    return !acc || (t && t > acc) ? (t ?? acc) : acc;
  }, null);

  const quoteHoldings = hold.filter((h) => String(h["price_source"] ?? "").toLowerCase().includes("yahoo"));
  const quoteLast = quoteHoldings.reduce<string | null>((acc, h) => {
    const t = h["price_updated_at"] as string | null;
    return !acc || (t && t > acc) ? (t ?? acc) : acc;
  }, null);

  const macroRows = rows.filter((r) => ["inflation", "policy_rate"].includes(String(r["kind"])));
  const marketRows = rows.filter((r) => ["index", "index_return", "commodity", "fx"].includes(String(r["kind"])));

  return [
    {
      id: "supabase",
      name: "Supabase Postgres",
      purpose: "Authoritative database for your profile, holdings, transactions, and snapshots.",
      records: hold.length,
      lastRefresh: new Date().toISOString(),
      url: "https://supabase.com/",
      status: "ok",
      detail: "Connected and healthy. Source of truth for your private financial records.",
    },
    {
      id: "amfi",
      name: "AMFI",
      purpose: "Official end-of-day NAVs for your mutual fund holdings.",
      records: navHoldings.length,
      lastRefresh: navLast,
      url: "https://www.amfiindia.com/spages/NAVAll.txt",
      ...grade(navLast, navHoldings.length, "NAVs are current to the last published AMFI file.", "No fund holding is priced from AMFI yet. Refresh NAVs on the Holdings page."),
    },
    {
      id: "yahoo",
      name: "Yahoo Finance",
      purpose: "Delayed stock, ETF, index, commodity and currency quotes.",
      records: quoteHoldings.length + marketRows.length,
      lastRefresh: quoteLast && (!latest(() => true) || quoteLast > (latest(() => true) ?? "")) ? quoteLast : latest((r) => ["index", "index_return", "commodity", "fx"].includes(String(r["kind"]))),
      url: "https://finance.yahoo.com/",
      ...grade(
        quoteLast ?? latest((r) => ["index", "commodity", "fx"].includes(String(r["kind"]))),
        quoteHoldings.length + marketRows.length,
        "Quotes are delayed by up to 15 minutes — context, not execution prices.",
        "No quote has been fetched yet. Refresh prices or market data.",
      ),
    },
    {
      id: "dbnomics",
      name: "DBnomics",
      purpose: "India CPI inflation and the RBI policy repo rate, from official series.",
      records: macroRows.length,
      lastRefresh: latest((r) => ["inflation", "policy_rate"].includes(String(r["kind"]))),
      url: "https://db.nomics.world/",
      ...grade(
        latest((r) => ["inflation", "policy_rate"].includes(String(r["kind"]))),
        macroRows.length,
        "Official macro series stored with their own publication dates.",
        "Macro series have never been fetched. Refresh from Market & tax.",
      ),
    },
  ];
});

/* ------------------------------------------------------------------ *
 * Exports
 * ------------------------------------------------------------------ */

export const EXPORT_DATASETS = [
  "holdings",
  "transactions",
  "goals",
  "planned_investments",
  "snapshots",
  "assumptions",
  "market_data",
] as const;
export type ExportDataset = (typeof EXPORT_DATASETS)[number];

function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";
  const cols = Array.from(new Set(rows.flatMap((r) => Object.keys(r))));
  const cell = (v: unknown) => {
    if (v === null || v === undefined) return "";
    const s = typeof v === "object" ? JSON.stringify(v) : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const body = rows.map((r) => cols.map((c) => cell(r[c])).join(","));
  return [cols.join(","), ...body].join("\n");
}

/** One dataset as CSV. No secrets are ever included — these are plain tables. */
export const exportDataset = createServerFn({ method: "POST" })
  .inputValidator((d: { dataset: ExportDataset }) => {
    if (!EXPORT_DATASETS.includes(d.dataset)) throw new Error("Unknown dataset");
    return d;
  })
  .handler(async ({ data }) => {
    await requireUnlocked();
    const supabase = await db();
    const { data: rows, error } = await supabase.from(data.dataset).select("*");
    if (error) throw new Error(error.message);
    const clean = ((rows ?? []) as Record<string, unknown>[]).map((r) => r);
    return { dataset: data.dataset, rows: clean.length, csv: toCsv(clean) };
  });

/* ------------------------------------------------------------------------- *
 * Phase H — watchlist, calendar, monthly review, assumptions centre
 * ------------------------------------------------------------------------- */

export type WatchlistRow = {
  id: string;
  name: string;
  symbol: string | null;
  isin: string | null;
  scheme_code: string | null;
  asset_class: AssetClass;
  instrument_type: string | null;
  quote_source: string | null;
  last_price: number | null;
  price_updated_at: string | null;
  reference_price: number | null;
  reference_set_on: string | null;
  target_buy_price: number | null;
  thesis: string | null;
  notes: string | null;
};

export const loadWatchlist = createServerFn({ method: "GET" }).handler(async (): Promise<WatchlistRow[]> => {
  await requireUnlocked();
  const supabase = await db();
  const { data, error } = await supabase.from("watchlist").select("*").order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: String(r["id"]),
    name: String(r["name"]),
    symbol: (r["symbol"] as string) ?? null,
    isin: (r["isin"] as string) ?? null,
    scheme_code: (r["scheme_code"] as string) ?? null,
    asset_class: ((r["asset_class"] as AssetClass) ?? "equity") as AssetClass,
    instrument_type: (r["instrument_type"] as string) ?? null,
    quote_source: (r["quote_source"] as string) ?? null,
    last_price: num(r["last_price"]),
    price_updated_at: (r["price_updated_at"] as string) ?? null,
    reference_price: num(r["reference_price"]),
    reference_set_on: (r["reference_set_on"] as string) ?? null,
    target_buy_price: num(r["target_buy_price"]),
    thesis: (r["thesis"] as string) ?? null,
    notes: (r["notes"] as string) ?? null,
  }));
});

export const saveWatchItem = createServerFn({ method: "POST" })
  .inputValidator((d: Partial<WatchlistRow> & { name: string }) => d)
  .handler(async ({ data }) => {
    await requireUnlocked();
    const supabase = await db();
    const row = {
      name: data.name,
      symbol: data.symbol ?? null,
      isin: data.isin ?? null,
      scheme_code: data.scheme_code ?? null,
      asset_class: data.asset_class ?? "equity",
      instrument_type: data.instrument_type ?? null,
      quote_source: data.quote_source ?? null,
      last_price: data.last_price ?? null,
      price_updated_at: data.last_price != null ? new Date().toISOString() : null,
      reference_price: data.reference_price ?? data.last_price ?? null,
      reference_set_on: data.reference_price ?? data.last_price ? new Date().toISOString().slice(0, 10) : null,
      target_buy_price: data.target_buy_price ?? null,
      thesis: data.thesis ?? null,
      notes: data.notes ?? null,
    };
    if (data.id) {
      const { error } = await supabase.from("watchlist").update(row).eq("id", data.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabase.from("watchlist").insert(row);
      if (error) throw new Error(error.message);
    }
    return { ok: true as const };
  });

export const deleteWatchItem = createServerFn({ method: "POST" })
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data }) => {
    await requireUnlocked();
    const supabase = await db();
    const { error } = await supabase.from("watchlist").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

/** Re-price the watchlist from the same feeds the portfolio uses. */
export const refreshWatchlist = createServerFn({ method: "POST" }).handler(async () => {
  await requireUnlocked();
  const supabase = await db();
  const { data: rows, error } = await supabase.from("watchlist").select("id,symbol,isin,scheme_code");
  if (error) throw new Error(error.message);
  const items = (rows ?? []) as { id: string; symbol: string | null; isin: string | null; scheme_code: string | null }[];
  if (items.length === 0) return { updated: 0, unmatched: [] as string[], checkedAt: new Date().toISOString() };

  const fundItems = items.filter((i) => i.scheme_code || i.isin);
  const symbolItems = items.filter((i) => !i.scheme_code && !i.isin && i.symbol);

  const [navs, quotes] = await Promise.all([
    fundItems.length
      ? import("./amfi.server")
          .then((m) => m.fetchAmfiNav())
          .catch(() => [])
      : Promise.resolve([]),
    symbolItems.length
      ? import("./quotes.server")
          .then((m) => m.fetchQuotes(symbolItems.map((s) => s.symbol!)))
          .catch(() => new Map())
      : Promise.resolve(new Map()),
  ]);

  const byCode = new Map<string, { nav: number }>();
  const byIsin = new Map<string, { nav: number }>();
  for (const n of navs as { schemeCode: string; isin: string | null; nav: number }[]) {
    byCode.set(n.schemeCode, { nav: n.nav });
    if (n.isin) byIsin.set(n.isin.toUpperCase(), { nav: n.nav });
  }

  const now = new Date().toISOString();
  let updated = 0;
  const unmatched: string[] = [];

  for (const item of items) {
    let price: number | null = null;
    let source: string | null = null;
    if (item.scheme_code && byCode.has(item.scheme_code)) {
      price = byCode.get(item.scheme_code)!.nav;
      source = "amfi_nav";
    } else if (item.isin && byIsin.has(item.isin.toUpperCase())) {
      price = byIsin.get(item.isin.toUpperCase())!.nav;
      source = "amfi_nav";
    } else if (item.symbol) {
      const q = (quotes as Map<string, { price: number }>).get(item.symbol.trim().toUpperCase());
      if (q) {
        price = q.price;
        source = "yahoo_quote";
      }
    }
    if (price === null) {
      unmatched.push(item.symbol ?? item.scheme_code ?? item.id);
      continue;
    }
    const { error: upErr } = await supabase
      .from("watchlist")
      .update({ last_price: price, quote_source: source, price_updated_at: now })
      .eq("id", item.id);
    if (upErr) throw new Error(upErr.message);
    updated += 1;
  }
  return { updated, unmatched, checkedAt: now };
});

export type CalendarEntryRow = {
  id: string;
  title: string;
  kind: string;
  event_date: string;
  amount: number | null;
  recurrence: string;
  notes: string | null;
  completed_on: string | null;
};

export const loadCalendarEntries = createServerFn({ method: "GET" }).handler(
  async (): Promise<CalendarEntryRow[]> => {
    await requireUnlocked();
    const supabase = await db();
    const { data, error } = await supabase.from("calendar_events").select("*").order("event_date");
    if (error) throw new Error(error.message);
    return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
      id: String(r["id"]),
      title: String(r["title"]),
      kind: String(r["kind"] ?? "custom"),
      event_date: String(r["event_date"]),
      amount: num(r["amount"]),
      recurrence: String(r["recurrence"] ?? "none"),
      notes: (r["notes"] as string) ?? null,
      completed_on: (r["completed_on"] as string) ?? null,
    }));
  },
);

export const saveCalendarEntry = createServerFn({ method: "POST" })
  .inputValidator((d: Partial<CalendarEntryRow> & { title: string; event_date: string }) => d)
  .handler(async ({ data }) => {
    await requireUnlocked();
    const supabase = await db();
    const row = {
      title: data.title,
      kind: data.kind ?? "custom",
      event_date: data.event_date,
      amount: data.amount ?? null,
      recurrence: data.recurrence ?? "none",
      notes: data.notes ?? null,
      completed_on: data.completed_on ?? null,
    };
    if (data.id) {
      const { error } = await supabase.from("calendar_events").update(row).eq("id", data.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabase.from("calendar_events").insert(row);
      if (error) throw new Error(error.message);
    }
    return { ok: true as const };
  });

export const deleteCalendarEntry = createServerFn({ method: "POST" })
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data }) => {
    await requireUnlocked();
    const supabase = await db();
    const { error } = await supabase.from("calendar_events").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const toggleCalendarEntry = createServerFn({ method: "POST" })
  .inputValidator((d: { id: string; done: boolean }) => d)
  .handler(async ({ data }) => {
    await requireUnlocked();
    const supabase = await db();
    const { error } = await supabase
      .from("calendar_events")
      .update({ completed_on: data.done ? new Date().toISOString().slice(0, 10) : null })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export type ReviewRow = {
  id: string;
  period: string;
  reviewed_at: string;
  total_value: number | null;
  invested: number | null;
  open_actions: number;
  decisions: { id: string; headline: string; severity: string }[];
  notes: string | null;
};

export const loadReviews = createServerFn({ method: "GET" }).handler(async (): Promise<ReviewRow[]> => {
  await requireUnlocked();
  const supabase = await db();
  const { data, error } = await supabase.from("reviews").select("*").order("period", { ascending: false }).limit(24);
  if (error) throw new Error(error.message);
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: String(r["id"]),
    period: String(r["period"]),
    reviewed_at: String(r["reviewed_at"]),
    total_value: num(r["total_value"]),
    invested: num(r["invested"]),
    open_actions: Number(r["open_actions"] ?? 0),
    decisions: Array.isArray(r["decisions"]) ? (r["decisions"] as ReviewRow["decisions"]) : [],
    notes: (r["notes"] as string) ?? null,
  }));
});

/** Records that a month has been reviewed, with the figures as they stood. */
export const markReviewed = createServerFn({ method: "POST" })
  .inputValidator(
    (d: {
      period: string;
      totalValue: number;
      invested: number;
      openActions: number;
      decisions: { id: string; headline: string; severity: string }[];
      notes?: string;
    }) => d,
  )
  .handler(async ({ data }) => {
    await requireUnlocked();
    const supabase = await db();
    const { error } = await supabase.from("reviews").upsert(
      {
        period: data.period,
        reviewed_at: new Date().toISOString(),
        total_value: data.totalValue,
        invested: data.invested,
        open_actions: data.openActions,
        decisions: data.decisions,
        notes: data.notes ?? null,
      },
      { onConflict: "period" },
    );
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

/** Stamps an assumption as reviewed today without changing its value. */
export const markAssumptionReviewed = createServerFn({ method: "POST" })
  .inputValidator((d: { key: string; scenario: ScenarioName }) => d)
  .handler(async ({ data }) => {
    await requireUnlocked();
    const supabase = await db();
    const { error } = await supabase
      .from("assumptions")
      .update({ reviewed_at: new Date().toISOString() })
      .eq("key", data.key)
      .eq("scenario", data.scenario);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

/* ------------------------------------------------------------------ *
 * Model status — what the numbers on screen are actually based on
 * ------------------------------------------------------------------ */

export type ModelStatus = {
  generatedAt: string;
  /** Most recent price/NAV stamp across holdings. */
  portfolioPricedAt: string | null;
  holdings: number;
  holdingsPriced: number;
  /** Most recent market_data fetch, by kind group. */
  marketRefreshedAt: string | null;
  macroRefreshedAt: string | null;
  /** Latest assumption edit / review stamp — the "version" of the model. */
  assumptionsUpdatedAt: string | null;
  assumptionsReviewedAt: string | null;
  assumptionCount: number;
  taxRulesEffectiveFrom: string;
  lastSnapshotAt: string | null;
  staleSources: string[];
};

export const modelStatus = createServerFn({ method: "GET" }).handler(async (): Promise<ModelStatus> => {
  await requireUnlocked();
  const supabase = await db();

  const [{ data: holdings }, { data: market }, { data: assumptions }, { data: snaps }, health] = await Promise.all([
    supabase.from("holdings").select("id,price_updated_at"),
    supabase.from("market_data").select("kind,fetched_at"),
    supabase.from("assumptions").select("key,updated_at,reviewed_at"),
    supabase.from("snapshots").select("taken_on").order("taken_on", { ascending: false }).limit(1),
    dataHealth(),
  ]);

  const maxOf = <T,>(rows: T[] | null, pick: (r: T) => string | null | undefined) =>
    (rows ?? []).reduce<string | null>((acc, r) => {
      const v = pick(r) ?? null;
      return v && (!acc || v > acc) ? v : acc;
    }, null);

  const hold = (holdings ?? []) as { id: string; price_updated_at: string | null }[];
  const mkt = (market ?? []) as { kind: string; fetched_at: string | null }[];
  const asm = (assumptions ?? []) as { key: string; updated_at: string | null; reviewed_at: string | null }[];

  return {
    generatedAt: new Date().toISOString(),
    portfolioPricedAt: maxOf(hold, (h) => h.price_updated_at),
    holdings: hold.length,
    holdingsPriced: hold.filter((h) => h.price_updated_at).length,
    marketRefreshedAt: maxOf(
      mkt.filter((r) => ["index", "index_return", "commodity", "fx"].includes(r.kind)),
      (r) => r.fetched_at,
    ),
    macroRefreshedAt: maxOf(
      mkt.filter((r) => ["inflation", "policy_rate"].includes(r.kind)),
      (r) => r.fetched_at,
    ),
    assumptionsUpdatedAt: maxOf(asm, (a) => a.updated_at),
    assumptionsReviewedAt: maxOf(asm, (a) => a.reviewed_at),
    assumptionCount: asm.length,
    taxRulesEffectiveFrom: "2024-07-23",
    lastSnapshotAt: ((snaps ?? []) as { taken_on: string }[])[0]?.taken_on ?? null,
    staleSources: health.filter((s) => s.status === "stale" || s.status === "unavailable").map((s) => s.name),
  };
});

/* ------------------------------------------------------------------ *
 * FX: USD → INR, used by money fields that accept dollar amounts
 * ------------------------------------------------------------------ */

export type UsdInrRate = {
  rate: number | null;
  source: string | null;
  asOf: string | null;
};

export const usdInrRate = createServerFn({ method: "GET" }).handler(async (): Promise<UsdInrRate> => {
  await requireUnlocked();
  const supabase = await db();
  const { data } = await supabase
    .from("market_data")
    .select("value,source,fetched_at,data_date")
    .eq("symbol", "USDINR=X")
    .order("fetched_at", { ascending: false })
    .limit(1);
  const row = ((data ?? []) as Record<string, unknown>[])[0];
  if (!row) return { rate: null, source: null, asOf: null };
  const rate = Number(row["value"]);
  if (!Number.isFinite(rate) || rate <= 0) return { rate: null, source: null, asOf: null };
  return {
    rate,
    source: String(row["source"] ?? "market data"),
    asOf: String(row["data_date"] ?? row["fetched_at"] ?? ""),
  };
});
