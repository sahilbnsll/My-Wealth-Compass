import { ASSET_CLASSES, type AssetClass, type Assumptions } from "./types";

export type ProjectionYear = {
  year: number;
  age: number | null;
  opening: number;
  contribution: number;
  /** Money taken out of the portfolio during the year (decumulation). */
  withdrawal: number;
  gain: number;
  closing: number;
  realClosing: number;
  totalInvested: number;
  totalWithdrawn: number;
  totalGains: number;
  /** True once the portfolio has been exhausted by withdrawals. */
  depleted: boolean;
  byAssetClass: Record<AssetClass, number>;
  allocationPct: Record<AssetClass, number>;
};

export type GlidePathPoint = { age: number; equityPct: number };

export type ProjectionInput = {
  /** Current value per asset class. */
  startingValues: Record<AssetClass, number>;
  /** Monthly contribution per asset class, in year 1. */
  monthlyContribution: Record<AssetClass, number>;
  assumptions: Assumptions;
  startYear: number;
  years: number;
  startAge: number | null;
  /** Optional equity glide path applied to the split of NEW contributions only. */
  glidePath?: GlidePathPoint[];
  /** Total invested so far (cost basis), used to split contributions vs compounding. */
  investedToDate?: number;
  /** Optional decumulation phase. Contributions stop and withdrawals begin at retirementAge. */
  decumulation?: DecumulationInput;
};

export type DecumulationInput = {
  /** Age at which contributions stop and withdrawals start. */
  retirementAge: number;
  /** Annual spend in today's rupees; inflated to the year of withdrawal. */
  annualSpendToday: number;
  /** Annual escalation of the spend. Defaults to the inflation assumption. */
  spendGrowthPct?: number;
  /** Other inflation-linked income in today's rupees (pension, rent) netted off the spend. */
  otherAnnualIncomeToday?: number;
};

function returnFor(c: AssetClass, a: Assumptions): number {
  switch (c) {
    case "equity":
      return a.equity_return;
    case "debt":
      return a.debt_return;
    case "gold":
      return a.gold_return;
    case "cash":
      return a.cash_return;
    default:
      return a.debt_return;
  }
}

/**
 * Grow a balance for one year with monthly cash flow applied at the start of each month.
 * A negative `monthly` is a withdrawal and is capped at the available balance.
 */
function growOneYear(opening: number, monthly: number, annualRatePct: number) {
  const i = annualRatePct / 100 / 12;
  let balance = opening;
  let contributed = 0;
  let withdrawn = 0;
  for (let m = 0; m < 12; m++) {
    if (monthly >= 0) {
      balance += monthly;
      contributed += monthly;
    } else {
      const take = Math.min(balance, -monthly);
      balance -= take;
      withdrawn += take;
    }
    balance *= 1 + i;
  }
  return { closing: balance, contributed, withdrawn, gain: balance - opening - contributed + withdrawn };
}

export function interpolateGlide(glide: GlidePathPoint[], age: number): number | null {
  if (glide.length === 0) return null;
  const sorted = [...glide].sort((a, b) => a.age - b.age);
  if (age <= sorted[0]!.age) return sorted[0]!.equityPct;
  const last = sorted[sorted.length - 1]!;
  if (age >= last.age) return last.equityPct;
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i]!;
    const b = sorted[i + 1]!;
    if (age >= a.age && age <= b.age) {
      const t = (age - a.age) / (b.age - a.age);
      return a.equityPct + t * (b.equityPct - a.equityPct);
    }
  }
  return last.equityPct;
}

/**
 * Year-by-year projection across the full planning horizon.
 * Each row reconciles: opening + contribution + gain = closing.
 */
export function project(input: ProjectionInput): ProjectionYear[] {
  const { assumptions, startYear, years, startAge } = input;
  const balances: Record<AssetClass, number> = { ...emptyMap(), ...input.startingValues };
  const baseMonthly: Record<AssetClass, number> = { ...emptyMap(), ...input.monthlyContribution };

  const rows: ProjectionYear[] = [];
  let totalInvested = input.investedToDate ?? Object.values(balances).reduce((a, b) => a + b, 0);
  let totalWithdrawn = 0;
  const dec = input.decumulation;

  for (let y = 0; y < years; y++) {
    const age = startAge === null ? null : startAge + y;
    const opening = sum(balances);
    const stepUpFactor = Math.pow(1 + assumptions.sip_step_up / 100, y);

    const retired = dec !== undefined && age !== null && age >= dec.retirementAge;

    let monthly: Record<AssetClass, number> = {} as Record<AssetClass, number>;
    for (const c of ASSET_CLASSES) monthly[c] = retired ? 0 : (baseMonthly[c] ?? 0) * stepUpFactor;

    // A glide path re-weights only new contributions between equity and debt.
    if (input.glidePath && input.glidePath.length > 0 && age !== null) {
      const targetEquity = interpolateGlide(input.glidePath, age);
      if (targetEquity !== null) {
        const totalMonthly = sum(monthly);
        const nonRebalanced = (monthly.gold ?? 0) + (monthly.cash ?? 0) + (monthly.other ?? 0);
        const rebalancable = totalMonthly - nonRebalanced;
        if (rebalancable > 0) {
          const eq = (rebalancable * targetEquity) / 100;
          monthly = { ...monthly, equity: eq, debt: rebalancable - eq };
        }
      }
    }

    // Decumulation: the year's spend is inflated from today's rupees and drawn
    // pro-rata across whatever the portfolio still holds.
    let monthlyDraw = 0;
    if (retired && dec) {
      const growth = dec.spendGrowthPct ?? assumptions.inflation;
      const yearsOfInflation = y;
      const netSpendToday = Math.max(0, dec.annualSpendToday - (dec.otherAnnualIncomeToday ?? 0));
      const annualSpend = netSpendToday * Math.pow(1 + growth / 100, yearsOfInflation);
      monthlyDraw = annualSpend / 12;
    }
    const openingTotal = opening;

    let yearContribution = 0;
    let yearWithdrawal = 0;
    let yearGain = 0;
    for (const c of ASSET_CLASSES) {
      const share = openingTotal > 0 ? (balances[c] ?? 0) / openingTotal : 0;
      const flow = monthlyDraw > 0 ? -(monthlyDraw * share) : (monthly[c] ?? 0);
      const r = growOneYear(balances[c] ?? 0, flow, returnFor(c, assumptions));
      balances[c] = r.closing;
      yearContribution += r.contributed;
      yearWithdrawal += r.withdrawn;
      yearGain += r.gain;
    }

    totalInvested += yearContribution;
    totalWithdrawn += yearWithdrawal;
    const closing = sum(balances);
    const yearsFromNow = y + 1;
    const allocationPct = {} as Record<AssetClass, number>;
    for (const c of ASSET_CLASSES) {
      allocationPct[c] = closing > 0 ? ((balances[c] ?? 0) / closing) * 100 : 0;
    }

    rows.push({
      year: startYear + y,
      age,
      opening,
      contribution: yearContribution,
      withdrawal: yearWithdrawal,
      gain: yearGain,
      closing,
      realClosing: closing / Math.pow(1 + assumptions.inflation / 100, yearsFromNow),
      totalInvested,
      totalWithdrawn,
      totalGains: closing + totalWithdrawn - totalInvested,
      depleted: closing <= 1 && monthlyDraw > 0,
      byAssetClass: { ...balances },
      allocationPct,
    });
  }
  return rows;
}

function emptyMap(): Record<AssetClass, number> {
  return Object.fromEntries(ASSET_CLASSES.map((c) => [c, 0])) as Record<AssetClass, number>;
}

function sum(m: Record<AssetClass, number>): number {
  return ASSET_CLASSES.reduce((a, c) => a + (m[c] ?? 0), 0);
}

/** Consistency checks the app runs on every projection before displaying it. */
export function validateProjection(rows: ProjectionYear[]): string[] {
  const errors: string[] = [];
  for (const r of rows) {
    const expected = r.opening + r.contribution - r.withdrawal + r.gain;
    if (Math.abs(expected - r.closing) > Math.max(1, Math.abs(r.closing) * 1e-6)) {
      errors.push(`Year ${r.year}: opening + contribution − withdrawal + gain does not equal closing.`);
    }
    const allocSum = ASSET_CLASSES.reduce((a, c) => a + (r.allocationPct[c] ?? 0), 0);
    if (r.closing > 0 && Math.abs(allocSum - 100) > 0.01) {
      errors.push(`Year ${r.year}: allocation percentages sum to ${allocSum.toFixed(2)} instead of 100.`);
    }
  }
  return errors;
}
