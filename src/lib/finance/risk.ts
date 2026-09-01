/**
 * Risk analysis for the portfolio workspace.
 *
 * Everything here is descriptive: it measures concentration along the axes a
 * private investor can actually act on (a single company, a sector, duplicated
 * funds, market cap, geography, and how quickly money can be reached) and says
 * plainly how much is unclassified. It never scores, ranks or predicts.
 */

import type { PortfolioSummary, ValuedHolding } from "./portfolio";
import { UNIT_PRICED } from "./types";

export type ConcentrationSlice = {
  key: string;
  label: string;
  value: number;
  pct: number;
  /** True when the row exists only because the data is missing. */
  unclassified: boolean;
};

export type ConcentrationAxis = {
  id: "instrument" | "sector" | "overlap" | "cap" | "geography" | "liquidity";
  title: string;
  /** What the denominator is, e.g. "of equity". */
  basis: string;
  slices: ConcentrationSlice[];
  /** Largest classified slice, the number worth reading first. */
  topPct: number | null;
  topLabel: string | null;
  /** Share of the basis with no data recorded. */
  unclassifiedPct: number;
  /** Threshold above which the top slice is worth a conversation. */
  thresholdPct: number;
  status: "concentrated" | "watch" | "spread" | "unknown";
  note: string;
};

const LIQUIDITY_LABEL: Record<string, string> = {
  liquid: "Same day to T+2",
  high: "Same day to T+2",
  medium: "Weeks",
  low: "Locked or years away",
};

function bucket(
  holdings: ValuedHolding[],
  keyOf: (h: ValuedHolding) => string | null | undefined,
  labelOf: (key: string) => string = (k) => k,
): { slices: ConcentrationSlice[]; total: number } {
  const total = holdings.reduce((a, h) => a + h.value, 0);
  const map = new Map<string, number>();
  for (const h of holdings) {
    const raw = keyOf(h);
    const key = raw && String(raw).trim() ? String(raw).trim().toLowerCase() : "__unclassified";
    map.set(key, (map.get(key) ?? 0) + h.value);
  }
  const slices = [...map.entries()]
    .map(([key, value]) => ({
      key,
      label: key === "__unclassified" ? "Not recorded" : labelOf(key),
      value,
      pct: total > 0 ? (value / total) * 100 : 0,
      unclassified: key === "__unclassified",
    }))
    .sort((a, b) => b.value - a.value);
  return { slices, total };
}

function statusOf(topPct: number | null, threshold: number, unclassifiedPct: number) {
  if (topPct === null) return "unknown" as const;
  if (unclassifiedPct >= 60) return "unknown" as const;
  if (topPct > threshold) return "concentrated" as const;
  if (topPct > threshold * 0.75) return "watch" as const;
  return "spread" as const;
}

function axis(
  id: ConcentrationAxis["id"],
  title: string,
  basis: string,
  holdings: ValuedHolding[],
  keyOf: (h: ValuedHolding) => string | null | undefined,
  thresholdPct: number,
  note: (top: ConcentrationSlice | null, unclassifiedPct: number) => string,
  labelOf?: (key: string) => string,
): ConcentrationAxis {
  const { slices } = bucket(holdings, keyOf, labelOf);
  const classified = slices.filter((s) => !s.unclassified);
  const top = classified[0] ?? null;
  const unclassifiedPct = slices.find((s) => s.unclassified)?.pct ?? 0;
  return {
    id,
    title,
    basis,
    slices,
    topPct: top ? top.pct : null,
    topLabel: top ? top.label : null,
    unclassifiedPct,
    thresholdPct,
    status: statusOf(top ? top.pct : null, thresholdPct, unclassifiedPct),
    note: note(top, unclassifiedPct),
  };
}

const pct = (n: number) => `${n.toFixed(n >= 10 ? 0 : 1)}%`;

/** Every concentration axis, in the order a reader should meet them. */
export function riskAxes(summary: PortfolioSummary): ConcentrationAxis[] {
  const all = summary.holdings;
  const equity = all.filter((h) => h.asset_class === "equity");
  const marketPriced = all.filter((h) => UNIT_PRICED.includes(h.instrument_type));

  const out: ConcentrationAxis[] = [];

  out.push(
    axis(
      "instrument",
      "Single position",
      "of the whole portfolio",
      all,
      (h) => h.name,
      10,
      (top) =>
        top
          ? `${top.label} is ${pct(top.pct)} of everything you own. Above 10% in one instrument, that single holding drives the result.`
          : "Nothing recorded yet.",
      (k) => k,
    ),
  );

  out.push(
    axis(
      "sector",
      "Sector",
      "of equity",
      equity,
      (h) => h.sector,
      30,
      (top, unclassified) =>
        !top
          ? "No sector recorded on any equity holding."
          : unclassified > 40
            ? `${pct(unclassified)} of equity has no sector recorded, so this reading is partial. Largest known: ${top.label} at ${pct(top.pct)}.`
            : `${pct(top.pct)} of equity sits in ${top.label}. A sector shock hits that share at once.`,
    ),
  );

  out.push(
    axis(
      "cap",
      "Market cap",
      "of equity",
      equity,
      (h) => h.cap_segment,
      60,
      (top, unclassified) =>
        !top
          ? "No cap segment recorded on equity holdings."
          : unclassified > 40
            ? `${pct(unclassified)} of equity has no cap segment recorded. Largest known: ${top.label} at ${pct(top.pct)}.`
            : `${pct(top.pct)} of equity is ${top.label}. Small and mid caps fall harder and recover slower.`,
    ),
  );

  out.push(
    axis(
      "geography",
      "Geography",
      "of market-priced holdings",
      marketPriced,
      (h) => h.geography,
      85,
      (top, unclassified) =>
        !top
          ? "No geography recorded."
          : unclassified > 40
            ? `${pct(unclassified)} has no geography recorded.`
            : `${pct(top.pct)} sits in ${top.label}. A single-country book carries that country's currency and policy risk.`,
    ),
  );

  out.push(
    axis(
      "liquidity",
      "Access to money",
      "of the whole portfolio",
      all,
      (h) => h.liquidity ?? (h.asset_class === "cash" ? "liquid" : null),
      75,
      (top, unclassified) =>
        !top
          ? "No liquidity recorded on any holding."
          : unclassified > 40
            ? `${pct(unclassified)} has no liquidity recorded, so time-to-cash is only partly known.`
            : `${pct(top.pct)} is reachable in the "${top.label.toLowerCase()}" band.`,
      (k) => LIQUIDITY_LABEL[k] ?? k,
    ),
  );

  // Fund overlap is counted per category rather than by value: two large-cap
  // funds hold much the same companies whatever their sizes.
  const funds = equity.filter((h) => h.instrument_type === "mutual_fund");
  const { slices: fundSlices } = bucket(funds, (h) => h.category);
  const counts = new Map<string, number>();
  for (const f of funds) {
    const key = f.category?.trim().toLowerCase() || "__unclassified";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const duplicated = [...counts.entries()].filter(([k, n]) => k !== "__unclassified" && n > 1);
  const worst = duplicated.sort((a, b) => b[1] - a[1])[0];
  const overlapTop = fundSlices.find((s) => !s.unclassified) ?? null;
  out.push({
    id: "overlap",
    title: "Fund overlap",
    basis: "of equity funds",
    slices: fundSlices,
    topPct: overlapTop ? overlapTop.pct : null,
    topLabel: overlapTop ? overlapTop.label : null,
    unclassifiedPct: fundSlices.find((s) => s.unclassified)?.pct ?? 0,
    thresholdPct: 50,
    status: funds.length === 0 ? "unknown" : worst ? "concentrated" : "spread",
    note:
      funds.length === 0
        ? "No equity mutual funds recorded."
        : worst
          ? `${worst[1]} funds share the ${worst[0]} category. Same-category funds hold overlapping companies, so the extra fund adds cost, not diversification.`
          : "Each equity fund sits in its own category, so overlap is limited.",
  });

  return out;
}

export type HealthSignal = {
  id: "diversification" | "allocation" | "liquidity" | "concentration" | "tax";
  label: string;
  /** Plain word, never a score. */
  rating: "Strong" | "Good" | "Moderate" | "Needs attention" | "Not enough data";
  tone: "positive" | "neutral" | "warning" | "unknown";
  /** One line saying why, with the number behind it. */
  reason: string;
};

export type HealthInput = {
  summary: PortfolioSummary;
  axes: ConcentrationAxis[];
  /** Absolute drift in percentage points, per asset class, against target. */
  maxDriftPp: number | null;
  emergencyCoverageMonths: number | null;
  emergencyTargetMonths: number;
  /** Share of value held in tax-sheltered or long-held positions, 0-100. */
  taxEfficientPct: number | null;
  shortTermEquityPct: number | null;
};

const TONE: Record<HealthSignal["rating"], HealthSignal["tone"]> = {
  Strong: "positive",
  Good: "positive",
  Moderate: "neutral",
  "Needs attention": "warning",
  "Not enough data": "unknown",
};

function signal(
  id: HealthSignal["id"],
  label: string,
  rating: HealthSignal["rating"],
  reason: string,
): HealthSignal {
  return { id, label, rating, tone: TONE[rating], reason };
}

/**
 * Qualitative portfolio health. Deliberately five named judgements rather than
 * one composite number: a single score hides which lever to pull.
 */
export function portfolioHealth(input: HealthInput): HealthSignal[] {
  const { summary, axes } = input;
  const out: HealthSignal[] = [];

  if (summary.totalValue <= 0) {
    return [
      signal("diversification", "Diversification", "Not enough data", "No holdings recorded yet."),
      signal("allocation", "Allocation", "Not enough data", "No holdings recorded yet."),
      signal("liquidity", "Liquidity", "Not enough data", "No holdings recorded yet."),
      signal("concentration", "Concentration", "Not enough data", "No holdings recorded yet."),
      signal("tax", "Tax efficiency", "Not enough data", "No holdings recorded yet."),
    ];
  }

  // Diversification: how many classes carry real weight, plus holding count.
  const meaningfulClasses = Object.values(summary.byAssetClass).filter((p) => p >= 5).length;
  const holdingCount = summary.holdings.length;
  out.push(
    signal(
      "diversification",
      "Diversification",
      meaningfulClasses >= 3 && holdingCount >= 5
        ? "Strong"
        : meaningfulClasses >= 3
          ? "Good"
          : meaningfulClasses === 2
            ? "Moderate"
            : "Needs attention",
      `${meaningfulClasses} asset class${meaningfulClasses === 1 ? "" : "es"} carry 5% or more across ${holdingCount} holding${holdingCount === 1 ? "" : "s"}.`,
    ),
  );

  // Allocation: distance from the target the strategy engine derived.
  const drift = input.maxDriftPp;
  out.push(
    signal(
      "allocation",
      "Allocation",
      drift === null
        ? "Not enough data"
        : drift <= 5
          ? "Good"
          : drift <= 10
            ? "Moderate"
            : "Needs attention",
      drift === null
        ? "Complete your inputs so a target allocation can be derived."
        : `Largest gap against target is ${drift.toFixed(1)} percentage points.`,
    ),
  );

  // Liquidity: months of essential spending reachable quickly.
  const cover = input.emergencyCoverageMonths;
  const target = input.emergencyTargetMonths;
  out.push(
    signal(
      "liquidity",
      "Liquidity",
      cover === null
        ? "Not enough data"
        : cover >= target
          ? "Strong"
          : cover >= target * 0.6
            ? "Moderate"
            : "Needs attention",
      cover === null
        ? "Record essential monthly expenses to measure cover."
        : `${cover.toFixed(1)} months of essential spending reachable against a ${target}-month target.`,
    ),
  );

  // Concentration: the single worst axis decides the word.
  const flagged = axes.filter((a) => a.status === "concentrated");
  const watching = axes.filter((a) => a.status === "watch");
  out.push(
    signal(
      "concentration",
      "Concentration",
      flagged.length >= 2
        ? "Needs attention"
        : flagged.length === 1
          ? "Moderate"
          : watching.length > 0
            ? "Good"
            : "Strong",
      flagged.length > 0
        ? `${flagged.map((a) => a.title.toLowerCase()).join(" and ")} above tolerance.`
        : watching.length > 0
          ? `${watching[0]?.title ?? "One axis"} is approaching its tolerance.`
          : "No axis is above its tolerance on the data recorded.",
    ),
  );

  // Tax efficiency: sheltered or long-held value versus short-term equity.
  const efficient = input.taxEfficientPct;
  const shortTerm = input.shortTermEquityPct;
  out.push(
    signal(
      "tax",
      "Tax efficiency",
      efficient === null
        ? "Not enough data"
        : shortTerm !== null && shortTerm > 25
          ? "Needs attention"
          : efficient >= 60
            ? "Good"
            : efficient >= 35
              ? "Moderate"
              : "Needs attention",
      efficient === null
        ? "Record purchase dates so holding periods can be read."
        : shortTerm !== null && shortTerm > 25
          ? `${shortTerm.toFixed(0)}% of equity is under a year old and would be taxed at the short-term rate if sold.`
          : `${efficient.toFixed(0)}% of value is sheltered or held beyond the long-term threshold.`,
    ),
  );

  return out;
}

/** Share of value that is tax-sheltered or past the long-term holding threshold. */
export function taxEfficiency(summary: PortfolioSummary): {
  efficientPct: number | null;
  shortTermEquityPct: number | null;
} {
  if (summary.totalValue <= 0) return { efficientPct: null, shortTermEquityPct: null };
  const sheltered = new Set(["ppf", "epf", "nps"]);
  const now = Date.now();
  let efficient = 0;
  let dated = 0;
  let equityValue = 0;
  let shortTermEquity = 0;

  for (const h of summary.holdings) {
    if (sheltered.has(h.instrument_type)) {
      efficient += h.value;
      dated += h.value;
      continue;
    }
    if (!h.purchase_date) continue;
    const held = (now - new Date(h.purchase_date).getTime()) / (365.25 * 24 * 3600 * 1000);
    if (Number.isNaN(held)) continue;
    dated += h.value;
    // Equity turns long-term at one year; everything else at two.
    const threshold = h.asset_class === "equity" ? 1 : 2;
    if (held >= threshold) efficient += h.value;
    if (h.asset_class === "equity") {
      equityValue += h.value;
      if (held < 1) shortTermEquity += h.value;
    }
  }

  return {
    efficientPct: dated > 0 ? (efficient / summary.totalValue) * 100 : null,
    shortTermEquityPct: equityValue > 0 ? (shortTermEquity / equityValue) * 100 : null,
  };
}
