import { describe, expect, it } from "vitest";
import {
  findStatedTotal,
  reconcileHoldingBalances,
  reconcileTransactionBalances,
} from "../balance";
import type { ReconciledHolding, ReconciledTransaction, ExistingHolding } from "../reconcile";
import type { ParsedHolding } from "../csv";
import type { ParsedTransaction } from "../transactions";
import type { Transaction } from "@/lib/finance/ledger";

const holdingRow = (over: Partial<ParsedHolding> = {}): ParsedHolding => ({
  name: "Infosys",
  symbol: "INFY",
  isin: null,
  instrument_type: "stock",
  asset_class: "equity",
  quantity: 10,
  avg_price: 1400,
  current_price: 1600,
  cost_basis: 14000,
  current_value: 16000,
  ...over,
});

const reconciled = (row: ParsedHolding, matchedId: string | null, index = 0): ReconciledHolding => ({
  index,
  row,
  status: matchedId ? "updated" : "new",
  confidence: "high",
  matchedId,
  matchedBy: matchedId ? "symbol" : "none",
  matchedName: null,
  changes: [],
  reason: null,
});

const existing = (over: Partial<ExistingHolding> = {}): ExistingHolding => ({
  id: "h1",
  name: "Infosys",
  symbol: "INFY",
  isin: null,
  quantity: 10,
  avg_price: 1400,
  current_price: 1500,
  current_value: 15000,
  ...over,
});

describe("reconcileHoldingBalances", () => {
  it("adds new positions to the opening portfolio", () => {
    const r = reconcileHoldingBalances([reconciled(holdingRow(), null)], [existing({ id: "other", name: "TCS", symbol: "TCS" })]);
    expect(r.opening).toBe(15000);
    expect(r.activity).toBe(16000);
    expect(r.closing).toBe(31000);
  });

  it("counts a restated position as revaluation, not a second holding", () => {
    const r = reconcileHoldingBalances([reconciled(holdingRow(), "h1")], [existing()]);
    expect(r.opening).toBe(15000);
    expect(r.activity).toBe(1000);
    expect(r.closing).toBe(16000);
  });

  it("warns when the closing value disagrees with the total stated in the file", () => {
    const r = reconcileHoldingBalances([reconciled(holdingRow(), "h1")], [existing()], 1240000);
    expect(r.balanced).toBe(false);
    expect(r.difference).toBe(16000 - 1240000);
    expect(r.warnings.join(" ")).toMatch(/Investigate/i);
  });

  it("accepts rounding differences inside tolerance", () => {
    const r = reconcileHoldingBalances([reconciled(holdingRow(), "h1")], [existing()], 15990);
    expect(r.balanced).toBe(true);
  });
});

const tx = (over: Partial<ParsedTransaction> = {}): ParsedTransaction => ({
  kind: "buy",
  trade_date: "2025-04-01",
  name: "Infosys",
  symbol: "INFY",
  isin: null,
  asset_class: "equity",
  instrument_type: "stock",
  quantity: 10,
  price: 1400,
  amount: 14000,
  fees: 20,
  taxes: 0,
  external_id: null,
  confidence: "high",
  reason: null,
  ...over,
});

const rtx = (row: ParsedTransaction, index = 0): ReconciledTransaction => ({
  index,
  row,
  status: "new",
  confidence: "high",
  matchedId: null,
  matchedBy: "none",
  reason: null,
});

const stored: Transaction = {
  id: "t1",
  holding_id: null,
  kind: "buy",
  trade_date: "2024-01-01",
  settlement_date: null,
  name: "TCS",
  symbol: "TCS",
  isin: null,
  asset_class: "equity",
  instrument_type: "stock",
  quantity: 5,
  price: 3000,
  amount: 15000,
  fees: 0,
  taxes: 0,
  currency: "INR",
  source: "manual",
  external_id: null,
  notes: null,
};

describe("reconcileTransactionBalances", () => {
  it("moves net invested by purchases less sales", () => {
    const r = reconcileTransactionBalances(
      [rtx(tx()), rtx(tx({ kind: "sell", amount: 5000, fees: 10 }), 1)],
      [stored],
    );
    expect(r.opening).toBe(15000);
    expect(r.activity).toBeCloseTo(14020 - 4990, 6);
    expect(r.closing).toBeCloseTo(15000 + 9030, 6);
  });

  it("keeps dividends out of invested capital", () => {
    const r = reconcileTransactionBalances([rtx(tx({ kind: "dividend", amount: 900, fees: 0, quantity: null }))], []);
    expect(r.activity).toBe(0);
    expect(r.lines.find((l) => l.label.startsWith("Dividends"))?.value).toBe(900);
  });

  it("flags rows with an unreadable date", () => {
    const r = reconcileTransactionBalances([rtx(tx({ trade_date: "01/04/25" }))], []);
    expect(r.warnings.join(" ")).toMatch(/unreadable date/i);
  });
});

describe("findStatedTotal", () => {
  it("reads a grand total line from a broker file", () => {
    expect(findStatedTotal("INFY,10,1400\nGrand Total,,12,40,000")?.value).toBe(1240000);
  });

  it("returns null when no total is present", () => {
    expect(findStatedTotal("INFY,10,1400")).toBeNull();
  });
});
