/** Portfolio history derived only from captured snapshots and ledger events. */
import type { Transaction } from "./ledger";

export type HistorySnapshot = {
  taken_on: string;
  total_value: number;
  invested: number;
  allocation?: Record<string, number>;
};

export type PerformancePoint = {
  date: string;
  label: string;
  value: number;
  invested: number;
  gain: number;
  drawdownPct: number;
  contribution: number;
};

export type RecoveryWindow = {
  peakDate: string;
  troughDate: string;
  recoveredDate: string | null;
  drawdownPct: number;
  daysToRecover: number | null;
};

function dateLabel(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("en-IN", { month: "short", year: "2-digit" }).format(date);
}

function daysBetween(a: string, b: string): number {
  return Math.max(0, Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86_400_000));
}

/**
 * Build a chart series without inventing history. The current point is added
 * only when it differs from the latest captured snapshot.
 */
export function buildPerformanceHistory(
  snapshots: HistorySnapshot[],
  current?: { totalValue: number; invested: number; asOf?: string },
  transactions: Transaction[] = [],
): PerformancePoint[] {
  const sorted = [...snapshots].sort((a, b) => a.taken_on.localeCompare(b.taken_on));
  const currentDate = current?.asOf?.slice(0, 10) ?? new Date().toISOString().slice(0, 10);
  const rows = [...sorted];
  const last = rows[rows.length - 1];
  if (current && (!last || last.taken_on !== currentDate || last.total_value !== current.totalValue || last.invested !== current.invested)) {
    rows.push({ taken_on: currentDate, total_value: current.totalValue, invested: current.invested });
  }

  let peak = 0;
  return rows.map((row) => {
    peak = Math.max(peak, row.total_value);
    const monthKey = row.taken_on.slice(0, 7);
    const contribution = transactions
      .filter((tx) => tx.trade_date.slice(0, 7) === monthKey && ["buy", "sip", "contribution", "deposit"].includes(tx.kind))
      .reduce((sum, tx) => sum + Math.abs(tx.amount), 0);
    return {
      date: row.taken_on,
      label: dateLabel(row.taken_on),
      value: row.total_value,
      invested: row.invested,
      gain: row.total_value - row.invested,
      drawdownPct: peak > 0 ? ((row.total_value - peak) / peak) * 100 : 0,
      contribution,
    };
  });
}

/** Find the deepest observed drawdown and whether the old high was regained. */
export function largestDrawdown(points: PerformancePoint[]): RecoveryWindow | null {
  if (points.length < 2) return null;
  const first = points[0];
  if (!first) return null;
  let peak: PerformancePoint = first;
  let trough: PerformancePoint = first;
  let worst: RecoveryWindow | null = null;
  for (const point of points.slice(1)) {
    if (point.value >= peak.value) {
      if (trough !== peak && (worst === null || trough.value / peak.value < 1 + worst.drawdownPct / 100)) {
        const recovered = point.value >= peak.value ? point : null;
        worst = {
          peakDate: peak.date,
          troughDate: trough.date,
          recoveredDate: recovered?.date ?? null,
          drawdownPct: ((trough.value - peak.value) / peak.value) * 100,
          daysToRecover: recovered ? daysBetween(trough.date, recovered.date) : null,
        };
      }
      peak = point;
      trough = point;
    } else if (point.value < trough.value) {
      trough = point;
    }
  }
  if (trough !== peak && (worst === null || trough.value / peak.value < 1 + worst.drawdownPct / 100)) {
    worst = {
      peakDate: peak.date,
      troughDate: trough.date,
      recoveredDate: null,
      drawdownPct: ((trough.value - peak.value) / peak.value) * 100,
      daysToRecover: null,
    };
  }
  return worst;
}

export function allocationHistory(
  snapshots: HistorySnapshot[],
  assetClass: string,
): { date: string; pct: number }[] {
  return snapshots
    .filter((s) => s.allocation && Number.isFinite(Number(s.allocation[assetClass])))
    .map((s) => ({ date: dateLabel(s.taken_on), pct: Number(s.allocation?.[assetClass] ?? 0) }));
}
