import { UnlitTargetArt } from "@/components/Art";
import { toast } from "sonner";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { useLaunchAction } from "@/lib/launch";
import { AppShell, EmptyState, Panel } from "@/components/AppShell";
import { AlertRow, Figure, buttonClass } from "@/components/Bits";
import { AdvancedDetails, OverrideBadge, DatePickerInput, NotesInput, FinancialAmountInput, PercentInput, Segmented, WizardField, WizardModal, wizardInputClass } from "@/components/Wizard";
import { GoalProgress } from "@/components/Charts";
import { deleteGoal, loadWorkspace, saveGoal, type GoalInput } from "@/lib/data.functions";
import { formatPct, formatRupees } from "@/lib/finance/format";
import { analyseGoals, blendedReturn, summariseGoalFunding, type GoalAnalysis } from "@/lib/finance/goals";
import { monthlyContribution } from "@/lib/finance/portfolio";

export const Route = createFileRoute("/goals")({
  loader: () => loadWorkspace(),
  head: () => ({
    meta: [
      { title: "Sahil's Finance Intelligence — Goals" },
      {
        name: "description",
        content:
          "Every financial goal costed at its future date, with the funding gap and the monthly SIP needed to close it.",
      },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Sahil's Finance Intelligence — Goals" },
      {
        property: "og:description",
        content: "Goal feasibility, funding gaps and required monthly investment.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: GoalsPage,
});

const BLANK: GoalInput = {
  name: "",
  current_cost: 0,
  target_date: null,
  inflation_pct: null,
  current_savings: 0,
  expected_return_pct: null,
  equity_allocation_pct: null,
  priority: "medium",
  notes: null,
  is_demo: false,
};

const STATUS_LABEL: Record<GoalAnalysis["status"], string> = {
  on_track: "On track",
  at_risk: "At risk",
  shortfall: "Shortfall",
  unknown: "Needs a date",
};

const STATUS_CLASS: Record<GoalAnalysis["status"], string> = {
  on_track: "text-positive",
  at_risk: "text-warning",
  shortfall: "text-destructive",
  unknown: "text-muted-foreground",
};

function GoalsPage() {
  const { goals, planned, assumptions } = Route.useLoaderData();
  const router = useRouter();
  const save = useServerFn(saveGoal);
  const remove = useServerFn(deleteGoal);
  const [editing, setEditing] = useState<GoalInput | null>(null);
  const [busy, setBusy] = useState(false);
  useLaunchAction("add-goal", () => setEditing({ ...BLANK }));

  const base = assumptions.base;
  const analyses = useMemo(
    () => analyseGoals(goals, {
      inflation: base.inflation,
      expectedReturn: base.equity_return,
      debtReturn: base.debt_return,
    }),
    [goals, base],
  );
  const plannedMonthly = useMemo(() => monthlyContribution(planned), [planned]);
  const funding = useMemo(
    () => summariseGoalFunding(analyses, plannedMonthly),
    [analyses, plannedMonthly],
  );

  async function onSave() {
    if (!editing) return;
    setBusy(true);
    try {
      await save({ data: { ...editing, name: editing.name.trim() } });
      await router.invalidate();
      setEditing(null);
      toast.success("Goal saved.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell
      title="Goals"
      subtitle="Each goal is inflated to its target date, matched against what your earmarked savings will grow into, and turned into the monthly investment needed to close the remaining gap."
      actions={
        <button className={buttonClass} onClick={() => setEditing({ ...BLANK })}>
          Add goal
        </button>
      }
    >
      <section className="border-b border-border-subtle pb-8">
        <p className="eyebrow text-[color:var(--text-secondary)]">
          {funding.totalGap > 0 ? "Still to fund, at target dates" : "Every goal is covered"}
        </p>
        <p
          className={`metric-xl privacy-sensitive mt-3 ${funding.totalGap > 0 ? "text-foreground" : "text-positive"}`}
        >
          {formatRupees(funding.totalGap)}
        </p>
        <p className="mt-3 max-w-2xl text-[13px] leading-relaxed text-[color:var(--text-secondary)]">
          {goals.length === 0
            ? "Add a goal to size the gap between what you are saving and what the goal will cost."
            : funding.coveragePct === null
              ? `Your earmarked savings already cover every goal at ${base.equity_return}% expected return.`
              : `Closing every gap needs ${formatRupees(funding.totalRequiredSip)} a month. You plan ${formatRupees(plannedMonthly)} — ${formatPct(funding.coveragePct)} of it.`}
        </p>

        <dl className="mt-8 grid gap-x-10 gap-y-6 sm:grid-cols-2 lg:grid-cols-4">
          <Figure label="Total future cost" value={formatRupees(funding.totalFutureCost)} note="Inflated to each target date" />
          <Figure label="Projected from savings" value={formatRupees(funding.totalProjected)} note="Earmarked savings, compounded" />
          <Figure
            label="Required monthly SIP"
            value={formatRupees(funding.totalRequiredSip)}
            note="To close every remaining gap"
            tone={funding.totalRequiredSip > plannedMonthly ? "negative" : "neutral"}
          />
          <Figure
            label="Planned monthly"
            value={formatRupees(plannedMonthly)}
            note={`${goals.length} goal${goals.length === 1 ? "" : "s"} tracked`}
          />
        </dl>
      </section>

      {funding.coveragePct !== null && funding.coveragePct < 100 ? (
        <div className="mt-8">
          <AlertRow
            level="warning"
            title="Planned contributions fall short of your goals"
            detail={`Closing every gap needs ${formatRupees(funding.totalRequiredSip)} a month at ${base.equity_return}% expected return. You currently plan ${formatRupees(plannedMonthly)}. Either raise contributions, push a target date out, or reduce a goal's cost.`}
          />
        </div>
      ) : null}

      <section className="mt-10">
        <h2 className="font-display text-[20px] tracking-tight text-foreground">Each goal, and how far away it is</h2>
        {goals.length === 0 ? (
          <div className="mt-4">
            <EmptyState
              art={<UnlitTargetArt />}
              title="No goals yet"
              detail="Add the things you are actually saving for — a home down payment, a child's education, a sabbatical — and the engine will size each one."
              action={
                <button className={buttonClass} onClick={() => setEditing({ ...BLANK })}>
                  Add a goal
                </button>
              }
            />
          </div>
        ) : (
          <ul className="mt-6 divide-y divide-[color:var(--border-subtle)] border-t border-border-subtle">
            {analyses.map((a) => {
              const goal = goals.find((g) => g.id === a.id)!;
              const tone =
                a.status === "on_track" ? "positive" : a.status === "at_risk" ? "warning" : "negative";
              return (
                <li key={a.id} className="py-6">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <button
                        className="text-left font-display text-[17px] tracking-tight text-foreground hover:text-primary"
                        onClick={() => setEditing(goal)}
                      >
                        {a.name}
                      </button>
                      <p className="mt-1 text-[12px] text-[color:var(--text-tertiary)]">
                        {a.yearsToGoal === null
                          ? "No target date set"
                          : `${a.yearsToGoal.toFixed(1)} years away`}
                        {" · "}
                        <span className="privacy-sensitive">{formatRupees(goal.current_cost)} in today's money</span>
                      </p>
                    </div>
                    <span className={`text-[12px] ${STATUS_CLASS[a.status]}`}>{STATUS_LABEL[a.status]}</span>
                  </div>

                  {a.fundedPct !== null ? (
                    <div className="mt-4 max-w-xl">
                      <GoalProgress fundedPct={a.fundedPct} tone={tone} />
                      <p className="mt-2 text-[12px] text-[color:var(--text-secondary)]">
                        <span className="tabular">{formatPct(Math.min(a.fundedPct, 999))}</span> funded ·{" "}
                        <span className="privacy-sensitive">
                          {formatRupees(a.projectedSavings ?? 0)} of {formatRupees(a.futureCost ?? 0)}
                        </span>
                      </p>
                    </div>
                  ) : null}

                  <div className="mt-4 flex flex-wrap gap-x-10 gap-y-3">
                    <div>
                      <p className="text-[11px] uppercase tracking-[0.1em] text-[color:var(--text-tertiary)]">Future cost</p>
                      <p className="tabular privacy-sensitive mt-1 text-[15px] text-foreground">
                        {a.futureCost === null ? "—" : formatRupees(a.futureCost)}
                      </p>
                    </div>
                    <div>
                      <p className="text-[11px] uppercase tracking-[0.1em] text-[color:var(--text-tertiary)]">Gap</p>
                      <p
                        className={`tabular privacy-sensitive mt-1 text-[15px] ${a.gap && a.gap > 0 ? "text-destructive" : "text-positive"}`}
                      >
                        {a.gap === null ? "—" : formatRupees(a.gap)}
                      </p>
                    </div>
                    <div>
                      <p className="text-[11px] uppercase tracking-[0.1em] text-[color:var(--text-tertiary)]">Monthly SIP needed</p>
                      <p className="tabular privacy-sensitive mt-1 text-[15px] text-foreground">
                        {a.requiredMonthlySip === null ? "—" : formatRupees(a.requiredMonthlySip)}
                      </p>
                    </div>
                  </div>

                  <details className="group mt-4">
                    <summary className="cursor-pointer list-none text-[12px] text-[color:var(--text-tertiary)] transition-colors hover:text-foreground">
                      How this was calculated
                    </summary>
                    <ul className="mt-2 space-y-1 text-[12px] leading-relaxed text-[color:var(--text-secondary)]">
                      {a.notes.length === 0 ? <li>Goal-specific inflation and return used as entered.</li> : null}
                      {a.notes.map((n) => (
                        <li key={n}>{n}</li>
                      ))}
                      {a.gap !== null && a.gap > 0 ? (
                        <li>
                          Gap of {formatRupees(a.gap)} at the target date needs{" "}
                          {formatRupees(a.requiredMonthlySip ?? 0)} a month from today.
                        </li>
                      ) : null}
                    </ul>
                    <button
                      className="mt-3 text-[12px] text-[color:var(--text-tertiary)] transition-colors hover:text-destructive"
                      disabled={busy}
                      onClick={async () => {
                        setBusy(true);
                        try {
                          await remove({ data: { id: a.id } });
                          await router.invalidate();
                          toast.success("Goal deleted.");
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      Delete this goal
                    </button>
                  </details>
                </li>
              );
            })}
          </ul>
        )}

        {editing ? (
          <GoalWizard
            value={editing}
            onChange={setEditing}
            onClose={() => setEditing(null)}
            onSubmit={onSave}
            busy={busy}
            baseInflation={base.inflation}
            baseReturn={base.equity_return}
            baseDebtReturn={base.debt_return}
          />
        ) : null}
      </section>
    </AppShell>
  );
}

function GoalWizard({
  value,
  onChange,
  onClose,
  onSubmit,
  busy,
  baseInflation,
  baseReturn,
  baseDebtReturn,
}: {
  value: GoalInput;
  onChange: (v: GoalInput) => void;
  onClose: () => void;
  onSubmit: () => void | Promise<void>;
  busy: boolean;
  baseInflation: number;
  baseReturn: number;
  baseDebtReturn: number;
}) {
  const set = <K extends keyof GoalInput>(k: K, v: GoalInput[K]) => onChange({ ...value, [k]: v });
  const nameValid = value.name.trim().length > 1;
  const costValid = Number(value.current_cost) > 0;
  const allocReturn =
    value.equity_allocation_pct === null || value.equity_allocation_pct === undefined
      ? null
      : blendedReturn(value.equity_allocation_pct, baseReturn, baseDebtReturn);
  const effectiveInflation = value.inflation_pct ?? baseInflation;
  const effectiveReturn = value.expected_return_pct ?? allocReturn ?? baseReturn;
  const overridden =
    value.inflation_pct !== null || value.expected_return_pct !== null || allocReturn !== null;

  return (
    <WizardModal
      open
      title="Add goal"
      busy={busy}
      onClose={onClose}
      onSubmit={onSubmit}
      saveLabel="Save goal"
      steps={[
        {
          title: "What are you saving for?",
          valid: nameValid,
          content: (
            <WizardField label="Goal" valid={nameValid} hint="A home down payment, a child's education, a sabbatical.">
              <input
                className={wizardInputClass}
                value={value.name}
                onChange={(e) => set("name", e.target.value)}
                placeholder="Home down payment"
              />
            </WizardField>
          ),
        },
        {
          title: "When do you need it?",
          valid: !!value.target_date,
          content: (
            <WizardField label="Target date" valid={!!value.target_date}>
              <DatePickerInput
                value={value.target_date}
                onChange={(v) => set("target_date", v)}
                placeholder="e.g. Mar 2032"
                min={new Date().toISOString().slice(0, 10)}
                ariaLabel="Goal target date"
              />
            </WizardField>
          ),
        },
        {
          title: "What does it cost today?",
          blurb: "Today's price. The engine inflates it to the target date.",
          valid: costValid,
          content: (
            <WizardField label="Cost in today's rupees" valid={costValid}>
              <FinancialAmountInput
                value={value.current_cost}
                onChange={(v) => set("current_cost", v ?? 0)}
              />
            </WizardField>
          ),
        },
        {
          title: "How much have you already saved?",
          content: (
            <WizardField label="Already earmarked" hint="Money set aside specifically for this goal.">
              <FinancialAmountInput
                value={value.current_savings}
                onChange={(v) => set("current_savings", v ?? 0)}
              />
            </WizardField>
          ),
        },
        {
          title: "How important is it?",
          blurb: "Priority orders the ledger when contributions have to be rationed.",
          content: (
            <>
              <WizardField label="Priority">
                <Segmented
                  ariaLabel="Priority"
                  value={(value.priority ?? "medium") as string}
                  onChange={(v) => set("priority", v)}
                  options={[
                    { value: "high", label: "High" },
                    { value: "medium", label: "Medium" },
                    { value: "low", label: "Low" },
                  ]}
                />
              </WizardField>

              <div className="card-base px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[13px] font-medium text-foreground">Planning assumptions</p>
                  {overridden ? <OverrideBadge /> : null}
                </div>
                <dl className="mt-2 space-y-1 text-[12px] text-[color:var(--text-secondary)]">
                  <div className="flex justify-between">
                    <dt>Inflation</dt>
                    <dd className="tabular">{effectiveInflation}%</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt>Return</dt>
                    <dd className="tabular">{effectiveReturn.toFixed(2)}%</dd>
                  </div>
                </dl>
                <p className="mt-2 text-[11px] text-[color:var(--text-tertiary)]">
                  {overridden ? "Custom values for this goal." : "Inherited from the base scenario."}
                </p>
              </div>

              <AdvancedDetails label="Advanced assumptions" summary="Inflation, return, allocation">
                <WizardField label="Custom inflation" hint={`Blank inherits ${baseInflation}%.`}>
                  <PercentInput
                    value={value.inflation_pct}
                    onChange={(v) => set("inflation_pct", v)}
                    min={0}
                    max={30}
                    placeholder={String(baseInflation)}
                  />
                </WizardField>
                <WizardField label="Custom expected return" hint={`Blank inherits ${baseReturn}%.`}>
                  <PercentInput
                    value={value.expected_return_pct}
                    onChange={(v) => set("expected_return_pct", v)}
                    min={0}
                    max={40}
                    placeholder={String(baseReturn)}
                  />
                </WizardField>
                <WizardField
                  label="Custom allocation (equity share)"
                  hint={`Blends ${baseReturn}% equity with ${baseDebtReturn}% debt when no explicit return is set.`}
                >
                  <PercentInput
                    value={value.equity_allocation_pct}
                    onChange={(v) => set("equity_allocation_pct", v)}
                    min={0}
                    max={100}
                    placeholder="e.g. 60"
                  />
                </WizardField>
                <WizardField label="Notes">
                  <NotesInput value={value.notes} onChange={(v) => set("notes", v)} />
                </WizardField>
              </AdvancedDetails>
            </>
          ),
        },
      ]}
      review={[
        { label: "Goal", value: value.name },
        { label: "Target date", value: value.target_date ?? "Not set" },
        { label: "Cost today", value: formatRupees(value.current_cost || 0) },
        { label: "Already saved", value: formatRupees(value.current_savings || 0) },
        { label: "Priority", value: value.priority ?? "medium" },
        {
          label: "Assumptions",
          value: `${effectiveInflation}% inflation · ${effectiveReturn.toFixed(2)}% return${overridden ? " (custom)" : " (inherited)"}`,
        },
      ]}
    />
  );
}
