import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AppShell, Panel } from "@/components/AppShell";
import { ProjectionChart, type ProjectionChartMode, type ProjectionMarker } from "@/components/ProjectionChart";
import { ProvenanceBadge, Stat } from "@/components/Bits";
import { YearScrubber, type Milestone } from "@/components/Timeline";
import { Segmented } from "@/components/Wizard";
import { loadWorkspace } from "@/lib/data.functions";
import { formatCompactRupees, formatPct, formatRupees } from "@/lib/finance/format";
import { contributionByAssetClass, summarisePortfolio } from "@/lib/finance/portfolio";
import { project, validateProjection, type ProjectionYear } from "@/lib/finance/projection";
import { buildGlidePath, sensitivityRanking } from "@/lib/finance/sensitivity";
import { ASSET_CLASSES, type AssetClass, type ScenarioName } from "@/lib/finance/types";

export const Route = createFileRoute("/projections")({
  loader: () => loadWorkspace(),
  head: () => ({
    meta: [
      { title: "Sahil's Finance Intelligence — Projections" },
      {
        name: "description",
        content:
          "Where the corpus lands each year, in today's money and tomorrow's.",
      },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Sahil's Finance Intelligence — Projections" },
      {
        property: "og:description",
        content: "Long-horizon corpus projections with explicit assumptions.",
      },
    ],
  }),
  component: ProjectionsPage,
});

const SCENARIOS: ScenarioName[] = ["conservative", "base", "optimistic"];

function ProjectionsPage() {
  const { holdings, planned, profile, assumptions, goals } = Route.useLoaderData();
  const [scenario, setScenario] = useState<ScenarioName>("base");
  const [showReal, setShowReal] = useState(true);
  const [compare, setCompare] = useState(false);
  const [chartMode, setChartMode] = useState<ProjectionChartMode>("value");
  const [density, setDensity] = useState<"comfortable" | "dense">("comfortable");
  const [inflationDelta, setInflationDelta] = useState(0);

  const [scrubIndex, setScrubIndex] = useState(0);

  const summary = useMemo(() => summarisePortfolio(holdings), [holdings]);
  const startValues = useMemo(() => {
    const out = Object.fromEntries(ASSET_CLASSES.map((c) => [c, 0])) as Record<AssetClass, number>;
    for (const h of holdings) {
      const v = h.current_value ?? (h.quantity ?? 0) * (h.current_price ?? 0);
      out[h.asset_class] = (out[h.asset_class] ?? 0) + v;
    }
    return out;
  }, [holdings]);
  const contributions = useMemo(() => contributionByAssetClass(planned), [planned]);

  const startAge = profile.current_age;
  const endAge =
    profile.planning_age ?? (profile.retirement_age !== null ? profile.retirement_age + 25 : null);
  const years =
    startAge !== null && endAge !== null && endAge > startAge
      ? Math.round(endAge - startAge)
      : (profile.investment_horizon_years ?? 25);

  const startYear = new Date().getFullYear();

  const glideAvailable = startAge !== null && profile.retirement_age !== null && profile.retirement_age > startAge;
  const [glide, setGlide] = useState(false);
  const glidePath = useMemo(() => {
    if (!glideAvailable || !glide || startAge === null || profile.retirement_age === null) return undefined;
    const currentEquityPct = (() => {
      const total = Object.values(contributions).reduce((a, v) => a + v, 0);
      return total > 0 ? (contributions.equity / total) * 100 : 70;
    })();
    return buildGlidePath({
      startAge,
      targetAge: profile.retirement_age,
      startEquityPct: currentEquityPct,
      endEquityPct: 30,
      holdYears: Math.max(0, Math.round((profile.retirement_age - startAge) * 0.4)),
    });
  }, [glideAvailable, glide, startAge, profile.retirement_age, contributions]);

  const runs = useMemo(() => {
    const out: Record<ScenarioName, ProjectionYear[]> = {
      conservative: [],
      base: [],
      optimistic: [],
    };
    for (const s of SCENARIOS) {
      const scenarioAssumptions = s === scenario
        ? { ...assumptions[s], inflation: Math.max(0, assumptions[s].inflation + inflationDelta) }
        : assumptions[s];
      out[s] = project({
        startingValues: startValues,
        monthlyContribution: contributions,
        assumptions: scenarioAssumptions,
        startYear,
        years,
        startAge,
        ...(glidePath ? { glidePath } : {}),
        investedToDate: summary.invested,
      });
    }
    return out;
  }, [startValues, contributions, assumptions, scenario, inflationDelta, startYear, years, startAge, glidePath, summary.invested]);

  const sensitivities = useMemo(
    () =>
      sensitivityRanking({
        startingValues: startValues,
        monthlyContribution: contributions,
        assumptions: { ...assumptions[scenario], inflation: Math.max(0, assumptions[scenario].inflation + inflationDelta) },
        startYear,
        years,
        startAge,
        ...(glidePath ? { glidePath } : {}),
        investedToDate: summary.invested,
      }),
    [startValues, contributions, assumptions, scenario, inflationDelta, startYear, years, startAge, glidePath, summary.invested],
  );

  const rows = runs[scenario];
  const reconciliation = useMemo(() => validateProjection(rows), [rows]);
  const final = rows[rows.length - 1];


  const a = { ...assumptions[scenario], inflation: Math.max(0, assumptions[scenario].inflation + inflationDelta) };

  const clampedIndex = Math.min(scrubIndex, Math.max(0, rows.length - 1));
  const scrubRow = rows[clampedIndex] ?? null;

  // Years worth stopping on while scrubbing: retirement, each goal date, and
  // the year the annual step-up has doubled the original contribution.
  const milestones = useMemo<Milestone[]>(() => {
    const out: Milestone[] = [];
    if (startAge !== null && profile.retirement_age !== null) {
      out.push({
        year: startYear + Math.round(profile.retirement_age - startAge),
        label: "Retirement",
      });
    }
    for (const g of goals) {
      if (!g.target_date) continue;
      const y = new Date(g.target_date).getFullYear();
      if (Number.isFinite(y)) out.push({ year: y, label: g.name });
    }
    if (a.sip_step_up > 0) {
      const yearsToDouble = Math.log(2) / Math.log(1 + a.sip_step_up / 100);
      out.push({ year: startYear + Math.round(yearsToDouble), label: "SIP step-up doubles" });
    }
    return out;
  }, [goals, profile.retirement_age, startAge, startYear, a.sip_step_up]);

  const chartMarkers = useMemo<ProjectionMarker[]>(
    () =>
      milestones
        .filter((m) => m.label !== "SIP step-up doubles")
        .map((m) => ({
          year: m.year,
          label: m.label,
          kind: m.label === "Retirement" ? "retirement" : "goal",
        })),
    [milestones],
  );

  function exportProjection() {
    const header = ["Year", "Age", "Opening", "Contribution", "Growth", "Closing", "Today's money", "Equity", "Debt", "Gold"];
    const csv = [
      header,
      ...rows.map((r) => [
        r.year,
        r.age ?? "",
        r.opening,
        r.contribution,
        r.gain,
        r.closing,
        r.realClosing,
        r.byAssetClass.equity,
        r.byAssetClass.debt,
        r.byAssetClass.gold,
      ]),
    ]
      .map((line) => line.join(","))
      .join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `projections-${scenario}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <AppShell
      title="Projections"
      subtitle={`Year-by-year growth of the current portfolio plus planned contributions, over ${years} years. Every figure below is a forecast built on stated assumptions, not a prediction.`}
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Scenario">
            {SCENARIOS.map((s) => {
              const active = scenario === s;
              return (
                <button
                  key={s}
                  role="tab"
                  aria-selected={active}
                  onClick={() => setScenario(s)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-medium capitalize transition-colors duration-100 ${
                    active
                      ? "border-primary/50 bg-primary/15 text-primary"
                      : "border-border bg-transparent text-muted-foreground hover:border-primary/30 hover:text-foreground"
                  }`}
                >
                  {s}
                </button>
              );
            })}
          </div>
          <button
            onClick={() => setCompare((v) => !v)}
            aria-pressed={compare}
            className={`rounded-md border px-3 py-1.5 text-sm transition-colors ${
              compare
                ? "border-primary/50 bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            Compare scenarios
          </button>
          {glideAvailable ? (
            <button
              onClick={() => setGlide((v) => !v)}
              aria-pressed={glide}
              className={`rounded-md border px-3 py-1.5 text-sm transition-colors ${
                glide
                  ? "border-primary/50 bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              Glide path
            </button>
          ) : null}
          <button
            onClick={() => setShowReal((v) => !v)}
            className="rounded-md border border-border px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            {showReal ? "Showing today's money" : "Showing future rupees"}
          </button>
        </div>
      }
    >
      {/* Hero — the question this page answers. */}
      <section className="border-b border-border-subtle pb-8">
        <p className="eyebrow text-[color:var(--text-secondary)]">Where could this take me?</p>
        <p className="metric-xl privacy-sensitive mt-3 text-foreground">
          {final ? formatCompactRupees(final.closing) : "—"}
        </p>
        <p className="mt-3 text-[13px] text-[color:var(--text-secondary)]">
          Projected corpus in {startYear + years - 1}
          {final?.age !== null && final?.age !== undefined ? ` at age ${final.age}` : ""} on the{" "}
          {scenario} scenario. A projection built on stated assumptions, not a prediction.
        </p>
      </section>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Starting portfolio" value={formatRupees(summary.totalValue)} provenance="current" />
        <Stat label="Today's money" value={final ? formatCompactRupees(final.realClosing) : "—"} sub={`After ${formatPct(a.inflation)} inflation`} provenance="forecast" />
        <Stat label="Total contributed" value={final ? formatCompactRupees(final.totalInvested) : "—"} provenance="forecast" />
        <Stat label="Total growth" value={final ? formatCompactRupees(final.totalGains) : "—"} sub={final && final.closing > 0 ? `${formatPct((final.totalGains / final.closing) * 100)} of corpus` : undefined} provenance="forecast" />
      </div>

      <div className="mt-5 flex flex-wrap gap-2" aria-label="Projection summary">
        {[
          ["Years modeled", `${rows.length}`],
          ["Projected corpus", final ? formatCompactRupees(final.closing) : "—"],
          ["Total contributions", final ? formatCompactRupees(final.totalInvested) : "—"],
          ["Total growth", final ? formatCompactRupees(final.totalGains) : "—"],
        ].map(([label, value]) => (
          <div key={label} className="rounded-full border border-border-subtle bg-surface-1/50 px-3 py-1.5 text-xs">
            <span className="text-muted-foreground">{label}</span><span className="ml-2 tabular privacy-sensitive text-foreground">{value}</span>
          </div>
        ))}
      </div>


      {glide ? (
        <p className="mt-4 text-xs text-muted-foreground">
          Glide path on: new contributions shift from today's equity share towards 30% equity by age{" "}
          {profile.retirement_age}. Existing holdings are not sold.
        </p>
      ) : null}

      <section className="mt-6 rounded-xl border border-teal/20 bg-teal/[0.045] p-4 sm:flex sm:items-center sm:gap-6">
        <div className="shrink-0">
          <p className="eyebrow text-teal">Inflation sensitivity</p>
          <p className="mt-1 text-[13px] text-foreground">Adjust purchasing power without changing your saved assumptions.</p>
        </div>
        <div className="mt-4 min-w-0 flex-1 sm:mt-0">
          <div className="flex items-center justify-between text-[12px] text-muted-foreground">
            <span>{formatPct(Math.max(0, assumptions[scenario].inflation - 2.5))}</span>
            <span className="font-medium text-teal">{formatPct(a.inflation)} inflation</span>
            <span>{formatPct(assumptions[scenario].inflation + 2.5)}</span>
          </div>
          <input
            type="range"
            min={-2.5}
            max={2.5}
            step={0.25}
            value={inflationDelta}
            onChange={(e) => setInflationDelta(Number(e.target.value))}
            className="scrubber mt-3"
            aria-label="Adjust inflation sensitivity"
            style={{ background: `linear-gradient(90deg, var(--accent-teal) 0%, var(--accent-teal) ${((inflationDelta + 2.5) / 5) * 100}%, var(--bg-surface-3) ${((inflationDelta + 2.5) / 5) * 100}%, var(--bg-surface-3) 100%)` }}
          />
        </div>
        {inflationDelta !== 0 ? (
          <button type="button" onClick={() => setInflationDelta(0)} className="mt-3 text-[12px] text-primary hover:underline sm:mt-0">Reset</button>
        ) : null}
      </section>

      <div className="mt-6">
        <Panel
          title="What actually moves the outcome"
          description={`One lever at a time, ${scenario} assumptions elsewhere.`}
          actions={<ProvenanceBadge kind="forecast" />}
        >
          <ul className="divide-y divide-[color:var(--border-subtle)] border-t border-border-subtle">
            {sensitivities.map((s) => {
              const lo = s.points[0]!;
              const hi = s.points[s.points.length - 1]!;
              const spread = Math.abs(hi.finalReal - lo.finalReal);
              const widest = Math.max(
                ...sensitivities.map((r) =>
                  Math.abs(r.points[r.points.length - 1]!.finalReal - r.points[0]!.finalReal),
                ),
                1,
              );
              return (
                <li key={s.lever} className="py-3.5">
                  <div className="flex items-baseline justify-between gap-4">
                    <span className="text-sm text-foreground">{s.title}</span>
                    <span className="shrink-0 text-xs tabular text-muted-foreground">
                      {lo.label} → {hi.label} swings{" "}
                      <span className="privacy-sensitive text-foreground">{formatCompactRupees(spread)}</span>
                    </span>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-secondary">
                    <div
                      className="h-full rounded-full bg-[color:var(--color-chart-1)]"
                      style={{ width: `${Math.max(2, (spread / widest) * 100)}%` }}
                    />
                  </div>
                  <p className="mt-1.5 text-[13px] leading-relaxed text-[color:var(--text-secondary)]">
                    {hi.deltaRealPct >= 0 ? "+" : ""}
                    {hi.deltaRealPct.toFixed(1)}% terminal wealth at {hi.label}; {lo.deltaRealPct.toFixed(1)}% at {lo.label}.
                  </p>
                </li>
              );
            })}
          </ul>
        </Panel>
      </div>

      <div className="mt-6">
        <Panel
          title="Wealth trajectory"
          description={`${showReal ? "Today's money" : "Future rupees"} · ${compare ? "range across scenarios" : `${scenario} scenario`}. Hover or tap the line to inspect each year.`}
          actions={<ProvenanceBadge kind="forecast" />}
        >
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <Segmented
              value={chartMode}
              onChange={setChartMode}
              ariaLabel="Trajectory view"
              options={[
                { value: "value", label: "Portfolio value" },
                { value: "composition", label: "Contribution / growth" },
              ]}
            />
            <span className="text-[11px] text-muted-foreground">
              {showReal ? "Inflation-adjusted" : "Nominal"} · selected year highlighted
            </span>
          </div>
          <ProjectionChart
            rows={rows}
            low={runs.conservative}
            high={runs.optimistic}
            showReal={showReal}
            mode={chartMode}
            showBand={compare}
            markers={chartMarkers}
            selectedIndex={clampedIndex}
            onSelectIndex={(index) => setScrubIndex(index)}
            height={380}
          />
        </Panel>



        <Panel
          title="Assumptions in force"
          description="Change these on what you believe, not what you want."
        >
          <dl className="space-y-2 text-sm">
            {(
              [
                ["Equity return", a.equity_return],
                ["Debt return", a.debt_return],
                ["Gold return", a.gold_return],
                ["Cash return", a.cash_return],
                ["Inflation", a.inflation],
                ["Annual SIP step-up", a.sip_step_up],
              ] as const
            ).map(([label, value]) => (
              <div
                key={label}
                className="flex items-center justify-between border-b border-border/60 pb-1.5 last:border-0"
              >
                <dt className="text-xs text-muted-foreground">{label}</dt>
                <dd className="tabular text-foreground">{formatPct(value)}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
            Returns are nominal and compounded monthly. Contributions are assumed to be made at the
            start of each month and increased once a year by the step-up rate.
          </p>
          {reconciliation.length > 0 ? (
            <p className="mt-3 rounded-md border border-destructive/50 bg-destructive/10 px-2 py-1.5 text-[11px] text-destructive">
              Internal check failed: {reconciliation[0]}
            </p>
          ) : (
            <p className="mt-3 text-[11px] text-positive">
              Internal check passed: every year reconciles opening + contributions + growth =
              closing.
            </p>
          )}
        </Panel>
      </div>

      <div className="mt-6">
        <Panel
          title="Scrub the years"
          description="Drag to see each year. Dots mark your goal years."
        >
          <YearScrubber
            years={rows.map((r) => r.year)}
            displayValues={rows.map((r) => (r.age === null ? `${r.year}` : `${r.year} · age ${r.age}`))}
            selectionLabel="Selected year"
            index={Math.min(scrubIndex, Math.max(0, rows.length - 1))}
            onIndexChange={setScrubIndex}
            milestones={milestones}
            callouts={[
              { label: "Added this year", value: scrubRow?.contribution ?? 0, format: formatCompactRupees },
              { label: "Growth this year", value: scrubRow?.gain ?? 0, format: formatCompactRupees, tone: "positive" },
              { label: "Closing balance", value: scrubRow?.closing ?? 0, format: formatCompactRupees },
            ]}
          />
          <p className="mt-4 text-[12px] text-[color:var(--text-secondary)]">
            {scrubRow
              ? `${scrubRow.year}${scrubRow.age !== null ? ` · age ${scrubRow.age}` : ""} — ${formatCompactRupees(scrubRow.realClosing)} in today's money.`
              : "No projection years to show."}
          </p>

          <details className="group mt-5 rounded-md border border-border-subtle bg-surface-1/40" open>
            <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-[13px] text-[color:var(--text-secondary)] transition-colors hover:text-foreground">
              <span>Year-by-year projection <span className="ml-2 text-[11px] text-[color:var(--text-tertiary)]">({rows.length} years)</span></span>
              <button type="button" onClick={(event) => { event.preventDefault(); exportProjection(); }} className="rounded-md border border-border px-2.5 py-1 text-[11px] text-muted-foreground hover:text-foreground">Export CSV</button>
            </summary>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border-subtle px-4 py-2">
              <span className="text-[11px] text-muted-foreground">Select a year to update the timeline and chart.</span>
              <Segmented value={density} onChange={setDensity} ariaLabel="Table density" options={[{ value: "comfortable", label: "Comfortable" }, { value: "dense", label: "Dense" }]} />
            </div>
            <div className="max-h-[30rem] overflow-auto border-t border-border-subtle px-4 pb-4">
              <table className="min-w-[980px] w-full text-sm">
                <thead className="sticky top-0 z-10 bg-card">
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="sticky left-0 bg-card py-2 pr-3 font-medium">Year</th>
                    <th className="sticky left-[4.5rem] bg-card py-2 pr-3 font-medium">Age</th>
                    <th className="py-2 pr-3 text-right font-medium">Opening</th>
                    <th className="py-2 pr-3 text-right font-medium">Contribution</th>
                    <th className="py-2 pr-3 text-right font-medium">Growth</th>
                    <th className="py-2 pr-3 text-right font-medium">Closing</th>
                    <th className="py-2 pr-3 text-right font-medium">Today&apos;s money</th>
                    <th className="py-2 pr-3 text-right font-medium">Equity</th>
                    <th className="py-2 pr-3 text-right font-medium">Debt</th>
                    <th className="py-2 text-right font-medium">Gold</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={r.year} onClick={() => setScrubIndex(i)} className={`cursor-pointer border-b border-border/60 last:border-0 hover:bg-surface-1 ${i === scrubIndex ? "bg-surface-2" : ""} ${density === "dense" ? "text-xs" : ""}`}>
                      <td className="sticky left-0 bg-card py-2 pr-3 tabular">{r.year}</td>
                      <td className="sticky left-[4.5rem] bg-card py-2 pr-3 tabular text-muted-foreground">{r.age ?? "—"}</td>
                      <td className="py-2 pr-3 text-right tabular text-muted-foreground">{formatCompactRupees(r.opening)}</td>
                      <td className="py-2 pr-3 text-right tabular text-muted-foreground">{formatCompactRupees(r.contribution)}</td>
                      <td className="py-2 pr-3 text-right tabular text-positive">{formatCompactRupees(r.gain)}</td>
                      <td className="py-2 pr-3 text-right tabular">{formatCompactRupees(r.closing)}</td>
                      <td className="py-2 pr-3 text-right tabular text-muted-foreground">{formatCompactRupees(r.realClosing)}</td>
                      <td className="py-2 pr-3 text-right tabular text-muted-foreground">{formatCompactRupees(r.byAssetClass.equity ?? 0)}</td>
                      <td className="py-2 pr-3 text-right tabular text-muted-foreground">{formatCompactRupees(r.byAssetClass.debt ?? 0)}</td>
                      <td className="py-2 text-right tabular text-muted-foreground">{formatCompactRupees(r.byAssetClass.gold ?? 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </Panel>
      </div>


      <p className="mt-6 text-xs text-muted-foreground">
        These projections are arithmetic, not forecasts of the market. Actual returns arrive
        unevenly: a sequence with the same average return but a deep early drawdown produces a
        materially smaller corpus. Treat the spread between the conservative and optimistic lines as
        the planning range, and revisit it whenever your contributions or circumstances change.
      </p>
    </AppShell>
  );
}
