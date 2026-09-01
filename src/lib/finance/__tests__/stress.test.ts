import { describe, expect, it } from "vitest";
import { project, validateProjection, type ProjectionInput } from "../projection";
import { runStressPath, runStressScenario, STRESS_SCENARIOS } from "../stress";
import { ASSET_CLASSES, type AssetClass } from "../types";

const assumptions = {
  equity_return: 12,
  debt_return: 7,
  gold_return: 8,
  cash_return: 4,
  inflation: 6,
  sip_step_up: 0,
};

function values(partial: Partial<Record<AssetClass, number>>): Record<AssetClass, number> {
  const out = Object.fromEntries(ASSET_CLASSES.map((c) => [c, 0])) as Record<AssetClass, number>;
  return { ...out, ...partial };
}

const base: ProjectionInput = {
  startingValues: values({ equity: 1_000_000, debt: 500_000 }),
  monthlyContribution: values({ equity: 20_000, debt: 10_000 }),
  assumptions,
  startYear: 2026,
  years: 10,
  startAge: 35,
};

describe("stress path", () => {
  it("with no segments reproduces the baseline projection", () => {
    const baseline = project(base);
    const rows = runStressPath(base, []);
    expect(rows).toHaveLength(baseline.length);
    expect(rows[rows.length - 1]!.closing).toBeCloseTo(baseline[baseline.length - 1]!.closing, 2);
  });

  it("stays internally consistent across segment boundaries", () => {
    const rows = runStressPath(base, STRESS_SCENARIOS[0]!.segments);
    expect(validateProjection(rows)).toEqual([]);
    expect(rows).toHaveLength(base.years);
    expect(rows[0]!.year).toBe(2026);
    expect(rows[9]!.year).toBe(2035);
    expect(rows[9]!.age).toBe(44);
  });

  it("applies the instant shock to opening balances", () => {
    const rows = runStressPath(base, [{ years: 1, instantShockPct: { equity: -50 } }]);
    expect(rows[0]!.opening).toBeCloseTo(500_000 + 500_000, 2);
  });

  it("stops contributions when the multiplier is zero", () => {
    const rows = runStressPath(base, [{ years: 2, contributionMultiplier: 0 }]);
    expect(rows[0]!.contribution).toBe(0);
    expect(rows[1]!.contribution).toBe(0);
    expect(rows[2]!.contribution).toBeGreaterThan(0);
  });

  it("accumulates invested totals across segments", () => {
    const rows = runStressPath(base, [{ years: 2, contributionMultiplier: 0 }]);
    const last = rows[rows.length - 1]!;
    expect(last.totalInvested).toBeCloseTo(8 * 12 * 30_000, 2);
  });
});

describe("stress scenarios", () => {
  it("every built-in scenario leaves the portfolio worse than the baseline", () => {
    const baseline = project(base);
    for (const scenario of STRESS_SCENARIOS) {
      const result = runStressScenario(base, scenario, baseline);
      expect(result.terminalValue).toBeLessThan(baseline[baseline.length - 1]!.closing);
      expect(result.deltaVsBaselinePct).toBeLessThan(0);
      expect(validateProjection(result.rows)).toEqual([]);
    }
  });

  it("reports a drawdown and a recovery time for a crash", () => {
    const crash = STRESS_SCENARIOS.find((s) => s.id === "equity_crash")!;
    const result = runStressScenario(base, crash);
    expect(result.maxDrawdownPct).toBeGreaterThan(10);
    expect(result.yearsToRecover).not.toBeNull();
  });

  it("reports no drawdown when contributions merely pause", () => {
    const incomeLoss = STRESS_SCENARIOS.find((s) => s.id === "income_loss")!;
    const result = runStressScenario(base, incomeLoss);
    expect(result.maxDrawdownPct).toBe(0);
    expect(result.yearsToRecover).toBe(0);
  });

  it("can exhaust a portfolio that is already withdrawing", () => {
    const withdrawing: ProjectionInput = {
      ...base,
      startingValues: values({ equity: 1_000_000 }),
      monthlyContribution: values({}),
      years: 15,
      decumulation: { retirementAge: 35, annualSpendToday: 400_000 },
    };
    const crash = STRESS_SCENARIOS.find((s) => s.id === "equity_crash")!;
    const result = runStressScenario(withdrawing, crash);
    expect(result.survives).toBe(false);
    expect(result.depletionYear).not.toBeNull();
  });
});
