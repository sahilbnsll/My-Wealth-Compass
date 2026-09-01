import { describe, expect, it } from "vitest";
import { guessInstrument, parseAmount, parseBrokerCsv, splitLine } from "../csv";

describe("splitLine", () => {
  it("respects quoted commas", () => {
    expect(splitLine('"Reliance, Ltd",10,100', ",")).toEqual(["Reliance, Ltd", "10", "100"]);
  });
});

describe("parseAmount", () => {
  it("handles Indian grouping, rupee signs and bracket negatives", () => {
    expect(parseAmount("₹1,25,000.50")).toBeCloseTo(125000.5);
    expect(parseAmount("(2,500)")).toBe(-2500);
    expect(parseAmount("-")).toBeNull();
    expect(parseAmount("")).toBeNull();
  });
});

describe("guessInstrument", () => {
  it("detects funds and ETFs", () => {
    expect(guessInstrument("Parag Parikh Flexi Cap Fund Direct Growth", null, "stock")).toBe("mutual_fund");
    expect(guessInstrument("NIFTYBEES", null, "stock")).toBe("etf");
    expect(guessInstrument("RELIANCE", "INE002A01018", "stock")).toBe("stock");
    expect(guessInstrument("Axis Bluechip", "INF846K01131", "stock")).toBe("mutual_fund");
  });
});

describe("parseBrokerCsv — Zerodha holdings", () => {
  const csv = [
    "Zerodha Console — Holdings",
    "",
    "Instrument,Qty.,Avg. cost,LTP,Invested,Cur. val,P&L,Net chg.",
    "RELIANCE,10,2350.00,2810.50,23500.00,28105.00,4605.00,19.60",
    "TCS,5,3900.00,3750.25,19500.00,18751.25,-748.75,-3.84",
    "Total,,,,43000.00,46856.25,3856.25,",
  ].join("\n");

  it("maps rows and totals correctly", () => {
    const res = parseBrokerCsv(csv);
    expect(res.rows).toHaveLength(2);
    const r = res.rows[0]!;
    expect(r.name).toBe("RELIANCE");
    expect(r.quantity).toBe(10);
    expect(r.avg_price).toBe(2350);
    expect(r.current_price).toBe(2810.5);
    expect(r.cost_basis).toBe(23500);
    expect(r.current_value).toBe(28105);
    expect(r.asset_class).toBe("equity");
  });

  it("drops the Total row", () => {
    expect(parseBrokerCsv(csv).rows.some((r) => r.name.toLowerCase() === "total")).toBe(false);
  });
});

describe("parseBrokerCsv — Groww exports", () => {
  it("reads stock holdings with ISIN", () => {
    const csv = [
      "Stock Name,ISIN,Quantity,Average buying price,Buy value,Closing price,Closing value,Unrealised P&L",
      "Infosys Ltd,INE009A01021,12,1450.00,17400.00,1580.00,18960.00,1560.00",
    ].join("\n");
    const r = parseBrokerCsv(csv).rows[0]!;
    expect(r.isin).toBe("INE009A01021");
    expect(r.quantity).toBe(12);
    expect(r.current_value).toBe(18960);
    expect(r.instrument_type).toBe("stock");
  });

  it("reads mutual fund holdings and derives missing values", () => {
    const csv = ["Scheme Name,ISIN,Units,Current NAV", "Parag Parikh Flexi Cap Fund,INF879O01019,250.5,72.4"].join("\n");
    const r = parseBrokerCsv(csv).rows[0]!;
    expect(r.instrument_type).toBe("mutual_fund");
    expect(r.current_value).toBeCloseTo(250.5 * 72.4);
  });
});

describe("parseBrokerCsv — resilience", () => {
  it("reports rows without a name or amount", () => {
    const csv = ["Instrument,Qty.,LTP", "RELIANCE,10,2800", ",5,100", "GARBAGE,,"].join("\n");
    const res = parseBrokerCsv(csv);
    expect(res.rows).toHaveLength(1);
    expect(res.skipped).toHaveLength(2);
  });

  it("handles tab-separated pastes", () => {
    const tsv = "Instrument\tQty.\tLTP\nHDFCBANK\t8\t1650";
    const res = parseBrokerCsv(tsv);
    expect(res.delimiter).toBe("\t");
    expect(res.rows[0]!.name).toBe("HDFCBANK");
  });

  it("returns a clear error when no header is recognised", () => {
    const res = parseBrokerCsv("some,random\nnotes,here");
    expect(res.rows).toHaveLength(0);
    expect(res.skipped[0]!.reason).toMatch(/header row/i);
  });
});
