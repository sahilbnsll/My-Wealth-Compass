/**
 * Indian capital-gains and dividend tax math.
 *
 * Rules encoded here follow the regime effective from 23 July 2024:
 *  - Listed equity, equity ETFs and equity mutual funds: short-term (held up
 *    to 12 months) at 20%, long-term at 12.5% with a ₹1,25,000 annual
 *    exemption on aggregate long-term equity gains.
 *  - Debt mutual funds and bonds (units bought after 1 April 2023) and FD
 *    interest: taxed at the investor's marginal slab rate, no indexation.
 *  - Gold and silver (physical, ETFs, funds): long-term after 24 months at
 *    12.5%, otherwise at slab.
 *  - EPF and PPF: exempt on maturity.
 *  - Dividends: taxed at the slab rate in the investor's hands.
 * Health & education cess of 4% is applied on top of the computed tax.
 *
 * Every function is pure so the numbers can be tested and reproduced.
 */

import type { InstrumentType } from "./types";
import type { ValuedHolding } from "./portfolio";

export const LTCG_EQUITY_EXEMPTION = 125_000;
export const EQUITY_STCG_RATE = 20;
export const EQUITY_LTCG_RATE = 12.5;
export const GOLD_LTCG_RATE = 12.5;
export const CESS_RATE = 4;

export type TaxCategory = "equity" | "debt" | "gold" | "exempt" | "other";

export type TaxSettings = {
  /** Marginal slab rate, before cess. */
  marginalRatePct: number;
  /** Expected annual dividend/interest yield on the equity + debt book. */
  dividendYieldPct: number;
};

export const DEFAULT_TAX_SETTINGS: TaxSettings = {
  marginalRatePct: 30,
  dividendYieldPct: 1.2,
};

export function withCess(tax: number): number {
  return tax * (1 + CESS_RATE / 100);
}

export function taxCategoryFor(instrument: InstrumentType, assetClass: string): TaxCategory {
  if (instrument === "ppf" || instrument === "epf") return "exempt";
  if (instrument === "stock" || instrument === "etf") return assetClass === "equity" ? "equity" : "other";
  if (instrument === "mutual_fund") return assetClass === "equity" ? "equity" : "debt";
  if (instrument === "gold" || instrument === "silver") return "gold";
  if (instrument === "bond" || instrument === "fd" || instrument === "nps") return "debt";
  if (instrument === "cash") return "exempt";
  return "other";
}

/** Months between a purchase date and `asOf`. Null when the date is unknown. */
export function holdingMonths(purchaseDate: string | null, asOf = new Date()): number | null {
  if (!purchaseDate) return null;
  const d = new Date(purchaseDate);
  if (Number.isNaN(d.getTime())) return null;
  const months =
    (asOf.getFullYear() - d.getFullYear()) * 12 +
    (asOf.getMonth() - d.getMonth()) +
    (asOf.getDate() >= d.getDate() ? 0 : -1);
  return Math.max(0, months);
}

/** Months a holding must be held for its gain to count as long-term. */
export function longTermThresholdMonths(category: TaxCategory): number {
  switch (category) {
    case "equity":
      return 12;
    case "gold":
      return 24;
    case "debt":
      return Number.POSITIVE_INFINITY; // slab rate regardless of period
    default:
      return 24;
  }
}

export type HoldingTax = {
  id: string;
  name: string;
  category: TaxCategory;
  months: number | null;
  longTerm: boolean;
  value: number;
  invested: number;
  gain: number;
  /** Gain left after the shared long-term equity exemption is applied. */
  taxableGain: number;
  ratePct: number;
  tax: number;
  reason: string;
};

export type TaxIfSoldSummary = {
  rows: HoldingTax[];
  totalGain: number;
  totalTax: number;
  netProceeds: number;
  totalValue: number;
  exemptionUsed: number;
  exemptionLeft: number;
  effectiveRatePct: number | null;
};

/**
 * Tax due if the whole portfolio were sold today, with the annual ₹1.25L
 * long-term equity exemption shared across qualifying holdings, largest gain
 * first (which is how an investor would naturally use it).
 */
export function taxIfSoldToday(
  holdings: ValuedHolding[],
  settings: TaxSettings,
  asOf = new Date(),
): TaxIfSoldSummary {
  const slab = settings.marginalRatePct;
  const prepared = holdings.map((h) => {
    const category = taxCategoryFor(h.instrument_type, h.asset_class);
    const months = holdingMonths(h.purchase_date, asOf);
    const threshold = longTermThresholdMonths(category);
    const longTerm = months !== null && months >= threshold;
    return { h, category, months, longTerm, gain: h.gain };
  });

  let exemptionLeft = LTCG_EQUITY_EXEMPTION;
  // Apply the exemption to the largest long-term equity gains first.
  const order = [...prepared].sort((a, b) => {
    const aEq = a.category === "equity" && a.longTerm ? 1 : 0;
    const bEq = b.category === "equity" && b.longTerm ? 1 : 0;
    if (aEq !== bEq) return bEq - aEq;
    return b.gain - a.gain;
  });

  const byId = new Map<string, HoldingTax>();
  for (const p of order) {
    const { h, category, months, longTerm } = p;
    const gain = h.gain;
    let ratePct = 0;
    let taxableGain = Math.max(0, gain);
    let reason = "";

    if (category === "exempt") {
      ratePct = 0;
      taxableGain = 0;
      reason = "Exempt on maturity (EPF/PPF) or not a taxable gain.";
    } else if (gain <= 0) {
      ratePct = 0;
      taxableGain = 0;
      reason = "No gain to tax — a realised loss can be set off against other gains.";
    } else if (category === "equity") {
      if (longTerm) {
        const used = Math.min(exemptionLeft, taxableGain);
        exemptionLeft -= used;
        taxableGain -= used;
        ratePct = EQUITY_LTCG_RATE;
        reason = `Held ${months} months. Long-term equity at ${EQUITY_LTCG_RATE}% after the ₹1.25L annual exemption.`;
      } else {
        ratePct = EQUITY_STCG_RATE;
        reason =
          months === null
            ? `No purchase date recorded, so treated as short-term equity at ${EQUITY_STCG_RATE}%.`
            : `Held ${months} months (under 12). Short-term equity at ${EQUITY_STCG_RATE}%.`;
      }
    } else if (category === "gold") {
      if (longTerm) {
        ratePct = GOLD_LTCG_RATE;
        reason = `Held ${months} months. Long-term gold at ${GOLD_LTCG_RATE}%.`;
      } else {
        ratePct = slab;
        reason = `Held under 24 months, so taxed at your ${slab}% slab rate.`;
      }
    } else {
      ratePct = slab;
      reason = `Debt-type gains are taxed at your ${slab}% slab rate with no indexation.`;
    }

    const tax = withCess((taxableGain * ratePct) / 100);
    byId.set(h.id, {
      id: h.id,
      name: h.name,
      category,
      months,
      longTerm,
      value: h.value,
      invested: h.invested,
      gain,
      taxableGain,
      ratePct,
      tax,
      reason,
    });
  }

  const rows = holdings.map((h) => byId.get(h.id)!).filter(Boolean);
  const totalGain = rows.reduce((a, r) => a + r.gain, 0);
  const totalTax = rows.reduce((a, r) => a + r.tax, 0);
  const totalValue = rows.reduce((a, r) => a + r.value, 0);
  return {
    rows,
    totalGain,
    totalTax,
    netProceeds: totalValue - totalTax,
    totalValue,
    exemptionUsed: LTCG_EQUITY_EXEMPTION - exemptionLeft,
    exemptionLeft,
    effectiveRatePct: totalGain > 0 ? (totalTax / totalGain) * 100 : null,
  };
}

/** Annual tax on dividend and interest income, taxed at the slab rate. */
export function dividendTax(annualIncome: number, settings: TaxSettings): number {
  if (annualIncome <= 0) return 0;
  return withCess((annualIncome * settings.marginalRatePct) / 100);
}

/**
 * Annual drag on the headline return caused by taxable dividend/interest
 * income being distributed and taxed each year, in percentage points.
 */
export function dividendDragPct(settings: TaxSettings): number {
  const effective = settings.marginalRatePct * (1 + CESS_RATE / 100);
  return (settings.dividendYieldPct * effective) / 100;
}

export type ExitTaxEstimate = {
  grossCorpus: number;
  invested: number;
  gain: number;
  tax: number;
  netCorpus: number;
  effectiveRatePct: number | null;
  byAssetClass: { assetClass: string; gain: number; tax: number; ratePct: number }[];
};

/**
 * Tax due on a projected corpus if it were fully redeemed at the horizon.
 * Everything held that long is long-term, so equity and gold use 12.5% and
 * debt uses the slab rate. The ₹1.25L exemption is applied once.
 */
export function taxOnProjectedCorpus(
  byAssetClass: Record<string, number>,
  totalInvested: number,
  settings: TaxSettings,
): ExitTaxEstimate {
  const grossCorpus = Object.values(byAssetClass).reduce((a, b) => a + b, 0);
  const gain = Math.max(0, grossCorpus - totalInvested);
  const rows: ExitTaxEstimate["byAssetClass"] = [];
  let tax = 0;
  let exemptionLeft = LTCG_EQUITY_EXEMPTION;

  for (const [assetClass, value] of Object.entries(byAssetClass)) {
    if (value <= 0 || grossCorpus <= 0) continue;
    const share = value / grossCorpus;
    const classGain = gain * share;
    let ratePct: number;
    let taxable = classGain;
    switch (assetClass) {
      case "equity": {
        ratePct = EQUITY_LTCG_RATE;
        const used = Math.min(exemptionLeft, taxable);
        exemptionLeft -= used;
        taxable -= used;
        break;
      }
      case "gold":
        ratePct = GOLD_LTCG_RATE;
        break;
      case "cash":
        ratePct = 0;
        taxable = 0;
        break;
      default:
        ratePct = settings.marginalRatePct;
    }
    const classTax = withCess((taxable * ratePct) / 100);
    tax += classTax;
    rows.push({ assetClass, gain: classGain, tax: classTax, ratePct });
  }

  return {
    grossCorpus,
    invested: totalInvested,
    gain,
    tax,
    netCorpus: grossCorpus - tax,
    effectiveRatePct: gain > 0 ? (tax / gain) * 100 : null,
    byAssetClass: rows.sort((a, b) => b.tax - a.tax),
  };
}
