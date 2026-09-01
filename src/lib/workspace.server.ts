/**
 * Server-only workspace reader. Shared by the data server functions and the
 * AI brief builder so both see identical normalised rows.
 */
import type {
  AssumptionRow,
  Goal,
  MarketRow,
  Workspace,
} from "./data.functions";
import type {
  Assumptions,
  Holding,
  PlannedInvestment,
  Profile,
  ScenarioName,
} from "./finance/types";
import type { Transaction as LedgerTransaction } from "./finance/ledger";

async function db() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

const num = (v: unknown): number | null =>
  v === null || v === undefined || v === "" ? null : Number(v);

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

export async function fetchWorkspace(): Promise<Workspace> {
  const supabase = await db();

  const [profileRes, holdingsRes, transactionsRes, plannedRes, goalsRes, assumptionsRes, marketRes] = await Promise.all([
    supabase.from("profile").select("*").eq("id", "singleton").maybeSingle(),
    supabase.from("holdings").select("*").order("created_at", { ascending: true }),
    supabase.from("transactions").select("*").order("trade_date", { ascending: true }).limit(2000),
    supabase.from("planned_investments").select("*").order("created_at", { ascending: true }),
    supabase.from("goals").select("*").order("target_date", { ascending: true }),
    supabase.from("assumptions").select("*"),
    supabase.from("market_data").select("*").order("symbol", { ascending: true }),
  ]);

  for (const res of [profileRes, holdingsRes, transactionsRes, plannedRes, goalsRes, assumptionsRes, marketRes]) {
    if (res.error) throw new Error(res.error.message);
  }

  const p = (profileRes.data ?? {}) as Record<string, unknown>;
  const profile: Profile = {
    ...EMPTY_PROFILE,
    ...Object.fromEntries(
      Object.keys(EMPTY_PROFILE).map((k) => {
        const v = p[k];
        const numericKeys = new Set([
          "current_age",
          "retirement_age",
          "planning_age",
          "monthly_income",
          "annual_bonus",
          "monthly_expenses",
          "essential_monthly_expenses",
          "existing_cash",
          "existing_debt",
          "dependents",
          "expected_salary_growth",
          "investment_horizon_years",
          "emergency_months_target",
        ]);
        return [k, numericKeys.has(k) ? num(v) : ((v as string | null) ?? null)];
      }),
    ),
  } as Profile;

  const holdings = ((holdingsRes.data ?? []) as Record<string, unknown>[]).map((h) => ({
    ...h,
    quantity: num(h["quantity"]),
    avg_price: num(h["avg_price"]),
    current_price: num(h["current_price"]),
    current_value: num(h["current_value"]),
    interest_rate: num(h["interest_rate"]),
    cost_basis: num(h["cost_basis"]),
    target_allocation_pct: num(h["target_allocation_pct"]),
  })) as unknown as Holding[];

  const planned = ((plannedRes.data ?? []) as Record<string, unknown>[]).map((r) => ({
    ...r,
    monthly_amount: Number(r["monthly_amount"] ?? 0),
    annual_step_up_pct: Number(r["annual_step_up_pct"] ?? 0),
    expected_return_pct: num(r["expected_return_pct"]),
    is_paused: Boolean(r["is_paused"] ?? false),
  })) as unknown as PlannedInvestment[];

  const goals = ((goalsRes.data ?? []) as Record<string, unknown>[]).map((g) => ({
    ...g,
    current_cost: Number(g["current_cost"] ?? 0),
    current_savings: Number(g["current_savings"] ?? 0),
    inflation_pct: num(g["inflation_pct"]),
    expected_return_pct: num(g["expected_return_pct"]),
    equity_allocation_pct: num(g["equity_allocation_pct"]),
  })) as unknown as Goal[];

  const assumptionRows = ((assumptionsRes.data ?? []) as Record<string, unknown>[]).map((a) => ({
    key: String(a["key"]),
    scenario: String(a["scenario"]) as ScenarioName,
    value: Number(a["value"]),
    unit: (a["unit"] as string | null) ?? null,
    rationale: (a["rationale"] as string | null) ?? null,
    source: (a["source"] as string | null) ?? null,
    reviewed_at: (a["reviewed_at"] as string | null) ?? null,
    updated_at: (a["updated_at"] as string | null) ?? null,
  }));


  const market = ((marketRes.data ?? []) as Record<string, unknown>[]).map((m) => ({
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
  }));

  return {
    profile,
    holdings,
    transactions: ((transactionsRes.data ?? []) as Record<string, unknown>[]).map((row) => ({
      id: String(row["id"]),
      holding_id: (row["holding_id"] as string | null) ?? null,
      kind: row["kind"] as LedgerTransaction["kind"],
      trade_date: String(row["trade_date"]),
      settlement_date: (row["settlement_date"] as string | null) ?? null,
      name: String(row["name"] ?? ""),
      symbol: (row["symbol"] as string | null) ?? null,
      isin: (row["isin"] as string | null) ?? null,
      asset_class: row["asset_class"] as LedgerTransaction["asset_class"],
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
    })),
    planned,
    goals,
    assumptions: groupAssumptions(assumptionRows),
    assumptionRows,
    market,
  };
}
