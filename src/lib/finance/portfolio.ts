import { cagr, xirr, type CashFlow } from "./core";
import { signedCashFlow, type Transaction } from "./ledger";
import {
  ASSET_CLASSES,
  UNIT_PRICED,
  type AssetClass,
  type Holding,
  type PlannedInvestment,
} from "./types";

export type ValuedHolding = Holding & {
  value: number;
  invested: number;
  gain: number;
  gainPct: number | null;
};

export type HoldingAnalysis = {
  sharePct: number;
  role: string;
  risk: "Low" | "Moderate" | "High";
  targetPct: number | null;
  status: "On target" | "Above target" | "No target set";
};

/** Value a holding. Unit-priced instruments use quantity x price; balances use current_value. */
export function valueHolding(h: Holding): ValuedHolding {
  const unitPriced = UNIT_PRICED.includes(h.instrument_type);
  const qty = h.quantity ?? 0;
  const price = h.current_price ?? 0;
  const value = unitPriced ? qty * price : (h.current_value ?? 0);
  const invested = h.cost_basis ?? (unitPriced ? qty * (h.avg_price ?? 0) : (h.current_value ?? 0));
  const gain = value - invested;
  return {
    ...h,
    value,
    invested,
    gain,
    gainPct: invested > 0 ? (gain / invested) * 100 : null,
  };
}

/** Describe one holding using only recorded facts and its share of the portfolio. */
export function holdingAnalysis(holding: ValuedHolding, totalValue: number): HoldingAnalysis {
  const sharePct = totalValue > 0 ? (holding.value / totalValue) * 100 : 0;
  const role =
    holding.asset_class === "equity"
      ? holding.instrument_type === "mutual_fund"
        ? "Diversified equity"
        : "Core equity"
      : holding.asset_class === "debt"
        ? "Stability"
        : holding.asset_class === "gold"
          ? "Diversifier"
          : holding.asset_class === "cash"
            ? "Liquidity"
            : "Other";
  const risk =
    holding.asset_class === "cash" || holding.asset_class === "debt"
      ? "Low"
      : sharePct >= 15
        ? "High"
        : sharePct >= 8
          ? "Moderate"
          : "Low";
  const targetPct = holding.target_allocation_pct;
  const status =
    targetPct === null || targetPct === undefined
      ? "No target set"
      : sharePct > targetPct + 1
        ? "Above target"
        : "On target";
  return { sharePct, role, risk, targetPct, status };
}

export type AllocationRow = {
  key: string;
  value: number;
  pct: number;
};

export function allocationBy(
  holdings: ValuedHolding[],
  keyFn: (h: ValuedHolding) => string,
): AllocationRow[] {
  const total = holdings.reduce((a, h) => a + h.value, 0);
  const map = new Map<string, number>();
  for (const h of holdings) {
    const k = keyFn(h) || "unclassified";
    map.set(k, (map.get(k) ?? 0) + h.value);
  }
  return [...map.entries()]
    .map(([key, value]) => ({ key, value, pct: total > 0 ? (value / total) * 100 : 0 }))
    .sort((a, b) => b.value - a.value);
}

export function assetClassAllocation(holdings: ValuedHolding[]): Record<AssetClass, number> {
  const total = holdings.reduce((a, h) => a + h.value, 0);
  const out = Object.fromEntries(ASSET_CLASSES.map((c) => [c, 0])) as Record<AssetClass, number>;
  for (const h of holdings) out[h.asset_class] = (out[h.asset_class] ?? 0) + h.value;
  if (total > 0) for (const c of ASSET_CLASSES) out[c] = (out[c] / total) * 100;
  return out;
}

export function assetClassValues(holdings: ValuedHolding[]): Record<AssetClass, number> {
  const out = Object.fromEntries(ASSET_CLASSES.map((c) => [c, 0])) as Record<AssetClass, number>;
  for (const h of holdings) out[h.asset_class] = (out[h.asset_class] ?? 0) + h.value;
  return out;
}

export type XirrBasis = "ledger" | "purchase_dates" | null;

/**
 * How a money-weighted return should be presented. A return computed from real
 * transaction cash flows is the truth; anything else is explicitly an estimate.
 */
export function xirrLabel(
  basis: XirrBasis,
  coveragePct: number | null = null,
): { title: string; source: string; estimated: boolean } {
  if (basis === "ledger") {
    const partial =
      coveragePct !== null && coveragePct < 90
        ? ` — covers ${Math.round(coveragePct)}% of invested capital`
        : "";
    return { title: "XIRR", source: `Based on transaction history${partial}`, estimated: false };
  }
  if (basis === "purchase_dates") {
    return {
      title: "Estimated XIRR",
      source: "Estimated from purchase dates until transaction history exists",
      estimated: true,
    };
  }
  return { title: "XIRR", source: "Add transactions or purchase dates", estimated: true };
}

export type PortfolioSummary = {
  totalValue: number;
  invested: number;
  unrealisedGain: number;
  unrealisedGainPct: number | null;
  holdings: ValuedHolding[];
  byAssetClass: Record<AssetClass, number>;
  valueByAssetClass: Record<AssetClass, number>;
  liquidValue: number;
  xirrPct: number | null;
  /** Where the money-weighted return came from, so the UI can say so honestly. */
  xirrBasis: XirrBasis;
  /** Share of invested capital represented in the ledger, when one exists. */
  xirrCoveragePct: number | null;
  cagrPct: number | null;
};

/**
 * Summarise the portfolio. When a transaction ledger is supplied it is the
 * source of truth for the money-weighted return: every dated cash flow is used
 * rather than the coarse "one purchase per holding" approximation.
 */
export function summarisePortfolio(
  rawHoldings: Holding[],
  transactions?: Transaction[],
): PortfolioSummary {
  const holdings = rawHoldings.map(valueHolding);
  const totalValue = holdings.reduce((a, h) => a + h.value, 0);
  const invested = holdings.reduce((a, h) => a + h.invested, 0);
  const gain = totalValue - invested;

  const liquidValue = holdings
    .filter((h) => h.asset_class === "cash" || h.liquidity === "high")
    .reduce((a, h) => a + h.value, 0);

  let xirrPct: number | null = null;
  let xirrBasis: XirrBasis = null;
  let xirrCoveragePct: number | null = null;

  // Preferred: true XIRR from the recorded transaction ledger.
  if (transactions && transactions.length > 0 && totalValue > 0) {
    const ledgerFlows: CashFlow[] = transactions
      .map((tx) => ({ date: new Date(tx.trade_date), amount: signedCashFlow(tx) }))
      .filter((f) => Math.abs(f.amount) > 1e-9 && !Number.isNaN(f.date.getTime()));
    if (ledgerFlows.length > 0) {
      ledgerFlows.push({ date: new Date(), amount: totalValue });
      const value = xirr(ledgerFlows);
      if (value !== null) {
        xirrPct = value;
        xirrBasis = "ledger";
        // How much of the invested capital the ledger actually explains.
        const ledgerInvested = transactions
          .map((tx) => -signedCashFlow(tx))
          .filter((v) => v > 0)
          .reduce((a, b) => a + b, 0);
        xirrCoveragePct = invested > 0 ? Math.min(100, (ledgerInvested / invested) * 100) : null;
      }
    }
  }

  // Fallback: dated purchases on the holdings themselves.
  if (xirrPct === null) {
    const flows: CashFlow[] = [];
    for (const h of holdings) {
      if (h.purchase_date && h.invested > 0) {
        flows.push({ date: new Date(h.purchase_date), amount: -h.invested });
      }
    }
    if (flows.length > 0 && totalValue > 0) {
      flows.push({ date: new Date(), amount: totalValue });
      const value = xirr(flows);
      if (value !== null) {
        xirrPct = value;
        xirrBasis = "purchase_dates";
      }
    }
  }

  // Simple CAGR from the earliest purchase date across dated holdings.
  let cagrPct: number | null = null;
  const dated = holdings.filter((h) => h.purchase_date);
  if (dated.length > 0 && invested > 0) {
    const earliest = Math.min(...dated.map((h) => new Date(h.purchase_date!).getTime()));
    const years = (Date.now() - earliest) / (365.25 * 24 * 3600 * 1000);
    if (years >= 0.5) cagrPct = cagr(invested, totalValue, years);
  }

  return {
    totalValue,
    invested,
    unrealisedGain: gain,
    unrealisedGainPct: invested > 0 ? (gain / invested) * 100 : null,
    holdings,
    byAssetClass: assetClassAllocation(holdings),
    valueByAssetClass: assetClassValues(holdings),
    liquidValue,
    xirrPct,
    xirrBasis,
    xirrCoveragePct,
    cagrPct,
  };
}

export type RebalanceRow = {
  assetClass: AssetClass;
  currentPct: number;
  targetPct: number;
  deltaPct: number;
  currentValue: number;
  targetValue: number;
  deltaValue: number;
  status: "above" | "below" | "on_target";
};

/**
 * Compare current allocation against target. Deviations inside `thresholdPct`
 * percentage points are treated as on target — no action needed.
 */
export function rebalance(
  summary: PortfolioSummary,
  target: Record<AssetClass, number>,
  thresholdPct = 5,
): RebalanceRow[] {
  return ASSET_CLASSES.map((c) => {
    const currentPct = summary.byAssetClass[c] ?? 0;
    const targetPct = target[c] ?? 0;
    const deltaPct = currentPct - targetPct;
    const currentValue = summary.valueByAssetClass[c] ?? 0;
    const targetValue = (summary.totalValue * targetPct) / 100;
    return {
      assetClass: c,
      currentPct,
      targetPct,
      deltaPct,
      currentValue,
      targetValue,
      deltaValue: targetValue - currentValue,
      status: Math.abs(deltaPct) < thresholdPct ? "on_target" : deltaPct > 0 ? "above" : "below",
    } satisfies RebalanceRow;
  }).filter((r) => r.currentValue > 0 || r.targetPct > 0);
}

export type ConcentrationWarning = {
  level: "info" | "warning";
  scope: string;
  message: string;
};

export function concentrationWarnings(summary: PortfolioSummary): ConcentrationWarning[] {
  const out: ConcentrationWarning[] = [];
  if (summary.totalValue <= 0) return out;

  for (const h of summary.holdings) {
    const pct = (h.value / summary.totalValue) * 100;
    if (h.instrument_type === "stock" && pct > 10) {
      out.push({
        level: "warning",
        scope: "single instrument",
        message: `${h.name} is ${pct.toFixed(1)}% of the total portfolio. Single-stock exposure above 10% materially raises company-specific risk.`,
      });
    }
  }

  const equity = summary.holdings.filter((h) => h.asset_class === "equity");
  const equityTotal = equity.reduce((a, h) => a + h.value, 0);
  if (equityTotal > 0) {
    for (const row of allocationBy(equity, (h) => h.sector ?? "")) {
      if (row.key === "unclassified") continue;
      const pct = (row.value / equityTotal) * 100;
      if (pct > 30) {
        out.push({
          level: "warning",
          scope: "sector",
          message: `${pct.toFixed(0)}% of equity exposure sits in ${row.key}. Sector concentration above 30% means a sector-specific shock hits a large part of the equity book.`,
        });
      }
    }
    const funds = equity.filter((h) => h.instrument_type === "mutual_fund");
    const sameCategory = new Map<string, number>();
    for (const f of funds) {
      const k = f.category ?? "uncategorised";
      sameCategory.set(k, (sameCategory.get(k) ?? 0) + 1);
    }
    for (const [cat, n] of sameCategory) {
      if (cat !== "uncategorised" && n > 2) {
        out.push({
          level: "info",
          scope: "fund overlap",
          message: `${n} funds share the ${cat} category. Funds in the same category usually hold overlapping stocks, so the extra funds add cost and complexity without much extra diversification.`,
        });
      }
    }
  }

  const cashPct = summary.byAssetClass.cash ?? 0;
  if (cashPct > 25) {
    out.push({
      level: "info",
      scope: "liquidity",
      message: `Cash is ${cashPct.toFixed(0)}% of the portfolio. Beyond the emergency fund, idle cash loses purchasing power to inflation.`,
    });
  }
  return out;
}

/** Total planned monthly contribution across all active planned investments. */
export function monthlyContribution(planned: PlannedInvestment[]): number {
  return planned.reduce((a, p) => a + normaliseToMonthly(p), 0);
}

export function normaliseToMonthly(p: PlannedInvestment): number {
  if (p.is_paused) return 0;
  const amt = p.monthly_amount ?? 0;
  switch (p.frequency) {
    case "quarterly":
      return amt / 3;
    case "annual":
      return amt / 12;
    case "one_time":
      return 0;
    default:
      return amt;
  }
}

export function contributionByAssetClass(planned: PlannedInvestment[]): Record<AssetClass, number> {
  const out = Object.fromEntries(ASSET_CLASSES.map((c) => [c, 0])) as Record<AssetClass, number>;
  for (const p of planned) out[p.asset_class] = (out[p.asset_class] ?? 0) + normaliseToMonthly(p);
  return out;
}
