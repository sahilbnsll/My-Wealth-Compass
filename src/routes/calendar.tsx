import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { Check, Plus, Trash2 } from "lucide-react";
import { AppShell, Panel } from "@/components/AppShell";
import { Figure, buttonClass, ghostButtonClass, inputClass } from "@/components/Bits";
import { DatePickerInput, FinancialAmountInput, NotesInput } from "@/components/Wizard";
import {
  deleteCalendarEntry,
  loadCalendarEntries,
  loadReviews,
  loadWorkspace,
  saveCalendarEntry,
  toggleCalendarEntry,
} from "@/lib/data.functions";
import { buildCalendar, committedWithin, toISODate, type CalendarEvent } from "@/lib/finance/calendar";
import { formatDateIST, formatRupees } from "@/lib/finance/format";

export const Route = createFileRoute("/calendar")({
  loader: async () => {
    const [workspace, entries, reviews] = await Promise.all([loadWorkspace(), loadCalendarEntries(), loadReviews()]);
    return { workspace, entries, reviews };
  },
  head: () => ({
    meta: [
      { title: "Sahil's Finance Intelligence — Calendar" },
      {
        name: "description",
        content:
          "What is due and when: SIPs, goals, maturities and tax dates.",
      },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Sahil's Finance Intelligence — Calendar" },
      {
        property: "og:description",
        content: "Built from your SIPs, goals, maturities and India's tax dates.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CalendarPage,
});

const KIND_LABEL: Record<string, string> = {
  sip: "SIP",
  goal: "Goal",
  tax: "Tax",
  review: "Review",
  maturity: "Maturity",
  custom: "Custom",
};

const KIND_TONE: Record<string, string> = {
  sip: "text-accent-teal border-accent-teal/40",
  goal: "text-accent border-accent/40",
  tax: "text-warning border-warning/40",
  review: "text-[color:var(--text-secondary)] border-border-subtle",
  maturity: "text-positive border-positive/40",
  custom: "text-[color:var(--text-secondary)] border-border-subtle",
};

function whenLabel(days: number): string {
  if (days < 0) return `${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} overdue`;
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days < 31) return `In ${days} days`;
  const months = Math.round(days / 30);
  return `In ${months} month${months === 1 ? "" : "s"}`;
}

function EventRow({
  event,
  onToggle,
  onDelete,
}: {
  event: CalendarEvent;
  onToggle?: () => void;
  onDelete?: () => void;
}) {
  const overdue = event.daysAway < 0 && !event.completed;
  return (
    <li className="row-hover -mx-3 flex flex-wrap items-start justify-between gap-3 rounded-md px-3 py-3.5">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`rounded-sm border px-1.5 py-0.5 text-[10px] uppercase tracking-[0.08em] ${
              KIND_TONE[event.kind] ?? KIND_TONE["custom"]
            }`}
          >
            {KIND_LABEL[event.kind] ?? event.kind}
          </span>
          <p className={`truncate text-sm ${event.completed ? "text-[color:var(--text-tertiary)] line-through" : "text-foreground"}`}>
            {event.to ? (
              <Link to={event.to} className="underline-offset-4 hover:underline">
                {event.title}
              </Link>
            ) : (
              event.title
            )}
          </p>
        </div>
        <p className="mt-1 text-[12px] text-[color:var(--text-secondary)]">{event.detail}</p>
      </div>
      <div className="flex items-center gap-5">
        <div className="text-right">
          <p className={`text-sm tabular ${overdue ? "text-destructive" : "text-foreground"}`}>
            {event.amount !== null ? formatRupees(event.amount) : whenLabel(event.daysAway)}
          </p>
          <p className="text-[12px] text-[color:var(--text-tertiary)]">
            {formatDateIST(event.date)}
            {event.amount !== null ? ` · ${whenLabel(event.daysAway)}` : ""}
          </p>
        </div>
        {onToggle ? (
          <button
            aria-label={event.completed ? "Mark not done" : "Mark done"}
            onClick={onToggle}
            className={`rounded-md border px-2 py-1.5 transition-colors ${
              event.completed
                ? "border-positive/40 text-positive"
                : "border-border-subtle text-[color:var(--text-tertiary)] hover:text-foreground"
            }`}
          >
            <Check className="h-3.5 w-3.5" strokeWidth={2} />
          </button>
        ) : null}
        {onDelete ? (
          <button
            aria-label={`Remove ${event.title}`}
            onClick={onDelete}
            className="text-[color:var(--text-tertiary)] transition-colors hover:text-destructive"
          >
            <Trash2 className="h-4 w-4" strokeWidth={1.75} />
          </button>
        ) : null}
      </div>
    </li>
  );
}

function CalendarPage() {
  const { workspace, entries, reviews } = Route.useLoaderData();
  const router = useRouter();
  const save = useServerFn(saveCalendarEntry);
  const remove = useServerFn(deleteCalendarEntry);
  const toggle = useServerFn(toggleCalendarEntry);

  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ title: "", event_date: toISODate(new Date()), amount: "", notes: "" });

  const events = useMemo(
    () =>
      buildCalendar({
        today: new Date(),
        horizonDays: 365,
        sips: workspace.planned
          .filter((p) => !p.is_paused)
          .map((p) => ({
            id: p.id,
            name: p.name,
            monthlyAmount: p.monthly_amount,
            frequency: p.frequency,
            startDate: p.start_date,
            endDate: p.end_date,
          })),
        goals: workspace.goals.map((g) => ({
          id: g.id,
          name: g.name,
          targetDate: g.target_date,
          futureCost: g.current_cost,
        })),
        maturities: workspace.holdings
          .filter((h) => h.maturity_date)
          .map((h) => ({
            id: h.id,
            name: h.name,
            maturityDate: h.maturity_date,
            value: h.current_value ?? null,
          })),
        custom: entries.map((e) => ({
          id: e.id,
          title: e.title,
          kind: e.kind,
          date: e.event_date,
          amount: e.amount,
          recurrence: e.recurrence,
          notes: e.notes,
          completedOn: e.completed_on,
        })),
        lastReviewedAt: reviews[0]?.reviewed_at ?? null,
      }),
    [workspace, entries, reviews],
  );

  const overdue = events.filter((e) => e.daysAway < 0 && !e.completed);
  const next30 = events.filter((e) => e.daysAway >= 0 && e.daysAway <= 30);
  const later = events.filter((e) => e.daysAway > 30);
  const committed30 = committedWithin(events, 30);
  const customIds = new Set(entries.map((e) => e.id));

  async function addEntry() {
    if (!form.title.trim()) return;
    setBusy(true);
    try {
      await save({
        data: {
          title: form.title.trim(),
          event_date: form.event_date,
          amount: form.amount === "" ? null : Number(form.amount),
          notes: form.notes || null,
          kind: "custom",
          recurrence: "none",
        },
      });
      setForm({ title: "", event_date: toISODate(new Date()), amount: "", notes: "" });
      setAdding(false);
      await router.invalidate();
    } finally {
      setBusy(false);
    }
  }

  function handlers(e: CalendarEvent) {
    const raw = e.id.replace(/^custom:/, "");
    if (!customIds.has(raw)) return {};
    return {
      onToggle: async () => {
        await toggle({ data: { id: raw, done: !e.completed } });
        await router.invalidate();
      },
      onDelete: async () => {
        await remove({ data: { id: raw } });
        await router.invalidate();
      },
    };
  }

  return (
    <AppShell
      title="Calendar"
      subtitle="Every dated commitment, derived from your data and Indian tax law."
      actions={
        <button className={buttonClass} onClick={() => setAdding((v) => !v)}>
          <Plus className="mr-2 inline h-3.5 w-3.5" strokeWidth={1.75} />
          Add entry
        </button>
      }
    >
      <dl className="grid gap-x-10 gap-y-6 border-b border-border-subtle pb-8 sm:grid-cols-3">
        <Figure
          label="Overdue"
          value={String(overdue.length)}
          tone={overdue.length > 0 ? "negative" : "positive"}
          note={overdue[0]?.title ?? "Nothing has slipped"}
          sensitive={false}
        />
        <Figure
          label="Due in 30 days"
          value={String(next30.length)}
          note={next30[0] ? `Next: ${next30[0].title}` : "A clear month ahead"}
          sensitive={false}
        />
        <Figure
          label="Committed in 30 days"
          value={formatRupees(committed30)}
          note="Sum of dated outflows you have already planned"
        />
      </dl>

      {adding ? (
        <Panel title="Add a dated entry" description="For anything the app cannot derive." className="mt-8">
          <div className="grid gap-4 sm:grid-cols-4">
            <label className="block sm:col-span-2">
              <span className="text-[13px] font-medium text-foreground">What is it</span>
              <input
                className={`${inputClass} mt-1.5`}
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="Term insurance premium"
                autoFocus
              />
            </label>
            <div className="block">
              <span className="text-[13px] font-medium text-foreground">Date</span>
              <div className="mt-1.5">
                <DatePickerInput
                  value={form.event_date}
                  onChange={(v) => setForm({ ...form, event_date: v ?? toISODate(new Date()) })}
                  className={inputClass}
                  clearable={false}
                  placeholder="Pick a date"
                  ariaLabel="Entry date"
                />
              </div>
            </div>
            <div className="block">
              <span className="text-[13px] font-medium text-foreground">Amount</span>
              <div className="mt-1.5">
                <FinancialAmountInput
                  value={form.amount === "" ? null : Number(form.amount)}
                  onChange={(v) => setForm({ ...form, amount: v === null ? "" : String(v) })}
                  placeholder="Optional — e.g. ₹25,000"
                />
              </div>
            </div>
            <div className="block sm:col-span-4">
              <span className="text-[13px] font-medium text-foreground">Notes</span>
              <div className="mt-1.5">
                <NotesInput
                  value={form.notes}
                  onChange={(v) => setForm({ ...form, notes: v ?? "" })}
                  rows={2}
                />
              </div>
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <button className={buttonClass} onClick={addEntry} disabled={busy || !form.title.trim()}>
              Add to calendar
            </button>
            <button className={ghostButtonClass} onClick={() => setAdding(false)}>
              Cancel
            </button>
          </div>
        </Panel>
      ) : null}

      <div className="mt-8 space-y-6">
        {overdue.length > 0 ? (
          <Panel title="Overdue" description="Past due.">
            <ul className="divide-y divide-[color:var(--border-subtle)]">
              {overdue.map((e) => (
                <EventRow key={e.id} event={e} {...handlers(e)} />
              ))}
            </ul>
          </Panel>
        ) : null}

        <Panel title="Next 30 days" description="The month ahead.">
          {next30.length === 0 ? (
            <p className="text-[12px] text-[color:var(--text-secondary)]">
              Nothing is due in the next 30 days. Recurring SIPs will appear here once their next debit falls inside the window.
            </p>
          ) : (
            <ul className="divide-y divide-[color:var(--border-subtle)]">
              {next30.map((e) => (
                <EventRow key={e.id} event={e} {...handlers(e)} />
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Later this year" description="Dated, not urgent.">
          {later.length === 0 ? (
            <p className="text-[12px] text-[color:var(--text-secondary)]">Nothing further out has a date attached.</p>
          ) : (
            <ul className="divide-y divide-[color:var(--border-subtle)]">
              {later.slice(0, 25).map((e) => (
                <EventRow key={e.id} event={e} {...handlers(e)} />
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </AppShell>
  );
}
