/**
 * Action centre: ranks what actually needs a decision, with the evidence used
 * to reach each conclusion. Pure — every number arrives already calculated by
 * the finance engine; nothing here fetches, formats currency, or guesses.
 */
import { formatCompactRupees, formatPct, formatRupees } from "./format";
import type { GoalAnalysis } from "./goals";
import type { RebalanceRow } from "./portfolio";
import type { MissingInput } from "./strategy";

export type ActionSeverity = "critical" | "attention" | "opportunity";

export type ActionEvidence = { label: string; value: string };

/** Destinations are constrained so the UI can link type-safely. */
export type ActionTarget = "/portfolio" | "/goals" | "/plan" | "/inputs" | "/projections";

export type ActionItem = {
  id: string;
  severity: ActionSeverity;
  /** Short, declarative sentence stating the finding. */
  headline: string;
  /** Why it matters and what the decision is. */
  detail: string;
  /** The calculated inputs behind the finding. Always shown on expand. */
  evidence: ActionEvidence[];
  action: { label: string; to: ActionTarget } | null;
  /** Ranking weight; higher sorts first. */
  score: number;
};

export type ActionCentreInput = {
  /** Months of essential expenses covered by liquid assets; null when unknown. */
  emergencyCoverageMonths: number | null;
  emergencyTargetMonths: number;
  liquidValue: number;
  essentialMonthlyExpenses: number | null;
  monthlySip: number;
  savingsRatePct: number | null;
  rebalanceRows: RebalanceRow[];
  goals: GoalAnalysis[];
  /** Holdings whose price has not refreshed inside the freshness window. */
  staleHoldings: { name: string; lastUpdated: string | null }[];
  missingInputs: MissingInput[];
  totalValue: number;
  /** Number of recorded ledger events; drives the XIRR-quality finding. */
  transactionCount?: number;
};

const SEVERITY_WEIGHT: Record<ActionSeverity, number> = {
  critical: 1000,
  attention: 500,
  opportunity: 100,
};

function item(
  severity: ActionSeverity,
  bump: number,
  rest: Omit<ActionItem, "severity" | "score">,
): ActionItem {
  return { ...rest, severity, score: SEVERITY_WEIGHT[severity] + bump };
}

export function buildActionCentre(input: ActionCentreInput): ActionItem[] {
  const out: ActionItem[] = [];

  // 1. Liquidity before growth.
  if (input.emergencyCoverageMonths !== null && input.essentialMonthlyExpenses !== null) {
    const cover = input.emergencyCoverageMonths;
    const target = input.emergencyTargetMonths;
    if (cover < target) {
      const shortfall = Math.max(0, (target - cover) * input.essentialMonthlyExpenses);
      const half = cover < target / 2;
      out.push(
        item(half ? "critical" : "attention", Math.min(99, (target - cover) * 10), {
          id: "emergency-fund",
          headline: `Emergency fund covers ${cover.toFixed(1)} of ${target} months`,
          detail: `Top up liquid assets by ${formatCompactRupees(shortfall)} before adding market risk. Until then, a job gap forces selling investments at whatever price the market offers.`,
          evidence: [
            { label: "Liquid assets", value: formatCompactRupees(input.liquidValue) },
            { label: "Essential monthly spend", value: formatRupees(input.essentialMonthlyExpenses) },
            { label: "Target months", value: `${target}` },
            { label: "Shortfall", value: formatCompactRupees(shortfall) },
          ],
          action: { label: "Review holdings", to: "/portfolio" },
        }),
      );
    }
  }

  // 2. Allocation drift — only where the correction is financially material.
  // A percentage gap on a small portfolio is arithmetic, not a decision.
  const driftFloor = Math.max(25000, input.totalValue * 0.02);
  const drifted = input.rebalanceRows
    .filter((r) => r.status !== "on_target" && Math.abs(r.deltaValue) >= driftFloor)
    .sort((a, b) => Math.abs(b.deltaValue) - Math.abs(a.deltaValue));
  drifted.slice(0, 2).forEach((r, index) => {
    const above = r.deltaPct > 0;
    out.push(
      item("attention", Math.max(1, 60 - index * 10), {
        id: `drift-${r.assetClass}`,
        headline: `${r.assetClass} is ${formatPct(Math.abs(r.deltaPct))} ${above ? "above" : "below"} target`,
        detail: above
          ? `Trim ${formatCompactRupees(Math.abs(r.deltaValue))} of ${r.assetClass}, or steer new contributions elsewhere until the weight returns to plan. Selling has a tax cost; redirecting fresh money does not.`
          : `Direct ${formatCompactRupees(Math.abs(r.deltaValue))} of new contributions into ${r.assetClass} to close the gap without selling anything.`,
        evidence: [
          { label: "Current weight", value: formatPct(r.currentPct) },
          { label: "Target weight", value: formatPct(r.targetPct) },
          { label: "Current value", value: formatCompactRupees(r.currentValue) },
          { label: "Target value", value: formatCompactRupees(r.targetValue) },
        ],
        action: { label: "Open portfolio", to: "/portfolio" },
      }),
    );
  });

  // 3. Goals that cannot be funded on the current plan.
  const shortGoals = input.goals
    .filter((g) => g.status === "shortfall" || g.status === "at_risk")
    .sort((a, b) => (b.gap ?? 0) - (a.gap ?? 0));
  for (const g of shortGoals.slice(0, 3)) {
    out.push(
      item(g.status === "shortfall" ? "critical" : "attention", Math.min(99, (g.gap ?? 0) / 100000), {
        id: `goal-${g.id}`,
        headline: `${g.name} is ${formatPct(g.fundedPct ?? 0, 0)} funded`,
        detail: `Closing the gap needs ${formatRupees(g.requiredMonthlySip ?? 0)} a month from today${
          g.yearsToGoal !== null ? ` for ${Math.max(0, g.yearsToGoal).toFixed(1)} years` : ""
        }. The alternative levers are a later date or a smaller target.`,
        evidence: [
          { label: "Cost at target date", value: formatCompactRupees(g.futureCost ?? 0) },
          { label: "Earmarked savings grow to", value: formatCompactRupees(g.projectedSavings ?? 0) },
          { label: "Gap", value: formatCompactRupees(g.gap ?? 0) },
          { label: "Required monthly", value: formatRupees(g.requiredMonthlySip ?? 0) },
        ],
        action: { label: "Open goals", to: "/goals" },
      }),
    );
  }

  // 4. Stale prices — valuation confidence, not a market call.
  if (input.staleHoldings.length > 0) {
    out.push(
      item("attention", 5, {
        id: "stale-prices",
        headline: `${input.staleHoldings.length} price${input.staleHoldings.length > 1 ? "s are" : " is"} out of date`,
        detail:
          "These valuations still count towards totals but are flagged everywhere they appear. Refresh them before acting on drift or tax numbers.",
        evidence: input.staleHoldings.slice(0, 5).map((h) => ({
          label: h.name,
          value: h.lastUpdated ? `last ${h.lastUpdated}` : "never priced",
        })),
        action: { label: "Refresh prices", to: "/portfolio" },
      }),
    );
  }

  // 5. No contributions recorded.
  if (input.monthlySip <= 0) {
    out.push(
      item("opportunity", 20, {
        id: "no-sip",
        headline: "No recurring contributions recorded",
        detail:
          "Projections currently grow only what you already own. Record your SIPs so the forecast reflects the money you actually add each month.",
        evidence: [
          { label: "Monthly contribution", value: formatRupees(0) },
          { label: "Portfolio value", value: formatCompactRupees(input.totalValue) },
        ],
        action: { label: "Add a SIP", to: "/plan" },
      }),
    );
  } else if (input.savingsRatePct !== null && input.savingsRatePct > 0 && input.monthlySip > 0) {
    const surplus = input.savingsRatePct;
    if (surplus > 20) {
      out.push(
        item("opportunity", 10, {
          id: "savings-headroom",
          headline: `Savings rate is ${formatPct(surplus)}`,
          detail:
            "A surplus this size compounds hardest when it is automated. Check whether the monthly amount recorded here matches what is actually being invested.",
          evidence: [
            { label: "Savings rate", value: formatPct(surplus) },
            { label: "Recorded monthly investing", value: formatRupees(input.monthlySip) },
          ],
          action: { label: "Review plan", to: "/plan" },
        }),
      );
    }
  }

  // 6. No ledger means every return figure is an estimate.
  if (input.transactionCount !== undefined && input.transactionCount === 0 && input.totalValue > 0) {
    out.push(
      item("opportunity", 40, {
        id: "no-transactions",
        headline: "No transaction history recorded",
        detail:
          "Returns, realised gains and tax are estimated from purchase dates until real cash flows exist. Importing a broker statement replaces the estimate with a true XIRR.",
        evidence: [
          { label: "Recorded transactions", value: "0" },
          { label: "Portfolio value", value: formatCompactRupees(input.totalValue) },
          { label: "Current return basis", value: "Estimated from purchase dates" },
        ],
        action: { label: "Import statements", to: "/portfolio" },
      }),
    );
  }

  // 7. Missing inputs weaken every downstream number.
  if (input.missingInputs.length > 0) {
    out.push(
      item("opportunity", 30, {
        id: "missing-inputs",
        headline: `${input.missingInputs.length} input${input.missingInputs.length > 1 ? "s" : ""} still missing`,
        detail:
          "Targets and projections fall back to defaults without these. Filling them in changes the recommended allocation, not just the labels.",
        evidence: input.missingInputs.map((m) => ({ label: m.field, value: m.whyItMatters })),
        action: { label: "Complete inputs", to: "/inputs" },
      }),
    );
  }

  return out.sort((a, b) => b.score - a.score);
}

/** Highest-severity level present, for a single-line summary. */
export function actionCentreTone(items: ActionItem[]): "critical" | "attention" | "opportunity" | "clear" {
  if (items.some((i) => i.severity === "critical")) return "critical";
  if (items.some((i) => i.severity === "attention")) return "attention";
  if (items.length > 0) return "opportunity";
  return "clear";
}
