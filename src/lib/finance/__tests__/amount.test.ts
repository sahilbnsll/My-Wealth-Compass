import { describe, expect, it } from "vitest";
import { describeAmount, formatAmountInput, parseAmountInput, parseFinancialAmount } from "../amount";

describe("parseFinancialAmount", () => {
  it.each([
    ["100000", 100000],
    ["1,00,000", 100000],
    ["1 lakh", 100000],
    ["1 lac", 100000],
    ["1L", 100000],
    ["1 lakhs", 100000],
    ["10k", 10000],
    ["10K", 10000],
    ["10000", 10000],
    ["₹10k", 10000],
    ["₹1.5 lakh", 150000],
    ["1.5L", 150000],
    ["1 crore", 10000000],
    ["1Cr", 10000000],
    ["2.5 crore", 25000000],
    ["2.25Cr", 22500000],
    ["Rs 5,000", 5000],
    ["  2 CRORE  ", 20000000],
  ])("parses %s", (input, expected) => expect(parseFinancialAmount(input)).toBe(expected));

  it("rejects arbitrary or ambiguous text", () => {
    expect(parseFinancialAmount("one lakh rupees")).toBeNull();
    expect(parseFinancialAmount("10 percent")).toBeNull();
    expect(parseFinancialAmount("1.2.3")).toBeNull();
    expect(parseFinancialAmount("")).toBeNull();
    expect(parseFinancialAmount("-500")).toBeNull();
  });

  it("allows negatives only when asked", () => {
    expect(parseFinancialAmount("-5k", { allowNegative: true })).toBe(-5000);
  });

  it("explains why an entry failed", () => {
    const bad = parseAmountInput("5 bananas");
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error).toContain("bananas");
  });

  it("formats values using Indian grouping", () => expect(formatAmountInput(150000)).toBe("1,50,000"));

  it("echoes amounts in natural units", () => {
    expect(describeAmount(150000)).toBe("₹1,50,000 (1.5 lakh)");
    expect(describeAmount(22500000)).toBe("₹2,25,00,000 (2.25 crore)");
    expect(describeAmount(10000)).toBe("₹10,000 (10k)");
    expect(describeAmount(500)).toBe("₹500");
  });
});

describe("dollar amounts", () => {
  it("flags USD and keeps the dollar value", () => {
    for (const input of ["$1000", "1000 usd", "1,000 dollars", "$1.5k"]) {
      const parsed = parseAmountInput(input);
      expect(parsed.ok).toBe(true);
      if (parsed.ok) expect(parsed.currency).toBe("USD");
    }
    const k = parseAmountInput("$1.5k");
    expect(k.ok && k.value).toBe(1500);
  });

  it("keeps rupee amounts as INR", () => {
    const parsed = parseAmountInput("1.5L");
    expect(parsed.ok && parsed.currency).toBe("INR");
  });

  it("understands million for dollar amounts", () => {
    const parsed = parseAmountInput("$2m");
    expect(parsed.ok && parsed.value).toBe(2_000_000);
  });
});

