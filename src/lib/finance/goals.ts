import { futureValue, inflatedCost, requiredMonthlySip } from "./core";

export type GoalLike = {
  id: string;
  name: string;
  current_cost: number;
  target_date: string | null;
  inflation_pct: number | null;
  current_savings: number;
  expected_return_pct: number | null;
  priority: string | null;
  /** Optional custom equity share (0-100). Blends into an expected return when no explicit return is set. */
  equity_allocation_pct?: number | null;
};

/**
 * Expected return implied by an equity/debt split.
 * Pure and linear: allocation is a weighted blend of the two scenario returns.
 */
export function blendedReturn(equityPct: number, equityReturn: number, debtReturn: number): number {
  const w = Math.min(100, Math.max(0, equityPct)) / 100;
  return equityReturn * w + debtReturn * (1 - w);
}

export type GoalAnalysis = {
  id: string;
  name: string;
  priority: string | null;
  yearsToGoal: number | null;
  /** Cost at the target date after goal-specific inflation. */
  futureCost: number | null;
  /** What today's earmarked savings grow into by the target date. */
  projectedSavings: number | null;
  gap: number | null;
  fundedPct: number | null;
  requiredMonthlySip: number | null;
  status: "on_track" | "at_risk" | "shortfall" | "unknown";
  notes: string[];
};

const MS_PER_YEAR = 365.2425 * 24 * 60 * 60 * 1000;

export function yearsUntil(targetDate: string | null, now = new Date()): number | null {
  if (!targetDate) return null;
  const t = new Date(`${targetDate}T00:00:00Z`).getTime();
  if (Number.isNaN(t)) return null;
  return (t - now.getTime()) / MS_PER_YEAR;
}

export function analyseGoal(
  goal: GoalLike,
  defaults: { inflation: number; expectedReturn: number; debtReturn?: number },
  now = new Date(),
): GoalAnalysis {
  const notes: string[] = [];
  const years = yearsUntil(goal.target_date, now);
  const inflation = goal.inflation_pct ?? defaults.inflation;
  const alloc = goal.equity_allocation_pct ?? null;
  const allocReturn =
    alloc === null ? null : blendedReturn(alloc, defaults.expectedReturn, defaults.debtReturn ?? defaults.expectedReturn);
  const ret = goal.expected_return_pct ?? allocReturn ?? defaults.expectedReturn;
  if (goal.inflation_pct === null) notes.push(`Using scenario inflation of ${inflation}% — no goal-specific rate set.`);
  if (goal.expected_return_pct === null && allocReturn !== null) {
    notes.push(`Return of ${ret.toFixed(2)}% derived from a ${alloc}% equity allocation.`);
  } else if (goal.expected_return_pct === null) {
    notes.push(`Using ${ret}% expected return — no goal-specific return set.`);
  }

  if (years === null) {
    notes.push("No target date set, so timing-dependent maths cannot run.");
    return {
      id: goal.id,
      name: goal.name,
      priority: goal.priority,
      yearsToGoal: null,
      futureCost: null,
      projectedSavings: null,
      gap: null,
      fundedPct: null,
      requiredMonthlySip: null,
      status: "unknown",
      notes,
    };
  }

  const horizon = Math.max(years, 0);
  if (years <= 0) notes.push("Target date has passed — the numbers below are as of today.");

  const futureCost = inflatedCost(goal.current_cost, inflation, horizon);
  const projectedSavings = futureValue(goal.current_savings, ret, horizon);
  const gap = futureCost - projectedSavings;
  const fundedPct = futureCost > 0 ? (projectedSavings / futureCost) * 100 : 100;
  const sip = gap > 0 && horizon > 0 ? requiredMonthlySip(gap, ret, horizon) : 0;

  const status: GoalAnalysis["status"] =
    gap <= 0 ? "on_track" : fundedPct >= 70 ? "at_risk" : "shortfall";

  if (horizon > 0 && horizon < 3 && ret > 8) {
    notes.push("Horizon under 3 years with an equity-like return assumption — consider a safer return for this goal.");
  }

  return {
    id: goal.id,
    name: goal.name,
    priority: goal.priority,
    yearsToGoal: years,
    futureCost,
    projectedSavings,
    gap,
    fundedPct,
    requiredMonthlySip: sip,
    status,
    notes,
  };
}

export function analyseGoals(
  goals: GoalLike[],
  defaults: { inflation: number; expectedReturn: number; debtReturn?: number },
  now = new Date(),
): GoalAnalysis[] {
  return goals.map((g) => analyseGoal(g, defaults, now));
}

export type GoalFundingSummary = {
  totalRequiredSip: number;
  totalFutureCost: number;
  totalProjected: number;
  totalGap: number;
  /** Share of the required SIP that current planned contributions can cover. */
  coveragePct: number | null;
};

export function summariseGoalFunding(
  analyses: GoalAnalysis[],
  plannedMonthly: number,
): GoalFundingSummary {
  const totalRequiredSip = analyses.reduce((a, g) => a + (g.requiredMonthlySip ?? 0), 0);
  const totalFutureCost = analyses.reduce((a, g) => a + (g.futureCost ?? 0), 0);
  const totalProjected = analyses.reduce((a, g) => a + (g.projectedSavings ?? 0), 0);
  const totalGap = analyses.reduce((a, g) => a + Math.max(g.gap ?? 0, 0), 0);
  return {
    totalRequiredSip,
    totalFutureCost,
    totalProjected,
    totalGap,
    coveragePct: totalRequiredSip > 0 ? (plannedMonthly / totalRequiredSip) * 100 : null,
  };
}
