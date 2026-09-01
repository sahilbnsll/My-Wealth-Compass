import { describe, expect, it } from "vitest";
import { project, validateProjection } from "../projection";
import { analyseRetirement, sustainableAnnualSpend, type RetirementInput } from "../retirement";
import { ASSET_CLASSES, type AssetClass } from "../types";

function map(values: Partial<Record<AssetClass, number>>): Record<AssetClass, number> {
  const out = Object.fromEntries(ASSET_CLASSES.map((c) => [c, 0])) as Record<AssetClass, number>;
  return { ...out, ...values };
}

const assumptions = {
  inflation: 6,
  equity_return: 10,
  debt_return: 7,
  gold_return: 7,
  cash_return: 4,
  sip_step_up: 0,
  salary_growth: 8,
} as RetirementInput["assumptions"];

const base: RetirementInput = {
  startingValues: map({ equity: 5_000_000, debt: 2_000_000 }),
  monthlyContribution: map({ equity: 50_000 }),
  assumptions,
  startYear: 2026,
  years: 40,
  startAge: 35,
  decumulation: { retirementAge: 55, annualSpendToday: 1_200_000 },
};

describe("decumulation in the core projection engine", () => {
  it("keeps every row reconciled once withdrawals begin", () => {
    const rows = project(base);
    expect(validateProjection(rows)).toEqual([]);
  });

  it("stops contributions at the retirement age", () => {
    const rows = project(base);
    const beforeRetirement = rows.find((r) => r.age === 54)!;
    const afterRetirement = rows.find((r) => r.age === 55)!;
    expect(beforeRetirement.contribution).toBeGreaterThan(0);
    expect(afterRetirement.contribution).toBe(0);
    expect(afterRetirement.withdrawal).toBeGreaterThan(0);
  });

  it("inflates the retirement spend from today's rupees", () => {
    const rows = project(base);
    const first = rows.find((r) => r.age === 55)!;
    const expected = 1_200_000 * Math.pow(1.06, 20);
    expect(first.withdrawal).toBeCloseTo(expected, -2);
  });

  it("nets other income off the spend", () => {
    const withIncome = project({
      ...base,
      decumulation: { ...base.decumulation, otherAnnualIncomeToday: 1_200_000 },
    });
    const first = withIncome.find((r) => r.age === 55)!;
    expect(first.withdrawal).toBe(0);
  });

  it("never withdraws more than the balance holds", () => {
    const rows = project({
      ...base,
      startingValues: map({ cash: 100_000 }),
      monthlyContribution: map({}),
      decumulation: { retirementAge: 35, annualSpendToday: 5_000_000 },
    });
    expect(rows.every((r) => r.closing >= -0.01)).toBe(true);
    expect(rows[0]!.withdrawal).toBeLessThanOrEqual(100_001);
  });
});

describe("analyseRetirement", () => {
  it("reports the corpus at retirement and a real-terms equivalent", () => {
    const a = analyseRetirement(base);
    expect(a.corpusAtRetirement).toBeGreaterThan(0);
    expect(a.realCorpusAtRetirement!).toBeLessThan(a.corpusAtRetirement!);
  });

  it("flags depletion when the spend is unaffordable", () => {
    const a = analyseRetirement({
      ...base,
      decumulation: { retirementAge: 55, annualSpendToday: 12_000_000 },
    });
    expect(a.survives).toBe(false);
    expect(a.depletionAge).not.toBeNull();
    expect(a.depletionAge!).toBeGreaterThanOrEqual(55);
  });

  it("survives a modest spend", () => {
    const a = analyseRetirement({
      ...base,
      decumulation: { retirementAge: 55, annualSpendToday: 600_000 },
    });
    expect(a.survives).toBe(true);
    expect(a.depletionYear).toBeNull();
    expect(a.terminalValue).toBeGreaterThan(0);
  });

  it("computes an initial withdrawal rate", () => {
    const a = analyseRetirement(base);
    expect(a.initialWithdrawalRatePct).toBeGreaterThan(0);
    expect(a.initialWithdrawalRatePct).toBeLessThan(100);
  });
});

describe("sustainableAnnualSpend", () => {
  it("finds a spend the portfolio can support to the horizon", () => {
    const safe = sustainableAnnualSpend(base);
    expect(safe).toBeGreaterThan(0);
    const check = analyseRetirement({
      ...base,
      decumulation: { ...base.decumulation, annualSpendToday: safe * 0.98 },
    });
    expect(check.survives).toBe(true);
  });

  it("returns a spend beyond which the portfolio fails", () => {
    const safe = sustainableAnnualSpend(base);
    const check = analyseRetirement({
      ...base,
      decumulation: { ...base.decumulation, annualSpendToday: safe * 1.25 },
    });
    expect(check.survives).toBe(false);
  });
});
