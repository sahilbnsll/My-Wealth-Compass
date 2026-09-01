import { toast } from "sonner";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { AppShell, Panel } from "@/components/AppShell";
import { buttonClass, ghostButtonClass } from "@/components/Bits";
import {
  AdvancedDetails,
  FinancialAmountInput,
  NotesInput,
  PercentInput,
  Segmented,
  WizardField,
  WizardModal,
  wizardInputClass,
} from "@/components/Wizard";
import { loadWorkspace, saveProfile } from "@/lib/data.functions";
import { recommendedEmergencyMonths } from "@/lib/finance/strategy";
import { formatRupees } from "@/lib/finance/format";
import { parseFinancialAmount } from "@/lib/finance/amount";
import type { Profile } from "@/lib/finance/types";

export const Route = createFileRoute("/inputs")({
  loader: () => loadWorkspace(),
  head: () => ({
    meta: [
      { title: "Sahil's Finance Intelligence — How your plan is built" },
      {
        name: "description",
        content:
          "The facts behind every projection: your age, income, safety net, risk appetite and tax regime.",
      },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Sahil's Finance Intelligence — How your plan is built" },
      {
        property: "og:description",
        content: "The facts behind every projection in this workspace.",
      },
    ],
  }),
  component: InputsPage,
});

type Draft = Record<string, string>;

const NUMERIC_FIELDS = new Set([
  "current_age",
  "retirement_age",
  "planning_age",
  "monthly_income",
  "annual_bonus",
  "monthly_expenses",
  "essential_monthly_expenses",
  "existing_cash",
  "existing_debt",
  "dependents",
  "expected_salary_growth",
  "investment_horizon_years",
  "emergency_months_target",
]);

function toDraft(p: Profile): Draft {
  return Object.fromEntries(
    Object.entries(p).map(([k, v]) => [k, v === null || v === undefined ? "" : String(v)]),
  );
}

function InputsPage() {
  const { profile } = Route.useLoaderData();
  const router = useRouter();
  const save = useServerFn(saveProfile);
  const [draft, setDraft] = useState<Draft>(() => toDraft(profile));
  const [open, setOpen] = useState(false);
  const [startStep, setStartStep] = useState(0);
  const [busy, setBusy] = useState(false);

  const set = (key: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setDraft((d) => ({ ...d, [key]: e.target.value }));
  const setValue = (key: string, value: string) => setDraft((d) => ({ ...d, [key]: value }));

  const numeric = (k: string): number | null => {
    const raw = draft[k];
    if (raw === undefined || raw.trim() === "") return null;
    const n = parseFinancialAmount(raw);
    return n !== null && Number.isFinite(n) ? n : null;
  };

  const previewProfile: Profile = {
    ...profile,
    current_age: numeric("current_age"),
    retirement_age: numeric("retirement_age"),
    monthly_income: numeric("monthly_income"),
    annual_bonus: numeric("annual_bonus"),
    monthly_expenses: numeric("monthly_expenses"),
    essential_monthly_expenses: numeric("essential_monthly_expenses"),
    existing_debt: numeric("existing_debt"),
    dependents: numeric("dependents"),
    job_stability: draft["job_stability"] || null,
  };
  const emergency = recommendedEmergencyMonths(previewProfile);
  const essential =
    previewProfile.essential_monthly_expenses ?? previewProfile.monthly_expenses ?? 0;

  const ageValid =
    (numeric("current_age") ?? 0) > 0 &&
    (numeric("retirement_age") ?? 0) > (numeric("current_age") ?? 0);
  const cashValid = (numeric("monthly_income") ?? 0) > 0 && (numeric("monthly_expenses") ?? 0) >= 0;

  function beginEdit(step = 0) {
    setDraft(toDraft(profile));
    setStartStep(step);
    setOpen(true);
  }

  async function onSubmit() {
    setBusy(true);
    const payload: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(draft)) {
      if (NUMERIC_FIELDS.has(k)) payload[k] = v.trim() === "" ? null : parseFinancialAmount(v);
      else payload[k] = v.trim() === "" ? null : v;
    }
    try {
      await save({ data: payload as Partial<Profile> });
      await router.invalidate();
      setOpen(false);
      toast.success("Saved.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }

  const money = (v: number | null | undefined) => (v ? formatRupees(v) : "Not set");
  const savedEmergency = recommendedEmergencyMonths(profile);
  const savedEssential = profile.essential_monthly_expenses ?? profile.monthly_expenses ?? 0;

  const groups: {
    heading: string;
    lead: string;
    step: number;
    rows: { label: string; value: string }[];
  }[] = [
    {
      heading: "About you",
      lead: "Your age and household set the length of every projection and how much cover you need.",
      step: 0,
      rows: [
        { label: "Age", value: profile.current_age ? `${profile.current_age}` : "Not set" },
        {
          label: "Retirement age",
          value: profile.retirement_age ? `${profile.retirement_age}` : "Not set",
        },
        { label: "Location", value: profile.location ?? "Not set" },
        {
          label: "Dependents",
          value: profile.dependents !== null ? String(profile.dependents) : "Not set",
        },
      ],
    },
    {
      heading: "Cash flow",
      lead: "What comes in, what goes out, and how fast income grows.",
      step: 1,
      rows: [
        { label: "Monthly income", value: money(profile.monthly_income) },
        { label: "Monthly expenses", value: money(profile.monthly_expenses) },
        {
          label: "Salary growth",
          value:
            profile.expected_salary_growth !== null
              ? `${profile.expected_salary_growth}% a year`
              : "Not set",
        },
      ],
    },
    {
      heading: "Financial safety",
      lead: "How long you could cover essentials without income, and what you owe.",
      step: 2,
      rows: [
        {
          label: "Emergency fund target",
          value: savedEssential
            ? `${savedEmergency.months} months · ${formatRupees(savedEmergency.months * savedEssential)}`
            : `${savedEmergency.months} months`,
        },
        { label: "Debt", value: profile.existing_debt ? money(profile.existing_debt) : "None" },
        { label: "Job stability", value: profile.job_stability ?? "Not set" },
      ],
    },
    {
      heading: "Investing",
      lead: "How much volatility you can hold, for how long, and how gains are taxed.",
      step: 3,
      rows: [
        { label: "Risk", value: profile.risk_tolerance ?? "Not set" },
        {
          label: "Horizon",
          value: profile.investment_horizon_years
            ? `${profile.investment_horizon_years} years`
            : profile.retirement_age && profile.current_age
              ? `${profile.retirement_age - profile.current_age} years to retirement`
              : "Not set",
        },
        {
          label: "Tax regime",
          value: profile.tax_regime ? `${profile.tax_regime} regime` : "Not set",
        },
      ],
    },
  ];

  return (
    <AppShell
      title="How your plan is built"
      subtitle="These facts drive every number in this workspace. Leave anything you are unsure of blank — a blank is reported as missing, never quietly assumed."
      actions={
        <button className={buttonClass} onClick={() => beginEdit(0)}>
          Update
        </button>
      }
    >
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {groups.map((group) => (
            <section key={group.heading} className="border-b border-border-subtle pb-6 last:border-0">
              <div className="flex items-baseline justify-between gap-4">
                <h2 className="text-[15px] font-medium text-foreground">{group.heading}</h2>
                <button
                  className="text-[12px] text-[color:var(--text-secondary)] transition-colors hover:text-foreground"
                  onClick={() => beginEdit(group.step)}
                  type="button"
                >
                  Edit
                </button>
              </div>
              <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-[color:var(--text-secondary)]">
                {group.lead}
              </p>
              <dl className="mt-4 grid gap-x-10 sm:grid-cols-2">
                {group.rows.map((r) => (
                  <div
                    key={r.label}
                    className="flex items-baseline justify-between gap-4 border-b border-border-subtle py-2.5 last:border-0"
                  >
                    <dt className="text-[12px] text-[color:var(--text-secondary)]">{r.label}</dt>
                    <dd
                      className={`tabular text-sm capitalize ${
                        r.value === "Not set"
                          ? "text-[color:var(--text-tertiary)]"
                          : "privacy-sensitive text-foreground"
                      }`}
                    >
                      {r.value}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}

          <section>
            <div className="flex items-baseline justify-between gap-4">
              <h2 className="text-[15px] font-medium text-foreground">Advanced</h2>
              <button
                className="text-[12px] text-[color:var(--text-secondary)] transition-colors hover:text-foreground"
                onClick={() => beginEdit(4)}
                type="button"
              >
                Edit
              </button>
            </div>
            <p className="mt-1 text-[13px] text-[color:var(--text-secondary)]">
              Overrides. Everything here is derived unless you set it.
            </p>
            <dl className="mt-4 grid gap-x-10 sm:grid-cols-2">
              {[
                {
                  label: "Plan until age",
                  value: profile.planning_age ? String(profile.planning_age) : "85 (default)",
                },
                { label: "Essential expenses", value: money(profile.essential_monthly_expenses) },
                { label: "Annual bonus", value: money(profile.annual_bonus) },
                {
                  label: "Emergency months override",
                  value: profile.emergency_months_target
                    ? `${profile.emergency_months_target} months`
                    : "Derived",
                },
              ].map((r) => (
                <div
                  key={r.label}
                  className="flex items-baseline justify-between gap-4 border-b border-border-subtle py-2.5 last:border-0"
                >
                  <dt className="text-[12px] text-[color:var(--text-secondary)]">{r.label}</dt>
                  <dd className="tabular privacy-sensitive text-sm text-foreground">{r.value}</dd>
                </div>
              ))}
            </dl>
          </section>
        </div>

        <div className="space-y-6">
          <Panel title="What this produces" description="Recalculated as you edit.">
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                  Emergency fund target
                </dt>
                <dd className="tabular privacy-sensitive mt-1 text-lg font-semibold text-foreground">
                  {emergency.months} months
                  {essential > 0 ? (
                    <span className="ml-2 text-sm font-normal text-muted-foreground">
                      = {formatRupees(emergency.months * essential)}
                    </span>
                  ) : null}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-muted-foreground">Why</dt>
                <dd className="mt-1 space-y-1 text-xs text-muted-foreground">
                  {emergency.reasons.map((r) => (
                    <p key={r}>{r}</p>
                  ))}
                </dd>
              </div>
            </dl>
          </Panel>

          <Panel title="Notes">
            <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-[color:var(--text-secondary)]">
              {profile.notes?.trim()
                ? profile.notes
                : "Nothing noted. Add anything that changes the plan — a career break, a windfall, a property purchase."}
            </p>
            <button className={`${ghostButtonClass} mt-4`} onClick={() => beginEdit(4)} type="button">
              Add a note
            </button>
          </Panel>
        </div>
      </div>

      <WizardModal
        key={startStep}
        open={open}
        title="How your plan is built"
        busy={busy}
        initialStep={startStep}
        onClose={() => setOpen(false)}
        onSubmit={onSubmit}
        saveLabel="Save"
        steps={[
          {
            title: "About you",
            blurb: "Sets the horizon of every projection.",
            valid: ageValid,
            content: (
              <>
                <div className="grid gap-5 sm:grid-cols-2">
                  <WizardField label="Age" valid={(numeric("current_age") ?? 0) > 0}>
                    <input
                      className={wizardInputClass}
                      inputMode="numeric"
                      placeholder="e.g. 32"
                      value={draft["current_age"] ?? ""}
                      onChange={set("current_age")}
                    />
                  </WizardField>
                  <WizardField label="Retirement age" valid={ageValid}>
                    <input
                      className={wizardInputClass}
                      inputMode="numeric"
                      placeholder="e.g. 55"
                      value={draft["retirement_age"] ?? ""}
                      onChange={set("retirement_age")}
                    />
                  </WizardField>
                  <WizardField label="Location">
                    <input
                      className={wizardInputClass}
                      placeholder="e.g. Bengaluru"
                      value={draft["location"] ?? ""}
                      onChange={set("location")}
                    />
                  </WizardField>
                  <WizardField label="Dependents" hint="People who rely on this income.">
                    <input
                      className={wizardInputClass}
                      inputMode="numeric"
                      placeholder="e.g. 2"
                      value={draft["dependents"] ?? ""}
                      onChange={set("dependents")}
                    />
                  </WizardField>
                </div>
              </>
            ),
          },
          {
            title: "Cash flow",
            blurb: "What you earn, what you spend, how fast pay grows.",
            valid: cashValid,
            content: (
              <>
                <WizardField label="Monthly income" valid={(numeric("monthly_income") ?? 0) > 0}>
                  <FinancialAmountInput
                    value={numeric("monthly_income")}
                    onChange={(v) => setValue("monthly_income", v === null ? "" : String(v))}
                  />
                </WizardField>
                <WizardField label="Monthly expenses" valid={(numeric("monthly_expenses") ?? 0) > 0}>
                  <FinancialAmountInput
                    value={numeric("monthly_expenses")}
                    onChange={(v) => setValue("monthly_expenses", v === null ? "" : String(v))}
                  />
                </WizardField>
                <WizardField label="Salary growth" hint="8% a year is a fair long-run default in India.">
                  <PercentInput
                    value={numeric("expected_salary_growth")}
                    onChange={(v) => setValue("expected_salary_growth", v === null ? "" : String(v))}
                    max={40}
                  />
                </WizardField>
                <AdvancedDetails label="Advanced details">
                  <WizardField label="Annual bonus" hint="Variable pay, counted once a year.">
                    <FinancialAmountInput
                      value={numeric("annual_bonus")}
                      onChange={(v) => setValue("annual_bonus", v === null ? "" : String(v))}
                    />
                  </WizardField>
                  <WizardField
                    label="Essential monthly expenses"
                    hint="Rent, EMI, food, utilities, insurance, fees. Drives the emergency fund target."
                  >
                    <FinancialAmountInput
                      value={numeric("essential_monthly_expenses")}
                      onChange={(v) =>
                        setValue("essential_monthly_expenses", v === null ? "" : String(v))
                      }
                    />
                  </WizardField>
                </AdvancedDetails>
              </>
            ),
          },
          {
            title: "Financial safety",
            blurb: "How long you could go without income, and what you owe.",
            content: (
              <>
                <WizardField
                  label="Emergency fund target"
                  hint="Leave blank to use the derived target."
                >
                  <input
                    className={wizardInputClass}
                    inputMode="numeric"
                    placeholder={`Derived — ${emergency.months} months`}
                    value={draft["emergency_months_target"] ?? ""}
                    onChange={set("emergency_months_target")}
                  />
                </WizardField>
                <WizardField label="Debt" hint="Total outstanding across loans and cards.">
                  <FinancialAmountInput
                    value={numeric("existing_debt")}
                    onChange={(v) => setValue("existing_debt", v === null ? "" : String(v))}
                  />
                </WizardField>
                <WizardField label="Job stability">
                  <Segmented
                    ariaLabel="Job stability"
                    value={draft["job_stability"] ?? ""}
                    onChange={(v) => setValue("job_stability", v)}
                    options={[
                      { value: "high", label: "High" },
                      { value: "medium", label: "Medium" },
                      { value: "low", label: "Low" },
                    ]}
                  />
                </WizardField>
                {essential > 0 ? (
                  <p className="rounded-md border border-border-subtle bg-surface-1 px-3 py-2 text-[12px] text-[color:var(--text-secondary)]">
                    Target so far:{" "}
                    <span className="tabular text-foreground">{emergency.months} months</span> ={" "}
                    <span className="tabular text-foreground">
                      {formatRupees(emergency.months * essential)}
                    </span>
                  </p>
                ) : null}
              </>
            ),
          },
          {
            title: "Investing",
            blurb: "Risk, horizon and tax decide the allocation you are steered towards.",
            content: (
              <>
                <WizardField
                  label="Risk"
                  hint="How much of a fall you can sit through without selling."
                >
                  <Segmented
                    ariaLabel="Risk tolerance"
                    value={draft["risk_tolerance"] ?? ""}
                    onChange={(v) => setValue("risk_tolerance", v)}
                    options={[
                      { value: "low", label: "Low" },
                      { value: "medium", label: "Medium" },
                      { value: "high", label: "High" },
                    ]}
                  />
                </WizardField>
                <WizardField
                  label="Horizon"
                  hint="Years before you need this money. Blank uses years to retirement."
                >
                  <input
                    className={wizardInputClass}
                    inputMode="numeric"
                    placeholder="e.g. 20"
                    value={draft["investment_horizon_years"] ?? ""}
                    onChange={set("investment_horizon_years")}
                  />
                </WizardField>
                <WizardField label="Tax regime">
                  <Segmented
                    ariaLabel="Tax regime"
                    value={draft["tax_regime"] ?? ""}
                    onChange={(v) => setValue("tax_regime", v)}
                    options={[
                      { value: "new", label: "New" },
                      { value: "old", label: "Old" },
                    ]}
                  />
                </WizardField>
              </>
            ),
          },
          {
            title: "Advanced",
            blurb: "Overrides and context. Skip unless something here is wrong.",
            content: (
              <>
                <WizardField
                  label="Plan until age"
                  hint="Projections run to this age. 85–90 is a common choice."
                >
                  <input
                    className={wizardInputClass}
                    inputMode="numeric"
                    placeholder="85"
                    value={draft["planning_age"] ?? ""}
                    onChange={set("planning_age")}
                  />
                </WizardField>
                <WizardField label="Notes">
                  <NotesInput
                    value={draft["notes"] ?? ""}
                    onChange={(v) => setValue("notes", v ?? "")}
                  />
                </WizardField>
              </>
            ),
          },
        ]}
        review={[
          { label: "Age", value: draft["current_age"] || "—" },
          { label: "Retire at", value: draft["retirement_age"] || "—" },
          {
            label: "Income",
            value:
              numeric("monthly_income") !== null ? formatRupees(numeric("monthly_income")!) : "—",
          },
          {
            label: "Expenses",
            value:
              numeric("monthly_expenses") !== null
                ? formatRupees(numeric("monthly_expenses")!)
                : "—",
          },
          { label: "Dependents", value: draft["dependents"] || "—" },
          { label: "Risk", value: draft["risk_tolerance"] || "Not set" },
          { label: "Emergency target", value: `${emergency.months} months` },
        ]}
      />
    </AppShell>
  );
}
