import { ASSET_CLASSES, type AssetClass } from "./types";
import type { RebalanceRow } from "./portfolio";

export type RebalanceAction = {
  assetClass: AssetClass;
  direction: "sell" | "buy";
  amount: number;
  currentPct: number;
  targetPct: number;
  driftPct: number;
  /** Contribution-first instruction for the next decision. */
  preferredAction:
    "Redirect new contributions" | "Increase new contributions" | "Sell existing holdings";
  /** Selling is intentionally reserved for a clearly stated condition. */
  sellCondition: string | null;
  /** Why this leg exists, in plain language. */
  reason: string;
};

export type RebalancePlan = {
  /** Absolute drift, in percentage points, summed across classes and halved (turnover measure). */
  turnoverPct: number;
  /** Rupee value that would change hands if corrected by trading. */
  tradeValue: number;
  breached: boolean;
  thresholdPct: number;
  actions: RebalanceAction[];
  /** Correcting by redirecting new money instead of selling. */
  contributionRoute: {
    monthlyContribution: number;
    monthsToCorrect: number | null;
    note: string;
  };
  /** Selling equity is a taxable event; this states that without computing a liability. */
  taxNote: string | null;
};

/**
 * Turn drift rows into an explicit, ordered correction plan.
 * Pure: no tax computation, no market assumptions — only arithmetic on the rows given.
 */
export function buildRebalancePlan(args: {
  rows: RebalanceRow[];
  totalValue: number;
  monthlyContribution: number;
  thresholdPct?: number;
}): RebalancePlan {
  const thresholdPct = args.thresholdPct ?? 5;
  const rows = args.rows;

  const drifted = rows.filter((r) => Math.abs(r.deltaPct) >= thresholdPct);
  const actions: RebalanceAction[] = drifted
    .map((r) => {
      const direction: "sell" | "buy" = r.deltaValue < 0 ? "sell" : "buy";
      const amount = Math.abs(r.deltaValue);
      const materiallyAbove = direction === "sell" && r.deltaPct >= 10;
      const preferredAction =
        direction === "buy"
          ? "Increase new contributions"
          : materiallyAbove || args.monthlyContribution <= 0
            ? "Sell existing holdings"
            : "Redirect new contributions";
      return {
        assetClass: r.assetClass,
        direction,
        amount,
        currentPct: r.currentPct,
        targetPct: r.targetPct,
        driftPct: r.deltaPct,
        preferredAction,
        sellCondition:
          direction === "sell" && preferredAction === "Redirect new contributions"
            ? "Sell only if the drift persists, crosses a wider threshold, or a tax/goal decision justifies realising gains."
            : null,
        reason:
          direction === "sell"
            ? `${r.assetClass} is ${r.deltaPct.toFixed(1)} points above its ${r.targetPct.toFixed(0)}% target.`
            : `${r.assetClass} is ${Math.abs(r.deltaPct).toFixed(1)} points below its ${r.targetPct.toFixed(0)}% target.`,
      } satisfies RebalanceAction;
    })
    .sort((a, b) => b.amount - a.amount);

  const totalAbsDrift = rows.reduce((s, r) => s + Math.abs(r.deltaPct), 0);
  const turnoverPct = totalAbsDrift / 2;
  const tradeValue = actions
    .filter((a) => a.direction === "sell")
    .reduce((s, a) => s + a.amount, 0);

  const shortfall = actions.filter((a) => a.direction === "buy").reduce((s, a) => s + a.amount, 0);
  const monthsToCorrect =
    args.monthlyContribution > 0 && shortfall > 0
      ? Math.ceil(shortfall / args.monthlyContribution)
      : shortfall > 0
        ? null
        : 0;

  const contributionRoute = {
    monthlyContribution: args.monthlyContribution,
    monthsToCorrect,
    note:
      shortfall <= 0
        ? "Nothing is under target, so new money does not need redirecting."
        : monthsToCorrect === null
          ? "There is no recurring contribution, so drift can only be corrected by moving existing money."
          : `Directing the full monthly contribution into the under-weight classes closes the gap in about ${monthsToCorrect} month(s) without selling anything.`,
  };

  const sellsEquity = actions.some(
    (a) => a.direction === "sell" && (a.assetClass === "equity" || a.assetClass === "gold"),
  );
  const taxNote = sellsEquity
    ? "Selling to rebalance realises capital gains and is taxable. Redirecting new contributions avoids that; check the tax module before trading."
    : null;

  return {
    turnoverPct,
    tradeValue,
    breached: actions.length > 0,
    thresholdPct,
    actions,
    contributionRoute,
    taxNote,
  };
}

/** Split a monthly contribution across the classes that are below target, weighted by shortfall. */
export function contributionSplitToTarget(
  rows: RebalanceRow[],
  monthly: number,
): Record<AssetClass, number> {
  const out = Object.fromEntries(ASSET_CLASSES.map((c) => [c, 0])) as Record<AssetClass, number>;
  const below = rows.filter((r) => r.deltaValue > 0);
  const total = below.reduce((s, r) => s + r.deltaValue, 0);
  if (monthly <= 0 || total <= 0) return out;
  for (const r of below) out[r.assetClass] = (r.deltaValue / total) * monthly;
  return out;
}
