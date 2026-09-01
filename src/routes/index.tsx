import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { Globe2, LineChart, Target } from "lucide-react";
import { AppShell, EmptyState, Panel } from "@/components/AppShell";
import { ActionCentre } from "@/components/ActionCentre";
import { AnimatedNumber, Figure, ProvenanceBadge, buttonClass } from "@/components/Bits";
import { ASSET_CLASS_COLORS, Donut, DonutLegend, DriftBar } from "@/components/Charts";
import { loadMacro, loadReviews, loadSnapshots, loadWatchlist, loadWorkspace } from "@/lib/data.functions";
import { formatCompactRupees, formatPct, formatRupees, relativeTime } from "@/lib/finance/format";
import { emergencyCoverageMonths, savingsRate } from "@/lib/finance/core";
import { concentrationWarnings, contributionByAssetClass, monthlyContribution, rebalance, summarisePortfolio, xirrLabel } from "@/lib/finance/portfolio";
import { project } from "@/lib/finance/projection";
import { buildTargetAllocation, recommendedEmergencyMonths } from "@/lib/finance/strategy";
import { analyseGoals, summariseGoalFunding } from "@/lib/finance/goals";
import { buildActionCentre } from "@/lib/finance/attention";
import { MONTH_STATUS_LABEL, thisMonthPlan } from "@/lib/finance/month";
import { changesSince, pickBaseline } from "@/lib/finance/changes";
import { Trajectory } from "@/components/Trajectory";
import { ASSET_CLASSES, type AssetClass } from "@/lib/finance/types";

export const Route = createFileRoute("/")({
  loader: async () => {
    const [workspace, watchlist, reviews, macro, snapshots] = await Promise.all([
      loadWorkspace(),
      loadWatchlist(),
      loadReviews(),
      loadMacro(),
      loadSnapshots(),
    ]);
    return { workspace, watchlist, reviews, macro, snapshots };
  },
  head: () => ({
    meta: [
      { title: "Sahil's Finance Intelligence — Home" },
      {
        name: "description",
        content:
          "A calm private overview of portfolio value, the plan ahead, goals, retirement runway and the decisions worth your attention today.",
      },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Sahil's Finance Intelligence — Home" },
      { property: "og:description", content: "Your portfolio, plan, goals and research in one calm financial overview." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Dashboard,
});

const STALE_AFTER_MS = 1000 * 60 * 60 * 24 * 7;

function Dashboard() {
  const { workspace, watchlist, reviews, snapshots } = Route.useLoaderData();
  const { holdings, planned, profile, assumptions, goals, transactions } = workspace;

  const summary = useMemo(() => summarisePortfolio(holdings, transactions), [holdings, transactions]);
  const monthly = useMemo(() => monthlyContribution(planned), [planned]);
  const contributions = useMemo(() => contributionByAssetClass(planned), [planned]);

  const essential = profile.essential_monthly_expenses ?? profile.monthly_expenses;
  const liquid = holdings
    .filter((h) => h.asset_class === "cash" || h.liquidity === "liquid")
    .reduce((a, h) => a + (h.current_value ?? (h.quantity ?? 0) * (h.current_price ?? 0)), 0);
  const emergency = recommendedEmergencyMonths(profile);
  const coverage = essential ? emergencyCoverageMonths(liquid, essential) : null;
  const emergencyCovered = coverage !== null && coverage >= emergency.months;

  const allocation = useMemo(() => buildTargetAllocation(profile, emergencyCovered), [profile, emergencyCovered]);
  const rebalanceRows = useMemo(() => rebalance(summary, allocation.target, 5), [summary, allocation.target]);

  const staleHoldings = useMemo(
    () =>
      holdings
        .filter((h) => {
          if (h.price_source === "manual") return false;
          if (!h.price_updated_at) return true;
          return Date.now() - new Date(h.price_updated_at).getTime() > STALE_AFTER_MS;
        })
        .map((h) => ({ name: h.name, lastUpdated: h.price_updated_at ? relativeTime(h.price_updated_at) : null })),
    [holdings],
  );

  const rate =
    profile.monthly_income && profile.monthly_expenses ? savingsRate(profile.monthly_income, profile.monthly_expenses) : null;

  const goalAnalyses = useMemo(
    () => analyseGoals(goals, { inflation: assumptions.base.inflation, expectedReturn: assumptions.base.equity_return }),
    [goals, assumptions.base],
  );
  const goalFunding = useMemo(() => summariseGoalFunding(goalAnalyses, monthly), [goalAnalyses, monthly]);

  const actions = useMemo(
    () =>
      buildActionCentre({
        emergencyCoverageMonths: coverage,
        emergencyTargetMonths: emergency.months,
        liquidValue: liquid,
        essentialMonthlyExpenses: essential ?? null,
        monthlySip: monthly,
        savingsRatePct: rate,
        rebalanceRows,
        goals: goalAnalyses,
        staleHoldings,
        missingInputs: allocation.missing,
        totalValue: summary.totalValue,
        transactionCount: transactions.length,
      }),
    [coverage, emergency.months, liquid, essential, monthly, rate, rebalanceRows, goalAnalyses, staleHoldings, allocation.missing, summary.totalValue, transactions.length],
  );

  const startValues = useMemo(() => {
    const out = Object.fromEntries(ASSET_CLASSES.map((c) => [c, 0])) as Record<AssetClass, number>;
    for (const h of holdings) {
      out[h.asset_class] += h.current_value ?? (h.quantity ?? 0) * (h.current_price ?? 0);
    }
    return out;
  }, [holdings]);

  const startAge = profile.current_age;
  const retire = profile.retirement_age;
  const yearsToRetire = startAge !== null && retire !== null ? Math.max(0, Math.round(retire - startAge)) : null;

  const retirementRun = useMemo(() => {
    if (!yearsToRetire) return null;
    return project({
      startingValues: startValues,
      monthlyContribution: contributions,
      assumptions: assumptions.base,
      startYear: new Date().getFullYear(),
      years: yearsToRetire,
      startAge,
      investedToDate: summary.invested,
    });
  }, [yearsToRetire, startValues, contributions, assumptions.base, startAge, summary.invested]);

  const atRetirement = retirementRun?.[retirementRun.length - 1] ?? null;

  const scenarioRuns = useMemo(() => {
    if (!yearsToRetire) return null;
    const common = {
      startingValues: startValues,
      monthlyContribution: contributions,
      startYear: new Date().getFullYear(),
      years: yearsToRetire,
      startAge,
      investedToDate: summary.invested,
    };
    return {
      conservative: project({ ...common, assumptions: assumptions.conservative }),
      optimistic: project({ ...common, assumptions: assumptions.optimistic }),
    };
  }, [yearsToRetire, startValues, contributions, assumptions, startAge, summary.invested]);

  const retirementYear = retirementRun?.[retirementRun.length - 1]?.year ?? null;

  const goalMarkers = useMemo(
    () =>
      goals
        .filter((g) => g.target_date)
        .map((g) => ({ year: new Date(g.target_date as string).getFullYear(), label: g.name }))
        .filter((m) => Number.isFinite(m.year))
        .slice(0, 4),
    [goals],
  );

  const month = useMemo(
    () => thisMonthPlan({ planned, transactions, targetAllocationPct: allocation.target }),
    [planned, transactions, allocation.target],
  );

  const changes = useMemo(
    () =>
      changesSince(pickBaseline(reviews, snapshots), {
        totalValue: summary.totalValue,
        invested: summary.invested,
        allocationPct: summary.byAssetClass,
        holdingCount: holdings.length,
        monthlySip: monthly,
        transactions,
      }),
    [reviews, snapshots, summary, holdings.length, monthly, transactions],
  );

  const pieData = ASSET_CLASSES.filter((c) => summary.valueByAssetClass[c] > 0).map((c) => ({
    name: c,
    value: Math.round(summary.valueByAssetClass[c] * 100) / 100,
    fill: ASSET_CLASS_COLORS[c],
  }));


  const hasData = holdings.length > 0 || planned.length > 0;

  return (
    <AppShell
      title="Home"
      subtitle="A calm view of what you own, what is planned, and the few decisions worth carrying into today."
    >
      {/* Three doors into the workspace — each lifts on hover and carries its own accent. */}
      <section className="mb-10 grid gap-3 border-b border-border-subtle pb-8 md:grid-cols-3 stagger">
        <Link to="/projections" className="card-base lift-hover group block p-5">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-primary/12 text-primary">
            <LineChart className="h-3.5 w-3.5" strokeWidth={2} />
          </span>
          <p className="eyebrow mt-3 text-[color:var(--text-secondary)]">The plan</p>
          <p className="mt-1.5 font-display text-[17px] tracking-tight text-foreground">Where could this take me?</p>
          <p className="mt-1 text-[12px] leading-relaxed text-[color:var(--text-secondary)]">
            {atRetirement ? `${formatCompactRupees(atRetirement.closing)} projected at retirement` : "Build a long-horizon projection"}
          </p>
        </Link>
        <Link to="/goals" className="card-base lift-hover group block p-5">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-teal/12 text-teal">
            <Target className="h-3.5 w-3.5" strokeWidth={2} />
          </span>
          <p className="eyebrow mt-3 text-[color:var(--text-secondary)]">Your why</p>
          <p className="mt-1.5 font-display text-[17px] tracking-tight text-foreground">{goalAnalyses.length ? `${goalAnalyses.length} goals in motion` : "Give the money a job"}</p>
          <p className="mt-1 text-[12px] leading-relaxed text-[color:var(--text-secondary)]">
            {goalAnalyses.length ? `${formatCompactRupees(goalFunding.totalFutureCost)} needed at target dates` : "Record a goal to see its true future cost"}
          </p>
        </Link>
        <Link to="/research" className="card-base lift-hover group block p-5">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-surface-3 text-[color:var(--text-secondary)]">
            <Globe2 className="h-3.5 w-3.5" strokeWidth={2} />
          </span>
          <p className="eyebrow mt-3 text-[color:var(--text-secondary)]">The backdrop</p>
          <p className="mt-1.5 font-display text-[17px] tracking-tight text-foreground">Market reference</p>
          <p className="mt-1 text-[12px] leading-relaxed text-[color:var(--text-secondary)]">
            {workspace.market.length ? `${workspace.market.length} sourced reference${workspace.market.length === 1 ? "" : "s"} point${workspace.market.length === 1 ? "" : "s"}` : "No market data fetched yet"}
          </p>
        </Link>
      </section>
      {!hasData ? (
        <EmptyState
          title="This workspace is empty"
          detail="Start with your personal inputs so the engine knows your horizon and obligations, then record what you already own."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Link to="/inputs" className={buttonClass}>
                Enter your inputs
              </Link>
              <Link
                to="/portfolio"
                className="inline-flex items-center rounded-md border border-border-subtle px-3 py-2 text-sm text-[color:var(--text-secondary)] transition-colors hover:text-foreground"
              >
                Add holdings
              </Link>
            </div>
          }
        />
      ) : (
        <>
          {/* Hero — one number leads the page, framed by a soft accent wash. */}
          <section className="entry-hero fade-up border-b-0 p-6 md:p-8">
            <p className="eyebrow text-[color:var(--text-secondary)]">Total portfolio value</p>
            <p className="metric-xl privacy-sensitive mt-3 text-foreground">
              <AnimatedNumber value={summary.totalValue} format={formatRupees} />
            </p>
            <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-[color:var(--text-secondary)]">
              <span className={summary.unrealisedGain >= 0 ? "text-positive" : "text-destructive"}>
                <span className="privacy-sensitive tabular">
                  {summary.unrealisedGain >= 0 ? "+" : "−"}
                  {formatCompactRupees(Math.abs(summary.unrealisedGain))}
                </span>{" "}
                unrealised
                {summary.unrealisedGainPct !== null ? ` (${formatPct(summary.unrealisedGainPct)} on cost)` : ""}
              </span>
              <span aria-hidden className="text-[color:var(--text-tertiary)]">·</span>
              <span>
                {holdings.length} holding{holdings.length === 1 ? "" : "s"}
              </span>
              <ProvenanceBadge
                kind={staleHoldings.length > 0 ? "stale" : "current"}
                note={staleHoldings.length > 0 ? `${staleHoldings.length} price(s) out of date` : "All prices inside the freshness window"}
              />
            </p>

            <dl className="mt-8 grid gap-x-10 gap-y-6 sm:grid-cols-2 lg:grid-cols-4">
              <Figure
                label="Investing each month"
                value={formatRupees(monthly)}
                note={rate !== null ? `${formatPct(rate)} savings rate` : "Add income and expenses"}
              />
              <Figure
                label="Emergency coverage"
                value={coverage !== null ? `${coverage.toFixed(1)} mo` : "—"}
                note={`Target ${emergency.months} months of essentials`}
                tone={coverage === null ? "neutral" : emergencyCovered ? "positive" : "negative"}
              />
              <Figure
                label="Invested capital"
                value={formatCompactRupees(summary.invested)}
                note={summary.xirrPct !== null ? `${formatPct(summary.xirrPct)} ${xirrLabel(summary.xirrBasis, summary.xirrCoveragePct).title}` : "Add transactions for XIRR"}
              />
              <Figure
                label={atRetirement && retire ? `Corpus at ${retire}` : "Corpus at retirement"}
                value={atRetirement ? formatCompactRupees(atRetirement.closing) : "—"}
                note={
                  atRetirement
                    ? `${formatCompactRupees(atRetirement.realClosing)} in today's money`
                    : "Set current and retirement age"
                }
              />
            </dl>
          </section>

          {/* This month — the only near-term commitment that matters. */}
          <section className="mt-10 grid gap-8 border-b border-border-subtle pb-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <div>
              <div className="flex items-baseline justify-between gap-4">
                <h2 className="font-display text-[20px] tracking-tight text-foreground">This month</h2>
                <span
                  className={`text-[12px] ${
                    month.status === "below_plan"
                      ? "text-warning"
                      : month.status === "on_track" || month.status === "ahead"
                        ? "text-teal"
                        : "text-[color:var(--text-tertiary)]"
                  }`}
                >
                  {MONTH_STATUS_LABEL[month.status]}
                </span>
              </div>
              <p className="mt-1.5 text-[13px] text-[color:var(--text-secondary)]">{month.label}</p>
              <dl className="mt-5 grid grid-cols-2 gap-x-8 gap-y-5">
                <Figure
                  label="Invested so far"
                  value={month.invested === null ? "—" : formatRupees(month.invested)}
                  note={month.invested === null ? "Record transactions to track this" : "From the transaction ledger"}
                />
                <Figure
                  label="Target"
                  value={formatRupees(month.target)}
                  note={month.target > 0 ? "Sum of active recurring plans" : "No recurring plans recorded"}
                />
              </dl>
              {month.remaining !== null && month.remaining > 0 ? (
                <p className="mt-5 text-[13px] text-[color:var(--text-secondary)]">
                  <span className="privacy-sensitive tabular text-foreground">{formatRupees(month.remaining)}</span> still to
                  invest before the month closes.
                </p>
              ) : null}
            </div>

            <div>
              <h3 className="font-display text-[20px] tracking-tight text-foreground">
                Your next {formatRupees(month.nextAmount)}
              </h3>
              <p className="mt-1.5 text-[13px] text-[color:var(--text-secondary)]">
                {month.splitFromPlan
                  ? "Split across the plans you already run."
                  : "Split by your target allocation, since no recurring plan is recorded."}
              </p>
              {month.nextSplit.length === 0 ? (
                <p className="mt-5 text-[13px] text-[color:var(--text-tertiary)]">
                  Add a recurring plan or complete your inputs to see where the next rupee should go.
                </p>
              ) : (
                <ul className="mt-5 divide-y divide-[color:var(--border-subtle)] border-t border-border-subtle">
                  {month.nextSplit.map((slice) => (
                    <li key={slice.assetClass} className="flex items-baseline justify-between gap-3 py-3">
                      <span className="text-[13px] capitalize text-foreground">{slice.assetClass}</span>
                      <span className="flex items-baseline gap-3">
                        <span className="tabular text-[12px] text-[color:var(--text-tertiary)]">
                          {formatPct(slice.pct, 0)}
                        </span>
                        <span className="privacy-sensitive tabular text-[13px] text-foreground">
                          {formatRupees(slice.amount)}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <Link to="/plan" className="mt-5 inline-block text-[12px] text-primary underline-offset-4 hover:underline">
                Review recurring plans →
              </Link>
            </div>
          </section>

          {/* Action centre — the reason to open this page. */}
          <section className="mt-10">
            <div className="flex items-baseline justify-between gap-4">
              <h2 className="font-display text-[20px] tracking-tight text-foreground">What needs attention</h2>
              <span className="text-[12px] text-[color:var(--text-tertiary)]">
                {actions.length === 0 ? "All clear" : `${actions.length} open`}
              </span>
            </div>
            <div className="mt-4">
              <ActionCentre items={actions} initialVisible={3} />
            </div>
          </section>

          {/* Wealth trajectory. */}
          <section className="mt-12 border-b border-border-subtle pb-10">
            <h2 className="font-display text-[20px] tracking-tight text-foreground">Wealth trajectory</h2>
            <p className="mt-1.5 max-w-2xl text-[13px] text-[color:var(--text-secondary)]">
              Today's holdings and recorded contributions, compounded to retirement. Markers show your retirement year and
              dated goals.
            </p>
            <div className="mt-6">
              <Trajectory
                base={retirementRun ?? []}
                conservative={scenarioRuns?.conservative}
                optimistic={scenarioRuns?.optimistic}
                retirementYear={retirementYear}
                markers={goalMarkers}
              />
            </div>
          </section>

          {/* What changed, strictly from recorded history. */}
          <section className="mt-12">
            <div className="flex items-baseline justify-between gap-4">
              <h2 className="font-display text-[20px] tracking-tight text-foreground">Since your last review</h2>
              <span className="text-[12px] text-[color:var(--text-tertiary)]">{changes.baselineLabel}</span>
            </div>
            {changes.lines.length === 0 ? (
              <p className="mt-4 max-w-2xl text-[13px] text-[color:var(--text-secondary)]">{changes.note}</p>
            ) : (
              <ul className="mt-5 grid gap-x-10 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
                {changes.lines.map((line) => (
                  <li key={line.id}>
                    <p className="eyebrow text-[color:var(--text-secondary)]">{line.label}</p>
                    <p
                      className={`privacy-sensitive tabular mt-1.5 text-[18px] ${
                        line.direction === "up"
                          ? "text-positive"
                          : line.direction === "down"
                            ? "text-destructive"
                            : "text-foreground"
                      }`}
                    >
                      {line.value}
                    </p>
                    <p className="mt-1 text-[12px] text-[color:var(--text-tertiary)]">{line.basis}</p>
                  </li>
                ))}
              </ul>
            )}
            <Link to="/review" className="mt-6 inline-block text-[12px] text-primary underline-offset-4 hover:underline">
              {reviews[0] ? "Open monthly review →" : "Start the first review →"}
            </Link>
          </section>


          {/* Allocation against plan. */}
          <section className="mt-12 grid gap-8 lg:grid-cols-[minmax(0,320px)_1fr]">
            <div>
              <h2 className="font-display text-[20px] tracking-tight text-foreground">Where the money sits</h2>
              <p className="mt-1.5 text-[13px] text-[color:var(--text-secondary)]">
                Current split of portfolio value by asset class.
              </p>
              <div className="mt-5">
                {pieData.length === 0 ? (
                  <p className="text-[13px] text-[color:var(--text-tertiary)]">No holdings to allocate yet.</p>
                ) : (
                  <>
                    <Donut
                      slices={pieData}
                      centreLabel="Portfolio"
                      centreValue={summary.totalValue}
                      formatValue={formatCompactRupees}
                      size={196}
                    />
                    <DonutLegend slices={pieData} total={summary.totalValue} format={formatCompactRupees} />
                  </>
                )}
              </div>
            </div>

            <div>
              <h2 className="font-display text-[20px] tracking-tight text-foreground">Distance from target</h2>
              <p className="mt-1.5 text-[13px] text-[color:var(--text-secondary)]">
                Anything inside five percentage points is treated as on plan — rebalancing costs tax and effort.
              </p>
              {summary.totalValue === 0 ? (
                <p className="mt-5 text-[13px] text-[color:var(--text-tertiary)]">
                  Add holdings to compare against the target allocation.
                </p>
              ) : (
                <ul className="mt-5 divide-y divide-[color:var(--border-subtle)] border-t border-border-subtle">
                  {rebalanceRows
                    .filter((r) => r.currentPct > 0 || r.targetPct > 0)
                    .map((r) => (
                      <li key={r.assetClass} className="py-3.5">
                        <div className="flex items-baseline justify-between gap-3">
                          <span className="text-[13px] capitalize text-foreground">{r.assetClass}</span>
                          <span className="tabular text-[12px] text-[color:var(--text-secondary)]">
                            {formatPct(r.currentPct)} now · {formatPct(r.targetPct)} target
                          </span>
                        </div>
                        <div className="mt-2">
                          <DriftBar deltaPct={r.deltaPct} tolerancePct={5} />
                        </div>
                        <div className="mt-1.5 flex items-center justify-between text-[12px]">
                          <span className={r.status === "on_target" ? "text-[color:var(--text-tertiary)]" : "text-warning"}>
                            {r.deltaPct >= 0 ? "+" : ""}
                            {formatPct(r.deltaPct)} drift
                          </span>
                          <span className="tabular privacy-sensitive">
                            {r.status === "on_target" ? (
                              <span className="text-[color:var(--text-tertiary)]">Hold</span>
                            ) : (
                              <span className={r.deltaValue >= 0 ? "text-positive" : "text-destructive"}>
                                {r.deltaValue >= 0 ? "Add " : "Trim "}
                                {formatCompactRupees(Math.abs(r.deltaValue))}
                              </span>
                            )}
                          </span>
                        </div>
                      </li>
                    ))}
                </ul>
              )}
            </div>
          </section>

          {/* Goals — distance to target, not another chart. */}
          <section className="mt-12">
            <div className="flex items-baseline justify-between gap-4">
              <h2 className="font-display text-[20px] tracking-tight text-foreground">Goal funding</h2>
              <Link to="/goals" className="text-[12px] text-primary underline-offset-4 hover:underline">
                Open the goal ledger →
              </Link>
            </div>
            {goalAnalyses.length === 0 ? (
              <div className="mt-4">
                <EmptyState
                  title="No goals yet"
                  detail="Add what you are actually saving for — a home, education, retirement — so the engine can price it at its target date."
                  action={
                    <Link to="/goals" className={buttonClass}>
                      Add a goal
                    </Link>
                  }
                />
              </div>
            ) : (
              <>
                <dl className="mt-5 grid gap-x-10 gap-y-6 sm:grid-cols-3">
                  <Figure
                    label="Future cost of all goals"
                    value={formatCompactRupees(goalFunding.totalFutureCost)}
                    note={`${goalAnalyses.length} goal${goalAnalyses.length === 1 ? "" : "s"}, inflated to their dates`}
                  />
                  <Figure
                    label="Total shortfall"
                    value={formatCompactRupees(goalFunding.totalGap)}
                    tone={goalFunding.totalGap > 0 ? "negative" : "positive"}
                    note={`Needs ${formatRupees(goalFunding.totalRequiredSip)}/mo of fresh investing`}
                  />
                  <Figure
                    label="Covered by current SIPs"
                    value={goalFunding.coveragePct !== null ? formatPct(goalFunding.coveragePct) : "—"}
                    tone={
                      goalFunding.coveragePct === null ? "neutral" : goalFunding.coveragePct >= 100 ? "positive" : "negative"
                    }
                    note={`${formatRupees(monthly)}/mo planned today`}
                  />
                </dl>

                <ul className="mt-6 divide-y divide-[color:var(--border-subtle)] border-t border-border-subtle text-[13px]">
                  {goalAnalyses.slice(0, 5).map((g) => (
                    <li key={g.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                      <span className="truncate text-foreground">{g.name}</span>
                      <span className="flex shrink-0 items-center gap-4 text-[12px]">
                        <span className="tabular text-[color:var(--text-tertiary)]">
                          {g.yearsToGoal !== null ? `${Math.max(0, g.yearsToGoal).toFixed(1)} yr` : "No date"}
                        </span>
                        <span className="tabular privacy-sensitive text-[color:var(--text-secondary)]">
                          {g.futureCost !== null ? formatCompactRupees(g.futureCost) : "—"}
                        </span>
                        <span
                          className={
                            g.status === "on_track"
                              ? "text-positive"
                              : g.status === "at_risk"
                                ? "text-warning"
                                : g.status === "shortfall"
                                  ? "text-destructive"
                                  : "text-[color:var(--text-tertiary)]"
                          }
                        >
                          {g.status === "on_track"
                            ? "On track"
                            : g.status === "at_risk"
                              ? `Needs ${formatRupees(g.requiredMonthlySip ?? 0)}/mo`
                              : g.status === "shortfall"
                                ? `Short ${formatCompactRupees(g.gap ?? 0)}`
                                : "Needs a date"}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>

          {/* Supporting modules — visible without competing with the main decision. */}
          <section className="mt-12 grid gap-8 lg:grid-cols-2">
            <Panel
              title="Research and signals"
              description="Sourced context and candidate ideas, kept separate from owned assets."
            >
              <div className="grid gap-5 sm:grid-cols-2">
                <Link to="/research" className="border-l-2 border-border pl-4 transition-colors hover:border-primary">
                  <p className="text-[11px] uppercase tracking-[0.1em] text-[color:var(--text-tertiary)]">Market data</p>
                  <p className="mt-2 font-display text-xl text-foreground">{workspace.market.length}</p>
                  <p className="mt-1 text-[12px] text-[color:var(--text-secondary)]">reference series with provenance</p>
                </Link>
                <Link to="/watchlist" className="border-l-2 border-border pl-4 transition-colors hover:border-primary">
                  <p className="text-[11px] uppercase tracking-[0.1em] text-[color:var(--text-tertiary)]">Watchlist</p>
                  <p className="mt-2 font-display text-xl text-foreground">{watchlist.length}</p>
                  <p className="mt-1 text-[12px] text-[color:var(--text-secondary)]">
                    {watchlist.filter((item) => item.last_price !== null).length} candidates priced
                  </p>
                </Link>
              </div>
              <Link to="/research" className="mt-6 inline-block text-[12px] text-primary underline-offset-4 hover:underline">
                Open the research terminal →
              </Link>
            </Panel>
            <Panel
              title="Last monthly review"
              description="A record of the last time you deliberately checked the system."
            >
              {reviews[0] ? (
                <div>
                  <div className="flex items-end justify-between gap-4">
                    <div>
                      <p className="font-display text-xl text-foreground">{reviews[0].period}</p>
                      <p className="mt-1 text-[12px] text-[color:var(--text-secondary)]">Signed off {relativeTime(reviews[0].reviewed_at)}</p>
                    </div>
                    <p className="tabular text-lg text-foreground">{reviews[0].total_value !== null ? formatRupees(reviews[0].total_value) : "—"}</p>
                  </div>
                  <p className="mt-5 text-[12px] text-[color:var(--text-secondary)]">
                    {reviews[0].open_actions} open decision{reviews[0].open_actions === 1 ? "" : "s"} at sign-off.
                  </p>
                </div>
              ) : (
                <div>
                  <p className="text-sm text-foreground">No review recorded yet.</p>
                  <p className="mt-1.5 text-[12px] text-[color:var(--text-secondary)]">Make the next month useful by writing down what the numbers said.</p>
                </div>
              )}
              <Link to="/review" className="mt-6 inline-block text-[12px] text-primary underline-offset-4 hover:underline">
                {reviews[0] ? "Open monthly review →" : "Start the first review →"}
              </Link>
            </Panel>
          </section>

          {/* Provenance, kept out of the way until asked for. */}
          <section className="mt-12">
            <details className="group">
              <summary className="cursor-pointer list-none text-[13px] text-[color:var(--text-secondary)] underline-offset-4 hover:text-foreground hover:underline">
                Data provenance and freshness
                <span className="ml-2 text-[color:var(--text-tertiary)]">
                  {staleHoldings.length > 0 ? `${staleHoldings.length} stale` : "all current"}
                </span>
              </summary>
              <div className="mt-4">
                <Panel collapsible title="Where each price came from" description="Every valuation carries its source and age.">
                  {holdings.length === 0 ? (
                    <p className="text-[13px] text-[color:var(--text-tertiary)]">No holdings yet.</p>
                  ) : (
                    <ul className="divide-y divide-[color:var(--border-subtle)] text-[13px]">
                      {[...holdings]
                        .sort((a, b) => (a.price_updated_at ?? "").localeCompare(b.price_updated_at ?? ""))
                        .slice(0, 10)
                        .map((h) => (
                          <li key={h.id} className="flex items-center justify-between gap-3 py-2">
                            <span className="truncate text-foreground">{h.name}</span>
                            <span className="flex shrink-0 items-center gap-2">
                              <ProvenanceBadge
                                kind={h.price_source === "manual" ? "manual" : "current"}
                                note={`Source: ${h.price_source}`}
                              />
                              <span className="text-[11px] text-[color:var(--text-tertiary)]">
                                {relativeTime(h.price_updated_at)}
                              </span>
                            </span>
                          </li>
                        ))}
                    </ul>
                  )}
                  {concentrationWarnings(summary).length > 0 ? (
                    <p className="mt-4 text-[12px] text-[color:var(--text-secondary)]">
                      {concentrationWarnings(summary)[0]!.message}
                    </p>
                  ) : null}
                </Panel>
              </div>
            </details>
          </section>
        </>
      )}
    </AppShell>
  );
}
