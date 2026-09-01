import { SeedlingArt } from "@/components/Art";
import { toast } from "sonner";
import { InstrumentSearch } from "@/components/InstrumentSearch";
import type { ResolvedInstrument } from "@/lib/instruments";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { useLaunchAction } from "@/lib/launch";
import { AppShell, EmptyState, Panel } from "@/components/AppShell";
import { ASSET_CLASS_COLORS } from "@/components/Charts";
import { Figure, buttonClass } from "@/components/Bits";
import { AdvancedDetails, DatePickerInput, NotesInput, FinancialAmountInput, PercentInput, Segmented, WizardField, WizardModal, wizardInputClass } from "@/components/Wizard";
import {
  deletePlanned,
  loadWorkspace,
  savePlanned,
  type PlannedInput,
} from "@/lib/data.functions";
import { formatPct, formatRupees } from "@/lib/finance/format";
import {
  contributionByAssetClass,
  monthlyContribution,
  summarisePortfolio,
} from "@/lib/finance/portfolio";
import { buildTargetAllocation, recommendedEmergencyMonths } from "@/lib/finance/strategy";
import { emergencyCoverageMonths, savingsRate } from "@/lib/finance/core";
import { ASSET_CLASSES, DEFAULT_ASSET_CLASS, type AssetClass } from "@/lib/finance/types";

export const Route = createFileRoute("/plan")({
  loader: () => loadWorkspace(),
  head: () => ({
    meta: [
      { title: "Sahil's Finance Intelligence — Investment plan" },
      {
        name: "description",
        content:
          "Planned monthly contributions, the target allocation derived from your situation, and the reasoning behind each weight.",
      },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Sahil's Finance Intelligence — Investment plan" },
      {
        property: "og:description",
        content: "Target allocation and planned contributions with explicit reasoning.",
      },
    ],
  }),
  component: PlanPage,
});

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

const BLANK: PlannedInput = {
  name: "",
  asset_class: "equity",
  instrument_type: "mutual_fund",
  symbol: null,
  isin: null,
  monthly_amount: 0,
  frequency: "monthly",
  start_date: null,
  end_date: null,
  annual_step_up_pct: 0,
  expected_return_pct: null,
  objective: null,
  risk_level: null,
  liquidity: null,
  tax_treatment: null,
  is_demo: false,
  is_paused: false,
  notes: null,
};

function PlanPage() {
  const { planned, holdings, profile } = Route.useLoaderData();
  const router = useRouter();
  const save = useServerFn(savePlanned);
  const remove = useServerFn(deletePlanned);
  const [editing, setEditing] = useState<PlannedInput | null>(null);
  const [busy, setBusy] = useState(false);
  useLaunchAction("add-sip", () => setEditing({ ...BLANK, start_date: todayISO() }));
  function beginEditing(value: PlannedInput) {
    setEditing(value);
  }

  const summary = useMemo(() => summarisePortfolio(holdings), [holdings]);
  const monthly = useMemo(() => monthlyContribution(planned), [planned]);
  const byClass = useMemo(() => contributionByAssetClass(planned), [planned]);

  const essential = profile.essential_monthly_expenses ?? profile.monthly_expenses;
  const liquid = holdings
    .filter((h) => h.asset_class === "cash" || h.liquidity === "liquid")
    .reduce((a, h) => a + (h.current_value ?? (h.quantity ?? 0) * (h.current_price ?? 0)), 0);
  const emergency = recommendedEmergencyMonths(profile);
  const coverage = essential ? emergencyCoverageMonths(liquid, essential) : null;
  const emergencyCovered = coverage !== null && coverage >= emergency.months;
  const allocation = useMemo(
    () => buildTargetAllocation(profile, emergencyCovered),
    [profile, emergencyCovered],
  );
  const rate =
    profile.monthly_income && profile.monthly_expenses
      ? savingsRate(profile.monthly_income, profile.monthly_expenses)
      : null;

  async function onSave() {
    if (!editing) return;
    if (!editing.name.trim()) {
      toast.error("Enter a fund or SIP name.");
      return;
    }
    if (editing.monthly_amount < 0 || !Number.isFinite(editing.monthly_amount)) {
      toast.error("Enter a valid amount.");
      return;
    }
    if (editing.annual_step_up_pct < 0 || editing.annual_step_up_pct > 100) {
      toast.error("Step-up must be between 0% and 100%.");
      return;
    }
    setBusy(true);
    try {
      await save({ data: { ...editing, name: editing.name.trim() } });
      await router.invalidate();
      setEditing(null);
      toast.success("SIP saved.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save this SIP.");
    } finally {
      setBusy(false);
    }
  }

  async function togglePaused(p: PlannedInput & { id: string }) {
    setBusy(true);
    try {
      await save({ data: { ...p, is_paused: !p.is_paused } });
      await router.invalidate();
      toast.success(p.is_paused ? "SIP resumed." : "SIP paused.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update this SIP.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell
      title="Investment plan"
      subtitle="What you intend to invest each month, and the allocation those contributions are steering towards. The target below is derived from your own horizon, dependents, debt and risk tolerance — not from a generic model portfolio."
      actions={
        <button className={buttonClass} onClick={() => beginEditing({ ...BLANK, start_date: todayISO() })}>
          Add SIP
        </button>
      }
    >
      <section className="border-b border-border-subtle pb-8">
        <p className="eyebrow text-[color:var(--text-secondary)]">Committed every month</p>
        <p className="metric-xl privacy-sensitive mt-3 text-foreground">{formatRupees(monthly)}</p>
        <p className="mt-3 max-w-2xl text-[13px] leading-relaxed text-[color:var(--text-secondary)]">
          {planned.length === 0
            ? "No investments planned yet. Add a SIP to model your future."
            : `${planned.filter((p) => !p.is_paused).length} active contribution${
                planned.filter((p) => !p.is_paused).length === 1 ? "" : "s"
              }${planned.some((p) => p.is_paused) ? `, ${planned.filter((p) => p.is_paused).length} paused` : ""}${
                rate !== null ? `, ${formatPct(rate)} of take-home income` : ""
              }.`}
        </p>

        <dl className="mt-8 grid gap-x-10 gap-y-6 sm:grid-cols-2 lg:grid-cols-4">
          <Figure
            label="Savings rate"
            value={rate !== null ? formatPct(rate) : "—"}
            note={rate === null ? "Needs income and expenses" : "Of take-home income"}
            sensitive={false}
          />
          <Figure
            label="Emergency coverage"
            value={coverage !== null ? `${coverage.toFixed(1)} mo` : "—"}
            note={`Target ${emergency.months} months`}
            tone={coverage !== null && coverage < emergency.months ? "negative" : "positive"}
            sensitive={false}
          />
          <Figure label="Portfolio value" value={formatRupees(summary.totalValue)} note="Current holdings" />
          <Figure
            label="Annual commitment"
            value={formatRupees(monthly * 12)}
            note="Before any step-up"
          />
        </dl>
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        <Panel
          title="Planned contributions"
          description="Everything shown monthly."
        >
          {planned.length === 0 ? (
            <EmptyState
              art={<SeedlingArt />}
              title="No planned contributions"
              detail="Record your SIPs, recurring deposits and provident-fund contributions. Projections use these to model future growth."
              action={
                <button className={buttonClass} onClick={() => beginEditing({ ...BLANK, start_date: todayISO() })}>
                  Add a SIP
                </button>
              }
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="py-2 pr-3 font-medium">Contribution</th>
                    <th className="py-2 pr-3 text-right font-medium">Amount</th>
                    <th className="py-2 pr-3 text-right font-medium">Step-up</th>
                    <th className="py-2" />
                  </tr>
                </thead>
                <tbody>
                  {planned.map((p) => {
                    const color = ASSET_CLASS_COLORS[p.asset_class];
                    return (
                      <tr
                        key={p.id}
                        className={`group border-b border-border/60 transition-colors duration-100 last:border-0 hover:bg-secondary/40 ${p.is_paused ? "opacity-60" : ""}`}
                      >
                        <td className="py-2.5 pr-3">
                          <button
                            className="flex items-center gap-3 text-left"
                            onClick={() => beginEditing(p)}
                          >
                            <span
                              aria-hidden
                              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-xs font-semibold uppercase"
                              style={{
                                backgroundColor: `color-mix(in oklab, ${color} 18%, transparent)`,
                                color,
                              }}
                            >
                              {p.name.trim().charAt(0) || "?"}
                            </span>
                            <span>
                              <span className="flex items-center gap-2 font-medium text-foreground group-hover:text-primary">
                                {p.name}
                                {p.is_paused ? (
                                  <span className="rounded-sm border border-warning/40 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-warning">
                                    Paused
                                  </span>
                                ) : null}
                              </span>
                              <span className="block text-xs capitalize text-muted-foreground">
                                {p.asset_class} · {p.frequency.replace("_", " ")}
                                {p.start_date ? ` · starts ${p.start_date}` : ""}
                              </span>
                            </span>
                          </button>
                        </td>
                        <td className="py-2.5 pr-3 text-right">
                          <span className="tabular block text-foreground">
                            {formatRupees(p.monthly_amount)}
                          </span>
                          <span className="tabular block text-[11px] text-muted-foreground">
                            {monthly > 0 && !p.is_paused
                              ? `${formatPct((p.monthly_amount / monthly) * 100)} of monthly`
                              : "per instalment"}
                          </span>
                        </td>
                        <td className="tabular py-2.5 pr-3 text-right text-muted-foreground">
                          {formatPct(p.annual_step_up_pct)}
                        </td>
                        <td className="py-2.5 text-right">
                          <div className="flex justify-end gap-3">
                            <button
                              className="text-xs text-muted-foreground hover:text-primary"
                              disabled={busy}
                              onClick={() => void togglePaused(p)}
                            >
                              {p.is_paused ? "Resume" : "Pause"}
                            </button>
                            <button
                              className="text-xs text-muted-foreground hover:text-foreground"
                              disabled={busy}
                              onClick={() => beginEditing(p)}
                            >
                              Edit
                            </button>
                            <button
                              className="text-xs text-muted-foreground hover:text-destructive"
                              disabled={busy}
                              onClick={async () => {
                                setBusy(true);
                                try {
                                  await remove({ data: { id: p.id } });
                                  await router.invalidate();
                                  toast.success("SIP deleted.");
                                } catch (error) {
                                  toast.error(
                                    error instanceof Error
                                      ? error.message
                                      : "Could not delete this SIP.",
                                  );
                                } finally {
                                  setBusy(false);
                                }
                              }}
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {editing ? (
            <SipWizard
              value={editing}
              onChange={setEditing}
              onClose={() => setEditing(null)}
              onSubmit={onSave}
              busy={busy}
              targetPct={allocation.target[editing.asset_class] ?? null}
            />
          ) : null}
        </Panel>

        <div className="space-y-6">
          <Panel
            title="Target allocation"
            description="Your target reflects your timeline, risk and obligations."
          >
            <ul className="space-y-3">
              {ASSET_CLASSES.filter((c) => allocation.target[c] > 0).map((c) => (
                <li key={c}>
                  <div className="flex items-baseline justify-between">
                    <span className="text-xs uppercase tracking-wide text-muted-foreground">
                      {c}
                    </span>
                    <span className="tabular text-sm text-foreground">
                      {formatPct(allocation.target[c])}
                      <span className="ml-2 text-xs text-muted-foreground">
                        now {formatPct(summary.byAssetClass[c])}
                      </span>
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-secondary">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${allocation.target[c]}%` }}
                    />
                  </div>
                  <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
                    {allocation.rationale[c]}
                  </p>
                </li>
              ))}
            </ul>
            {allocation.missing.length > 0 ? (
              <div className="mt-4 rounded-md border border-warning/40 bg-warning/10 px-3 py-2">
                <p className="text-xs font-medium text-foreground">
                  Missing inputs weaken this target
                </p>
                <ul className="mt-1 space-y-1">
                  {allocation.missing.map((m) => (
                    <li key={m.field} className="text-[11px] text-muted-foreground">
                      <span className="text-foreground">{m.field}</span> — {m.whyItMatters}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </Panel>

          {allocation.equitySplit.length > 0 ? (
            <Panel
              title="Equity split"
              description="Few buckets, each with a job."
            >
              <ul className="space-y-2">
                {allocation.equitySplit.map((s) => (
                  <li
                    key={s.key}
                    className="border-b border-border/60 pb-2 last:border-0 last:pb-0"
                  >
                    <div className="flex items-baseline justify-between">
                      <span className="text-sm text-foreground">{s.key}</span>
                      <span className="tabular text-sm text-muted-foreground">
                        {formatPct(s.pct)}
                      </span>
                    </div>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">{s.role}</p>
                  </li>
                ))}
              </ul>
            </Panel>
          ) : null}

          <Panel title="Where new money goes" description="New money by asset class.">
            {monthly > 0 ? (
              <ul className="space-y-1.5">
                {ASSET_CLASSES.filter((c) => byClass[c] > 0).map((c) => (
                  <li key={c} className="flex items-baseline justify-between text-sm">
                    <span className="text-xs uppercase tracking-wide text-muted-foreground">
                      {c}
                    </span>
                    <span className="tabular text-foreground">
                      {formatRupees(byClass[c])}
                      <span className="ml-2 text-xs text-muted-foreground">
                        {formatPct((byClass[c] / monthly) * 100)}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-muted-foreground">No contributions recorded yet.</p>
            )}
          </Panel>
        </div>
      </div>
    </AppShell>
  );
}

const FREQUENCY_LABEL: Record<string, string> = {
  monthly: "Monthly",
  quarterly: "Quarterly",
  annual: "Annual",
  one_time: "One time",
};

function SipWizard({
  value,
  onChange,
  onClose,
  onSubmit,
  busy,
  targetPct,
}: {
  value: PlannedInput;
  onChange: (v: PlannedInput) => void;
  onClose: () => void;
  onSubmit: () => void | Promise<void>;
  busy: boolean;
  /** Target share of contributions for this asset class, from the strategy engine. */
  targetPct: number | null;
}) {
  const set = <K extends keyof PlannedInput>(k: K, v: PlannedInput[K]) =>
    onChange({ ...value, [k]: v });
  const nameValid = value.name.trim().length > 1;
  const amountValid = value.monthly_amount > 0 && Number.isFinite(value.monthly_amount);

  const perMonth =
    value.frequency === "monthly"
      ? value.monthly_amount
      : value.frequency === "quarterly"
        ? value.monthly_amount / 3
        : value.frequency === "annual"
          ? value.monthly_amount / 12
          : 0;
  const perYear = perMonth * 12;
  const tenYearContribution = (() => {
    // Plain sum of instalments over ten years, stepped up annually. No returns applied.
    let total = 0;
    let annual = perYear;
    for (let y = 0; y < 10; y += 1) {
      total += annual;
      annual *= 1 + (value.annual_step_up_pct || 0) / 100;
    }
    return value.frequency === "one_time" ? value.monthly_amount : total;
  })();

  /** One field: pick a real instrument, or type any name. */
  function applyResolved(r: ResolvedInstrument) {
    onChange({
      ...value,
      name: r.name,
      symbol: r.symbol,
      isin: r.isin,
      instrument_type: r.type,
      asset_class: r.assetClass,
    });
  }

  return (
    <WizardModal
      open
      title={value.id ? "Edit SIP" : "Add SIP"}
      busy={busy}
      onClose={onClose}
      onSubmit={onSubmit}
      saveLabel="Save SIP"
      steps={[
        {
          title: "Search or enter investment",
          blurb: "Pick a real fund or stock and everything else fills itself in.",
          valid: nameValid,
          content: (
            <>
              <WizardField label="Search or enter investment" valid={nameValid}>
                <InstrumentSearch
                  placeholder="e.g. Parag Parikh Flexi Cap, or INFY"
                  onPick={(hit) =>
                    onChange({
                      ...value,
                      name: hit.name,
                      symbol: hit.symbol,
                      isin: hit.isin,
                      instrument_type: hit.kind,
                      asset_class: DEFAULT_ASSET_CLASS[hit.kind],
                    })
                  }
                  onResolve={applyResolved}
                />
              </WizardField>
              {value.name ? (
                <div className="card-base px-4 py-3 text-[12px] text-[color:var(--text-secondary)]">
                  <p className="text-sm text-foreground">{value.name}</p>
                  <p className="mt-1">
                    {(value.instrument_type ?? "other").replace("_", " ")} · {value.asset_class}
                    {value.symbol ? ` · ${value.symbol}` : ""}
                    {value.isin ? ` · ${value.isin}` : ""}
                  </p>
                </div>
              ) : null}
              <WizardField label="Name" hint="Type it yourself if the search cannot find it.">
                <input
                  className={wizardInputClass}
                  value={value.name}
                  maxLength={160}
                  onChange={(e) => set("name", e.target.value)}
                />
              </WizardField>
              <AdvancedDetails summary="Type and asset class">
                <WizardField label="Type">
                  <Segmented
                    ariaLabel="Investment type"
                    value={value.instrument_type ?? "other"}
                    onChange={(v) => set("instrument_type", v === "other" ? null : v)}
                    options={[
                      { value: "mutual_fund", label: "Mutual fund" },
                      { value: "stock", label: "Stock" },
                      { value: "etf", label: "ETF" },
                      { value: "fd", label: "Fixed deposit" },
                    ]}
                  />
                </WizardField>
                <WizardField label="Asset class">
                  <Segmented
                    ariaLabel="Asset class"
                    value={value.asset_class}
                    onChange={(v) => set("asset_class", v as AssetClass)}
                    options={ASSET_CLASSES.map((c) => ({ value: c, label: c }))}
                  />
                </WizardField>
              </AdvancedDetails>
            </>
          ),
        },
        {
          title: "How much each time?",
          valid: amountValid,
          content: (
            <WizardField label="Amount per instalment" valid={amountValid}>
              <FinancialAmountInput
                value={value.monthly_amount}
                onChange={(v) => set("monthly_amount", v ?? 0)}
              />
            </WizardField>
          ),
        },
        {
          title: "How often?",
          content: (
            <WizardField label="Frequency">
              <Segmented
                ariaLabel="Frequency"
                value={value.frequency}
                onChange={(v) => set("frequency", v)}
                options={[
                  { value: "monthly", label: "Monthly" },
                  { value: "quarterly", label: "Quarterly" },
                  { value: "annual", label: "Annual" },
                  { value: "one_time", label: "One time" },
                ]}
              />
            </WizardField>
          ),
        },
        {
          title: "When does it start?",
          content: (
            <WizardField label="Start date" hint="Today unless you change it.">
              <DatePickerInput
                value={value.start_date}
                onChange={(v) => set("start_date", v)}
                placeholder="Today"
                min="1990-01-01"
                ariaLabel="SIP start date"
              />
            </WizardField>
          ),
        },
        {
          title: "Do you step it up each year?",
          content: (
            <WizardField label="Annual step-up">
              <PercentInput
                value={value.annual_step_up_pct || null}
                onChange={(v) => set("annual_step_up_pct", v ?? 0)}
                min={0}
                max={100}
                placeholder="e.g. 10"
                hint="A 10% step-up roughly doubles the instalment in seven years."
              />
            </WizardField>
          ),
        },
        {
          title: "What is it for?",
          content: (
            <>
              <WizardField label="Purpose">
                <input
                  className={wizardInputClass}
                  maxLength={240}
                  value={value.objective ?? ""}
                  onChange={(e) => set("objective", e.target.value || null)}
                  placeholder="Retirement corpus"
                />
              </WizardField>
              <AdvancedDetails summary="End date, status, notes">
                <WizardField label="End date" hint="Leave blank to run indefinitely.">
                  <DatePickerInput
                    value={value.end_date}
                    onChange={(v) => set("end_date", v)}
                    placeholder="No end date"
                    min={value.start_date ?? "1990-01-01"}
                    ariaLabel="SIP end date"
                  />
                </WizardField>
                <WizardField label="Status" hint="Paused SIPs are excluded from totals and projections.">
                  <Segmented
                    ariaLabel="Status"
                    value={value.is_paused ? "paused" : "active"}
                    onChange={(v) => set("is_paused", v === "paused")}
                    options={[
                      { value: "active", label: "Active" },
                      { value: "paused", label: "Paused" },
                    ]}
                  />
                </WizardField>
                <WizardField label="Notes">
                  <NotesInput
                    value={value.notes}
                    onChange={(v) => set("notes", v)}
                  />
                </WizardField>
              </AdvancedDetails>
            </>
          ),
        },
      ]}
      review={[
        { label: "Investment", value: value.name },
        {
          label: "Per month",
          value: value.frequency === "one_time" ? "One-time" : `${formatRupees(perMonth)}/month`,
        },
        {
          label: "Per year",
          value: value.frequency === "one_time" ? formatRupees(value.monthly_amount || 0) : `${formatRupees(perYear)}/year`,
        },
        { label: "Step-up", value: value.annual_step_up_pct ? `${value.annual_step_up_pct}% a year` : "None" },
        { label: "Role in portfolio", value: value.objective ?? `${value.asset_class} contribution` },
        {
          label: "Target allocation",
          value: targetPct === null ? "Not set" : `${value.asset_class} target ${formatPct(targetPct)}`,
        },
        {
          label: "Contribution over 10 years",
          value: `${formatRupees(tenYearContribution)} invested (returns excluded)`,
        },
        { label: "Starts", value: value.start_date ?? "Immediately" },
        { label: "Status", value: value.is_paused ? "Paused" : "Active" },
      ]}
    />
  );
}

