import { describe, it, expect } from "vitest";
import { summarisePortfolio, rebalance, concentrationWarnings, monthlyContribution } from "../portfolio";
import { ASSET_CLASSES, type AssetClass, type Holding, type PlannedInvestment } from "../types";

function holding(partial: Partial<Holding>): Holding {
  return {
    id: crypto.randomUUID(),
    asset_class: "equity",
    instrument_type: "stock",
    name: "Test",
    symbol: null,
    isin: null,
    category: null,
    quantity: null,
    avg_price: null,
    current_price: null,
    current_value: null,
    price_source: "manual",
    price_updated_at: null,
    purchase_date: null,
    maturity_date: null,
    interest_rate: null,
    cost_basis: null,
    target_allocation_pct: null,
    tax_treatment: null,
    liquidity: null,
    sector: null,
    cap_segment: null,
    geography: "india",
    is_demo: false,
    notes: null,
    ...partial,
  };
}

describe("summarisePortfolio", () => {
  it("values unit-priced and balance-based holdings differently", () => {
    const s = summarisePortfolio([
      holding({ instrument_type: "stock", quantity: 100, avg_price: 500, current_price: 700 }),
      holding({ instrument_type: "fd", asset_class: "debt", current_value: 200000, cost_basis: 180000 }),
    ]);
    expect(s.totalValue).toBe(70000 + 200000);
    expect(s.invested).toBe(50000 + 180000);
    expect(s.unrealisedGain).toBe(40000);
    expect(s.unrealisedGainPct!).toBeCloseTo((40000 / 230000) * 100);
  });

  it("allocation percentages sum to 100", () => {
    const s = summarisePortfolio([
      holding({ asset_class: "equity", instrument_type: "mutual_fund", quantity: 10, current_price: 1000 }),
      holding({ asset_class: "debt", instrument_type: "fd", current_value: 50000 }),
      holding({ asset_class: "gold", instrument_type: "gold", quantity: 20, current_price: 7000 }),
      holding({ asset_class: "cash", instrument_type: "cash", current_value: 100000 }),
    ]);
    const total = ASSET_CLASSES.reduce((a, c) => a + s.byAssetClass[c], 0);
    expect(total).toBeCloseTo(100, 9);
  });

  it("handles an empty portfolio without dividing by zero", () => {
    const s = summarisePortfolio([]);
    expect(s.totalValue).toBe(0);
    expect(s.unrealisedGainPct).toBeNull();
    expect(s.xirrPct).toBeNull();
  });
});

describe("rebalance", () => {
  it("computes the delta against target and flags breaches", () => {
    const s = summarisePortfolio([
      holding({ asset_class: "equity", instrument_type: "cash", current_value: 780000 }),
      holding({ asset_class: "debt", instrument_type: "cash", current_value: 220000 }),
    ]);
    const target = Object.fromEntries(ASSET_CLASSES.map((c) => [c, 0])) as Record<AssetClass, number>;
    target.equity = 70;
    target.debt = 30;
    const rows = rebalance(s, target, 5);
    const eq = rows.find((r) => r.assetClass === "equity")!;
    expect(eq.currentPct).toBeCloseTo(78);
    expect(eq.deltaPct).toBeCloseTo(8);
    expect(eq.status).toBe("above");
    expect(eq.deltaValue).toBeCloseTo(-80000);
    const debt = rows.find((r) => r.assetClass === "debt")!;
    expect(debt.status).toBe("below");
  });

  it("treats small deviations as on target", () => {
    const s = summarisePortfolio([
      holding({ asset_class: "equity", instrument_type: "cash", current_value: 720000 }),
      holding({ asset_class: "debt", instrument_type: "cash", current_value: 280000 }),
    ]);
    const target = Object.fromEntries(ASSET_CLASSES.map((c) => [c, 0])) as Record<AssetClass, number>;
    target.equity = 70;
    target.debt = 30;
    expect(rebalance(s, target, 5).every((r) => r.status === "on_target")).toBe(true);
  });
});

describe("concentrationWarnings", () => {
  it("flags a dominant single stock", () => {
    const s = summarisePortfolio([
      holding({ instrument_type: "stock", name: "ACME", quantity: 1, current_price: 500000 }),
      holding({ instrument_type: "stock", name: "Other", quantity: 1, current_price: 500000 }),
    ]);
    expect(concentrationWarnings(s).some((w) => w.message.includes("ACME"))).toBe(true);
  });

  it("flags sector concentration above 30% of equity", () => {
    const s = summarisePortfolio([
      holding({ instrument_type: "mutual_fund", sector: "Financials", quantity: 1, current_price: 600000 }),
      holding({ instrument_type: "mutual_fund", sector: "Energy", quantity: 1, current_price: 400000 }),
    ]);
    expect(concentrationWarnings(s).some((w) => w.scope === "sector")).toBe(true);
  });

  it("stays quiet on a diversified portfolio", () => {
    const s = summarisePortfolio([
      holding({ instrument_type: "mutual_fund", sector: "Financials", quantity: 1, current_price: 250000 }),
      holding({ instrument_type: "mutual_fund", sector: "Technology", quantity: 1, current_price: 250000 }),
      holding({ instrument_type: "mutual_fund", sector: "Consumer", quantity: 1, current_price: 250000 }),
      holding({ instrument_type: "mutual_fund", sector: "Industrials", quantity: 1, current_price: 250000 }),
      holding({ asset_class: "debt", instrument_type: "fd", current_value: 300000 }),
    ]);
    expect(concentrationWarnings(s).filter((w) => w.level === "warning")).toHaveLength(0);
  });
});

describe("monthlyContribution", () => {
  it("normalises frequencies to a monthly figure", () => {
    const p = (o: Partial<PlannedInvestment>): PlannedInvestment => ({
      id: "1",
      name: "x",
      asset_class: "equity",
      instrument_type: null,
      symbol: null,
      isin: null,
      monthly_amount: 0,
      frequency: "monthly",
      start_date: null,
      end_date: null,
      annual_step_up_pct: 0,
      expected_return_pct: null,
      objective: null,
      risk_level: null,
      liquidity: null,
       tax_treatment: null,
       is_demo: false,
       is_paused: false,
       notes: null,
      ...o,
    });
    expect(
      monthlyContribution([
        p({ monthly_amount: 20000, frequency: "monthly" }),
        p({ monthly_amount: 30000, frequency: "quarterly" }),
        p({ monthly_amount: 120000, frequency: "annual" }),
      ]),
    ).toBeCloseTo(20000 + 10000 + 10000);
  });
});
