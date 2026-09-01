import { describe, expect, it } from "vitest";
import { actionCentreTone, buildActionCentre, type ActionCentreInput } from "../attention";
import type { RebalanceRow } from "../portfolio";
import type { GoalAnalysis } from "../goals";

const base: ActionCentreInput = {
  emergencyCoverageMonths: null,
  emergencyTargetMonths: 6,
  liquidValue: 0,
  essentialMonthlyExpenses: null,
  monthlySip: 25000,
  savingsRatePct: 10,
  rebalanceRows: [],
  goals: [],
  staleHoldings: [],
  missingInputs: [],
  totalValue: 1000000,
};

const drift = (over: Partial<RebalanceRow>): RebalanceRow => ({
  assetClass: "equity",
  currentPct: 80,
  targetPct: 65,
  deltaPct: 15,
  currentValue: 800000,
  targetValue: 650000,
  deltaValue: -150000,
  status: "above",
  ...over,
});

const goal = (over: Partial<GoalAnalysis>): GoalAnalysis => ({
  id: "g1",
  name: "Home",
  priority: null,
  yearsToGoal: 7,
  futureCost: 10000000,
  projectedSavings: 2000000,
  gap: 8000000,
  fundedPct: 20,
  requiredMonthlySip: 60000,
  status: "shortfall",
  notes: [],
  ...over,
});

describe("buildActionCentre", () => {
  it("returns nothing when everything is settled", () => {
    expect(buildActionCentre(base)).toHaveLength(0);
    expect(actionCentreTone([])).toBe("clear");
  });

  it("flags an emergency fund below half the target as critical", () => {
    const items = buildActionCentre({
      ...base,
      emergencyCoverageMonths: 2,
      essentialMonthlyExpenses: 100000,
      liquidValue: 200000,
    });
    const ef = items.find((i) => i.id === "emergency-fund");
    expect(ef?.severity).toBe("critical");
    expect(ef?.evidence.some((e) => e.label === "Shortfall")).toBe(true);
  });

  it("treats a mild emergency shortfall as attention, not critical", () => {
    const items = buildActionCentre({
      ...base,
      emergencyCoverageMonths: 5,
      essentialMonthlyExpenses: 100000,
      liquidValue: 500000,
    });
    expect(items.find((i) => i.id === "emergency-fund")?.severity).toBe("attention");
  });

  it("does not flag a funded emergency fund", () => {
    const items = buildActionCentre({
      ...base,
      emergencyCoverageMonths: 8,
      essentialMonthlyExpenses: 100000,
      liquidValue: 800000,
    });
    expect(items.find((i) => i.id === "emergency-fund")).toBeUndefined();
  });

  it("ranks drift by rupee size and skips on-target rows", () => {
    const items = buildActionCentre({
      ...base,
      rebalanceRows: [
        drift({ assetClass: "gold", deltaPct: 2, deltaValue: -20000, status: "on_target" }),
        drift({ assetClass: "debt", deltaPct: -8, deltaValue: 300000, status: "below" }),
        drift({}),
      ],
    });
    const ids = items.filter((i) => i.id.startsWith("drift-")).map((i) => i.id);
    expect(ids).toEqual(["drift-debt", "drift-equity"]);
  });

  it("surfaces under-funded goals with the required SIP as evidence", () => {
    const items = buildActionCentre({ ...base, goals: [goal({}), goal({ id: "g2", status: "on_track" })] });
    const g = items.find((i) => i.id === "goal-g1");
    expect(g?.severity).toBe("critical");
    expect(g?.evidence.find((e) => e.label === "Required monthly")?.value).toContain("60,000");
    expect(items.find((i) => i.id === "goal-g2")).toBeUndefined();
  });

  it("flags stale prices and lists at most five as evidence", () => {
    const items = buildActionCentre({
      ...base,
      staleHoldings: Array.from({ length: 7 }, (_, i) => ({ name: `H${i}`, lastUpdated: "3 d ago" })),
    });
    const stale = items.find((i) => i.id === "stale-prices");
    expect(stale?.headline).toContain("7 prices");
    expect(stale?.evidence).toHaveLength(5);
  });

  it("prompts for contributions when none are recorded", () => {
    const items = buildActionCentre({ ...base, monthlySip: 0 });
    expect(items.find((i) => i.id === "no-sip")?.severity).toBe("opportunity");
  });

  it("sorts critical items above attention and opportunity", () => {
    const items = buildActionCentre({
      ...base,
      emergencyCoverageMonths: 1,
      essentialMonthlyExpenses: 100000,
      liquidValue: 100000,
      rebalanceRows: [drift({})],
      missingInputs: [{ field: "Current age", whyItMatters: "Sets the horizon." }],
    });
    expect(items.map((i) => i.severity)).toEqual(["critical", "attention", "opportunity"]);
    expect(actionCentreTone(items)).toBe("critical");
  });

  it("never fabricates emergency-fund maths without essential expenses", () => {
    const items = buildActionCentre({ ...base, emergencyCoverageMonths: 1, essentialMonthlyExpenses: null });
    expect(items.find((i) => i.id === "emergency-fund")).toBeUndefined();
  });
});

describe("materiality", () => {
  const base = {
    emergencyCoverageMonths: null,
    emergencyTargetMonths: 6,
    liquidValue: 0,
    essentialMonthlyExpenses: null,
    monthlySip: 10000,
    savingsRatePct: null,
    goals: [],
    staleHoldings: [],
    missingInputs: [],
  };

  const row = (deltaValue: number, deltaPct: number) => ({
    assetClass: "debt" as const,
    currentPct: 100,
    targetPct: 100 - deltaPct,
    currentValue: deltaValue,
    targetValue: 0,
    deltaPct,
    deltaValue,
    status: "above" as const,
    action: "trim" as const,
  });

  it("stays quiet about drift that is too small to be worth a trade", () => {
    const items = buildActionCentre({ ...base, rebalanceRows: [row(8000, 40)], totalValue: 100000 });
    expect(items.some((i) => i.id.startsWith("drift-"))).toBe(false);
  });

  it("raises drift once the correction is financially significant", () => {
    const items = buildActionCentre({ ...base, rebalanceRows: [row(400000, 20)], totalValue: 2000000 });
    expect(items.some((i) => i.id.startsWith("drift-"))).toBe(true);
  });

  it("flags an empty ledger so returns are not mistaken for measured ones", () => {
    const items = buildActionCentre({ ...base, rebalanceRows: [], totalValue: 500000, transactionCount: 0 });
    const found = items.find((i) => i.id === "no-transactions");
    expect(found?.evidence.some((e) => e.value.includes("Estimated"))).toBe(true);
  });
});
