import { describe, expect, it } from "vitest";
import {
  buildLedger,
  financialYearOf,
  ledgerXirr,
  monthlyContributionHistory,
  signedCashFlow,
  summariseByFinancialYear,
  type Transaction,
} from "../ledger";

let seq = 0;
function tx(partial: Partial<Transaction>): Transaction {
  seq += 1;
  return {
    id: `t${String(seq).padStart(3, "0")}`,
    holding_id: null,
    kind: "buy",
    trade_date: "2024-04-01",
    settlement_date: null,
    name: "Test Fund",
    symbol: null,
    isin: null,
    asset_class: "equity",
    instrument_type: "mutual_fund",
    quantity: null,
    price: null,
    amount: 0,
    fees: 0,
    taxes: 0,
    currency: "INR",
    source: "manual",
    external_id: null,
    notes: null,
    ...partial,
  };
}

describe("signed cash flow", () => {
  it("treats buys and charges as outflows and sales and income as inflows", () => {
    expect(signedCashFlow(tx({ kind: "buy", amount: 10_000, fees: 20 }))).toBe(-10_020);
    expect(signedCashFlow(tx({ kind: "sell", amount: 12_000, fees: 20, taxes: 80 }))).toBe(11_900);
    expect(signedCashFlow(tx({ kind: "dividend", amount: 500 }))).toBe(500);
    expect(signedCashFlow(tx({ kind: "charge", amount: 300 }))).toBe(-300);
    expect(signedCashFlow(tx({ kind: "bonus", quantity: 10 }))).toBe(0);
  });
});

describe("FIFO ledger", () => {
  it("builds an open position with average cost", () => {
    const { positions, realised } = buildLedger([
      tx({ kind: "buy", trade_date: "2023-01-10", quantity: 100, price: 100, amount: 10_000 }),
      tx({ kind: "buy", trade_date: "2023-06-10", quantity: 100, price: 150, amount: 15_000 }),
    ]);
    expect(realised).toHaveLength(0);
    const p = positions[0]!;
    expect(p.quantity).toBe(200);
    expect(p.costBasis).toBe(25_000);
    expect(p.averageCost).toBe(125);
  });

  it("matches sales against the oldest lot first and classifies the term", () => {
    const { realised, positions } = buildLedger([
      tx({ kind: "buy", trade_date: "2022-01-10", quantity: 100, price: 100, amount: 10_000 }),
      tx({ kind: "buy", trade_date: "2023-06-10", quantity: 100, price: 200, amount: 20_000 }),
      tx({ kind: "sell", trade_date: "2023-09-10", quantity: 150, amount: 45_000 }),
    ]);
    expect(realised).toHaveLength(2);
    const long = realised.find((r) => r.buyDate === "2022-01-10")!;
    const short = realised.find((r) => r.buyDate === "2023-06-10")!;
    expect(long.term).toBe("long");
    expect(long.quantity).toBe(100);
    expect(long.gain).toBeCloseTo(30_000 - 10_000, 6);
    expect(short.term).toBe("short");
    expect(short.quantity).toBe(50);
    expect(short.gain).toBeCloseTo(15_000 - 10_000, 6);
    expect(positions[0]!.quantity).toBeCloseTo(50, 9);
    expect(positions[0]!.costBasis).toBeCloseTo(10_000, 6);
  });

  it("warns when a sale has no matching purchase", () => {
    const { warnings } = buildLedger([tx({ kind: "sell", trade_date: "2024-01-01", quantity: 10, amount: 1_000 })]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("Add the missing purchase");
  });

  it("gives bonus units zero cost and lowers the average", () => {
    const { positions } = buildLedger([
      tx({ kind: "buy", trade_date: "2023-01-01", quantity: 100, amount: 10_000 }),
      tx({ kind: "bonus", trade_date: "2023-07-01", quantity: 100 }),
    ]);
    expect(positions[0]!.quantity).toBe(200);
    expect(positions[0]!.averageCost).toBe(50);
  });

  it("records dividends as income, not as a change in cost basis", () => {
    const { positions } = buildLedger([
      tx({ kind: "buy", trade_date: "2023-01-01", quantity: 100, amount: 10_000 }),
      tx({ kind: "dividend", trade_date: "2023-08-01", amount: 800 }),
    ]);
    expect(positions[0]!.income).toBe(800);
    expect(positions[0]!.costBasis).toBe(10_000);
  });

  it("handles balance instruments without units", () => {
    const { positions } = buildLedger([
      tx({ kind: "deposit", trade_date: "2023-01-01", amount: 100_000, instrument_type: "fd", asset_class: "debt" }),
      tx({ kind: "withdrawal", trade_date: "2024-01-01", amount: 107_000, instrument_type: "fd", asset_class: "debt" }),
    ]);
    const p = positions[0]!;
    expect(p.costBasis).toBe(0);
    expect(p.realisedGain).toBeCloseTo(7_000, 6);
  });

  it("keeps separate instruments apart", () => {
    const { positions } = buildLedger([
      tx({ kind: "buy", name: "A", isin: "INA", quantity: 10, amount: 1_000 }),
      tx({ kind: "buy", name: "B", isin: "INB", quantity: 10, amount: 2_000 }),
    ]);
    expect(positions).toHaveLength(2);
  });
});

describe("financial year roll-up", () => {
  it("assigns April to the new financial year and March to the old one", () => {
    expect(financialYearOf("2024-04-01").label).toBe("FY 2024-25");
    expect(financialYearOf("2024-03-31").label).toBe("FY 2023-24");
  });

  it("splits realised gains into short and long term per year", () => {
    const txs = [
      tx({ kind: "buy", trade_date: "2022-01-10", quantity: 100, amount: 10_000 }),
      tx({ kind: "sell", trade_date: "2024-05-10", quantity: 100, amount: 30_000 }),
      tx({ kind: "dividend", trade_date: "2024-06-10", amount: 1_000 }),
    ];
    const { realised } = buildLedger(txs);
    const rows = summariseByFinancialYear(txs, realised);
    const fy = rows.find((r) => r.label === "FY 2024-25")!;
    expect(fy.realisedLongTerm).toBeCloseTo(20_000, 6);
    expect(fy.realisedShortTerm).toBe(0);
    expect(fy.income).toBe(1_000);
    expect(fy.withdrawn).toBe(30_000);
  });
});

describe("ledger XIRR", () => {
  it("returns roughly the compounded return of a single buy held to today", () => {
    const txs = [tx({ kind: "buy", trade_date: "2023-01-01", quantity: 100, amount: 100_000 })];
    const rate = ledgerXirr(txs, 121_000, new Date("2025-01-01"));
    expect(rate).not.toBeNull();
    expect(rate!).toBeGreaterThan(9.5);
    expect(rate!).toBeLessThan(10.5);
  });

  it("is null with no events", () => {
    expect(ledgerXirr([], 100_000)).toBeNull();
  });
});

describe("monthly contribution history", () => {
  it("groups invested and withdrawn amounts by month", () => {
    const rows = monthlyContributionHistory([
      tx({ kind: "buy", trade_date: "2024-04-05", amount: 10_000 }),
      tx({ kind: "buy", trade_date: "2024-04-20", amount: 5_000 }),
      tx({ kind: "sell", trade_date: "2024-05-05", amount: 3_000 }),
    ]);
    expect(rows).toEqual([
      { month: "2024-04", invested: 15_000, withdrawn: 0 },
      { month: "2024-05", invested: 0, withdrawn: 3_000 },
    ]);
  });
});
