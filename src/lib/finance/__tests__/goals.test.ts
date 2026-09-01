import { describe, expect, it } from "vitest";
import { analyseGoal, blendedReturn, summariseGoalFunding, yearsUntil, type GoalLike } from "../goals";

const NOW = new Date("2026-01-01T00:00:00Z");
const DEFAULTS = { inflation: 6, expectedReturn: 10 };

function goal(over: Partial<GoalLike> = {}): GoalLike {
  return {
    id: "g1",
    name: "Car",
    current_cost: 1_000_000,
    target_date: "2031-01-01",
    inflation_pct: 6,
    current_savings: 0,
    expected_return_pct: 10,
    priority: "medium",
    ...over,
  };
}

describe("yearsUntil", () => {
  it("returns null without a date", () => {
    expect(yearsUntil(null, NOW)).toBeNull();
  });
  it("measures roughly five years", () => {
    expect(yearsUntil("2031-01-01", NOW)).toBeCloseTo(5, 1);
  });
});

describe("analyseGoal", () => {
  it("inflates the cost and requires a SIP when unfunded", () => {
    const a = analyseGoal(goal(), DEFAULTS, NOW);
    expect(a.futureCost).toBeGreaterThan(1_300_000);
    expect(a.futureCost).toBeLessThan(1_360_000);
    expect(a.requiredMonthlySip).toBeGreaterThan(0);
    expect(a.status).toBe("shortfall");
  });

  it("marks a fully funded goal on track with no SIP", () => {
    const a = analyseGoal(goal({ current_savings: 2_000_000 }), DEFAULTS, NOW);
    expect(a.gap!).toBeLessThan(0);
    expect(a.requiredMonthlySip).toBe(0);
    expect(a.status).toBe("on_track");
  });

  it("flags a goal that is mostly funded as at risk", () => {
    const a = analyseGoal(goal({ current_savings: 700_000 }), DEFAULTS, NOW);
    expect(a.fundedPct!).toBeGreaterThan(70);
    expect(a.status).toBe("at_risk");
  });

  it("falls back to scenario defaults and says so", () => {
    const a = analyseGoal(goal({ inflation_pct: null, expected_return_pct: null }), DEFAULTS, NOW);
    expect(a.notes.join(" ")).toContain("6%");
    expect(a.notes.join(" ")).toContain("10%");
  });

  it("returns unknown without a target date", () => {
    const a = analyseGoal(goal({ target_date: null }), DEFAULTS, NOW);
    expect(a.status).toBe("unknown");
    expect(a.futureCost).toBeNull();
  });

  it("warns about equity returns on a short horizon", () => {
    const a = analyseGoal(goal({ target_date: "2027-06-01" }), DEFAULTS, NOW);
    expect(a.notes.some((n) => n.includes("under 3 years"))).toBe(true);
  });
});

describe("summariseGoalFunding", () => {
  it("computes coverage from planned contributions", () => {
    const analyses = [analyseGoal(goal(), DEFAULTS, NOW), analyseGoal(goal({ id: "g2" }), DEFAULTS, NOW)];
    const s = summariseGoalFunding(analyses, 10_000);
    expect(s.totalRequiredSip).toBeGreaterThan(0);
    expect(s.coveragePct).toBeCloseTo((10_000 / s.totalRequiredSip) * 100, 6);
  });

  it("has no coverage figure when nothing is required", () => {
    expect(summariseGoalFunding([], 5000).coveragePct).toBeNull();
  });
});

describe("custom allocation", () => {
  it("blends equity and debt returns linearly", () => {
    expect(blendedReturn(100, 12, 7)).toBeCloseTo(12, 10);
    expect(blendedReturn(0, 12, 7)).toBeCloseTo(7, 10);
    expect(blendedReturn(60, 12, 7)).toBeCloseTo(10, 10);
  });

  it("uses the blended return when no explicit goal return is set", () => {
    const goal = {
      id: "g1",
      name: "Car",
      current_cost: 1_000_000,
      target_date: "2036-01-01",
      inflation_pct: null,
      current_savings: 500_000,
      expected_return_pct: null,
      priority: "medium",
      equity_allocation_pct: 0,
    };
    const withAlloc = analyseGoal(goal, { inflation: 5, expectedReturn: 12, debtReturn: 7 }, new Date("2026-01-01"));
    const withoutAlloc = analyseGoal(
      { ...goal, equity_allocation_pct: null },
      { inflation: 5, expectedReturn: 12, debtReturn: 7 },
      new Date("2026-01-01"),
    );
    expect(withAlloc.projectedSavings!).toBeLessThan(withoutAlloc.projectedSavings!);
  });

  it("an explicit goal return still wins over the allocation", () => {
    const a = analyseGoal(
      {
        id: "g2",
        name: "Home",
        current_cost: 1_000_000,
        target_date: "2036-01-01",
        inflation_pct: null,
        current_savings: 100_000,
        expected_return_pct: 9,
        priority: "high",
        equity_allocation_pct: 0,
      },
      { inflation: 5, expectedReturn: 12, debtReturn: 7 },
      new Date("2026-01-01"),
    );
    expect(a.projectedSavings).toBeCloseTo(100_000 * 1.09 ** a.yearsToGoal!, 0);
  });
});
