/**
 * Transaction ledger: a durable financial event model.
 *
 * Everything downstream — cost basis, realised gains, income, XIRR, SIP history,
 * withdrawals and tax — is derived here from the same event stream. Nothing in
 * this module reads the database or touches the UI.
 */
import { xirr, type CashFlow } from "./core";
import { longTermThresholdMonths, taxCategoryFor, type TaxCategory } from "./tax";
import type { AssetClass, InstrumentType } from "./types";

export const TRANSACTION_KINDS = [
  "buy",
  "sip",
  "sell",
  "dividend",
  "interest",
  "bonus",
  "charge",
  "deposit",
  "contribution",
  "withdrawal",
] as const;
export type TransactionKind = (typeof TRANSACTION_KINDS)[number];

export const TRANSACTION_LABELS: Record<TransactionKind, string> = {
  buy: "Buy",
  sip: "SIP instalment",
  sell: "Sell",
  dividend: "Dividend",
  interest: "Interest",
  bonus: "Bonus units",
  charge: "Charge / fee",
  deposit: "Deposit",
  contribution: "Contribution",
  withdrawal: "Withdrawal",
};

export type Transaction = {
  id: string;
  holding_id: string | null;
  kind: TransactionKind;
  trade_date: string;
  settlement_date: string | null;
  name: string;
  symbol: string | null;
  isin: string | null;
  asset_class: AssetClass;
  instrument_type: InstrumentType;
  quantity: number | null;
  price: number | null;
  amount: number;
  fees: number;
  taxes: number;
  currency: string;
  source: string;
  external_id: string | null;
  notes: string | null;
};

/** Cash moving in (+) or out (−) of the investor's pocket. */
export function signedCashFlow(tx: Transaction): number {
  const gross = Math.abs(tx.amount);
  const costs = Math.abs(tx.fees) + Math.abs(tx.taxes);
  switch (tx.kind) {
    case "buy":
    case "sip":
    case "deposit":
    case "contribution":
      return -(gross + costs);
    case "sell":
    case "withdrawal":
      return gross - costs;
    case "dividend":
    case "interest":
      return gross - costs;
    case "charge":
      return -(gross + costs);
    case "bonus":
      return 0;
    default:
      return 0;
  }
}

/** Groups events that describe the same instrument. */
export function positionKey(tx: Transaction): string {
  return tx.holding_id ?? tx.isin ?? tx.symbol ?? tx.name.trim().toLowerCase();
}

type Lot = { date: string; quantity: number; costPerUnit: number };

export type RealisedGain = {
  key: string;
  name: string;
  assetClass: AssetClass;
  taxCategory: TaxCategory;
  buyDate: string;
  sellDate: string;
  quantity: number;
  proceeds: number;
  cost: number;
  gain: number;
  holdingMonths: number;
  term: "short" | "long";
};

export type Position = {
  key: string;
  holdingId: string | null;
  name: string;
  symbol: string | null;
  assetClass: AssetClass;
  instrumentType: InstrumentType;
  /** Units still held (0 for balance-style instruments). */
  quantity: number;
  /** Remaining cost basis of the open lots, plus net deposits for unit-less events. */
  costBasis: number;
  averageCost: number | null;
  invested: number;
  withdrawn: number;
  income: number;
  realisedGain: number;
  firstTradeDate: string;
  lastTradeDate: string;
  transactions: number;
};

function monthsBetween(from: string, to: string): number {
  const a = new Date(from);
  const b = new Date(to);
  let months = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
  if (b.getDate() < a.getDate()) months -= 1;
  return Math.max(0, months);
}

export type LedgerResult = {
  positions: Position[];
  realised: RealisedGain[];
  /** Events that could not be applied, e.g. a sale with no matching lots. */
  warnings: string[];
};

/**
 * Rebuilds positions and realised gains from the event stream using FIFO lots,
 * the convention Indian brokers and the Income Tax Act both use.
 */
export function buildLedger(transactions: Transaction[]): LedgerResult {
  const sorted = [...transactions].sort((a, b) =>
    a.trade_date === b.trade_date ? a.id.localeCompare(b.id) : a.trade_date.localeCompare(b.trade_date),
  );

  const lots = new Map<string, Lot[]>();
  const positions = new Map<string, Position>();
  const realised: RealisedGain[] = [];
  const warnings: string[] = [];

  for (const tx of sorted) {
    const key = positionKey(tx);
    const existing = positions.get(key);
    const pos: Position = existing ?? {
      key,
      holdingId: tx.holding_id,
      name: tx.name,
      symbol: tx.symbol,
      assetClass: tx.asset_class,
      instrumentType: tx.instrument_type,
      quantity: 0,
      costBasis: 0,
      averageCost: null,
      invested: 0,
      withdrawn: 0,
      income: 0,
      realisedGain: 0,
      firstTradeDate: tx.trade_date,
      lastTradeDate: tx.trade_date,
      transactions: 0,
    };
    if (!existing) positions.set(key, pos);
    pos.lastTradeDate = tx.trade_date;
    pos.transactions += 1;
    if (tx.holding_id) pos.holdingId = tx.holding_id;

    const gross = Math.abs(tx.amount);
    const fees = Math.abs(tx.fees) + Math.abs(tx.taxes);
    const list = lots.get(key) ?? [];

    switch (tx.kind) {
      case "buy":
      case "sip":
      case "deposit":
      case "contribution": {
        const qty = tx.quantity ?? 0;
        const total = gross + fees;
        pos.invested += total;
        pos.costBasis += total;
        if (qty > 0) {
          pos.quantity += qty;
          list.push({ date: tx.trade_date, quantity: qty, costPerUnit: total / qty });
          lots.set(key, list);
        }
        break;
      }
      case "bonus": {
        const qty = tx.quantity ?? 0;
        if (qty > 0) {
          pos.quantity += qty;
          // Bonus units carry zero cost; the existing basis now spreads over more units.
          list.push({ date: tx.trade_date, quantity: qty, costPerUnit: 0 });
          lots.set(key, list);
        }
        break;
      }
      case "sell":
      case "withdrawal": {
        const proceedsNet = gross - fees;
        pos.withdrawn += proceedsNet;
        let qty = tx.quantity ?? 0;

        if (qty > 0) {
          const category = taxCategoryFor(tx.instrument_type, tx.asset_class);
          const threshold = longTermThresholdMonths(category);
          const perUnitProceeds = proceedsNet / qty;
          let matched = 0;
          while (qty > 1e-9 && list.length > 0) {
            const lot = list[0]!;
            const take = Math.min(qty, lot.quantity);
            const cost = take * lot.costPerUnit;
            const proceeds = take * perUnitProceeds;
            const months = monthsBetween(lot.date, tx.trade_date);
            realised.push({
              key,
              name: pos.name,
              assetClass: tx.asset_class,
              taxCategory: category,
              buyDate: lot.date,
              sellDate: tx.trade_date,
              quantity: take,
              proceeds,
              cost,
              gain: proceeds - cost,
              holdingMonths: months,
              term: months >= threshold ? "long" : "short",
            });
            pos.realisedGain += proceeds - cost;
            pos.costBasis -= cost;
            pos.quantity -= take;
            lot.quantity -= take;
            qty -= take;
            matched += take;
            if (lot.quantity <= 1e-9) list.shift();
          }
          lots.set(key, list);
          if (qty > 1e-9) {
            warnings.push(
              `${tx.name}: sold ${(matched + qty).toFixed(2)} units on ${tx.trade_date} but only ${matched.toFixed(2)} were held. Add the missing purchase.`,
            );
          }
        } else {
          // Balance-style instrument: reduce basis, treat the excess as gain.
          const cost = Math.min(pos.costBasis, proceedsNet);
          pos.costBasis -= cost;
          pos.realisedGain += proceedsNet - cost;
        }
        break;
      }
      case "dividend":
      case "interest": {
        pos.income += gross - fees;
        break;
      }
      case "charge": {
        pos.costBasis += gross + fees;
        pos.invested += gross + fees;
        break;
      }
    }

    pos.averageCost = pos.quantity > 1e-9 ? pos.costBasis / pos.quantity : null;
  }

  return {
    positions: [...positions.values()].sort((a, b) => b.lastTradeDate.localeCompare(a.lastTradeDate)),
    realised: realised.sort((a, b) => b.sellDate.localeCompare(a.sellDate)),
    warnings,
  };
}

/** Indian financial year (1 April – 31 March) containing `date`. */
export function financialYearOf(date: Date | string): { label: string; start: string; end: string } {
  const d = typeof date === "string" ? new Date(date) : date;
  const year = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
  return {
    label: `FY ${year}-${String((year + 1) % 100).padStart(2, "0")}`,
    start: `${year}-04-01`,
    end: `${year + 1}-03-31`,
  };
}

export type FYSummary = {
  label: string;
  start: string;
  end: string;
  invested: number;
  withdrawn: number;
  income: number;
  realisedShortTerm: number;
  realisedLongTerm: number;
  realisedTotal: number;
  transactions: number;
};

/** Per-financial-year roll-up, newest first. */
export function summariseByFinancialYear(
  transactions: Transaction[],
  realised: RealisedGain[],
): FYSummary[] {
  const map = new Map<string, FYSummary>();
  const bucket = (dateStr: string) => {
    const fy = financialYearOf(dateStr);
    const existing = map.get(fy.label);
    if (existing) return existing;
    const fresh: FYSummary = {
      ...fy,
      invested: 0,
      withdrawn: 0,
      income: 0,
      realisedShortTerm: 0,
      realisedLongTerm: 0,
      realisedTotal: 0,
      transactions: 0,
    };
    map.set(fy.label, fresh);
    return fresh;
  };

  for (const tx of transactions) {
    const b = bucket(tx.trade_date);
    b.transactions += 1;
    const flow = signedCashFlow(tx);
    if (tx.kind === "buy" || tx.kind === "deposit" || tx.kind === "charge") b.invested += -flow;
    if (tx.kind === "sell" || tx.kind === "withdrawal") b.withdrawn += flow;
    if (tx.kind === "dividend" || tx.kind === "interest") b.income += flow;
  }
  for (const r of realised) {
    const b = bucket(r.sellDate);
    if (r.term === "long") b.realisedLongTerm += r.gain;
    else b.realisedShortTerm += r.gain;
    b.realisedTotal += r.gain;
  }

  return [...map.values()].sort((a, b) => b.start.localeCompare(a.start));
}

/**
 * Money-weighted return of the whole ledger. The current portfolio value is
 * added as a final inflow, so this is the true realised-plus-unrealised XIRR.
 */
export function ledgerXirr(
  transactions: Transaction[],
  currentValue: number,
  asOf: Date = new Date(),
): number | null {
  const flows: CashFlow[] = transactions
    .map((tx) => ({ date: new Date(tx.trade_date), amount: signedCashFlow(tx) }))
    .filter((f) => Math.abs(f.amount) > 1e-9 && !Number.isNaN(f.date.getTime()));
  if (flows.length === 0) return null;
  if (currentValue > 0) flows.push({ date: asOf, amount: currentValue });
  return xirr(flows);
}

/** Contributions made through SIPs or recurring buys, grouped by month. */
export function monthlyContributionHistory(
  transactions: Transaction[],
): { month: string; invested: number; withdrawn: number }[] {
  const map = new Map<string, { month: string; invested: number; withdrawn: number }>();
  for (const tx of transactions) {
    const month = tx.trade_date.slice(0, 7);
    const row = map.get(month) ?? { month, invested: 0, withdrawn: 0 };
    const flow = signedCashFlow(tx);
    if (flow < 0) row.invested += -flow;
    else if (tx.kind === "sell" || tx.kind === "withdrawal") row.withdrawn += flow;
    map.set(month, row);
  }
  return [...map.values()].sort((a, b) => a.month.localeCompare(b.month));
}
