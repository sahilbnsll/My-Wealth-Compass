import { describe, expect, it } from "vitest";
import { changesSince, pickBaseline } from "../changes";
import type { Transaction } from "../ledger";

const tx = (over: Partial<Transaction> = {}): Transaction => ({
  id: "t1",
  holding_id: null,
  kind: "buy",
  trade_date: "2026-08-20",
  settlement_date: null,
  name: "Infosys",
  symbol: "INFY",
  isin: null,
  asset_class: "equity",
  instrument_type: "stock",
  quantity: 10,
  price: 1400,
  amount: 14000,
  fees: 0,
  taxes: 0,
  currency: "INR",
  source: "manual",
  external_id: null,
  notes: null,
  ...over,
});

const current = {
  totalValue: 1242300,
  invested: 1100000,
  allocationPct: { equity: 61.4, debt: 30 },
  holdingCount: 9,
  monthlySip: 25000,
  transactions: [tx()],
};

describe("changesSince", () => {
  it("says nothing rather than inventing change when there is no baseline", () => {
    const r = changesSince(null, current);
    expect(r.hasBaseline).toBe(false);
    expect(r.lines).toHaveLength(0);
    expect(r.note).toMatch(/never estimated/i);
  });

  it("reports the portfolio move against the baseline", () => {
    const r = changesSince(
      { date: "2026-08-01", source: "Review 2026-08", totalValue: 1200000, invested: 1100000, allocationPct: { equity: 60 } },
      current,
    );
    const value = r.lines.find((l) => l.id === "value")!;
    expect(value.direction).toBe("up");
    expect(value.value).toContain("+");
  });

  it("reports equity drift in percentage points", () => {
    const r = changesSince(
      { date: "2026-08-01", source: "Snapshot", totalValue: 1200000, invested: 1100000, allocationPct: { equity: 60 } },
      current,
    );
    expect(r.lines.find((l) => l.id === "equity-weight")?.value).toBe("+1.4 pp");
  });

  it("omits invested and holdings lines when they did not move", () => {
    const r = changesSince(
      { date: "2026-08-01", source: "Snapshot", totalValue: 1200000, invested: 1100000, allocationPct: null, holdingCount: 9 },
      current,
    );
    expect(r.lines.some((l) => l.id === "invested")).toBe(false);
    expect(r.lines.some((l) => l.id === "holdings")).toBe(false);
  });

  it("counts only transactions recorded after the baseline date", () => {
    const r = changesSince(
      { date: "2026-08-25", source: "Snapshot", totalValue: 1200000, invested: 1100000 },
      current,
    );
    expect(r.lines.some((l) => l.id === "ledger")).toBe(false);
  });
});

describe("pickBaseline", () => {
  const snaps = [
    { taken_on: "2026-07-01", total_value: 1000000, invested: 900000, allocation: { equity: 55 } },
    { taken_on: "2026-09-01", total_value: 1200000, invested: 1050000, allocation: { equity: 60 } },
  ];

  it("prefers the last review and borrows allocation from the nearest earlier snapshot", () => {
    const b = pickBaseline(
      [{ period: "2026-08", reviewed_at: "2026-08-02T10:00:00Z", total_value: 1150000, invested: 1000000 }],
      snaps,
    )!;
    expect(b.source).toBe("Review 2026-08");
    expect(b.totalValue).toBe(1150000);
    expect(b.allocationPct).toEqual({ equity: 55 });
  });

  it("falls back to a snapshot at least a month old", () => {
    const b = pickBaseline([], snaps, new Date("2026-09-15T00:00:00Z"))!;
    expect(b.date).toBe("2026-07-01");
  });

  it("returns null when there is no history at all", () => {
    expect(pickBaseline([], [])).toBeNull();
  });
});
