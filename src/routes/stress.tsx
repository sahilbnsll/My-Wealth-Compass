import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AppShell, Panel } from "@/components/AppShell";
import { AlertRow, Figure } from "@/components/Bits";
import { CHART_MARGIN, ChartFrame, chartTooltipStyle, legendStyle } from "@/components/Charts";
import { loadWorkspace } from "@/lib/data.functions";
import { formatCompactRupees, formatPct, formatRupees } from "@/lib/finance/format";
import { contributionByAssetClass } from "@/lib/finance/portfolio";
import { project, type ProjectionInput } from "@/lib/finance/projection";
import { runStressScenario, STRESS_SCENARIOS } from "@/lib/finance/stress";
import { ASSET_CLASSES, type AssetClass, type ScenarioName } from "@/lib/finance/types";

export const Route = createFileRoute("/stress")({
  loader: () => loadWorkspace(),
  head: () => ({
    meta: [
      { title: "Sahil's Finance Intelligence — Stress Tests" },
      {
        name: "description",
        content:
          "What a crash, a weak decade or lost income would do to your plan.",
      },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Sahil's Finance Intelligence — Stress Tests" },
      {
        property: "og:description",
        content: "Damage, drawdown and recovery time for each shock.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: StressPage,
});

const HORIZONS = [10, 15, 20, 25, 30];

function StressPage() {
  const { holdings, planned, profile, assumptions } = Route.useLoaderData();
  const [scenario, setScenario] = useState<ScenarioName>("base");
  const [years, setYears] = useState(20);
  const [openId, setOpenId] = useState<string>(STRESS_SCENARIOS[0]?.id ?? "");

  const startValues = useMemo(() => {
    const out = Object.fromEntries(ASSET_CLASSES.map((c) => [c, 0])) as Record<AssetClass, number>;
    for (const h of holdings) {
      const v = h.current_value ?? (h.quantity ?? 0) * (h.current_price ?? 0);
      out[h.asset_class] = (out[h.asset_class] ?? 0) + v;
    }
    return out;
  }, [holdings]);

  const contributions = useMemo(() => contributionByAssetClass(planned), [planned]);
  const portfolioValue = ASSET_CLASSES.reduce((a, c) => a + (startValues[c] ?? 0), 0);

  const input: ProjectionInput = useMemo(
    () => ({
      startingValues: startValues,
      monthlyContribution: contributions,
      assumptions: assumptions[scenario],
      startYear: new Date().getFullYear(),
      years,
      startAge: profile.current_age,
    }),
    [startValues, contributions, assumptions, scenario, years, profile.current_age],
  );

  const baseline = useMemo(() => project(input), [input]);
  const results = useMemo(
    () => STRESS_SCENARIOS.map((s) => runStressScenario(input, s, baseline)),
    [input, baseline],
  );

  const worst = useMemo(
    () => results.reduce((a, b) => (b.deltaVsBaseline < a.deltaVsBaseline ? b : a), results[0]!),
    [results],
  );
  const baselineTerminal = baseline[baseline.length - 1]?.closing ?? 0;

  const open = results.find((r) => r.scenario.id === openId) ?? results[0]!;
  const chartData = useMemo(
    () =>
      baseline.map((row, i) => ({
        year: row.year,
        base: Math.round(row.closing),
        stressed: Math.round(open.rows[i]?.closing ?? 0),
      })),
    [baseline, open],
  );

  if (portfolioValue <= 0 && ASSET_CLASSES.every((c) => (contributions[c] ?? 0) === 0)) {
    return (
      <AppShell title="Stress tests" subtitle="How the plan behaves when things go wrong.">
        <AlertRow
          level="info"
          title="Nothing to stress yet"
          detail="Add holdings or a monthly plan first. Tests run on your real numbers."
        />
      </AppShell>
    );
  }

  return (
    <AppShell
      title="Stress tests"
      subtitle="Sensitivity, not prediction."
    >
      <section className="border-b border-border-subtle pb-8">
        <p className="eyebrow text-[color:var(--text-secondary)]">Worst case at {years} years</p>
        <p className="metric-xl mt-3 privacy-sensitive text-destructive">
          {formatRupees(worst.deltaVsBaseline)}
        </p>
        <p className="mt-3 max-w-2xl text-[13px] leading-relaxed text-[color:var(--text-secondary)]">
          “{worst.scenario.name}” leaves you {formatPct(Math.abs(worst.deltaVsBaselinePct))} below the base plan
          in {years} years — {formatRupees(worst.terminalValue)} instead of {formatRupees(baselineTerminal)}.
        </p>

        <dl className="mt-8 grid gap-x-10 gap-y-6 sm:grid-cols-2 lg:grid-cols-4">
          <Figure label="Base plan at horizon" value={formatRupees(baselineTerminal)} note={`${years} years from now`} />
          <Figure
            label="Deepest fall"
            value={formatPct(Math.max(...results.map((r) => r.maxDrawdownPct)))}
            note="Peak to trough, across all scenarios"
            tone="negative"
            sensitive={false}
          />
          <Figure
            label="Longest recovery"
            value={
              results.some((r) => r.yearsToRecover === null)
                ? "Never"
                : `${Math.max(...results.map((r) => r.yearsToRecover ?? 0))} yrs`
            }
            note="Back to today's portfolio value"
            sensitive={false}
          />
          <Figure
            label="Scenarios run"
            value={String(results.length)}
            note="All using your live holdings and SIPs"
            sensitive={false}
          />
        </dl>

        <div className="mt-8 flex flex-wrap items-center gap-3 text-[12px]">
          <span className="text-[color:var(--text-tertiary)]">Assumption set</span>
          {(["conservative", "base", "optimistic"] as ScenarioName[]).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setScenario(s)}
              className={`rounded-full px-3 py-1 capitalize transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--color-primary)] ${
                scenario === s
                  ? "bg-[color:var(--color-primary)] text-[color:var(--color-primary-foreground)]"
                  : "border border-border-subtle text-[color:var(--text-secondary)] hover:text-foreground"
              }`}
            >
              {s}
            </button>
          ))}
          <span className="ml-4 text-[color:var(--text-tertiary)]">Horizon</span>
          {HORIZONS.map((h) => (
            <button
              key={h}
              type="button"
              onClick={() => setYears(h)}
              className={`rounded-full px-3 py-1 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--color-primary)] ${
                years === h
                  ? "bg-[color:var(--color-primary)] text-[color:var(--color-primary-foreground)]"
                  : "border border-border-subtle text-[color:var(--text-secondary)] hover:text-foreground"
              }`}
            >
              {h}y
            </button>
          ))}
        </div>
      </section>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_1.3fr]">
        <div>
          <p className="eyebrow text-[color:var(--text-secondary)]">Scenarios</p>
          <ul className="mt-4 divide-y divide-[color:var(--border-subtle)]">
            {results.map((r) => {
              const active = r.scenario.id === open.scenario.id;
              return (
                <li key={r.scenario.id}>
                  <button
                    type="button"
                    onClick={() => setOpenId(r.scenario.id)}
                    aria-current={active}
                    className={`w-full py-4 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--color-primary)] ${
                      active ? "" : "opacity-70 hover:opacity-100"
                    }`}
                  >
                    <div className="flex items-baseline justify-between gap-4">
                      <span className="text-[14px] font-medium text-foreground">{r.scenario.name}</span>
                      <span className="privacy-sensitive font-mono text-[13px] text-destructive">
                        {formatPct(r.deltaVsBaselinePct)}
                      </span>
                    </div>
                    <p className="mt-1 text-[12px] leading-relaxed text-[color:var(--text-secondary)]">
                      {r.scenario.description}
                    </p>
                    {active ? (
                      <div className="mt-3 grid gap-2 text-[12px] text-[color:var(--text-secondary)]">
                        <div className="flex justify-between">
                          <span>Value at {years} years</span>
                          <span className="privacy-sensitive font-mono text-foreground">
                            {formatRupees(r.terminalValue)}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span>In today&rsquo;s money</span>
                          <span className="privacy-sensitive font-mono text-foreground">
                            {formatRupees(r.realTerminalValue)}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span>Deepest fall</span>
                          <span className="font-mono text-foreground">{formatPct(r.maxDrawdownPct)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Back to today&rsquo;s value</span>
                          <span className="font-mono text-foreground">
                            {r.yearsToRecover === null
                              ? "Not within the horizon"
                              : r.yearsToRecover === 0
                                ? "Never falls below"
                                : `${r.yearsToRecover} years`}
                          </span>
                        </div>
                        <p className="mt-1 text-[color:var(--text-tertiary)]">{r.scenario.basis}</p>
                      </div>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        <Panel
          title={open.scenario.name}
          description="The stressed path against the base plan, in nominal rupees."
        >
          <ChartFrame height={340}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={CHART_MARGIN}>
                <CartesianGrid stroke="var(--border-subtle)" vertical={false} />
                <XAxis
                  dataKey="year"
                  tick={{ fontSize: 11, fill: "var(--text-tertiary)" }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  tickFormatter={(v: number) => formatCompactRupees(v)}
                  tick={{ fontSize: 11, fill: "var(--text-tertiary)" }}
                  tickLine={false}
                  axisLine={false}
                  width={70}
                />
                <Tooltip
                  contentStyle={chartTooltipStyle}
                  formatter={(v: number, name: string) => [formatRupees(v), name]}
                />
                <Legend wrapperStyle={legendStyle} />
                <Line
                  type="monotone"
                  dataKey="base"
                  name="Base plan"
                  stroke="var(--text-tertiary)"
                  strokeWidth={1.5}
                  strokeDasharray="4 4"
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="stressed"
                  name="Stressed"
                  stroke="var(--color-primary)"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </ChartFrame>
          <p className="mt-4 text-[12px] leading-relaxed text-[color:var(--text-secondary)]">
            Shocks are applied to your real holdings and contributions. They describe the shape of past
            episodes, not a prediction of the next one.
          </p>
        </Panel>
      </div>
    </AppShell>
  );
}
