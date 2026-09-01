export const ASSET_CLASSES = ["equity", "debt", "gold", "cash", "other"] as const;
export type AssetClass = (typeof ASSET_CLASSES)[number];

export const INSTRUMENT_TYPES = [
  "stock",
  "etf",
  "mutual_fund",
  "gold",
  "silver",
  "fd",
  "ppf",
  "epf",
  "nps",
  "cash",
  "bond",
  "other",
] as const;
export type InstrumentType = (typeof INSTRUMENT_TYPES)[number];

/** Which asset class an instrument type defaults to. */
export const DEFAULT_ASSET_CLASS: Record<InstrumentType, AssetClass> = {
  stock: "equity",
  etf: "equity",
  mutual_fund: "equity",
  gold: "gold",
  silver: "gold",
  fd: "debt",
  ppf: "debt",
  epf: "debt",
  nps: "equity",
  cash: "cash",
  bond: "debt",
  other: "other",
};

/** Instruments priced per-unit (quantity x price). Everything else carries a balance. */
export const UNIT_PRICED: InstrumentType[] = ["stock", "etf", "mutual_fund", "gold", "silver"];

export type Freshness = "live" | "delayed" | "eod" | "stale" | "manual";
export type SourceType = "official" | "public" | "third_party" | "manual";

export type MarketDataPoint = {
  symbol: string;
  label?: string;
  value: number;
  currency: string;
  dataDate?: string | null;
  fetchedAt: string;
  source: string;
  sourceUrl?: string | null;
  sourceType: SourceType;
  freshness: Freshness;
};

/** Provenance badge shown next to every number in the UI. */
export type Provenance = "current" | "historical" | "assumption" | "forecast" | "user_input" | "manual" | "stale";

export type Holding = {
  id: string;
  asset_class: AssetClass;
  instrument_type: InstrumentType;
  name: string;
  symbol: string | null;
  isin: string | null;
  category: string | null;
  quantity: number | null;
  avg_price: number | null;
  current_price: number | null;
  current_value: number | null;
  price_source: string;
  price_updated_at: string | null;
  purchase_date: string | null;
  maturity_date: string | null;
  interest_rate: number | null;
  cost_basis: number | null;
  target_allocation_pct: number | null;
  tax_treatment: string | null;
  liquidity: string | null;
  sector: string | null;
  cap_segment: string | null;
  geography: string | null;
  is_demo: boolean;
  notes: string | null;
};

export type PlannedInvestment = {
  id: string;
  name: string;
  asset_class: AssetClass;
  instrument_type: string | null;
  symbol: string | null;
  isin: string | null;
  monthly_amount: number;
  frequency: string;
  start_date: string | null;
  end_date: string | null;
  annual_step_up_pct: number;
  expected_return_pct: number | null;
  objective: string | null;
  risk_level: string | null;
  liquidity: string | null;
  tax_treatment: string | null;
  is_demo: boolean;
  is_paused: boolean;
  notes: string | null;
};

export type Profile = {
  current_age: number | null;
  retirement_age: number | null;
  planning_age: number | null;
  monthly_income: number | null;
  annual_bonus: number | null;
  monthly_expenses: number | null;
  essential_monthly_expenses: number | null;
  existing_cash: number | null;
  existing_debt: number | null;
  dependents: number | null;
  job_stability: string | null;
  expected_salary_growth: number | null;
  risk_tolerance: string | null;
  investment_horizon_years: number | null;
  tax_regime: string | null;
  location: string | null;
  emergency_months_target: number | null;
  notes: string | null;
};

export type ScenarioName = "conservative" | "base" | "optimistic";

export type Assumptions = {
  equity_return: number;
  debt_return: number;
  gold_return: number;
  cash_return: number;
  inflation: number;
  sip_step_up: number;
};
