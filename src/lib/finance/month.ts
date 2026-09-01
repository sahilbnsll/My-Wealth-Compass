/**
 * "This month" — what the plan asks for, what actually went in, and where the
 * next rupee should go. Pure: every input arrives already loaded; nothing here
 * fetches or guesses. When the ledger is empty the module says so rather than
 * implying zero was invested.
 */
import type { Transaction } from "./ledger";
import { contributionByAssetClass, monthlyContribution } from "./portfolio";
import { ASSET_CLASSES, type AssetClass, type PlannedInvestment } from "./types";

export type MonthStatus = "on_track" | "ahead" | "below_plan" | "no_plan" | "unknown";

export type NextRupeeSlice = { assetClass: AssetClass; amount: number; pct: number };

export type ThisMonth = {
  /** e.g. "September 2026". */
  label: string;
  /** Planned contribution for the month, from active SIPs. */
  target: number;
  /** Money actually added this month, from the ledger. Null when no ledger exists. */
  invested: number | null;
  /** target − invested, floored at zero. Null when invested is unknown. */
  remaining: number | null;
  status: MonthStatus;
  /** How the next contribution should be split, largest first. */
  nextSplit: NextRupeeSlice[];
  /** Rupees the split refers to: what is left this month, else the monthly plan. */
  nextAmount: number;
  /** True when the split comes from recorded SIPs rather than target weights. */
  splitFromPlan: boolean;
};

const CONTRIBUTION_KINDS = new Set(["buy", "sip", "contribution", "deposit"]);

function isActive(p: PlannedInvestment, monthStart: Date, monthEnd: Date): boolean {
  if (p.is_paused) return false;
  if (p.start_date && new Date(p.start_date) > monthEnd) return false;
  if (p.end_date && new Date(p.end_date) < monthStart) return false;
  return true;
}

export type ThisMonthInput = {
  planned: PlannedInvestment[];
  transactions: Transaction[];
  /** Target weights, used only when no SIPs are recorded. */
  targetAllocationPct?: Partial<Record<AssetClass, number>>;
  now?: Date;
};

export function thisMonthPlan(input: ThisMonthInput): ThisMonth {
  const now = input.now ?? new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const label = monthStart.toLocaleDateString("en-IN", { month: "long", year: "numeric" });

  const active = input.planned.filter((p) => isActive(p, monthStart, monthEnd));
  const target = monthlyContribution(active);

  const startKey = monthStart.toISOString().slice(0, 10);
  const endKey = monthEnd.toISOString().slice(0, 10);
  const invested =
    input.transactions.length === 0
      ? null
      : input.transactions
          .filter(
            (t) =>
              CONTRIBUTION_KINDS.has(t.kind) &&
              t.trade_date >= startKey &&
              t.trade_date <= endKey,
          )
          .reduce((a, t) => a + Math.abs(t.amount), 0);

  const remaining = invested === null ? null : Math.max(0, target - invested);

  let status: MonthStatus = "no_plan";
  if (target > 0) {
    if (invested === null) status = "unknown";
    else if (invested >= target * 1.1) status = "ahead";
    else if (invested >= target * 0.98) status = "on_track";
    else status = "below_plan";
  }

  const planSplit = contributionByAssetClass(active);
  const planTotal = ASSET_CLASSES.reduce((a, c) => a + planSplit[c], 0);
  const splitFromPlan = planTotal > 0;

  const nextAmount = remaining && remaining > 0 ? remaining : target;
  const weights: Record<AssetClass, number> = splitFromPlan
    ? planSplit
    : (Object.fromEntries(
        ASSET_CLASSES.map((c) => [c, input.targetAllocationPct?.[c] ?? 0]),
      ) as Record<AssetClass, number>);
  const weightTotal = ASSET_CLASSES.reduce((a, c) => a + (weights[c] || 0), 0);

  const nextSplit: NextRupeeSlice[] =
    weightTotal <= 0
      ? []
      : ASSET_CLASSES.filter((c) => (weights[c] || 0) > 0)
          .map((c) => ({
            assetClass: c,
            pct: ((weights[c] || 0) / weightTotal) * 100,
            amount: Math.round((nextAmount * (weights[c] || 0)) / weightTotal),
          }))
          .sort((a, b) => b.amount - a.amount || b.pct - a.pct);

  return { label, target, invested, remaining, status, nextSplit, nextAmount, splitFromPlan };
}

export const MONTH_STATUS_LABEL: Record<MonthStatus, string> = {
  on_track: "On track",
  ahead: "Ahead of plan",
  below_plan: "Below plan",
  no_plan: "No plan recorded",
  unknown: "No ledger yet",
};
