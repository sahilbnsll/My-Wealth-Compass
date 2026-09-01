import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  Area,
  ComposedChart,
  CartesianGrid,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AppShell, Panel } from "@/components/AppShell";
import { AlertRow, Figure, inputClass } from "@/components/Bits";
import { CHART_MARGIN, ChartFrame, chartTooltipStyle, legendStyle } from "@/components/Charts";
import { FinancialAmountInput } from "@/components/Wizard";
import { loadWorkspace } from "@/lib/data.functions";
import { formatCompactRupees, formatPct, formatRupees } from "@/lib/finance/format";
import { contributionByAssetClass } from "@/lib/finance/portfolio";
import { analyseRetirement, sustainableAnnualSpend, type RetirementInput } from "@/lib/finance/retirement";
import { ASSET_CLASSES, type AssetClass, type ScenarioName } from "@/lib/finance/types";

export const Route = createFileRoute("/retirement")({
  loader: () => loadWorkspace(),
  head: () => ({
    meta: [
      { title: "Sahil's Finance Intelligence — Retirement" },
      {
        name: "description",
        content:
          "Whether your money lasts: contributions stop, withdrawals begin.",
      },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Sahil's Finance Intelligence — Retirement" },
      {
        property: "og:description",
        content: "Does the corpus last to your longevity age?",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: RetirementPage,
});

const SCENARIOS: ScenarioName[] = ["conservative", "base", "optimistic"];

function RetirementPage() {
  const { holdings, planned, profile, assumptions } = Route.useLoaderData();
  const [scenario, setScenario] = useState<ScenarioName>("base");

  const startAge = profile.current_age;
  const defaultRetirementAge = profile.retirement_age ?? (startAge !== null ? startAge + 25 : 60);
  const defaultLongevity = profile.planning_age ?? defaultRetirementAge + 30;
  const defaultSpend = Math.round(
    (profile.essential_monthly_expenses ?? profile.monthly_expenses ?? 0) * 12,
  );

  const [retirementAge, setRetirementAge] = useState(defaultRetirementAge);
  const [longevityAge, setLongevityAge] = useState(defaultLongevity);
  const [annualSpend, setAnnualSpend] = useState(defaultSpend);
  const [otherIncome, setOtherIncome] = useState(0);

  const startValues = useMemo(() => {
    const out = Object.fromEntries(ASSET_CLASSES.map((c) => [c, 0])) as Record<AssetClass, number>;
    for (const h of holdings) {
      const v = h.current_value ?? (h.quantity ?? 0) * (h.current_price ?? 0);
      out[h.asset_class] = (out[h.asset_class] ?? 0) + v;
    }
    return out;
  }, [holdings]);
  const contributions = useMemo(() => contributionByAssetClass(planned), [planned]);

  const missingProfile = startAge === null;
  const years = startAge !== null ? Math.max(1, Math.round(longevityAge - startAge)) : 40;

  const input: RetirementInput | null = useMemo(() => {
    if (startAge === null) return null;
    return {
      startingValues: startValues,
      monthlyContribution: contributions,
      assumptions: assumptions[scenario],
      startYear: new Date().getFullYear(),
      years,
      startAge,
      decumulation: {
        retirementAge,
        annualSpendToday: annualSpend,
        otherAnnualIncomeToday: otherIncome,
      },
    };
  }, [startAge, startValues, contributions, assumptions, scenario, years, retirementAge, annualSpend, otherIncome]);

  const analysis = useMemo(() => (input ? analyseRetirement(input) : null), [input]);
  const safeSpend = useMemo(() => (input ? sustainableAnnualSpend(input) : null), [input]);

  const chartData = useMemo(
    () =>
      (analysis?.rows ?? []).map((r) => ({
        age: r.age ?? r.year,
        corpus: Math.round(r.closing),
        real: Math.round(r.realClosing),
        withdrawal: Math.round(r.withdrawal),
      })),
    [analysis],
  );

  return (
    <AppShell
      title="Retirement"
      subtitle="Withdrawals rise with inflation. Same engine as Projections."
    >
      {missingProfile ? (
        <AlertRow
          level="warning"
          title="Your current age is missing"
          detail="Add your age, retirement age and monthly spend on Inputs to start."
        />
      ) : analysis ? (
        <>
          <section className="border-b border-border-subtle pb-8">
            <p className="eyebrow text-[color:var(--text-secondary)]">
              {analysis.survives ? `Money lasts past age ${longevityAge}` : "The money runs out"}
            </p>
            <p
              className={`metric-xl mt-3 ${analysis.survives ? "text-positive" : "text-destructive"}`}
            >
              {analysis.survives ? `Age ${longevityAge}+` : `Age ${analysis.depletionAge ?? "—"}`}
            </p>
            <p className="mt-3 max-w-2xl text-[13px] leading-relaxed text-[color:var(--text-secondary)]">
              {analysis.survives
                ? `Spending ${formatRupees(annualSpend)} a year in today's money from age ${retirementAge}, the portfolio still holds ${formatRupees(analysis.realTerminalValue)} in today's rupees at age ${longevityAge}.`
                : `Spending ${formatRupees(annualSpend)} a year in today's money from age ${retirementAge}, the portfolio is exhausted in ${analysis.depletionYear}. A spend of about ${formatRupees(safeSpend ?? 0)} a year would last the full horizon.`}
            </p>

            <dl className="mt-8 grid gap-x-10 gap-y-6 sm:grid-cols-2 lg:grid-cols-4">
              <Figure
                label="Corpus at retirement"
                value={analysis.corpusAtRetirement === null ? "—" : formatRupees(analysis.corpusAtRetirement)}
                note={
                  analysis.realCorpusAtRetirement === null
                    ? "Set a retirement age"
                    : `${formatRupees(analysis.realCorpusAtRetirement)} in today's money`
                }
              />
              <Figure
                label="First year's withdrawal"
                value={formatRupees(analysis.firstYearWithdrawal)}
                note={
                  analysis.initialWithdrawalRatePct === null
                    ? "No corpus yet"
                    : `${formatPct(analysis.initialWithdrawalRatePct)} of the corpus`
                }
              />
              <Figure
                label="Sustainable spend"
                value={safeSpend === null ? "—" : formatRupees(safeSpend)}
                note="Per year in today's money, to the horizon"
                tone={safeSpend !== null && safeSpend < annualSpend ? "negative" : "positive"}
              />
              <Figure
                label="Years funded"
                value={analysis.yearsOfSpendCovered === null ? "—" : String(analysis.yearsOfSpendCovered)}
                note={`From age ${retirementAge}`}
                sensitive={false}
              />
            </dl>
          </section>

          <div className="mt-8 grid gap-6 lg:grid-cols-[1.6fr_1fr]">
            <Panel
              title="Corpus through both phases"
              description="Dashed line marks retirement."
            >
              <ChartFrame height={340}>
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={chartData} margin={CHART_MARGIN}>
                    <CartesianGrid stroke="var(--border-subtle)" vertical={false} />
                    <XAxis
                      dataKey="age"
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
                      labelFormatter={(l) => `Age ${l}`}
                    />
                    <Legend wrapperStyle={legendStyle} />
                    <Area
                      type="monotone"
                      dataKey="corpus"
                      name="Corpus (nominal)"
                      stroke="var(--color-primary)"
                      fill="var(--color-primary)"
                      fillOpacity={0.12}
                      strokeWidth={2}
                    />
                    <Line
                      type="monotone"
                      dataKey="real"
                      name="In today's money"
                      stroke="var(--color-teal)"
                      strokeWidth={1.5}
                      dot={false}
                    />
                    <ReferenceLine
                      x={retirementAge}
                      stroke="var(--text-tertiary)"
                      strokeDasharray="4 4"
                      label={{ value: "Retire", fontSize: 11, fill: "var(--text-tertiary)", position: "top" }}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </ChartFrame>
            </Panel>

            <Panel title="Assumptions you control" description="Everything here feeds the same engine.">
              <div className="grid gap-4">
                <label className="block">
                  <span className="text-[11px] uppercase tracking-[0.1em] text-[color:var(--text-tertiary)]">
                    Retirement age
                  </span>
                  <input
                    type="number"
                    className={`${inputClass} mt-2`}
                    value={retirementAge}
                    onChange={(e) => setRetirementAge(Number(e.target.value) || 0)}
                  />
                </label>
                <label className="block">
                  <span className="text-[11px] uppercase tracking-[0.1em] text-[color:var(--text-tertiary)]">
                    Plan until age
                  </span>
                  <input
                    type="number"
                    className={`${inputClass} mt-2`}
                    value={longevityAge}
                    onChange={(e) => setLongevityAge(Number(e.target.value) || 0)}
                  />
                </label>
                <label className="block">
                  <span className="text-[11px] uppercase tracking-[0.1em] text-[color:var(--text-tertiary)]">
                    Annual spend in retirement (today's ₹)
                  </span>
                  <div className="mt-2">
                    <FinancialAmountInput value={annualSpend} onChange={(v) => setAnnualSpend(v ?? 0)} />
                  </div>
                </label>
                <label className="block">
                  <span className="text-[11px] uppercase tracking-[0.1em] text-[color:var(--text-tertiary)]">
                    Other annual income (pension, rent)
                  </span>
                  <div className="mt-2">
                    <FinancialAmountInput value={otherIncome} onChange={(v) => setOtherIncome(v ?? 0)} />
                  </div>
                </label>
                <div>
                  <span className="text-[11px] uppercase tracking-[0.1em] text-[color:var(--text-tertiary)]">
                    Scenario
                  </span>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {SCENARIOS.map((s) => (
                      <button
                        key={s}
                        onClick={() => setScenario(s)}
                        className={`rounded-full border px-3 py-1 text-xs capitalize transition-colors ${
                          scenario === s
                            ? "border-primary/50 bg-primary/15 text-primary"
                            : "border-border text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                  <p className="mt-3 text-[12px] leading-relaxed text-[color:var(--text-secondary)]">
                    {scenario} assumptions: {assumptions[scenario].equity_return}% equity,{" "}
                    {assumptions[scenario].debt_return}% debt, {assumptions[scenario].inflation}% inflation.
                    Spend escalates with inflation each year.
                  </p>
                </div>
              </div>
            </Panel>
          </div>

          <section className="mt-10">
            <h2 className="font-display text-[20px] tracking-tight text-foreground">
              The decumulation years
            </h2>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-[color:var(--text-tertiary)]">
                    <th className="py-2 pr-3 font-medium">Age</th>
                    <th className="py-2 pr-3 text-right font-medium">Opening</th>
                    <th className="py-2 pr-3 text-right font-medium">Withdrawal</th>
                    <th className="py-2 pr-3 text-right font-medium">Growth</th>
                    <th className="py-2 pr-3 text-right font-medium">Closing</th>
                    <th className="py-2 text-right font-medium">In today's ₹</th>
                  </tr>
                </thead>
                <tbody>
                  {analysis.rows
                    .filter((r) => r.age !== null && r.age >= retirementAge)
                    .map((r) => (
                      <tr key={r.year} className="border-b border-border/60 last:border-0">
                        <td className="tabular py-2 pr-3">{r.age}</td>
                        <td className="tabular privacy-sensitive py-2 pr-3 text-right">
                          {formatCompactRupees(r.opening)}
                        </td>
                        <td className="tabular privacy-sensitive py-2 pr-3 text-right text-destructive">
                          {formatCompactRupees(r.withdrawal)}
                        </td>
                        <td className="tabular privacy-sensitive py-2 pr-3 text-right text-positive">
                          {formatCompactRupees(r.gain)}
                        </td>
                        <td className="tabular privacy-sensitive py-2 pr-3 text-right">
                          {formatCompactRupees(r.closing)}
                        </td>
                        <td className="tabular privacy-sensitive py-2 text-right text-[color:var(--text-secondary)]">
                          {formatCompactRupees(r.realClosing)}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : null}
    </AppShell>
  );
}
