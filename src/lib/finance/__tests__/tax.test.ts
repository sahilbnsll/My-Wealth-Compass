import { describe, expect, it } from "vitest";
import {
  DEFAULT_TAX_SETTINGS,
  LTCG_EQUITY_EXEMPTION,
  dividendDragPct,
  dividendTax,
  holdingMonths,
  taxCategoryFor,
  taxIfSoldToday,
  taxOnProjectedCorpus,
  withCess,
} from "../tax";
import type { ValuedHolding } from "../portfolio";

function holding(over: Partial<ValuedHolding>): ValuedHolding {
  return {
    id: over.id ?? "h1",
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
    geography: null,
    is_demo: false,
    notes: null,
    value: 0,
    invested: 0,
    gain: 0,
    gainPct: null,
    ...over,
  } as ValuedHolding;
}

const asOf = new Date("2026-09-01T00:00:00Z");

describe("categories and periods", () => {
  it("classifies instruments", () => {
    expect(taxCategoryFor("stock", "equity")).toBe("equity");
    expect(taxCategoryFor("mutual_fund", "debt")).toBe("debt");
    expect(taxCategoryFor("gold", "gold")).toBe("gold");
    expect(taxCategoryFor("ppf", "debt")).toBe("exempt");
  });

  it("counts completed months only", () => {
    expect(holdingMonths("2025-09-02", asOf)).toBe(11);
    expect(holdingMonths("2025-09-01", asOf)).toBe(12);
    expect(holdingMonths(null, asOf)).toBeNull();
  });
});

describe("tax if sold today", () => {
  it("applies the 1.25L exemption to long-term equity, then 12.5%", () => {
    const h = holding({ purchase_date: "2023-01-01", value: 1_000_000, invested: 600_000, gain: 400_000 });
    const s = taxIfSoldToday([h], DEFAULT_TAX_SETTINGS, asOf);
    const taxable = 400_000 - LTCG_EQUITY_EXEMPTION;
    expect(s.rows[0]!.taxableGain).toBeCloseTo(taxable, 6);
    expect(s.totalTax).toBeCloseTo(withCess(taxable * 0.125), 6);
    expect(s.exemptionUsed).toBe(LTCG_EQUITY_EXEMPTION);
  });

  it("taxes short-term equity at 20% with no exemption", () => {
    const h = holding({ purchase_date: "2026-04-01", value: 150_000, invested: 100_000, gain: 50_000 });
    const s = taxIfSoldToday([h], DEFAULT_TAX_SETTINGS, asOf);
    expect(s.totalTax).toBeCloseTo(withCess(50_000 * 0.2), 6);
    expect(s.exemptionUsed).toBe(0);
  });

  it("taxes debt gains at the slab rate", () => {
    const h = holding({
      instrument_type: "bond",
      asset_class: "debt",
      purchase_date: "2020-01-01",
      value: 200_000,
      invested: 150_000,
      gain: 50_000,
    });
    const s = taxIfSoldToday([h], { marginalRatePct: 30, dividendYieldPct: 1 }, asOf);
    expect(s.totalTax).toBeCloseTo(withCess(50_000 * 0.3), 6);
  });

  it("charges nothing on losses or exempt instruments", () => {
    const loss = holding({ id: "a", value: 80_000, invested: 100_000, gain: -20_000 });
    const ppf = holding({
      id: "b",
      instrument_type: "ppf",
      asset_class: "debt",
      value: 500_000,
      invested: 300_000,
      gain: 200_000,
    });
    const s = taxIfSoldToday([loss, ppf], DEFAULT_TAX_SETTINGS, asOf);
    expect(s.totalTax).toBe(0);
    expect(s.rows).toHaveLength(2);
  });

  it("shares one exemption pool across holdings", () => {
    const a = holding({ id: "a", purchase_date: "2022-01-01", value: 300_000, invested: 200_000, gain: 100_000 });
    const b = holding({ id: "b", purchase_date: "2022-01-01", value: 300_000, invested: 200_000, gain: 100_000 });
    const s = taxIfSoldToday([a, b], DEFAULT_TAX_SETTINGS, asOf);
    expect(s.exemptionUsed).toBe(LTCG_EQUITY_EXEMPTION);
    expect(s.totalTax).toBeCloseTo(withCess((200_000 - LTCG_EQUITY_EXEMPTION) * 0.125), 6);
  });
});

describe("income and projections", () => {
  it("taxes dividends at slab plus cess", () => {
    expect(dividendTax(100_000, { marginalRatePct: 30, dividendYieldPct: 1 })).toBeCloseTo(31_200, 6);
    expect(dividendTax(0, DEFAULT_TAX_SETTINGS)).toBe(0);
  });

  it("expresses the dividend drag in percentage points", () => {
    expect(dividendDragPct({ marginalRatePct: 30, dividendYieldPct: 2 })).toBeCloseTo(0.624, 6);
  });

  it("taxes a projected corpus by asset class", () => {
    const est = taxOnProjectedCorpus({ equity: 8_000_000, debt: 2_000_000 }, 4_000_000, DEFAULT_TAX_SETTINGS);
    expect(est.grossCorpus).toBe(10_000_000);
    expect(est.gain).toBe(6_000_000);
    expect(est.netCorpus).toBeLessThan(est.grossCorpus);
    expect(est.effectiveRatePct).toBeGreaterThan(0);
    // Debt is taxed harder than equity, so its share of tax exceeds its share of gains.
    const debt = est.byAssetClass.find((r) => r.assetClass === "debt")!;
    expect(debt.ratePct).toBe(30);
  });

  it("returns no tax when the corpus never grew", () => {
    const est = taxOnProjectedCorpus({ equity: 100 }, 500, DEFAULT_TAX_SETTINGS);
    expect(est.tax).toBe(0);
    expect(est.effectiveRatePct).toBeNull();
  });
});
