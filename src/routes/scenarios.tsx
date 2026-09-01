import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
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
import { CHART_MARGIN, chartTooltipStyle, legendStyle } from "@/components/Charts";
import { PercentInput } from "@/components/Wizard";

import { AppShell, EmptyState, Panel } from "@/components/AppShell";
import { ProvenanceBadge, Stat, buttonClass, inputClass } from "@/components/Bits";
import { contributionByAssetClass, summarisePortfolio } from "@/lib/finance/portfolio";
import { project } from "@/lib/finance/projection";
import { ASSET_CLASSES, type AssetClass } from "@/lib/finance/types";
import {
  captureSnapshot,
  loadSnapshots,
  loadWorkspace,
  saveAssumption,
  type SnapshotRow,
  type Workspace,
} from "@/lib/data.functions";
import {
  formatCompactRupees,
  formatDateIST,
  formatRupees,
  relativeTime,
} from "@/lib/finance/format";
import type { Assumptions, ScenarioName } from "@/lib/finance/types";

export const Route = createFileRoute("/scenarios")({
  loader: async (): Promise<{ workspace: Workspace; snapshots: SnapshotRow[] }> => {
    const [workspace, snapshots] = await Promise.all([loadWorkspace(), loadSnapshots()]);
    return { workspace, snapshots };
  },
  head: () => ({
    meta: [
      { title: "Sahil's Finance Intelligence — Scenarios & history" },
      {
        name: "description",
        content:
          "Assumptions behind every forecast, and value over time.",
      },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Sahil's Finance Intelligence — Scenarios & history" },
      {
        property: "og:description",
        content: "Assumptions, sources and history.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ScenariosPage,
});

const SCENARIOS: ScenarioName[] = ["conservative", "base", "optimistic"];

const KEYS: { key: keyof Assumptions; label: string; why: string }[] = [
  {
    key: "equity_return",
    label: "Equity return",
    why: "Drives long-horizon corpus growth more than any other input.",
  },
  { key: "debt_return", label: "Debt return", why: "Applies to EPF, PPF, bonds and debt funds." },
  {
    key: "gold_return",
    label: "Gold return",
    why: "Applies to physical gold, SGBs and gold funds.",
  },
  {
    key: "cash_return",
    label: "Cash return",
    why: "Savings and liquid funds — usually below inflation.",
  },
  {
    key: "inflation",
    label: "Inflation",
    why: "Converts every future rupee into today's purchasing power.",
  },
  { key: "sip_step_up", label: "SIP step-up", why: "Annual increase applied to contributions." },
];

function ScenariosPage() {
  const { workspace, snapshots } = Route.useLoaderData();
  const { holdings, planned, profile, assumptions } = workspace;
  const router = useRouter();
  const save = useServerFn(saveAssumption);
  const capture = useServerFn(captureSnapshot);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<ScenarioName, Assumptions>>(workspace.assumptions);

  async function commit(scenario: ScenarioName, key: keyof Assumptions, value: number) {
    setBusy(true);
    try {
      await save({ data: { key, scenario, value } });
      await router.invalidate();
    } finally {
      setBusy(false);
    }
  }

  const chartData = snapshots.map((s) => ({
    date: s.taken_on,
    value: s.total_value,
    invested: s.invested,
  }));
  const latest = snapshots[snapshots.length - 1] ?? null;
  const first = snapshots[0] ?? null;
  const change = latest && first ? latest.total_value - first.total_value : null;

  // Side-by-side outcome comparison: same holdings and contributions, one run
  // per scenario. Answers "how much does the assumption choice matter?".
  const comparison = useMemo(() => {
    const startValues = Object.fromEntries(ASSET_CLASSES.map((c) => [c, 0])) as Record<
      AssetClass,
      number
    >;
    let invested = 0;
    for (const h of holdings) {
      startValues[h.asset_class] += h.current_value ?? (h.quantity ?? 0) * (h.current_price ?? 0);
      invested += h.cost_basis ?? (h.quantity ?? 0) * (h.avg_price ?? 0);
    }
    const contributions = contributionByAssetClass(planned);
    const startAge = profile.current_age;
    const endAge =
      profile.planning_age ??
      (profile.retirement_age !== null ? profile.retirement_age + 25 : null);
    const years =
      startAge !== null && endAge !== null && endAge > startAge
        ? Math.round(endAge - startAge)
        : (profile.investment_horizon_years ?? 25);
    const startYear = new Date().getFullYear();
    return SCENARIOS.map((s) => {
      const rows = project({
        startingValues: startValues,
        monthlyContribution: contributions,
        assumptions: assumptions[s],
        startYear,
        years,
        startAge,
        investedToDate: invested,
      });
      const checkpoints = [5, 10, 15, 20, years]
        .filter((y, i, arr) => y <= years && arr.indexOf(y) === i)
        .sort((a, b) => a - b);
      return {
        scenario: s,
        rows,
        checkpoints: checkpoints.map((y) => ({ year: y, value: rows[y - 1]?.realClosing ?? 0 })),
        final: rows[rows.length - 1]?.realClosing ?? 0,
      };
    });
  }, [holdings, planned, profile, assumptions]);
  const comparisonYears = comparison[0]?.checkpoints.map((c) => c.year) ?? [];

  return (
    <AppShell
      title="Scenarios & history"
      subtitle="Change these and every forecast follows."
      actions={
        <button
          className={buttonClass}
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setStatus(null);
            try {
              const res = await capture();
              setStatus(
                `Snapshot saved for ${formatDateIST(res.takenOn)} at ${formatRupees(res.totalValue)}.`,
              );
              await router.invalidate();
            } catch (err) {
              setStatus(err instanceof Error ? err.message : "Snapshot failed");
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "Working…" : "Capture snapshot"}
        </button>
      }
    >
      {status ? <p className="mb-4 text-xs text-muted-foreground">{status}</p> : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Snapshots recorded"
          value={String(snapshots.length)}
          sub={latest ? `Latest ${formatDateIST(latest.taken_on)}` : "None yet"}
          provenance="historical"
        />
        <Stat
          label="Latest recorded value"
          value={latest ? formatRupees(latest.total_value) : "—"}
          provenance="historical"
        />
        <Stat
          label="Change since first snapshot"
          value={change === null ? "—" : formatRupees(change)}
          tone={change !== null && change < 0 ? "negative" : "positive"}
          provenance="historical"
        />
        <Stat
          label="Base equity assumption"
          value={`${workspace.assumptions.base.equity_return}%`}
          sub={`Inflation ${workspace.assumptions.base.inflation}%`}
          provenance="assumption"
        />
      </div>

      <div className="mt-6 grid gap-6">
        <Panel
          title="Assumption control panel"
          description="Percent a year. Saves immediately."
        >
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="py-2 pr-3 font-medium">Assumption</th>
                  {SCENARIOS.map((s) => (
                    <th key={s} className="py-2 pr-3 text-right font-medium">
                      {s}
                    </th>
                  ))}
                  <th className="py-2 font-medium">Why it matters</th>
                </tr>
              </thead>
              <tbody>
                {KEYS.map((row) => (
                  <tr key={row.key} className="border-b border-border/60 last:border-0">
                    <td className="py-2 pr-3 text-foreground">{row.label}</td>
                    {SCENARIOS.map((s) => (
                      <td key={s} className="py-2 pr-3 text-right">
                        <PercentInput
                          className={`${inputClass} w-28 text-right`}
                          value={draft[s][row.key]}
                          disabled={busy}
                          min={-50}
                          max={50}
                          onChange={(v) =>
                            setDraft({ ...draft, [s]: { ...draft[s], [row.key]: v ?? 0 } })
                          }
                          onCommit={(v) => {
                            const next = v ?? 0;
                            if (next !== workspace.assumptions[s][row.key]) void commit(s, row.key, next);
                          }}
                        />
                      </td>
                    ))}
                    <td className="py-2 text-xs text-muted-foreground">{row.why}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel
          title="Scenario comparison"
          description="Each scenario, in today's money."
        >
          {holdings.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Add holdings to see how the scenarios diverge.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="py-2 pr-3 font-medium">Scenario</th>
                    {comparisonYears.map((y) => (
                      <th key={y} className="tabular py-2 pr-3 text-right font-medium">
                        Year {y}
                      </th>
                    ))}
                    <th className="tabular py-2 text-right font-medium">vs base at end</th>
                  </tr>
                </thead>
                <tbody>
                  {comparison.map((c) => {
                    const baseFinal = comparison.find((b) => b.scenario === "base")?.final ?? 0;
                    const delta = c.scenario === "base" ? null : c.final - baseFinal;
                    return (
                      <tr
                        key={c.scenario}
                        className={`border-b border-border/60 transition-colors duration-100 last:border-0 hover:bg-secondary/40 ${
                          c.scenario === "base" ? "bg-secondary/20" : ""
                        }`}
                      >
                        <td className="py-2.5 pr-3 font-medium capitalize text-foreground">
                          {c.scenario}
                        </td>
                        {c.checkpoints.map((cp) => (
                          <td
                            key={cp.year}
                            className="tabular py-2.5 pr-3 text-right text-foreground"
                          >
                            {formatCompactRupees(cp.value)}
                          </td>
                        ))}
                        <td className="tabular py-2.5 text-right">
                          {delta === null ? (
                            <span className="text-xs text-muted-foreground">—</span>
                          ) : (
                            <span className={delta >= 0 ? "text-positive" : "text-destructive"}>
                              {delta >= 0 ? "+" : "−"}
                              {formatCompactRupees(Math.abs(delta))}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <Panel
          title="Portfolio value history"
          description="Built from the snapshots you capture — nothing is back-filled."
        >
          {snapshots.length < 2 ? (
            <EmptyState
              title="Not enough history yet"
              detail="Two or more snapshots and this chart tracks value against cost."
            />
          ) : (
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={CHART_MARGIN}>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="var(--color-border)"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="date"
                    stroke="var(--color-muted-foreground)"
                    fontSize={11}
                    tickLine={false}
                  />
                  <YAxis
                    stroke="var(--color-muted-foreground)"
                    fontSize={11}
                    tickLine={false}
                    width={72}
                    tickFormatter={(v: number) => formatCompactRupees(v)}
                  />
                  <Tooltip
                    contentStyle={chartTooltipStyle}
                    formatter={(v: number | string) => formatRupees(Number(v))}
                  />
                  <Legend verticalAlign="bottom" height={28} wrapperStyle={legendStyle} />
                  <Line
                    type="monotone"
                    dataKey="value"
                    stroke="var(--color-chart-equity)"
                    strokeWidth={2}
                    dot={false}
                    name="Value"
                  />
                  <Line
                    type="monotone"
                    dataKey="invested"
                    stroke="var(--color-chart-debt)"
                    strokeWidth={1.5}
                    strokeDasharray="4 4"
                    dot={false}
                    name="Invested"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </Panel>

        <Panel
          title="Data sources"
          description="Where every non-manual number in this app came from."
        >
          {workspace.market.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No external data pulled yet. Refresh fund NAVs from the Portfolio page to populate
              this.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="py-2 pr-3 font-medium">Symbol</th>
                    <th className="py-2 pr-3 font-medium">Source</th>
                    <th className="py-2 pr-3 font-medium">As of</th>
                    <th className="py-2 pr-3 font-medium">Fetched</th>
                    <th className="py-2 font-medium">Freshness</th>
                  </tr>
                </thead>
                <tbody>
                  {workspace.market.map((m) => (
                    <tr key={m.symbol} className="border-b border-border/60 last:border-0">
                      <td className="py-2 pr-3 text-foreground">{m.label ?? m.symbol}</td>
                      <td className="py-2 pr-3 text-xs text-muted-foreground">
                        {m.source_url ? (
                          <a
                            className="hover:text-primary"
                            href={m.source_url}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {m.source}
                          </a>
                        ) : (
                          m.source
                        )}
                      </td>
                      <td className="py-2 pr-3 text-xs text-muted-foreground">
                        {formatDateIST(m.data_date)}
                      </td>
                      <td className="py-2 pr-3 text-xs text-muted-foreground">
                        {relativeTime(m.fetched_at)}
                      </td>
                      <td className="py-2">
                        <ProvenanceBadge
                          kind={m.freshness === "stale" ? "stale" : "current"}
                          note={m.freshness}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>
    </AppShell>
  );
}
