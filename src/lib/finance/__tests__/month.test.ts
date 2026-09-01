import { describe, expect, it } from "vitest";
import { thisMonthPlan } from "../month";
import type { PlannedInvestment } from "../types";
import type { Transaction } from "../ledger";

const sip = (over: Partial<PlannedInvestment> = {}): PlannedInvestment => ({
  id: "p1",
  name: "Nifty index fund",
  asset_class: "equity",
  instrument_type: "mutual_fund",
  monthly_amount: 20000,
  frequency: "monthly",
  start_date: null,
  end_date: null,
  annual_step_up_pct: 0,
  expected_return_pct: null,
  objective: null,
  risk_level: null,
  liquidity: null,
  tax_treatment: null,
  is_paused: false,
  is_demo: false,
  notes: null,
  symbol: null,
  isin: null,
  ...over,
});

const tx = (over: Partial<Transaction> = {}): Transaction => ({
  id: "t1",
  holding_id: null,
  kind: "sip",
  trade_date: "2026-09-05",
  settlement_date: null,
  name: "Nifty index fund",
  symbol: null,
  isin: null,
  asset_class: "equity",
  instrument_type: "mutual_fund",
  quantity: 100,
  price: 200,
  amount: 20000,
  fees: 0,
  taxes: 0,
  currency: "INR",
  source: "manual",
  external_id: null,
  notes: null,
  ...over,
});

const now = new Date(2026, 8, 15);

describe("thisMonthPlan", () => {
  it("reads the monthly target from active plans", () => {
    const m = thisMonthPlan({ planned: [sip(), sip({ id: "p2", asset_class: "debt", monthly_amount: 10000 })], transactions: [], now });
    expect(m.target).toBe(30000);
    expect(m.label).toMatch(/September 2026/);
  });

  it("ignores paused and ended plans", () => {
    const m = thisMonthPlan({
      planned: [sip({ is_paused: true }), sip({ id: "p2", end_date: "2026-01-31", monthly_amount: 5000 })],
      transactions: [],
      now,
    });
    expect(m.target).toBe(0);
    expect(m.status).toBe("no_plan");
  });

  it("says the month is unknown rather than zero when no ledger exists", () => {
    const m = thisMonthPlan({ planned: [sip()], transactions: [], now });
    expect(m.invested).toBeNull();
    expect(m.status).toBe("unknown");
  });

  it("counts only this month's contributions from the ledger", () => {
    const m = thisMonthPlan({
      planned: [sip()],
      transactions: [tx(), tx({ id: "t2", trade_date: "2026-08-05" }), tx({ id: "t3", kind: "sell", amount: 9000 })],
      now,
    });
    expect(m.invested).toBe(20000);
    expect(m.status).toBe("on_track");
    expect(m.remaining).toBe(0);
  });

  it("flags a month that is behind plan and states what is left", () => {
    const m = thisMonthPlan({ planned: [sip()], transactions: [tx({ amount: 5000 })], now });
    expect(m.status).toBe("below_plan");
    expect(m.remaining).toBe(15000);
    expect(m.nextAmount).toBe(15000);
  });

  it("splits the next rupee across the recorded plans", () => {
    const m = thisMonthPlan({
      planned: [sip(), sip({ id: "p2", asset_class: "debt", monthly_amount: 10000 })],
      transactions: [tx({ amount: 0 })],
      now,
    });
    expect(m.splitFromPlan).toBe(true);
    expect(m.nextSplit[0]).toMatchObject({ assetClass: "equity", amount: 20000 });
    expect(m.nextSplit[1]).toMatchObject({ assetClass: "debt", amount: 10000 });
  });

  it("falls back to target weights when nothing is planned", () => {
    const m = thisMonthPlan({
      planned: [],
      transactions: [],
      targetAllocationPct: { equity: 60, debt: 40 },
      now,
    });
    expect(m.splitFromPlan).toBe(false);
    expect(m.nextSplit.map((s) => s.assetClass)).toEqual(["equity", "debt"]);
  });
});
