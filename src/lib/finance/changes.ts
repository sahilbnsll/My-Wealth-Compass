/**
 * "Since your last review" — differences between a recorded baseline and today.
 * Pure, and deliberately conservative: a line is emitted only when both sides
 * of the comparison are real recorded data. Nothing is inferred or invented.
 */
import { formatCompactRupees, formatPct, formatRupees } from "./format";
import type { Transaction } from "./ledger";
import type { AssetClass } from "./types";

export type ChangeDirection = "up" | "down" | "flat";

export type ChangeLine = {
  id: string;
  label: string;
  value: string;
  direction: ChangeDirection;
  /** Where the comparison came from, e.g. "Snapshot 2026-08-01". */
  basis: string;
};

export type ChangeBaseline = {
  /** ISO date of the baseline. */
  date: string;
  /** Human label for the source, e.g. "review 2026-08" or "snapshot". */
  source: string;
  totalValue: number | null;
  invested: number | null;
  /** Allocation percentages at the baseline, by asset class. */
  allocationPct?: Partial<Record<AssetClass, number>> | null;
  holdingCount?: number | null;
};

export type ChangeCurrent = {
  totalValue: number;
  invested: number;
  allocationPct: Partial<Record<AssetClass, number>>;
  holdingCount: number;
  monthlySip: number;
  transactions: Transaction[];
};

function direction(delta: number, epsilon = 0.5): ChangeDirection {
  if (delta > epsilon) return "up";
  if (delta < -epsilon) return "down";
  return "flat";
}

function signedRupees(delta: number): string {
  return `${delta >= 0 ? "+" : "−"}${formatCompactRupees(Math.abs(delta))}`;
}

export type ChangeReport = {
  hasBaseline: boolean;
  baselineLabel: string;
  lines: ChangeLine[];
  /** Stated when nothing measurable changed or no baseline exists. */
  note: string | null;
};

export function changesSince(baseline: ChangeBaseline | null, current: ChangeCurrent): ChangeReport {
  if (!baseline) {
    return {
      hasBaseline: false,
      baselineLabel: "No earlier record",
      lines: [],
      note: "Record a monthly review or capture a snapshot — change is measured against real history, never estimated.",
    };
  }

  const basis = `${baseline.source} · ${baseline.date}`;
  const lines: ChangeLine[] = [];

  if (baseline.totalValue !== null) {
    const delta = current.totalValue - baseline.totalValue;
    lines.push({
      id: "value",
      label: "Portfolio value",
      value: signedRupees(delta),
      direction: direction(delta),
      basis: `Was ${formatCompactRupees(baseline.totalValue)} on ${baseline.date}`,
    });
  }

  if (baseline.invested !== null) {
    const delta = current.invested - baseline.invested;
    if (Math.abs(delta) >= 1) {
      lines.push({
        id: "invested",
        label: "Invested capital",
        value: signedRupees(delta),
        direction: direction(delta),
        basis: `Was ${formatCompactRupees(baseline.invested)} on ${baseline.date}`,
      });
    }
  }

  const baseEquity = baseline.allocationPct?.equity;
  const nowEquity = current.allocationPct.equity;
  if (baseEquity !== undefined && baseEquity !== null && nowEquity !== undefined) {
    const delta = nowEquity - baseEquity;
    if (Math.abs(delta) >= 0.1) {
      lines.push({
        id: "equity-weight",
        label: "Equity allocation",
        value: `${delta >= 0 ? "+" : "−"}${Math.abs(delta).toFixed(1)} pp`,
        direction: direction(delta, 0.05),
        basis: `${formatPct(baseEquity)} → ${formatPct(nowEquity)}`,
      });
    }
  }

  if (baseline.holdingCount !== null && baseline.holdingCount !== undefined) {
    const delta = current.holdingCount - baseline.holdingCount;
    if (delta !== 0) {
      lines.push({
        id: "holdings",
        label: delta > 0 ? "New holdings" : "Holdings closed",
        value: `${delta > 0 ? "+" : "−"}${Math.abs(delta)}`,
        direction: direction(delta, 0),
        basis: `${baseline.holdingCount} → ${current.holdingCount}`,
      });
    }
  }

  const since = current.transactions.filter((t) => t.trade_date > baseline.date);
  if (since.length > 0) {
    const net = since.reduce(
      (a, t) => a + (t.kind === "sell" || t.kind === "withdrawal" ? -Math.abs(t.amount) : Math.abs(t.amount)),
      0,
    );
    lines.push({
      id: "ledger",
      label: `${since.length} transaction${since.length === 1 ? "" : "s"} recorded`,
      value: signedRupees(net),
      direction: direction(net),
      basis: `Net cash flow across ${since.length} recorded event${since.length === 1 ? "" : "s"}`,
    });
  }

  if (current.monthlySip > 0) {
    lines.push({
      id: "sip",
      label: "Monthly investing now",
      value: formatRupees(current.monthlySip),
      direction: "flat",
      basis: "Sum of active recurring plans",
    });
  }

  return {
    hasBaseline: true,
    baselineLabel: basis,
    lines,
    note: lines.length === 0 ? "Nothing measurable has changed since then." : null,
  };
}

/** Picks the most useful baseline available: last review, else an older snapshot. */
export function pickBaseline(
  reviews: { period: string; reviewed_at: string; total_value: number | null; invested: number | null }[],
  snapshots: { taken_on: string; total_value: number; invested: number; allocation: Record<string, number> }[],
  now = new Date(),
): ChangeBaseline | null {
  const review = reviews[0];
  if (review) {
    const date = review.reviewed_at.slice(0, 10);
    const snap = [...snapshots].filter((s) => s.taken_on <= date).sort((a, b) => b.taken_on.localeCompare(a.taken_on))[0];
    return {
      date,
      source: `Review ${review.period}`,
      totalValue: review.total_value ?? snap?.total_value ?? null,
      invested: review.invested ?? snap?.invested ?? null,
      allocationPct: snap?.allocation ?? null,
      holdingCount: null,
    };
  }

  const cutoff = new Date(now.getTime() - 1000 * 60 * 60 * 24 * 30).toISOString().slice(0, 10);
  const older = [...snapshots].filter((s) => s.taken_on <= cutoff).sort((a, b) => b.taken_on.localeCompare(a.taken_on))[0];
  const oldest = [...snapshots].sort((a, b) => a.taken_on.localeCompare(b.taken_on))[0];
  const snap = older ?? (snapshots.length > 1 ? oldest : undefined);
  if (!snap) return null;
  return {
    date: snap.taken_on,
    source: "Snapshot",
    totalValue: snap.total_value,
    invested: snap.invested,
    allocationPct: snap.allocation,
    holdingCount: null,
  };
}
