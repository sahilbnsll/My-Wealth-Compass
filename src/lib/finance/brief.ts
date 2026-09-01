/**
 * Portfolio brief: the single structured, already-calculated view of a
 * workspace that the AI narrative layer is allowed to see.
 *
 * Every number here comes from the finance engine. Nothing in this module
 * fetches data, and nothing downstream (including the model) is permitted to
 * recompute a figure — the AI may only reference `facts` by id.
 */
import { emergencyCoverageMonths, savingsRate } from "./core";
import { formatCompactRupees, formatPct, formatRupees } from "./format";
import { analyseGoals, summariseGoalFunding, type GoalAnalysis, type GoalLike } from "./goals";
import {
  concentrationWarnings,
  contributionByAssetClass,
  monthlyContribution,
  rebalance,
  summarisePortfolio,
  type PortfolioSummary,
  type RebalanceRow,
  xirrLabel,
} from "./portfolio";
import { project, type ProjectionYear } from "./projection";
import { buildActionCentre, type ActionItem } from "./attention";
import type { Transaction } from "./ledger";
import { buildTargetAllocation, recommendedEmergencyMonths } from "./strategy";
import { ASSET_CLASSES, type AssetClass, type Assumptions, type Holding, type PlannedInvestment, type Profile } from "./types";

/** A single calculated fact the narrative layer can cite by id. */
export type BriefFact = {
  id: string;
  label: string;
  /** Human-readable, already formatted for display. */
  value: string;
  /** Raw number where one exists, for charts and parity checks. */
  raw: number | null;
  /** Where the figure came from in the engine. */
  basis: string;
};

export type PortfolioBrief = {
  generatedAt: string;
  hasData: boolean;
  facts: BriefFact[];
  actions: ActionItem[];
  goals: GoalAnalysis[];
  rebalance: RebalanceRow[];
  concentration: { name: string; detail: string }[];
  /** Gaps the engine could not fill; the narrative must not invent them. */
  unknowns: string[];
  summary: PortfolioSummary;
  retirementRun: ProjectionYear[] | null;
};

export type BriefInput = {
  profile: Profile;
  holdings: Holding[];
  planned: PlannedInvestment[];
  goals: GoalLike[];
  assumptions: Assumptions;
  /** Real cash flows, when recorded: they make XIRR true rather than estimated. */
  transactions?: Transaction[];
  now?: Date;
};

function fact(id: string, label: string, value: string, raw: number | null, basis: string): BriefFact {
  return { id, label, value, raw, basis };
}

/** Builds the calculated context. Pure: same input, same brief. */
export function buildPortfolioBrief(input: BriefInput): PortfolioBrief {
  const now = input.now ?? new Date();
  const { profile, holdings, planned, assumptions } = input;

  const summary = summarisePortfolio(holdings, input.transactions);
  const monthly = monthlyContribution(planned);
  const contributions = contributionByAssetClass(planned);

  const essential = profile.essential_monthly_expenses ?? profile.monthly_expenses;
  const emergency = recommendedEmergencyMonths(profile);
  const coverage = essential ? emergencyCoverageMonths(summary.liquidValue, essential) : null;
  const emergencyCovered = coverage !== null && coverage >= emergency.months;

  const allocation = buildTargetAllocation(profile, emergencyCovered);
  const rebalanceRows = rebalance(summary, allocation.target, 5);
  const concentration = concentrationWarnings(summary).map((w) => ({ name: w.scope, detail: w.message }));

  const rate =
    profile.monthly_income && profile.monthly_expenses
      ? savingsRate(profile.monthly_income, profile.monthly_expenses)
      : null;

  const goalAnalyses = analyseGoals(input.goals, {
    inflation: assumptions.inflation,
    expectedReturn: assumptions.equity_return,
  });
  const goalFunding = summariseGoalFunding(goalAnalyses, monthly);

  const startValues = Object.fromEntries(ASSET_CLASSES.map((c) => [c, 0])) as Record<AssetClass, number>;
  for (const c of ASSET_CLASSES) startValues[c] = summary.valueByAssetClass[c];

  const startAge = profile.current_age;
  const retire = profile.retirement_age;
  const yearsToRetire = startAge !== null && retire !== null ? Math.max(0, Math.round(retire - startAge)) : null;

  const retirementRun =
    yearsToRetire && yearsToRetire > 0
      ? project({
          startingValues: startValues,
          monthlyContribution: contributions,
          assumptions,
          startYear: now.getFullYear(),
          years: yearsToRetire,
          startAge,
          investedToDate: summary.invested,
        })
      : null;
  const atRetirement = retirementRun?.[retirementRun.length - 1] ?? null;

  const staleHoldings = holdings
    .filter((h) => h.price_source !== "manual" && !h.price_updated_at)
    .map((h) => ({ name: h.name, lastUpdated: null as string | null }));

  const actions = buildActionCentre({
    emergencyCoverageMonths: coverage,
    emergencyTargetMonths: emergency.months,
    liquidValue: summary.liquidValue,
    essentialMonthlyExpenses: essential ?? null,
    monthlySip: monthly,
    savingsRatePct: rate,
    rebalanceRows,
    goals: goalAnalyses,
    staleHoldings,
    missingInputs: allocation.missing,
    totalValue: summary.totalValue,
  });

  const facts: BriefFact[] = [
    fact("total_value", "Portfolio value", formatRupees(summary.totalValue), summary.totalValue, "Sum of valued holdings"),
    fact("invested", "Invested capital", formatRupees(summary.invested), summary.invested, "Cost basis across holdings"),
    fact(
      "unrealised_gain",
      "Unrealised gain",
      formatRupees(summary.unrealisedGain),
      summary.unrealisedGain,
      "Value less cost basis",
    ),
    fact(
      "unrealised_gain_pct",
      "Unrealised gain %",
      formatPct(summary.unrealisedGainPct),
      summary.unrealisedGainPct,
      "Gain over invested capital",
    ),
    fact(
      "xirr",
      summary.xirrBasis === "ledger" ? "Money-weighted return (XIRR)" : "Money-weighted return (estimated XIRR)",
      formatPct(summary.xirrPct),
      summary.xirrPct,
      xirrLabel(summary.xirrBasis, summary.xirrCoveragePct).source,
    ),
    fact("monthly_sip", "Monthly commitment", formatRupees(monthly), monthly, "Active planned investments, normalised to monthly"),
    fact(
      "savings_rate",
      "Savings rate",
      formatPct(rate),
      rate,
      "Income less expenses, over income",
    ),
    fact(
      "emergency_coverage",
      "Emergency coverage",
      coverage === null ? "—" : `${coverage.toFixed(1)} months`,
      coverage,
      "Liquid assets over essential monthly expenses",
    ),
    fact(
      "emergency_target",
      "Emergency target",
      `${emergency.months} months`,
      emergency.months,
      emergency.reasons.join("; ") || "Baseline target",
    ),
    fact(
      "goals_on_track",
      "Goals on track",
      `${goalAnalyses.filter((g) => g.status === "on_track").length} of ${goalAnalyses.length}`,
      goalAnalyses.filter((g) => g.status === "on_track").length,
      "Per-goal projected savings against inflated cost",
    ),
    fact(
      "goal_required_sip",
      "SIP required by goals",
      formatRupees(goalFunding.totalRequiredSip),
      goalFunding.totalRequiredSip,
      "Sum of per-goal required monthly contributions",
    ),
    fact(
      "goal_gap",
      "Total goal shortfall",
      formatRupees(goalFunding.totalGap),
      goalFunding.totalGap,
      "Sum of positive per-goal gaps at target dates",
    ),
    fact(
      "goal_coverage",
      "Goal SIP coverage",
      formatPct(goalFunding.coveragePct),
      goalFunding.coveragePct,
      "Current monthly commitment over required goal SIP",
    ),
  ];

  for (const c of ASSET_CLASSES) {
    if (summary.byAssetClass[c] > 0) {
      facts.push(
        fact(
          `allocation_${c}`,
          `${c} allocation`,
          formatPct(summary.byAssetClass[c]),
          summary.byAssetClass[c],
          "Share of portfolio value",
        ),
      );
    }
  }

  for (const row of rebalanceRows) {
    facts.push(
      fact(
        `drift_${row.assetClass}`,
        `${row.assetClass} drift vs target`,
        `${formatPct(row.currentPct)} vs ${formatPct(row.targetPct)} target`,
        row.currentPct - row.targetPct,
        "Current share against risk-based target allocation",
      ),
    );
  }

  if (atRetirement && yearsToRetire) {
    facts.push(
      fact(
        "corpus_at_retirement",
        `Projected corpus in ${yearsToRetire} years`,
        formatCompactRupees(atRetirement.closing),
        atRetirement.closing,
        "Base-scenario projection with current contributions",
      ),
      fact(
        "corpus_real",
        "That corpus in today's money",
        formatCompactRupees(atRetirement.realClosing),
        atRetirement.realClosing,
        `Deflated at ${formatPct(assumptions.inflation)} inflation`,
      ),
    );
  }

  const unknowns: string[] = allocation.missing.map((m) => `${m.field}: ${m.whyItMatters}`);
  if (summary.xirrPct === null) unknowns.push("XIRR is unavailable: no transaction history and no purchase dates.");
  else if (summary.xirrBasis !== "ledger")
    unknowns.push("XIRR is estimated from purchase dates, not from real transaction cash flows.");
  if (coverage === null) unknowns.push("Emergency coverage is unknown because monthly expenses are not recorded.");
  if (!yearsToRetire) unknowns.push("No projection horizon: current age or retirement age is missing.");
  if (staleHoldings.length > 0) {
    unknowns.push(`${staleHoldings.length} holding(s) have never had a price refresh, so their value may be stale.`);
  }

  return {
    generatedAt: now.toISOString(),
    hasData: holdings.length > 0 || planned.length > 0,
    facts,
    actions,
    goals: goalAnalyses,
    rebalance: rebalanceRows,
    concentration,
    unknowns,
    summary,
    retirementRun,
  };
}

/**
 * Compact, model-facing serialisation. Only labelled facts, findings and
 * explicit unknowns cross the boundary — never raw holdings rows.
 */
export function briefForModel(brief: PortfolioBrief): string {
  const lines: string[] = [];
  lines.push(`As of ${brief.generatedAt}`);
  lines.push("", "CALCULATED FACTS (id — label — value — basis):");
  for (const f of brief.facts) lines.push(`- ${f.id} — ${f.label} — ${f.value} — ${f.basis}`);

  if (brief.actions.length > 0) {
    lines.push("", "ENGINE FINDINGS (already ranked):");
    for (const a of brief.actions) {
      lines.push(`- [${a.severity}] ${a.headline}: ${a.detail}`);
      for (const e of a.evidence) lines.push(`    evidence: ${e.label} = ${e.value}`);
    }
  }

  if (brief.goals.length > 0) {
    lines.push("", "GOALS:");
    for (const g of brief.goals) {
      lines.push(
        `- ${g.name} [${g.status}]: needs ${formatRupees(g.futureCost)} in ${
          g.yearsToGoal === null ? "?" : g.yearsToGoal.toFixed(1)
        } years; projected ${formatRupees(g.projectedSavings)}; gap ${formatRupees(g.gap)}; required SIP ${formatRupees(
          g.requiredMonthlySip,
        )}`,
      );
    }
  }

  if (brief.concentration.length > 0) {
    lines.push("", "CONCENTRATION:");
    for (const c of brief.concentration) lines.push(`- ${c.name}: ${c.detail}`);
  }

  lines.push("", "UNKNOWN / UNAVAILABLE (never guess these):");
  if (brief.unknowns.length === 0) lines.push("- none");
  for (const u of brief.unknowns) lines.push(`- ${u}`);

  return lines.join("\n");
}
