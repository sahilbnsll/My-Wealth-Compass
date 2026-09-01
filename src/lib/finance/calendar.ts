/**
 * Financial calendar — deterministic, derived from recorded data only.
 *
 * Nothing here invents a date. Every event traces back to something the user
 * entered (a SIP, a goal, a custom entry) or to a statutory Indian date that is
 * fixed in law (advance tax instalments, the ITR filing deadline).
 */

export type CalendarKind =
  | "sip"
  | "goal"
  | "tax"
  | "review"
  | "maturity"
  | "custom";

export type CalendarEvent = {
  id: string;
  title: string;
  detail: string;
  kind: CalendarKind;
  /** ISO yyyy-mm-dd in local terms. */
  date: string;
  amount: number | null;
  /** Whole days from `today` (negative when overdue). */
  daysAway: number;
  source: string;
  /** Present when the user can act on it directly. */
  to?: string;
  completed?: boolean;
};

export type CalendarInputs = {
  today: Date;
  /** How far ahead to project recurring items. */
  horizonDays?: number;
  sips: Array<{
    id: string;
    name: string;
    monthlyAmount: number;
    frequency: string;
    startDate: string | null;
    endDate: string | null;
  }>;
  goals: Array<{ id: string; name: string; targetDate: string | null; futureCost: number | null }>;
  maturities: Array<{ id: string; name: string; maturityDate: string | null; value: number | null }>;
  custom: Array<{
    id: string;
    title: string;
    kind: string;
    date: string;
    amount: number | null;
    recurrence: string;
    notes: string | null;
    completedOn: string | null;
  }>;
  /** ISO timestamp of the last completed monthly review, if any. */
  lastReviewedAt: string | null;
};

const MS_DAY = 86_400_000;

export function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseISO(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

export function daysBetween(from: Date, to: Date): number {
  const a = new Date(from.getFullYear(), from.getMonth(), from.getDate()).getTime();
  const b = new Date(to.getFullYear(), to.getMonth(), to.getDate()).getTime();
  return Math.round((b - a) / MS_DAY);
}

/** Clamp a day-of-month onto a month that may be shorter (31st in February). */
function onDay(year: number, monthIndex: number, day: number): Date {
  const last = new Date(year, monthIndex + 1, 0).getDate();
  return new Date(year, monthIndex, Math.min(day, last));
}

const MONTHS_PER_PERIOD: Record<string, number> = {
  monthly: 1,
  quarterly: 3,
  "half-yearly": 6,
  half_yearly: 6,
  yearly: 12,
  annual: 12,
  annually: 12,
};

/** Statutory Indian dates for the financial year containing `today`. */
export function statutoryDates(today: Date): Array<{ title: string; detail: string; date: Date }> {
  const y = today.getFullYear();
  // Indian FY runs April–March; look across this calendar year and the next
  // April so a December view still shows the March instalment.
  const years = [y, y + 1];
  const out: Array<{ title: string; detail: string; date: Date }> = [];
  for (const yr of years) {
    out.push(
      {
        title: "Advance tax — 15%",
        detail: "First instalment of advance tax for the financial year.",
        date: new Date(yr, 5, 15),
      },
      {
        title: "Advance tax — 45% cumulative",
        detail: "Second instalment of advance tax.",
        date: new Date(yr, 8, 15),
      },
      {
        title: "Advance tax — 75% cumulative",
        detail: "Third instalment of advance tax.",
        date: new Date(yr, 11, 15),
      },
      {
        title: "Advance tax — 100% cumulative",
        detail: "Final instalment for the financial year ending 31 March.",
        date: new Date(yr, 2, 15),
      },
      {
        title: "Financial year ends",
        detail: "Last day to book gains or losses inside this financial year.",
        date: new Date(yr, 2, 31),
      },
      {
        title: "Income tax return due",
        detail: "Usual due date for individuals not subject to audit.",
        date: new Date(yr, 6, 31),
      },
    );
  }
  return out;
}

/** Next occurrence of a recurring commitment on or after `today`. */
export function nextOccurrence(
  today: Date,
  anchor: Date,
  monthsPerPeriod: number,
  until: Date | null,
): Date | null {
  if (monthsPerPeriod <= 0) return null;
  if (anchor >= today) return until && anchor > until ? null : anchor;
  const monthsElapsed =
    (today.getFullYear() - anchor.getFullYear()) * 12 + (today.getMonth() - anchor.getMonth());
  let periods = Math.floor(monthsElapsed / monthsPerPeriod);
  let candidate = onDay(
    anchor.getFullYear(),
    anchor.getMonth() + periods * monthsPerPeriod,
    anchor.getDate(),
  );
  while (candidate < today) {
    periods += 1;
    candidate = onDay(anchor.getFullYear(), anchor.getMonth() + periods * monthsPerPeriod, anchor.getDate());
  }
  if (until && candidate > until) return null;
  return candidate;
}

export function buildCalendar(input: CalendarInputs): CalendarEvent[] {
  const { today } = input;
  const horizon = input.horizonDays ?? 400;
  const limit = new Date(today.getTime() + horizon * MS_DAY);
  const events: CalendarEvent[] = [];

  const push = (e: Omit<CalendarEvent, "daysAway">, date: Date) => {
    events.push({ ...e, daysAway: daysBetween(today, date) });
  };

  // --- SIP instalments -----------------------------------------------------
  for (const sip of input.sips) {
    const anchor = sip.startDate ? parseISO(sip.startDate) : null;
    if (!anchor) continue;
    const end = sip.endDate ? parseISO(sip.endDate) : null;
    const months = MONTHS_PER_PERIOD[sip.frequency] ?? 1;
    const next = nextOccurrence(today, anchor, months, end);
    if (!next || next > limit) continue;
    push(
      {
        id: `sip:${sip.id}`,
        title: `${sip.name} instalment`,
        detail:
          months === 1
            ? "Monthly instalment on the plan's start-date anniversary."
            : `Recurring every ${months} months from the recorded start date.`,
        kind: "sip",
        date: toISODate(next),
        amount: sip.monthlyAmount * months,
        source: "Your recorded plan",
        to: "/plan",
      },
      next,
    );
  }

  // --- Goal target dates ---------------------------------------------------
  for (const goal of input.goals) {
    const d = goal.targetDate ? parseISO(goal.targetDate) : null;
    if (!d || d > limit) continue;
    push(
      {
        id: `goal:${goal.id}`,
        title: `${goal.name} — target date`,
        detail: "The date this goal has to be funded by.",
        kind: "goal",
        date: toISODate(d),
        amount: goal.futureCost,
        source: "Your recorded goal",
        to: "/goals",
      },
      d,
    );
  }

  // --- Instrument maturities ----------------------------------------------
  for (const m of input.maturities) {
    const d = m.maturityDate ? parseISO(m.maturityDate) : null;
    if (!d || d > limit) continue;
    push(
      {
        id: `maturity:${m.id}`,
        title: `${m.name} matures`,
        detail: "Proceeds land as cash unless reinvested.",
        kind: "maturity",
        date: toISODate(d),
        amount: m.value,
        source: "Your holdings",
        to: "/portfolio",
      },
      d,
    );
  }

  // --- Statutory tax dates -------------------------------------------------
  for (const s of statutoryDates(today)) {
    const away = daysBetween(today, s.date);
    if (away < 0 || s.date > limit) continue;
    push(
      {
        id: `tax:${toISODate(s.date)}:${s.title}`,
        title: s.title,
        detail: s.detail,
        kind: "tax",
        date: toISODate(s.date),
        amount: null,
        source: "Statutory Indian date",
        to: "/market-tax",
      },
      s.date,
    );
  }

  // --- Monthly review ------------------------------------------------------
  const lastReview = input.lastReviewedAt ? new Date(input.lastReviewedAt) : null;
  const reviewDate =
    lastReview && !Number.isNaN(lastReview.getTime())
      ? onDay(lastReview.getFullYear(), lastReview.getMonth() + 1, lastReview.getDate())
      : onDay(today.getFullYear(), today.getMonth(), 1);
  push(
    {
      id: "review:next",
      title: "Monthly review",
      detail: lastReview
        ? "One month after your last completed review."
        : "No review recorded yet — start the first one.",
      kind: "review",
      date: toISODate(reviewDate),
      amount: null,
      source: "Review cadence",
      to: "/review",
    },
    reviewDate,
  );

  // --- User-entered events -------------------------------------------------
  for (const c of input.custom) {
    const anchor = parseISO(c.date);
    if (!anchor) continue;
    const months = MONTHS_PER_PERIOD[c.recurrence] ?? 0;
    const date = months > 0 ? (nextOccurrence(today, anchor, months, null) ?? anchor) : anchor;
    if (date > limit) continue;
    push(
      {
        id: `custom:${c.id}`,
        title: c.title,
        detail: c.notes ?? (months > 0 ? "Recurring entry you added." : "One-off entry you added."),
        kind: (["sip", "goal", "tax", "review", "maturity", "custom"].includes(c.kind)
          ? c.kind
          : "custom") as CalendarKind,
        date: toISODate(date),
        amount: c.amount,
        source: "You entered",
        to: "/calendar",
        completed: Boolean(c.completedOn),
      },
      date,
    );
  }

  return events.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.title.localeCompare(b.title)));
}

/** Total rupee commitment falling inside the next `days` days. */
export function committedWithin(events: CalendarEvent[], days: number): number {
  return events
    .filter((e) => !e.completed && e.daysAway >= 0 && e.daysAway <= days && e.amount !== null && e.kind !== "goal")
    .reduce((a, e) => a + (e.amount ?? 0), 0);
}
