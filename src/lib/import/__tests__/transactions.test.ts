import { describe, expect, it } from "vitest";
import { parseKind, parseStatementDate, parseTransactionCsv } from "../transactions";
import { reconcileTransactions, summariseReconciliation } from "../reconcile";

describe("statement transaction parsing", () => {
  it("reads Indian dates and common trade directions", () => {
    expect(parseStatementDate("15/02/2025")).toBe("2025-02-15");
    expect(parseStatementDate("15-Feb-25")).toBe("2025-02-15");
    expect(parseKind("SIP instalment")).toBe("sip");
    expect(parseKind("Dividend payout")).toBe("dividend");
  });

  it("parses a broker tradebook and derives missing amount", () => {
    const result = parseTransactionCsv([
      "Trade Date,Instrument,Trade Type,Quantity,Price,Amount,Trade ID",
      "15-Feb-25,RELIANCE,Buy,2,2500,,T-100",
      "16/02/2025,RELIANCE,Sell,1,2600,2600,T-101",
    ].join("\n"));
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]).toMatchObject({ trade_date: "2025-02-15", kind: "buy", amount: 5000, external_id: "T-100" });
    expect(result.rows[1]).toMatchObject({ trade_date: "2025-02-16", kind: "sell", amount: 2600 });
    expect(result.rows[0]?.confidence).toBe("medium");
  });
});

describe("transaction reconciliation", () => {
  it("marks broker references and signatures unchanged, and duplicates as conflicts", () => {
    const rows = parseTransactionCsv([
      "Date,Instrument,Type,Amount,Trade ID",
      "2025-01-02,RELIANCE,Buy,1000,NEW-1",
      "2025-01-03,TCS,Buy,2000,",
      "2025-01-03,TCS,Buy,2000,",
    ].join("\n")).rows;
    const reconciled = reconcileTransactions(rows, [
      { id: "existing-1", external_id: "OLD-1", kind: "buy", trade_date: "2025-01-03", name: "TCS", amount: 2000, quantity: null },
    ]);
    expect(reconciled.map((r) => r.status)).toEqual(["new", "unchanged", "conflict"]);
    expect(summariseReconciliation(reconciled)).toMatchObject({ total: 3, new: 1, unchanged: 1, conflict: 1, review: 1 });
  });
});
