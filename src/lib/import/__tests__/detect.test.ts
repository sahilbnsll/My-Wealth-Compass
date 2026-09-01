import { describe, expect, it } from "vitest";
import { detectDocument } from "../detect";

describe("detectDocument", () => {
  it("identifies a Zerodha holdings export", () => {
    const d = detectDocument("Instrument,Qty.,Avg. cost,LTP,Cur. val\nINFY,10,1400,1600,16000", "holdings-zerodha.csv");
    expect(d.source).toBe("zerodha");
    expect(d.kind).toBe("holdings");
  });

  it("identifies a tradebook as transactions", () => {
    const d = detectDocument(
      "symbol,trade_date,trade_type,quantity,price,order_id\nINFY,2024-04-01,buy,10,1400,123",
      "tradebook.csv",
    );
    expect(d.kind).toBe("transactions");
  });

  it("falls back to a generic sheet without broker markers", () => {
    const d = detectDocument("name,quantity,price\nGold,5,7000", "sheet.csv");
    expect(d.source).toBe("generic");
    expect(d.reasons.length).toBeGreaterThan(0);
  });
});
