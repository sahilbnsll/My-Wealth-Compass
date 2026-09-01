import { describe, it, expect } from "vitest";
import {
  cagr,
  xirr,
  sipFutureValue,
  stepUpSipFutureValue,
  futureValue,
  realValue,
  inflatedCost,
  requiredMonthlySip,
  savingsRate,
  emergencyCoverageMonths,
  recoveryYears,
  blendedReturn,
} from "../core";

describe("cagr", () => {
  it("computes a known doubling over 10 years", () => {
    // 2^(1/10) - 1 = 7.1773%
    expect(cagr(100, 200, 10)!).toBeCloseTo(7.1773, 3);
  });
  it("returns null for invalid inputs", () => {
    expect(cagr(0, 200, 10)).toBeNull();
    expect(cagr(100, 200, 0)).toBeNull();
  });
});

describe("xirr", () => {
  it("recovers a flat 10% annual return", () => {
    const flows = [
      { date: new Date("2020-01-01"), amount: -100000 },
      { date: new Date("2021-01-01"), amount: 110000 },
    ];
    // 365-day year convention: 2020 is a leap year (366 days), so the annualised
    // rate that turns 100,000 into 110,000 is marginally below 10%.
    expect(xirr(flows)!).toBeCloseTo(9.9714, 3);
  });

  it("handles multiple contributions", () => {
    const flows = [
      { date: new Date("2020-01-01"), amount: -10000 },
      { date: new Date("2021-01-01"), amount: -10000 },
      { date: new Date("2022-01-01"), amount: 22000 },
    ];
    const r = xirr(flows)!;
    expect(r).toBeGreaterThan(5);
    expect(r).toBeLessThan(12);
  });

  it("returns null when all flows point the same way", () => {
    expect(
      xirr([
        { date: new Date("2020-01-01"), amount: -100 },
        { date: new Date("2021-01-01"), amount: -100 },
      ]),
    ).toBeNull();
  });
});

describe("sipFutureValue", () => {
  it("matches the closed-form annuity-due value", () => {
    // ₹10,000/month, 12% nominal, 10 years, contributions at month start.
    // i = 0.01, n = 120 -> 10000 * ((1.01^120 - 1)/0.01) * 1.01 = 23,23,391
    expect(sipFutureValue(10000, 12, 10)).toBeCloseTo(2323390.7, 0);
  });
  it("degrades to a simple sum at zero return", () => {
    expect(sipFutureValue(5000, 0, 2)).toBe(120000);
  });
});

describe("stepUpSipFutureValue", () => {
  it("equals the level SIP when step-up is zero", () => {
    expect(stepUpSipFutureValue(10000, 12, 10, 0)).toBeCloseTo(sipFutureValue(10000, 12, 10), 2);
  });
  it("is strictly larger with a positive step-up", () => {
    expect(stepUpSipFutureValue(10000, 12, 10, 10)).toBeGreaterThan(sipFutureValue(10000, 12, 10));
  });
  it("matches a hand-computed two-year case", () => {
    // Year 1: 12 x ₹1,000 at 12% -> 12,809.33 at the end of year 1, then grown
    // one more year (x 1.01^12) -> 14,433.87.
    // Year 2: 12 x ₹1,100 -> 14,090.26. Total 28,524.13.
    expect(stepUpSipFutureValue(1000, 12, 2, 10)).toBeCloseTo(28524.13, 1);
  });
});

describe("inflation adjustment", () => {
  it("round-trips nominal and real values", () => {
    const nominal = futureValue(100, 10, 10);
    expect(realValue(nominal, 10, 10)).toBeCloseTo(100, 6);
  });
  it("inflates a goal cost", () => {
    expect(inflatedCost(1000000, 6, 5)).toBeCloseTo(1338225.58, 1);
  });
});

describe("requiredMonthlySip", () => {
  it("returns zero when the existing corpus already covers the target", () => {
    expect(requiredMonthlySip(100000, 10, 5, 200000)).toBe(0);
  });
  it("produces a SIP that reaches the target", () => {
    const sip = requiredMonthlySip(2323390.7, 12, 10, 0);
    expect(sip).toBeCloseTo(10000, 2);
  });
  it("accounts for an existing corpus", () => {
    const target = 1000000;
    const sip = requiredMonthlySip(target, 10, 10, 200000);
    const reached = futureValue(200000, 10, 10) + sipFutureValue(sip, 10, 10);
    expect(reached).toBeCloseTo(target, 0);
  });
});

describe("ratios and coverage", () => {
  it("computes savings rate", () => {
    expect(savingsRate(100000, 60000)).toBeCloseTo(40);
    expect(savingsRate(0, 100)).toBeNull();
  });
  it("computes emergency coverage", () => {
    expect(emergencyCoverageMonths(310000, 100000)).toBeCloseTo(3.1);
    expect(emergencyCoverageMonths(1000, 0)).toBeNull();
  });
  it("computes recovery years for a drawdown", () => {
    // -50% needs a 100% gain; at 10% that is ln(2)/ln(1.1) = 7.27 years.
    expect(recoveryYears(50, 10)!).toBeCloseTo(7.2725, 3);
    expect(recoveryYears(0, 10)).toBeNull();
  });
});

describe("blendedReturn", () => {
  it("weights asset-class returns", () => {
    expect(blendedReturn({ equity: 0.6, debt: 0.4 }, { equity: 12, debt: 7 })).toBeCloseTo(10);
  });
  it("normalises weights that do not sum to one", () => {
    expect(blendedReturn({ equity: 60, debt: 40 }, { equity: 12, debt: 7 })).toBeCloseTo(10);
  });
});
