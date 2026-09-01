import { describe, expect, it } from "vitest";
import { buildRebalancePlan, contributionSplitToTarget } from "../rebalance";
import type { RebalanceRow } from "../portfolio";

function row(p: Partial<RebalanceRow>): RebalanceRow {
  return {
    assetClass: "equity",
    currentPct: 0,
    targetPct: 0,
    deltaPct: 0,
    currentValue: 0,
    targetValue: 0,
    deltaValue: 0,
    status: "on_target",
    ...p,
  } as RebalanceRow;
}

const rows: RebalanceRow[] = [
  row({ assetClass: "equity", currentPct: 78, targetPct: 70, deltaPct: 8, currentValue: 780000, targetValue: 700000, deltaValue: -80000, status: "above" }),
  row({ assetClass: "debt", currentPct: 22, targetPct: 30, deltaPct: -8, currentValue: 220000, targetValue: 300000, deltaValue: 80000, status: "below" }),
];

describe("buildRebalancePlan", () => {
  it("produces sell and buy legs above the threshold", () => {
    const plan = buildRebalancePlan({ rows, totalValue: 1000000, monthlyContribution: 20000 });
    expect(plan.breached).toBe(true);
    expect(plan.actions).toHaveLength(2);
    expect(plan.actions.find((a) => a.assetClass === "equity")!.direction).toBe("sell");
    expect(plan.tradeValue).toBeCloseTo(80000);
    expect(plan.turnoverPct).toBeCloseTo(8);
  });

  it("offers a contribution route instead of selling", () => {
    const plan = buildRebalancePlan({ rows, totalValue: 1000000, monthlyContribution: 20000 });
    expect(plan.contributionRoute.monthsToCorrect).toBe(4);
    expect(plan.taxNote).toBeTruthy();
  });

  it("reports no route when there is no recurring contribution", () => {
    const plan = buildRebalancePlan({ rows, totalValue: 1000000, monthlyContribution: 0 });
    expect(plan.contributionRoute.monthsToCorrect).toBeNull();
  });

  it("treats drift inside the threshold as no action", () => {
    const tight: RebalanceRow[] = [
      row({ assetClass: "equity", currentPct: 72, targetPct: 70, deltaPct: 2, currentValue: 720000, targetValue: 700000, deltaValue: -20000 }),
      row({ assetClass: "debt", currentPct: 28, targetPct: 30, deltaPct: -2, currentValue: 280000, targetValue: 300000, deltaValue: 20000 }),
    ];
    const plan = buildRebalancePlan({ rows: tight, totalValue: 1000000, monthlyContribution: 10000 });
    expect(plan.breached).toBe(false);
    expect(plan.actions).toHaveLength(0);
    expect(plan.tradeValue).toBe(0);
  });
});

describe("contributionSplitToTarget", () => {
  it("weights new money by shortfall", () => {
    const split = contributionSplitToTarget(rows, 20000);
    expect(split.debt).toBeCloseTo(20000);
    expect(split.equity).toBe(0);
  });

  it("returns zeros when nothing is below target", () => {
    const split = contributionSplitToTarget([rows[0]!], 20000);
    expect(Object.values(split).every((v) => v === 0)).toBe(true);
  });
});
