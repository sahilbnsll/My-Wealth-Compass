import { ASSET_CLASSES, type AssetClass } from "./types";
import { project, type ProjectionInput, type ProjectionYear } from "./projection";

/**
 * Stress testing is not a second forecasting engine. Every scenario is expressed
 * as a sequence of segments, each of which is a normal `project()` run whose
 * closing balances become the next segment's opening balances.
 */
export type StressSegment = {
  /** Length of this segment in years. */
  years: number;
  /** Instant one-off move applied to balances at the START of the segment, in percent
   * (−40 = a 40% fall). Applied per asset class; omitted classes are untouched. */
  instantShockPct?: Partial<Record<AssetClass, number>>;
  /** Percentage-point change to each asset class's annual return during the segment. */
  returnDeltaPct?: Partial<Record<AssetClass, number>>;
  /** Percentage-point change to inflation during the segment. */
  inflationDeltaPct?: number;
  /** Multiplier on monthly contributions during the segment (0 = contributions stop). */
  contributionMultiplier?: number;
};

export type StressScenario = {
  id: string;
  name: string;
  /** Plain-language description of what is being simulated. */
  description: string;
  /** Where the shape of the shock comes from, so the UI can show provenance. */
  basis: string;
  segments: StressSegment[];
};

export type StressResult = {
  scenario: StressScenario;
  rows: ProjectionYear[];
  terminalValue: number;
  realTerminalValue: number;
  /** Difference against the un-stressed run at the same horizon. */
  deltaVsBaseline: number;
  deltaVsBaselinePct: number;
  /** Deepest peak-to-trough fall in the stressed path, in percent. */
  maxDrawdownPct: number;
  /** Years from the start of the shock until the portfolio regains its pre-shock value. */
  yearsToRecover: number | null;
  /** Only meaningful when the base input has a decumulation phase. */
  depletionYear: number | null;
  survives: boolean;
};

function scaleBalances(
  values: Record<AssetClass, number>,
  shock: Partial<Record<AssetClass, number>> | undefined,
): Record<AssetClass, number> {
  if (!shock) return { ...values };
  const out = { ...values };
  for (const c of ASSET_CLASSES) {
    const pct = shock[c];
    if (pct === undefined) continue;
    out[c] = Math.max(0, (out[c] ?? 0) * (1 + pct / 100));
  }
  return out;
}

/**
 * Runs the core projection engine once per segment and stitches the runs together,
 * re-deriving cumulative totals so the result satisfies `validateProjection`.
 */
export function runStressPath(base: ProjectionInput, segments: StressSegment[]): ProjectionYear[] {
  const rows: ProjectionYear[] = [];
  let balances = { ...base.startingValues };
  let yearOffset = 0;
  let totalInvested = base.investedToDate ?? 0;
  let totalWithdrawn = 0;
  let cumulativeInflation = 1;

  const remaining = () => base.years - yearOffset;
  const plan = [...segments];
  const declaredYears = plan.reduce((a, s) => a + s.years, 0);
  if (declaredYears < base.years) plan.push({ years: base.years - declaredYears });

  for (const segment of plan) {
    const years = Math.min(segment.years, remaining());
    if (years <= 0) break;

    balances = scaleBalances(balances, segment.instantShockPct);

    const assumptions = { ...base.assumptions };
    for (const c of ASSET_CLASSES) {
      const delta = segment.returnDeltaPct?.[c];
      if (delta === undefined) continue;
      const key = `${c}_return` as keyof typeof assumptions;
      if (key in assumptions) {
        assumptions[key] = (assumptions[key] as number) + delta;
      }
    }
    if (segment.inflationDeltaPct !== undefined) {
      assumptions.inflation = assumptions.inflation + segment.inflationDeltaPct;
    }

    const mult = segment.contributionMultiplier ?? 1;
    const monthly = {} as Record<AssetClass, number>;
    for (const c of ASSET_CLASSES) monthly[c] = (base.monthlyContribution[c] ?? 0) * mult;

    const segmentRows = project({
      ...base,
      startingValues: balances,
      monthlyContribution: monthly,
      assumptions,
      years,
      startYear: base.startYear + yearOffset,
      startAge: base.startAge === null ? null : base.startAge + yearOffset,
      investedToDate: 0,
    });

    for (const r of segmentRows) {
      totalInvested += r.contribution;
      totalWithdrawn += r.withdrawal;
      cumulativeInflation *= 1 + assumptions.inflation / 100;
      rows.push({
        ...r,
        totalInvested,
        totalWithdrawn,
        totalGains: r.closing + totalWithdrawn - totalInvested,
        realClosing: r.closing / cumulativeInflation,
      });
    }

    const last = segmentRows[segmentRows.length - 1];
    if (last) balances = { ...last.byAssetClass };
    yearOffset += years;
  }

  return rows;
}

function maxDrawdown(rows: ProjectionYear[], openingValue: number): number {
  // Walk the value series point by point (including each year's shocked opening)
  // so an instant fall is measured, not smoothed away by the year's growth.
  const series = [openingValue];
  for (const r of rows) series.push(r.opening, r.closing);
  let peak = 0;
  let worst = 0;
  for (const value of series) {
    peak = Math.max(peak, value);
    if (peak <= 0) continue;
    worst = Math.max(worst, ((peak - value) / peak) * 100);
  }
  return worst;
}

function yearsToRecover(rows: ProjectionYear[], preShockValue: number): number | null {
  if (preShockValue <= 0) return null;
  const dipped = rows.some((r) => r.closing < preShockValue);
  if (!dipped) return 0;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (row && row.closing < preShockValue) continue;
    if (rows.slice(0, i).some((r) => r.closing < preShockValue)) return i + 1;
  }
  return null;
}

/** Runs one scenario against a baseline projection and summarises the damage. */
export function runStressScenario(
  base: ProjectionInput,
  scenario: StressScenario,
  baselineRows?: ProjectionYear[],
): StressResult {
  const baseline = baselineRows ?? project(base);
  const rows = runStressPath(base, scenario.segments);

  const terminal = rows[rows.length - 1];
  const baselineTerminal = baseline[baseline.length - 1];
  const terminalValue = terminal?.closing ?? 0;
  const baselineValue = baselineTerminal?.closing ?? 0;
  const openingValue = ASSET_CLASSES.reduce((a, c) => a + (base.startingValues[c] ?? 0), 0);
  const depleted = rows.find((r) => r.depleted) ?? null;

  return {
    scenario,
    rows,
    terminalValue,
    realTerminalValue: terminal?.realClosing ?? 0,
    deltaVsBaseline: terminalValue - baselineValue,
    deltaVsBaselinePct: baselineValue > 0 ? ((terminalValue - baselineValue) / baselineValue) * 100 : 0,
    maxDrawdownPct: maxDrawdown(rows, openingValue),
    yearsToRecover: yearsToRecover(rows, openingValue),
    depletionYear: depleted?.year ?? null,
    survives: depleted === null && terminalValue > 1,
  };
}

/**
 * Historical shapes only — each scenario states the episode it is modelled on.
 * These are stress shapes, not forecasts, and never claim to be market data.
 */
export const STRESS_SCENARIOS: StressScenario[] = [
  {
    id: "equity_crash",
    name: "Equity crash, slow recovery",
    description:
      "Equities fall 40% immediately, then return 4 percentage points below assumption for three years before normalising.",
    basis: "Shaped on the Nifty 50 drawdown of 2008–09 (roughly −50% peak to trough, multi-year recovery).",
    segments: [
      { years: 3, instantShockPct: { equity: -40, gold: 5 }, returnDeltaPct: { equity: -4 } },
    ],
  },
  {
    id: "lost_decade",
    name: "Lost decade",
    description: "Ten years of equity returns 6 percentage points below assumption, with no crash.",
    basis: "Shaped on flat-to-negative decade-long equity stretches (e.g. Nifty 1994–2003 in real terms).",
    segments: [{ years: 10, returnDeltaPct: { equity: -6, debt: -1 } }],
  },
  {
    id: "high_inflation",
    name: "Sustained high inflation",
    description:
      "Inflation runs 4 percentage points higher for five years while debt and cash lose real ground.",
    basis: "Shaped on India's 2010–2013 inflation episode (CPI persistently near 10%).",
    segments: [{ years: 5, inflationDeltaPct: 4, returnDeltaPct: { debt: -1, cash: -1, gold: 3 } }],
  },
  {
    id: "income_loss",
    name: "Income loss",
    description: "All contributions stop for two years, then resume at the planned amount.",
    basis: "A personal-risk stress, not a market event: job loss or a career break.",
    segments: [{ years: 2, contributionMultiplier: 0 }],
  },
  {
    id: "crash_plus_income_loss",
    name: "Crash while out of work",
    description:
      "Equities fall 35% and contributions stop for two years — the market and income shocks arrive together.",
    basis: "Combines the equity drawdown shape with a two-year contribution stop.",
    segments: [
      { years: 2, instantShockPct: { equity: -35 }, returnDeltaPct: { equity: -3 }, contributionMultiplier: 0 },
    ],
  },
];
