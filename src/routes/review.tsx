import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { AppShell, Panel } from "@/components/AppShell";
import { Figure, buttonClass, ghostButtonClass, inputClass } from "@/components/Bits";
import { loadReviews, loadWorkspace, markReviewed } from "@/lib/data.functions";
import { formatPct, formatRupees, relativeTime } from "@/lib/finance/format";
import { emergencyCoverageMonths, savingsRate } from "@/lib/finance/core";
import { monthlyContribution, rebalance, summarisePortfolio } from "@/lib/finance/portfolio";
import { buildTargetAllocation, recommendedEmergencyMonths } from "@/lib/finance/strategy";
import { analyseGoals } from "@/lib/finance/goals";
import { buildActionCentre } from "@/lib/finance/attention";

export const Route = createFileRoute("/review")({
  loader: async () => {
    const [workspace, reviews] = await Promise.all([loadWorkspace(), loadReviews()]);
    return { workspace, reviews };
  },
  head: () => ({
    meta: [
      { title: "Sahil's Finance Intelligence — Monthly review" },
      {
        name: "description",
        content:
          "What changed this month, and what needs a decision.",
      },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Sahil's Finance Intelligence — Monthly review" },
      {
        property: "og:description",
        content: "One disciplined pass a month, recorded with the numbers as they stood.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ReviewPage,
});

const STALE_AFTER_MS = 1000 * 60 * 60 * 24 * 7;

function currentPeriod(): string {
  const d = new Date();
  return `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, "0")}`;
}

function periodLabel(period: string): string {
  const [y, m] = period.split("-");
  const d = new Date(Number(y), Number(m) - 1, 1);
  return d.toLocaleDateString("en-IN", { month: "long", year: "numeric" });
}

function ReviewPage() {
  const { workspace, reviews } = Route.useLoaderData();
  const { holdings, planned, profile, assumptions, goals, transactions } = workspace;
  const router = useRouter();
  const record = useServerFn(markReviewed);

  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  const period = currentPeriod();
  const done = reviews.find((r) => r.period === period) ?? null;
  const previous = reviews.find((r) => r.period !== period) ?? null;

  const summary = useMemo(() => summarisePortfolio(holdings, transactions), [holdings, transactions]);
  const monthly = useMemo(() => monthlyContribution(planned), [planned]);

  const essential = profile.essential_monthly_expenses ?? profile.monthly_expenses;
  const liquid = holdings
    .filter((h) => h.asset_class === "cash" || h.liquidity === "liquid")
    .reduce((a, h) => a + (h.current_value ?? (h.quantity ?? 0) * (h.current_price ?? 0)), 0);
  const emergency = recommendedEmergencyMonths(profile);
  const coverage = essential ? emergencyCoverageMonths(liquid, essential) : null;
  const emergencyCovered = coverage !== null && coverage >= emergency.months;
  const allocation = useMemo(() => buildTargetAllocation(profile, emergencyCovered), [profile, emergencyCovered]);
  const rebalanceRows = useMemo(() => rebalance(summary, allocation.target, 5), [summary, allocation.target]);

  const staleHoldings = holdings
    .filter((h) => h.price_source !== "manual" && (!h.price_updated_at || Date.now() - new Date(h.price_updated_at).getTime() > STALE_AFTER_MS))
    .map((h) => ({ name: h.name, lastUpdated: h.price_updated_at ? relativeTime(h.price_updated_at) : null }));

  const rate =
    profile.monthly_income && profile.monthly_expenses ? savingsRate(profile.monthly_income, profile.monthly_expenses) : null;

  const goalAnalyses = useMemo(
    () => analyseGoals(goals, { inflation: assumptions.base.inflation, expectedReturn: assumptions.base.equity_return }),
    [goals, assumptions.base],
  );

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
      }),
    [coverage, emergency.months, liquid, essential, monthly, rate, rebalanceRows, goalAnalyses, staleHoldings, allocation.missing, summary.totalValue],
  );

  const changeSincePrevious =
    previous?.total_value != null ? summary.totalValue - previous.total_value : null;

  const checklist = [
    {
      id: "prices",
      label: "Valuations are current",
      pass: staleHoldings.length === 0,
      detail:
        staleHoldings.length === 0
          ? "Every fed price is under a week old."
          : `${staleHoldings.length} holding${staleHoldings.length === 1 ? "" : "s"} priced over a week ago.`,
      to: "/portfolio",
    },
    {
      id: "drift",
      label: "Allocation is inside its band",
      pass: rebalanceRows.filter((r) => Math.abs(r.deltaPct) > 5).length === 0,
      detail:
        rebalanceRows.filter((r) => Math.abs(r.deltaPct) > 5).length === 0
          ? "No sleeve is more than five points from target."
          : `${rebalanceRows.filter((r) => Math.abs(r.deltaPct) > 5).length} sleeve(s) beyond the five-point band.`,
      to: "/portfolio",
    },
    {
      id: "emergency",
      label: "Emergency cover is intact",
      pass: emergencyCovered,
      detail:
        coverage === null
          ? "Essential monthly expenses are not recorded, so cover cannot be measured."
          : `${coverage.toFixed(1)} months held against a ${emergency.months}-month target.`,
      to: "/inputs",
    },
    {
      id: "goals",
      label: "Goals are on track",
      pass: goalAnalyses.every((g) => g.status !== "shortfall"),
      detail:
        goalAnalyses.length === 0
          ? "No goals yet yet."
          : `${goalAnalyses.filter((g) => g.status === "shortfall").length} of ${goalAnalyses.length} goals are short at the current run-rate.`,
      to: "/goals",
    },
    {
      id: "assumptions",
      label: "Assumptions still hold",
      pass: workspace.assumptionRows.some((a) => {
        const t = a.reviewed_at ?? a.updated_at;
        return t ? Date.now() - new Date(t).getTime() < 1000 * 60 * 60 * 24 * 180 : false;
      }),
      detail: "Return, inflation and step-up inputs should be revisited at least twice a year.",
      to: "/assumptions",
    },
  ];

  const passing = checklist.filter((c) => c.pass).length;

  async function signOff() {
    setBusy(true);
    try {
      await record({
        data: {
          period,
          totalValue: summary.totalValue,
          invested: summary.invested,
          openActions: actions.length,
          decisions: actions.slice(0, 5).map((a) => ({ id: a.id, headline: a.headline, severity: a.severity })),
          ...(notes.trim() ? { notes: notes.trim() } : {}),
        },
      });
      setNotes("");
      await router.invalidate();
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell
      title="Monthly review"
      subtitle={`${periodLabel(period)}. One deliberate pass a month: confirm what the numbers say, decide what needs doing, and record the figures as they stood.`}
      actions={
        done ? (
          <span className="text-[12px] text-positive">Signed off {relativeTime(done.reviewed_at)}</span>
        ) : (
          <button className={buttonClass} onClick={signOff} disabled={busy}>
            {busy ? "Recording…" : "Mark this month reviewed"}
          </button>
        )
      }
    >
      <dl className="grid gap-x-10 gap-y-6 border-b border-border-subtle pb-8 sm:grid-cols-3">
        <Figure
          label="Portfolio value"
          value={formatRupees(summary.totalValue)}
          note={
            changeSincePrevious === null
              ? "No earlier review to compare against"
              : `${changeSincePrevious >= 0 ? "+" : "−"}${formatRupees(Math.abs(changeSincePrevious))} since ${periodLabel(previous!.period)}`
          }
          tone={changeSincePrevious === null ? "neutral" : changeSincePrevious >= 0 ? "positive" : "negative"}
        />
        <Figure
          label="Checks passing"
          value={`${passing} of ${checklist.length}`}
          tone={passing === checklist.length ? "positive" : passing >= 3 ? "neutral" : "negative"}
          note="Each check reads live figures, not a saved snapshot"
          sensitive={false}
        />
        <Figure
          label="Open decisions"
          value={String(actions.length)}
          note={actions[0]?.headline ?? "Nothing is asking for attention"}
          sensitive={false}
        />
      </dl>

      <Panel title="This month's checks" description="Five checks. Anything failing links to the fix." className="mt-8">
        <ul className="divide-y divide-[color:var(--border-subtle)]">
          {checklist.map((c) => (
            <li key={c.id} className="flex flex-wrap items-start justify-between gap-3 py-3.5">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span
                    aria-hidden
                    className={`h-1.5 w-1.5 rounded-full ${c.pass ? "bg-positive" : "bg-warning"}`}
                  />
                  <p className="text-sm text-foreground">{c.label}</p>
                </div>
                <p className="mt-1 text-[12px] text-[color:var(--text-secondary)]">{c.detail}</p>
              </div>
              <Link
                to={c.to}
                className="text-[12px] text-[color:var(--text-tertiary)] underline-offset-4 hover:text-foreground hover:underline"
              >
                {c.pass ? "Review" : "Fix this"}
              </Link>
            </li>
          ))}
        </ul>
      </Panel>

      {!done ? (
        <Panel title="Notes for your future self" description="What you decided and why. This is stored with the month's figures." className="mt-6">
          <textarea
            className={`${inputClass} min-h-24 w-full`}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Increased the index SIP by ₹5,000; left the gold sleeve alone despite the drift."
          />
          <div className="mt-4 flex items-center gap-3">
            <button className={buttonClass} onClick={signOff} disabled={busy}>
              {busy ? "Recording…" : "Record review"}
            </button>
            <span className="text-[12px] text-[color:var(--text-tertiary)]">
              Saves value {formatRupees(summary.totalValue)}, invested {formatRupees(summary.invested)} and the top decisions.
            </span>
          </div>
        </Panel>
      ) : null}

      <Panel title="History" description="Past reviews, with the figures exactly as they stood on the day." className="mt-6">
        {reviews.length === 0 ? (
          <p className="text-[12px] text-[color:var(--text-secondary)]">
            No month has been reviewed yet. The first sign-off starts the record.
          </p>
        ) : (
          <ul className="divide-y divide-[color:var(--border-subtle)]">
            {reviews.map((r) => (
              <li key={r.id} className="flex flex-wrap items-start justify-between gap-3 py-3.5">
                <div className="min-w-0">
                  <p className="text-sm text-foreground">{periodLabel(r.period)}</p>
                  <p className="mt-1 text-[12px] text-[color:var(--text-secondary)]">
                    {r.notes ?? `${r.open_actions} open decision${r.open_actions === 1 ? "" : "s"} at sign-off.`}
                  </p>
                </div>
                <div className="text-right">
                  <p className="tabular text-sm text-foreground">
                    {r.total_value !== null ? formatRupees(r.total_value) : "—"}
                  </p>
                  <p className="text-[12px] text-[color:var(--text-tertiary)]">
                    {r.invested ? `${formatPct(((r.total_value ?? 0) / r.invested - 1) * 100)} on invested` : "—"} ·{" "}
                    {relativeTime(r.reviewed_at)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {!done ? null : (
        <div className="mt-6 flex justify-end">
          <button className={ghostButtonClass} onClick={signOff} disabled={busy}>
            Re-record this month
          </button>
        </div>
      )}
    </AppShell>
  );
}
