/**
 * Import reconciliation — the balance check.
 *
 * A financial import is only trustworthy if the arithmetic closes. Before
 * anything is written we compute what the portfolio (or ledger) is worth today,
 * what the selected rows would add or change, and what the result should be.
 * If the file states its own total and our arithmetic disagrees, the difference
 * is surfaced as a warning rather than quietly absorbed.
 */
import type { ParsedHolding } from "./csv";
import type { ParsedTransaction } from "./transactions";
import type { ReconciledHolding, ReconciledTransaction, ExistingHolding } from "./reconcile";
import { signedCashFlow, type Transaction, type TransactionKind } from "@/lib/finance/ledger";

/** Materiality threshold: below this, rounding in a broker file is not a problem. */
export const TOLERANCE_ABS = 100;
export const TOLERANCE_PCT = 0.005;

export type ReconciliationLine = {
  label: string;
  value: number;
  hint?: string;
};

export type Reconciliation = {
  /** Portfolio / ledger position before this import. */
  opening: number;
  openingLabel: string;
  /** Net effect of the rows the user has selected. */
  activity: number;
  activityLabel: string;
  /** Detail behind the activity figure. */
  lines: ReconciliationLine[];
  /** opening + activity. */
  closing: number;
  closingLabel: string;
  /** The total the file itself claims, when it states one. */
  statedTotal: number | null;
  statedLabel: string | null;
  /** closing − statedTotal, when a stated total exists. */
  difference: number | null;
  balanced: boolean;
  /** Plain-language warnings the user should clear before confirming. */
  warnings: string[];
};

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

const holdingValue = (row: ParsedHolding): number => {
  if (row.current_value !== null) return row.current_value;
  if (row.quantity !== null && row.current_price !== null) return row.quantity * row.current_price;
  if (row.cost_basis !== null) return row.cost_basis;
  if (row.quantity !== null && row.avg_price !== null) return row.quantity * row.avg_price;
  return 0;
};

const existingValue = (h: ExistingHolding): number => {
  if (h.current_value !== null && h.current_value !== undefined) return h.current_value;
  if (h.quantity !== null && h.current_price !== null) return h.quantity * h.current_price;
  if (h.quantity !== null && h.avg_price !== null) return h.quantity * h.avg_price;
  return 0;
};

const withinTolerance = (difference: number, scale: number) =>
  Math.abs(difference) <= Math.max(TOLERANCE_ABS, Math.abs(scale) * TOLERANCE_PCT);

/**
 * Reconcile a holdings import: today's portfolio, the value the selected rows
 * add or restate, and the closing portfolio value that would result.
 */
export function reconcileHoldingBalances(
  selected: ReconciledHolding[],
  existing: ExistingHolding[],
  statedTotal: number | null = null,
): Reconciliation {
  const opening = sum(existing.map(existingValue));
  const byId = new Map(existing.map((h) => [h.id, h]));

  const added = selected.filter((r) => r.matchedId === null);
  const updated = selected.filter((r) => r.matchedId !== null);

  const addedValue = sum(added.map((r) => holdingValue(r.row)));
  const restatedNew = sum(updated.map((r) => holdingValue(r.row)));
  const restatedOld = sum(
    updated.map((r) => {
      const match = r.matchedId ? byId.get(r.matchedId) : undefined;
      return match ? existingValue(match) : 0;
    }),
  );
  const revaluation = restatedNew - restatedOld;
  const activity = addedValue + revaluation;
  const closing = opening + activity;

  const lines: ReconciliationLine[] = [
    { label: "New positions", value: addedValue, hint: `${added.length} instrument${added.length === 1 ? "" : "s"}` },
    {
      label: "Revaluation of existing positions",
      value: revaluation,
      hint: `${updated.length} instrument${updated.length === 1 ? "" : "s"} restated`,
    },
  ];

  const warnings: string[] = [];
  const missingValue = selected.filter((r) => holdingValue(r.row) === 0);
  if (missingValue.length > 0) {
    warnings.push(
      `${missingValue.length} selected row${missingValue.length === 1 ? " carries" : "s carry"} no value. They will be saved with zero and will not appear in your totals until priced.`,
    );
  }

  const difference = statedTotal === null ? null : closing - statedTotal;
  const balanced = difference === null ? true : withinTolerance(difference, statedTotal || closing);
  if (difference !== null && !balanced) {
    warnings.push(
      "The closing value does not match the total stated in this file. Investigate before confirming — a missing or duplicated row is the usual cause.",
    );
  }

  return {
    opening,
    openingLabel: "Portfolio before import",
    activity,
    activityLabel: "Imported activity",
    lines,
    closing,
    closingLabel: "Portfolio after import",
    statedTotal,
    statedLabel: statedTotal === null ? null : "Total stated in file",
    difference,
    balanced,
    warnings,
  };
}

const INFLOW_KINDS: TransactionKind[] = ["buy", "sip", "deposit", "contribution"];
const OUTFLOW_KINDS: TransactionKind[] = ["sell", "withdrawal"];
const INCOME_KINDS: TransactionKind[] = ["dividend", "interest"];

/**
 * Reconcile a transaction import: net invested to date, the net cash the
 * selected rows move, and the net invested position that would result.
 */
export function reconcileTransactionBalances(
  selected: ReconciledTransaction[],
  existing: Transaction[],
  statedTotal: number | null = null,
): Reconciliation {
  // Net capital deployed so far: outflows from the pocket count positive.
  const opening = sum(existing.map((tx) => -signedCashFlow(tx)));

  const rows = selected.map((r) => r.row as ParsedTransaction);
  const gross = (tx: ParsedTransaction) => Math.abs(tx.amount);
  const costs = (tx: ParsedTransaction) => Math.abs(tx.fees) + Math.abs(tx.taxes);

  const purchases = rows.filter((tx) => INFLOW_KINDS.includes(tx.kind));
  const sales = rows.filter((tx) => OUTFLOW_KINDS.includes(tx.kind));
  const income = rows.filter((tx) => INCOME_KINDS.includes(tx.kind));
  const charges = rows.filter((tx) => tx.kind === "charge");

  const purchaseValue = sum(purchases.map((tx) => gross(tx) + costs(tx)));
  const saleValue = sum(sales.map((tx) => gross(tx) - costs(tx)));
  const incomeValue = sum(income.map((tx) => gross(tx) - costs(tx)));
  const chargeValue = sum(charges.map((tx) => gross(tx) + costs(tx)));
  const feesValue = sum(rows.map(costs));

  const activity = purchaseValue + chargeValue - saleValue;
  const closing = opening + activity;

  const lines: ReconciliationLine[] = [
    { label: "Purchases and instalments", value: purchaseValue, hint: `${purchases.length} event${purchases.length === 1 ? "" : "s"}` },
    { label: "Sales and withdrawals", value: -saleValue, hint: `${sales.length} event${sales.length === 1 ? "" : "s"}` },
    { label: "Dividends and interest", value: incomeValue, hint: "Recorded as income, not capital" },
    { label: "Charges and fees", value: chargeValue + feesValue, hint: "Included in cost basis" },
  ];

  const warnings: string[] = [];

  const undated = rows.filter((tx) => !/^\d{4}-\d{2}-\d{2}$/.test(tx.trade_date));
  if (undated.length > 0) {
    warnings.push(`${undated.length} selected row${undated.length === 1 ? " has" : "s have"} an unreadable date. XIRR and tax terms need a valid trade date.`);
  }

  const zeroAmount = rows.filter((tx) => Math.abs(tx.amount) < 1e-9);
  if (zeroAmount.length > 0) {
    warnings.push(`${zeroAmount.length} selected row${zeroAmount.length === 1 ? " has" : "s have"} no amount. They will not affect invested capital.`);
  }

  const unpricedSales = sales.filter((tx) => tx.quantity === null);
  if (unpricedSales.length > 0) {
    warnings.push(
      `${unpricedSales.length} sale${unpricedSales.length === 1 ? "" : "s"} carry no quantity, so realised gains will be matched by value rather than by lot.`,
    );
  }

  const difference = statedTotal === null ? null : closing - statedTotal;
  const balanced = difference === null ? true : withinTolerance(difference, statedTotal || closing);
  if (difference !== null && !balanced) {
    warnings.push(
      "Net invested after import does not match the total stated in this file. Investigate before confirming.",
    );
  }

  return {
    opening,
    openingLabel: "Net invested before import",
    activity,
    activityLabel: "Imported activity",
    lines,
    closing,
    closingLabel: "Net invested after import",
    statedTotal,
    statedLabel: statedTotal === null ? null : "Total stated in file",
    difference,
    balanced,
    warnings,
  };
}

/**
 * Many broker exports print a grand total line ("Total", "Grand Total",
 * "Closing balance"). Read it when present so the import can be balanced
 * against the file's own arithmetic.
 */
export function findStatedTotal(text: string): { value: number; label: string } | null {
  const patterns = [
    /(?:^|\n)\s*"?(grand\s*total|closing\s*balance|total\s*value|portfolio\s*value|net\s*total|total)"?[^0-9\-\n]{0,40}(-?[\d,]+(?:\.\d+)?)/i,
  ];
  for (const re of patterns) {
    const m = re.exec(text);
    if (!m) continue;
    const value = Number((m[2] ?? "").replace(/,/g, ""));
    if (Number.isFinite(value) && Math.abs(value) > 0) {
      return { value, label: (m[1] ?? "total").trim().toLowerCase() };
    }
  }
  return null;
}
