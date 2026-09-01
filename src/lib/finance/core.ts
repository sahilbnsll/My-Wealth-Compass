/**
 * Core financial formulas. Pure functions only — no UI, no I/O.
 * Every formula used anywhere in the app lives here so results stay consistent.
 */

export type CashFlow = { date: Date; amount: number };

/** Compound annual growth rate, as a percentage. */
export function cagr(beginValue: number, endValue: number, years: number): number | null {
  if (beginValue <= 0 || years <= 0 || endValue < 0) return null;
  return (Math.pow(endValue / beginValue, 1 / years) - 1) * 100;
}

/** Net present value of dated cash flows at annual rate `rate` (decimal). */
export function xnpv(rate: number, flows: CashFlow[]): number {
  if (flows.length === 0) return 0;
  const t0 = flows[0]!.date.getTime();
  return flows.reduce((acc, f) => {
    const years = (f.date.getTime() - t0) / (365 * 24 * 60 * 60 * 1000);
    return acc + f.amount / Math.pow(1 + rate, years);
  }, 0);
}

/**
 * XIRR as a percentage. Outflows negative, inflows positive.
 * Bisection on a bracketed root — robust where Newton diverges.
 */
export function xirr(flows: CashFlow[]): number | null {
  if (flows.length < 2) return null;
  const sorted = [...flows].sort((a, b) => a.date.getTime() - b.date.getTime());
  const hasPositive = sorted.some((f) => f.amount > 0);
  const hasNegative = sorted.some((f) => f.amount < 0);
  if (!hasPositive || !hasNegative) return null;

  let low = -0.9999;
  let high = 10;
  let fLow = xnpv(low, sorted);
  let fHigh = xnpv(high, sorted);
  if (fLow * fHigh > 0) return null;

  for (let i = 0; i < 200; i++) {
    const mid = (low + high) / 2;
    const fMid = xnpv(mid, sorted);
    if (Math.abs(fMid) < 1e-9) return mid * 100;
    if (fLow * fMid < 0) {
      high = mid;
      fHigh = fMid;
    } else {
      low = mid;
      fLow = fMid;
    }
  }
  void fHigh;
  return ((low + high) / 2) * 100;
}

/**
 * Future value of a level monthly SIP, contributions at the start of each month.
 * @param monthly contribution per month
 * @param annualRatePct nominal annual return, percent
 * @param years number of years
 */
export function sipFutureValue(monthly: number, annualRatePct: number, years: number): number {
  const n = Math.round(years * 12);
  if (n <= 0) return 0;
  const i = annualRatePct / 100 / 12;
  if (Math.abs(i) < 1e-12) return monthly * n;
  return monthly * ((Math.pow(1 + i, n) - 1) / i) * (1 + i);
}

/**
 * Future value of a SIP that increases by `stepUpPct` at the start of each year.
 * Contributions at the start of each month; compounded monthly.
 */
export function stepUpSipFutureValue(
  monthly: number,
  annualRatePct: number,
  years: number,
  stepUpPct: number,
): number {
  const wholeYears = Math.floor(years);
  const i = annualRatePct / 100 / 12;
  let total = 0;
  for (let y = 0; y < wholeYears; y++) {
    const contribution = monthly * Math.pow(1 + stepUpPct / 100, y);
    // Value of this year's 12 contributions at the end of year `y`, then grown
    // for the remaining (years - y - 1) years.
    const endOfYear = sipFutureValue(contribution, annualRatePct, 1);
    total += endOfYear * Math.pow(1 + i, (wholeYears - y - 1) * 12);
  }
  return total;
}

/** Future value of a lump sum. */
export function futureValue(present: number, annualRatePct: number, years: number): number {
  return present * Math.pow(1 + annualRatePct / 100, years);
}

/** Value of a future nominal amount expressed in today's money. */
export function realValue(nominal: number, inflationPct: number, years: number): number {
  return nominal / Math.pow(1 + inflationPct / 100, years);
}

/** Cost of something today, inflated to a future date. */
export function inflatedCost(currentCost: number, inflationPct: number, years: number): number {
  return currentCost * Math.pow(1 + inflationPct / 100, years);
}

/** Monthly SIP required to reach `target` in `years` at `annualRatePct`. */
export function requiredMonthlySip(
  target: number,
  annualRatePct: number,
  years: number,
  existingCorpus = 0,
): number {
  const grownExisting = futureValue(existingCorpus, annualRatePct, years);
  const shortfall = target - grownExisting;
  if (shortfall <= 0) return 0;
  const n = Math.round(years * 12);
  if (n <= 0) return shortfall;
  const i = annualRatePct / 100 / 12;
  if (Math.abs(i) < 1e-12) return shortfall / n;
  return shortfall / (((Math.pow(1 + i, n) - 1) / i) * (1 + i));
}

/** Savings rate as a percentage of income. */
export function savingsRate(monthlyIncome: number, monthlyExpenses: number): number | null {
  if (!monthlyIncome || monthlyIncome <= 0) return null;
  return ((monthlyIncome - monthlyExpenses) / monthlyIncome) * 100;
}

/** How many months of essential expenses the liquid pot covers. */
export function emergencyCoverageMonths(liquid: number, essentialMonthly: number): number | null {
  if (!essentialMonthly || essentialMonthly <= 0) return null;
  return liquid / essentialMonthly;
}

/** Years for a portfolio to recover a drawdown at a given return rate. */
export function recoveryYears(drawdownPct: number, annualRatePct: number): number | null {
  if (drawdownPct <= 0 || drawdownPct >= 100 || annualRatePct <= 0) return null;
  const ratio = 1 / (1 - drawdownPct / 100);
  return Math.log(ratio) / Math.log(1 + annualRatePct / 100);
}

/** Weighted blended annual return from asset-class weights (fractions summing to 1). */
export function blendedReturn(weights: Record<string, number>, returns: Record<string, number>): number {
  let total = 0;
  let weightSum = 0;
  for (const [k, w] of Object.entries(weights)) {
    const r = returns[k];
    if (r === undefined) continue;
    total += w * r;
    weightSum += w;
  }
  if (weightSum <= 0) return 0;
  return total / weightSum;
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
