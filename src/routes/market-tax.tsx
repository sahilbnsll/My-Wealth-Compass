import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AppShell, EmptyState, Panel } from "@/components/AppShell";
import { Field, Stat, buttonClass, inputClass } from "@/components/Bits";
import { CHART_MARGIN, chartTooltipStyle, legendStyle } from "@/components/Charts";
import {
  loadMacro,
  loadTaxSettings,
  loadWorkspace,
  refreshMacro,
  saveTaxSettings as saveTaxSettingsFn,
  type MacroPointRow,
  type Workspace,
} from "@/lib/data.functions";
import { formatCompactRupees, formatDateIST, formatPct, formatRupees, relativeTime } from "@/lib/finance/format";
import { contributionByAssetClass, summarisePortfolio } from "@/lib/finance/portfolio";
import { project } from "@/lib/finance/projection";
import {
  CESS_RATE,
  LTCG_EQUITY_EXEMPTION,
  dividendDragPct,
  dividendTax,
  taxIfSoldToday,
  taxOnProjectedCorpus,
  type TaxSettings,
} from "@/lib/finance/tax";
import { ASSET_CLASSES, type AssetClass, type ScenarioName } from "@/lib/finance/types";

export const Route = createFileRoute("/market-tax")({
  loader: async (): Promise<{ workspace: Workspace; tax: TaxSettings; macro: MacroPointRow[] }> => {
    const [workspace, tax, macro] = await Promise.all([loadWorkspace(), loadTaxSettings(), loadMacro()]);
    return { workspace, tax, macro };
  },
  head: () => ({
    meta: [
      { title: "Sahil's Finance Intelligence — Market & tax" },
      {
        name: "description",
        content:
          "The external context behind your numbers: India CPI, the RBI repo rate and index levels, alongside capital gains and dividend tax on your own portfolio.",
      },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Sahil's Finance Intelligence — Market & tax" },
      {
        property: "og:description",
        content: "Macro context and the tax impact on your portfolio, in one place.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MarketTaxPage,
});

const SCENARIOS: ScenarioName[] = ["conservative", "base", "optimistic"];

const CATEGORY_LABEL: Record<string, string> = {
  equity: "Equity",
  debt: "Debt / slab",
  gold: "Gold",
  exempt: "Exempt",
  other: "Other",
};

const CONFIDENCE_STYLE: Record<string, string> = {
  high: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
  medium: "border-amber-500/40 bg-amber-500/10 text-amber-300",
  low: "border-rose-500/40 bg-rose-500/10 text-rose-300",
};

const CONFIDENCE_MEANING: Record<string, string> = {
  high: "Official and current — safe to plan on.",
  medium: "Official but lagging, or unofficial but timely — use as context.",
  low: "Stale or indicative only — verify before acting on it.",
};

function ConfidenceBadge({ level }: { level: string }) {
  return (
    <span
      title={CONFIDENCE_MEANING[level] ?? ""}
      className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] uppercase tracking-wide ${
        CONFIDENCE_STYLE[level] ?? "border-border bg-secondary text-muted-foreground"
      }`}
    >
      {level} confidence
    </span>
  );
}

function fmtValue(row: MacroPointRow): string {
  if (row.kind === "index") return row.value.toLocaleString("en-IN", { maximumFractionDigits: 2 });
  return `${row.value.toFixed(2)}%`;
}

type Tab = "market" | "tax";

function MarketTaxPage() {
  const { workspace, tax, macro } = Route.useLoaderData();
  const [tab, setTab] = useState<Tab>("market");

  // Shared freshness: the most recent fetch across every external series.
  const freshest = macro.reduce<string | null>(
    (acc, r) => (acc === null || (r.fetched_at ?? "") > acc ? (r.fetched_at ?? acc) : acc),
    null,
  );

  return (
    <AppShell
      title="Market & tax"
      subtitle="External context that explains your numbers — the economy at one end, your own tax bill at the other."
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-subtle pb-3">
        <div role="tablist" aria-label="Market and tax views" className="flex gap-1.5">
          {(
            [
              ["market", "Market Context"],
              ["tax", "Tax Impact"],
            ] as const
          ).map(([value, label]) => {
            const active = tab === value;
            return (
              <button
                key={value}
                role="tab"
                aria-selected={active}
                onClick={() => setTab(value)}
                className={`rounded-md border px-3.5 py-2 text-[13px] font-medium transition-colors duration-100 ${
                  active
                    ? "border-teal/50 bg-teal/15 text-teal"
                    : "border-border-subtle bg-surface-2 text-[color:var(--text-secondary)] hover:text-foreground"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
        <p className="text-[12px] text-[color:var(--text-secondary)]">
          External data as of {freshest ? relativeTime(freshest) : "never fetched"}
        </p>
      </div>

      <div className="mt-6">
        {tab === "market" ? <MarketContext rows={macro} /> : <TaxImpact workspace={workspace} tax={tax} />}
      </div>
    </AppShell>
  );
}

/* -------------------------------------------------------- Market context */

function MarketContext({ rows }: { rows: MacroPointRow[] }) {
  const router = useRouter();
  const refresh = useServerFn(refreshMacro);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const cpi = rows.find((r) => r.kind === "inflation") ?? null;
  const repo = rows.find((r) => r.kind === "policy_rate") ?? null;
  const indices = rows.filter((r) => r.kind === "index");
  const returns = rows.filter((r) => r.kind === "index_return");
  const nifty = indices.find((r) => r.symbol === "^NSEI") ?? null;
  const niftyReturn = returns.find((r) => r.symbol === "^NSEI_1Y") ?? null;
  const realRate = cpi && repo ? repo.value - cpi.value : null;

  async function run() {
    setBusy(true);
    setStatus(null);
    try {
      const res = await refresh();
      setStatus(
        res.failures.length > 0
          ? `Updated ${res.updated} series. Could not reach: ${res.failures.join(", ")}.`
          : `Updated ${res.updated} series from their official sources.`,
      );
      await router.invalidate();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Refresh failed");
    } finally {
      setBusy(false);
    }
  }

  if (rows.length === 0) {
    return (
      <EmptyState
        title="No macro data yet"
        detail="Fetch CPI inflation from the IMF price database, the repo rate from the BIS policy-rate series, and index levels from the public market feed."
        action={
          <button className={buttonClass} disabled={busy} onClick={run}>
            {busy ? "Fetching…" : "Fetch macro data"}
          </button>
        }
      />
    );
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-[12px] text-[color:var(--text-secondary)]">
          Consumer price inflation, the RBI&apos;s policy rate and headline equity index levels. Every figure carries its
          source, the date it refers to, and how much confidence it deserves.
        </p>
        <button className={buttonClass} disabled={busy} onClick={run}>
          {busy ? "Fetching…" : "Refresh macro data"}
        </button>
      </div>
      {status ? <p className="mb-4 text-xs text-muted-foreground">{status}</p> : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="CPI inflation (YoY)"
          value={cpi ? `${cpi.value.toFixed(2)}%` : "—"}
          sub={cpi?.data_date ? `As of ${formatDateIST(cpi.data_date)}` : "Not fetched"}
          provenance={cpi?.freshness === "stale" ? "stale" : "current"}
          sensitive={false}
        />
        <Stat
          label="RBI policy repo rate"
          value={repo ? `${repo.value.toFixed(2)}%` : "—"}
          sub={repo?.data_date ? `As of ${formatDateIST(repo.data_date)}` : "Not fetched"}
          provenance={repo?.freshness === "stale" ? "stale" : "current"}
          sensitive={false}
        />
        <Stat
          label="Real policy rate"
          value={realRate === null ? "—" : `${realRate.toFixed(2)}%`}
          sub="Repo rate minus CPI inflation"
          tone={realRate !== null && realRate < 0 ? "negative" : "positive"}
          provenance="current"
          sensitive={false}
        />
        <Stat
          label="NIFTY 50"
          value={nifty ? nifty.value.toLocaleString("en-IN", { maximumFractionDigits: 0 }) : "—"}
          sub={niftyReturn ? `${niftyReturn.value.toFixed(1)}% over 1 year` : "Delayed level"}
          tone={niftyReturn && niftyReturn.value < 0 ? "negative" : "positive"}
          provenance="current"
          sensitive={false}
        />
      </div>

      <div className="mt-6 grid gap-6">
        <Panel
          title="What this means for your plan"
          description="Macro against your assumptions."
        >
          <ul className="space-y-2 text-sm text-muted-foreground">
            {cpi ? (
              <li>
                Consumer prices are rising at <span className="tabular text-foreground">{cpi.value.toFixed(2)}%</span> a
                year. Your projections convert future rupees into today&apos;s money using the inflation assumption on
                the Scenarios page — if the two differ a lot, revisit it.
              </li>
            ) : null}
            {realRate !== null ? (
              <li>
                The real policy rate is <span className="tabular text-foreground">{realRate.toFixed(2)}%</span>.{" "}
                {realRate < 0
                  ? "Cash and deposits are losing purchasing power, which argues against holding excess idle cash."
                  : "Deposits and debt funds are earning above inflation, so a debt allocation is currently being paid for its safety."}
              </li>
            ) : null}
            {niftyReturn ? (
              <li>
                The NIFTY 50 is <span className="tabular text-foreground">{niftyReturn.value.toFixed(1)}%</span> over the
                last year on price alone. One year says nothing about long-run returns — your equity assumption should
                stay anchored to a full-cycle view.
              </li>
            ) : null}
          </ul>
        </Panel>

        <Panel
          title="Series, sources and confidence"
          description="Each row shows its source and age."
        >
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="py-2 pr-3 font-medium">Series</th>
                  <th className="py-2 pr-3 font-medium">Value</th>
                  <th className="py-2 pr-3 font-medium">Observation date</th>
                  <th className="py-2 pr-3 font-medium">Source</th>
                  <th className="py-2 pr-3 font-medium">Confidence</th>
                  <th className="py-2 font-medium">Fetched</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.symbol} className="border-b border-border/60 align-top">
                    <td className="py-2 pr-3">
                      <div className="text-foreground">{r.label ?? r.symbol}</div>
                      <div className="text-xs text-muted-foreground">{r.symbol}</div>
                    </td>
                    <td className="tabular py-2 pr-3 text-foreground">{fmtValue(r)}</td>
                    <td className="py-2 pr-3 text-muted-foreground">{r.data_date ? formatDateIST(r.data_date) : "—"}</td>
                    <td className="py-2 pr-3 text-muted-foreground">
                      {r.source_url ? (
                        <a
                          className="underline decoration-dotted underline-offset-2 hover:text-foreground"
                          href={r.source_url}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {r.source}
                        </a>
                      ) : (
                        r.source
                      )}
                      <div className="mt-1 max-w-sm text-xs text-muted-foreground/80">{r.note}</div>
                    </td>
                    <td className="py-2 pr-3">
                      <ConfidenceBadge level={r.confidence} />
                    </td>
                    <td className="py-2 text-xs text-muted-foreground">{relativeTime(r.fetched_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>
    </>
  );
}

/* ------------------------------------------------------------ Tax impact */

function TaxImpact({ workspace, tax }: { workspace: Workspace; tax: TaxSettings }) {
  const router = useRouter();
  const save = useServerFn(saveTaxSettingsFn);
  const [draft, setDraft] = useState<TaxSettings>(tax);
  const [busy, setBusy] = useState(false);
  const [scenario, setScenario] = useState<ScenarioName>("base");

  const { holdings, planned, profile, assumptions } = workspace;
  const summary = useMemo(() => summarisePortfolio(holdings), [holdings]);
  const sold = useMemo(() => taxIfSoldToday(summary.holdings, draft), [summary.holdings, draft]);

  const annualIncome = (summary.totalValue * draft.dividendYieldPct) / 100;
  const incomeTax = dividendTax(annualIncome, draft);
  const drag = dividendDragPct(draft);

  const startValues = useMemo(() => {
    const out = Object.fromEntries(ASSET_CLASSES.map((c) => [c, 0])) as Record<AssetClass, number>;
    for (const h of summary.holdings) out[h.asset_class] = (out[h.asset_class] ?? 0) + h.value;
    return out;
  }, [summary.holdings]);
  const contributions = useMemo(() => contributionByAssetClass(planned), [planned]);

  const startAge = profile.current_age;
  const endAge = profile.planning_age ?? (profile.retirement_age !== null ? profile.retirement_age + 25 : null);
  const years =
    startAge !== null && endAge !== null && endAge > startAge
      ? Math.round(endAge - startAge)
      : (profile.investment_horizon_years ?? 25);
  const startYear = new Date().getFullYear();

  const projections = useMemo(() => {
    return SCENARIOS.map((s) => {
      const a = assumptions[s];
      const gross = project({
        startingValues: startValues,
        monthlyContribution: contributions,
        assumptions: a,
        startYear,
        years,
        startAge,
        investedToDate: summary.invested,
      });
      // Dividend and interest income is taxed every year, which shaves the
      // compounding rate itself — modelled as a drag on each asset return.
      const netOfIncomeTax = project({
        startingValues: startValues,
        monthlyContribution: contributions,
        assumptions: {
          ...a,
          equity_return: Math.max(0, a.equity_return - drag),
          debt_return: Math.max(0, a.debt_return - drag),
          gold_return: a.gold_return,
          cash_return: Math.max(0, a.cash_return - drag),
        },
        startYear,
        years,
        startAge,
        investedToDate: summary.invested,
      });
      const finalGross = gross[gross.length - 1];
      const finalNet = netOfIncomeTax[netOfIncomeTax.length - 1];
      const exit = finalNet
        ? taxOnProjectedCorpus(finalNet.byAssetClass as Record<string, number>, finalNet.totalInvested, draft)
        : null;
      return {
        scenario: s,
        grossCorpus: finalGross?.closing ?? 0,
        afterIncomeTax: finalNet?.closing ?? 0,
        exit,
        realNet: finalNet && exit ? exit.netCorpus / Math.pow(1 + a.inflation / 100, years) : 0,
      };
    });
  }, [assumptions, startValues, contributions, startYear, years, startAge, summary.invested, drag, draft]);

  const current = projections.find((p) => p.scenario === scenario)!;
  const totalTaxCost = current.grossCorpus - (current.exit?.netCorpus ?? current.grossCorpus);

  const chartData = projections.map((p) => ({
    scenario: p.scenario[0]!.toUpperCase() + p.scenario.slice(1),
    "Before tax": Math.round(p.grossCorpus),
    "After tax": Math.round(p.exit?.netCorpus ?? 0),
  }));

  async function persist() {
    setBusy(true);
    try {
      await save({ data: draft });
      await router.invalidate();
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-[12px] text-[color:var(--text-secondary)]">
          What the taxman takes: capital gains if you sold today, tax on dividends and interest each year, and how much
          of the projected corpus never reaches you. Rules follow the regime effective from 23 July 2024, plus 4% cess.
        </p>
        <select
          className={`${inputClass} w-auto`}
          value={scenario}
          onChange={(e) => setScenario(e.target.value as ScenarioName)}
        >
          {SCENARIOS.map((s) => (
            <option key={s} value={s}>
              {s[0]!.toUpperCase() + s.slice(1)} scenario
            </option>
          ))}
        </select>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Tax if sold today"
          value={formatRupees(sold.totalTax)}
          sub={
            sold.effectiveRatePct === null
              ? "No taxable gains"
              : `${formatPct(sold.effectiveRatePct)} of ${formatRupees(sold.totalGain)} in gains`
          }
          tone="negative"
          provenance="current"
        />
        <Stat
          label="Net proceeds"
          value={formatRupees(sold.netProceeds)}
          sub={`From ${formatRupees(sold.totalValue)} of holdings`}
          provenance="current"
        />
        <Stat
          label="Annual tax on income"
          value={formatRupees(incomeTax)}
          sub={`On ${formatRupees(annualIncome)} of dividends and interest`}
          tone="negative"
          provenance="assumption"
        />
        <Stat
          label={`Tax on the ${startYear + years - 1} corpus`}
          value={formatCompactRupees(totalTaxCost)}
          sub={`${formatCompactRupees(current.exit?.netCorpus ?? 0)} reaches you`}
          tone="negative"
          provenance="forecast"
        />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[320px_1fr]">
        <Panel title="Your tax profile" description="Two inputs drive this page.">
          <div className="grid gap-4">
            <Field
              label="Marginal slab rate"
              hint="Your top income-tax slab, before cess. Debt gains and dividends are taxed here."
            >
              <input
                type="number"
                step="0.5"
                className={inputClass}
                value={draft.marginalRatePct}
                onChange={(e) => setDraft({ ...draft, marginalRatePct: Number(e.target.value) })}
              />
            </Field>
            <Field
              label="Dividend / interest yield"
              hint="Share of the portfolio paid out as taxable income each year, rather than compounding untaxed."
            >
              <input
                type="number"
                step="0.1"
                className={inputClass}
                value={draft.dividendYieldPct}
                onChange={(e) => setDraft({ ...draft, dividendYieldPct: Number(e.target.value) })}
              />
            </Field>
            <button className={buttonClass} disabled={busy} onClick={persist}>
              {busy ? "Saving…" : "Save tax settings"}
            </button>
            <p className="text-xs text-muted-foreground">
              Annual income tax drags roughly {drag.toFixed(2)} percentage points off the compounding rate, which is
              applied to the projections below.
            </p>
          </div>
        </Panel>

        <Panel
          title="What tax does to the corpus"
          description="Corpus after annual tax and a full exit at the horizon."
        >
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={CHART_MARGIN} barGap={6} barCategoryGap="32%">
                <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="scenario" stroke="var(--color-muted-foreground)" fontSize={12} tickLine={false} />
                <YAxis
                  stroke="var(--color-muted-foreground)"
                  fontSize={11}
                  tickLine={false}
                  width={72}
                  tickFormatter={(v: number) => formatCompactRupees(v)}
                />
                <Tooltip
                  cursor={{ fill: "var(--bg-surface-2)", opacity: 0.4 }}
                  formatter={(v: number) => formatRupees(v)}
                  contentStyle={chartTooltipStyle}
                />
                <Legend verticalAlign="bottom" height={28} wrapperStyle={legendStyle} />
                <Bar dataKey="Before tax" fill="var(--color-chart-cash)" radius={[3, 3, 0, 0]} maxBarSize={54} />
                <Bar dataKey="After tax" fill="var(--color-chart-equity)" radius={[3, 3, 0, 0]} maxBarSize={54} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-xs text-muted-foreground">Gross corpus</dt>
              <dd className="tabular privacy-sensitive text-foreground">{formatCompactRupees(current.grossCorpus)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">After annual income tax</dt>
              <dd className="tabular privacy-sensitive text-foreground">{formatCompactRupees(current.afterIncomeTax)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">After exit capital gains tax</dt>
              <dd className="tabular privacy-sensitive text-foreground">{formatCompactRupees(current.exit?.netCorpus ?? 0)}</dd>
            </div>
          </dl>
          <p className="mt-3 text-xs text-muted-foreground">
            In today&apos;s money that net corpus is {formatCompactRupees(current.realNet)} after{" "}
            {formatPct(assumptions[scenario].inflation)} inflation. Effective rate on the projected gain:{" "}
            {current.exit?.effectiveRatePct === null || current.exit === null
              ? "—"
              : formatPct(current.exit.effectiveRatePct)}
            .
          </p>
        </Panel>
      </div>

      <div className="mt-6">
        <Panel
          collapsible
          title="Capital gains by holding, if sold today"
          description={`One ₹${(LTCG_EQUITY_EXEMPTION / 1000).toFixed(0)}k long-term exemption, largest gains first. Includes ${CESS_RATE}% cess.`}
        >
          {summary.holdings.length === 0 ? (
            <EmptyState
              title="No holdings yet"
              detail="Add holdings on the Portfolio page and the tax position for each one will appear here."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="py-2 pr-3 font-medium">Holding</th>
                    <th className="py-2 pr-3 font-medium">Category</th>
                    <th className="py-2 pr-3 font-medium">Held</th>
                    <th className="py-2 pr-3 text-right font-medium">Gain</th>
                    <th className="py-2 pr-3 text-right font-medium">Taxable</th>
                    <th className="py-2 pr-3 text-right font-medium">Rate</th>
                    <th className="py-2 pr-3 text-right font-medium">Tax</th>
                    <th className="py-2 font-medium">Why</th>
                  </tr>
                </thead>
                <tbody>
                  {sold.rows.map((r) => (
                    <tr key={r.id} className="border-b border-border/60 align-top">
                      <td className="py-2 pr-3 text-foreground">{r.name}</td>
                      <td className="py-2 pr-3 text-muted-foreground">{CATEGORY_LABEL[r.category] ?? r.category}</td>
                      <td className="py-2 pr-3 text-muted-foreground">
                        {r.months === null ? "Unknown" : `${r.months} mo`}
                        {r.longTerm ? " · long-term" : ""}
                      </td>
                      <td className={`tabular privacy-sensitive py-2 pr-3 text-right ${r.gain < 0 ? "text-rose-400" : "text-foreground"}`}>
                        {formatRupees(r.gain)}
                      </td>
                      <td className="tabular privacy-sensitive py-2 pr-3 text-right text-muted-foreground">{formatRupees(r.taxableGain)}</td>
                      <td className="tabular py-2 pr-3 text-right text-muted-foreground">{r.ratePct.toFixed(1)}%</td>
                      <td className="tabular privacy-sensitive py-2 pr-3 text-right text-foreground">{formatRupees(r.tax)}</td>
                      <td className="max-w-sm py-2 text-xs text-muted-foreground">{r.reason}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="text-sm">
                    <td className="py-2 pr-3 font-medium text-foreground" colSpan={3}>
                      Total
                    </td>
                    <td className="tabular privacy-sensitive py-2 pr-3 text-right text-foreground">{formatRupees(sold.totalGain)}</td>
                    <td className="py-2 pr-3" />
                    <td className="py-2 pr-3" />
                    <td className="tabular privacy-sensitive py-2 pr-3 text-right text-foreground">{formatRupees(sold.totalTax)}</td>
                    <td className="py-2 text-xs text-muted-foreground">
                      {formatRupees(sold.exemptionUsed)} of the ₹1.25L long-term equity exemption used.
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </Panel>
      </div>
    </>
  );
}
