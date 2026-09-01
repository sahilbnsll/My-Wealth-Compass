import { describe, expect, it } from "vitest";
import { briefForModel, buildPortfolioBrief, type BriefInput } from "../brief";
import type { Assumptions, Holding, Profile } from "../types";

const assumptions: Assumptions = {
  equity_return: 10.5,
  debt_return: 6.5,
  gold_return: 6.5,
  cash_return: 3.5,
  inflation: 5.5,
  sip_step_up: 10,
};

const profile = {
  current_age: 30,
  retirement_age: 55,
  planning_age: 85,
  monthly_income: 200000,
  annual_bonus: null,
  monthly_expenses: 90000,
  essential_monthly_expenses: 60000,
  existing_cash: null,
  existing_debt: null,
  dependents: 1,
  job_stability: "high",
  expected_salary_growth: 8,
  risk_tolerance: "high",
  investment_horizon_years: 25,
  tax_regime: "new",
  location: "Gurugram",
  emergency_months_target: null,
  notes: null,
} as Profile;

function holding(over: Partial<Holding>): Holding {
  return {
    id: crypto.randomUUID(),
    asset_class: "equity",
    instrument_type: "mutual_fund",
    name: "Fund",
    symbol: null,
    isin: null,
    category: null,
    quantity: null,
    avg_price: null,
    current_price: null,
    current_value: 1000000,
    price_source: "manual",
    price_updated_at: null,
    purchase_date: null,
    maturity_date: null,
    interest_rate: null,
    cost_basis: 800000,
    target_allocation_pct: null,
    tax_treatment: null,
    liquidity: null,
    sector: null,
    cap_segment: null,
    geography: "india",
    is_demo: false,
    notes: null,
    ...over,
  } as Holding;
}

const base: BriefInput = {
  profile,
  holdings: [holding({ quantity: 10000, current_price: 100, avg_price: 80 }), holding({ asset_class: "cash", instrument_type: "cash", current_value: 300000, cost_basis: 300000 })],
  planned: [],
  goals: [],
  assumptions,
  now: new Date("2026-01-01T00:00:00Z"),
};

describe("portfolio brief", () => {
  it("is deterministic for the same input", () => {
    expect(buildPortfolioBrief(base)).toEqual(buildPortfolioBrief(base));
  });

  it("exposes core valuation facts that match the engine", () => {
    const brief = buildPortfolioBrief(base);
    const total = brief.facts.find((f) => f.id === "total_value");
    expect(total?.raw).toBe(1300000);
    expect(brief.facts.find((f) => f.id === "invested")?.raw).toBe(1100000);
    expect(brief.facts.find((f) => f.id === "unrealised_gain")?.raw).toBe(200000);
  });

  it("gives every fact a stable id, a formatted value and a basis", () => {
    const brief = buildPortfolioBrief(base);
    const ids = brief.facts.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const f of brief.facts) {
      expect(f.id).toMatch(/^[a-z0-9_]+$/);
      expect(f.value.length).toBeGreaterThan(0);
      expect(f.basis.length).toBeGreaterThan(0);
    }
  });

  it("declares unknowns instead of inventing values", () => {
    const brief = buildPortfolioBrief({
      ...base,
      profile: { ...profile, monthly_expenses: null, essential_monthly_expenses: null } as Profile,
    });
    expect(brief.unknowns.some((u) => u.toLowerCase().includes("emergency coverage"))).toBe(true);
    expect(brief.facts.find((f) => f.id === "emergency_coverage")?.raw).toBeNull();
  });

  it("reports no projection horizon when ages are missing", () => {
    const brief = buildPortfolioBrief({
      ...base,
      profile: { ...profile, current_age: null, retirement_age: null } as Profile,
    });
    expect(brief.retirementRun).toBeNull();
    expect(brief.unknowns.some((u) => u.includes("projection horizon"))).toBe(true);
    expect(brief.facts.some((f) => f.id === "corpus_at_retirement")).toBe(false);
  });

  it("serialises facts and unknowns for the model without raw holdings", () => {
    const text = briefForModel(buildPortfolioBrief(base));
    expect(text).toContain("CALCULATED FACTS");
    expect(text).toContain("UNKNOWN / UNAVAILABLE");
    expect(text).toContain("total_value");
    // Instrument-level rows must not cross the boundary.
    expect(text).not.toContain("mutual_fund");
  });
});
