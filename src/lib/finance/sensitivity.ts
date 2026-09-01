import { project, type ProjectionInput, type ProjectionYear } from "./projection";
import type { AssetClass } from "./types";

export type SensitivityLever = "equity_return" | "inflation" | "contribution" | "sip_step_up" | "years";

export type SensitivityPoint = {
  /** Signed change applied to the lever (percentage points, % of contribution, or years). */
  delta: number;
  label: string;
  finalNominal: number;
  finalReal: number;
  /** Change in real terminal wealth against the base run, in rupees. */
  deltaReal: number;
  /** Same change as a share of base real terminal wealth. */
  deltaRealPct: number;
};

export type SensitivityResult = {
  lever: SensitivityLever;
  title: string;
  unit: string;
  points: SensitivityPoint[];
  /** Rupees of real terminal wealth per unit of lever, averaged across the tested range. */
  slopePerUnit: number;
};

const LEVER_META: Record<SensitivityLever, { title: string; unit: string; deltas: number[] }> = {
  equity_return: { title: "Equity return", unit: "pp", deltas: [-2, -1, 0, 1, 2] },
  inflation: { title: "Inflation", unit: "pp", deltas: [-2, -1, 0, 1, 2] },
  contribution: { title: "Monthly contribution", unit: "%", deltas: [-20, -10, 0, 10, 20] },
  sip_step_up: { title: "Annual step-up", unit: "pp", deltas: [-5, -2.5, 0, 2.5, 5] },
  years: { title: "Time invested", unit: "yr", deltas: [-5, -2, 0, 2, 5] },
};

function withLever(base: ProjectionInput, lever: SensitivityLever, delta: number): ProjectionInput {
  const next: ProjectionInput = { ...base, assumptions: { ...base.assumptions }, monthlyContribution: { ...base.monthlyContribution } };
  switch (lever) {
    case "equity_return":
      next.assumptions.equity_return = base.assumptions.equity_return + delta;
      break;
    case "inflation":
      next.assumptions.inflation = base.assumptions.inflation + delta;
      break;
    case "sip_step_up":
      next.assumptions.sip_step_up = Math.max(0, base.assumptions.sip_step_up + delta);
      break;
    case "contribution": {
      const factor = 1 + delta / 100;
      for (const k of Object.keys(next.monthlyContribution) as AssetClass[]) {
        next.monthlyContribution[k] = Math.max(0, base.monthlyContribution[k] * factor);
      }
      break;
    }
    case "years":
      next.years = Math.max(1, base.years + delta);
      break;
  }
  return next;
}

function last(rows: ProjectionYear[]): ProjectionYear | null {
  return rows.length > 0 ? rows[rows.length - 1]! : null;
}

/** One-way sensitivity of terminal wealth to a single lever. Everything else held fixed. */
export function sensitivity(base: ProjectionInput, lever: SensitivityLever): SensitivityResult {
  const meta = LEVER_META[lever];
  const baseFinal = last(project(base));
  const baseReal = baseFinal?.realClosing ?? 0;

  const points: SensitivityPoint[] = meta.deltas.map((delta) => {
    const rows = project(withLever(base, lever, delta));
    const final = last(rows);
    const finalReal = final?.realClosing ?? 0;
    const deltaReal = finalReal - baseReal;
    const sign = delta > 0 ? "+" : "";
    return {
      delta,
      label: delta === 0 ? "Current assumption" : `${sign}${delta}${meta.unit === "%" ? "%" : meta.unit === "yr" ? " yr" : " pp"}`,
      finalNominal: final?.closing ?? 0,
      finalReal,
      deltaReal,
      deltaRealPct: baseReal > 0 ? (deltaReal / baseReal) * 100 : 0,
    } satisfies SensitivityPoint;
  });

  const lo = points[0]!;
  const hi = points[points.length - 1]!;
  const span = hi.delta - lo.delta;
  const slopePerUnit = span !== 0 ? (hi.finalReal - lo.finalReal) / span : 0;

  return { lever, title: meta.title, unit: meta.unit, points, slopePerUnit };
}

/** Rank levers by how much real terminal wealth moves across each lever's tested range. */
export function sensitivityRanking(base: ProjectionInput, levers?: SensitivityLever[]): SensitivityResult[] {
  const list = levers ?? (Object.keys(LEVER_META) as SensitivityLever[]);
  return list
    .map((l) => sensitivity(base, l))
    .sort((a, b) => {
      const spread = (r: SensitivityResult) => {
        const vals = r.points.map((p) => p.finalReal);
        return Math.max(...vals) - Math.min(...vals);
      };
      return spread(b) - spread(a);
    });
}

/** Standard age-based equity glide path: hold, then step equity down towards the floor by the target age. */
export function buildGlidePath(args: {
  startAge: number;
  targetAge: number;
  startEquityPct: number;
  endEquityPct: number;
  holdYears?: number;
}): { age: number; equityPct: number }[] {
  const hold = args.holdYears ?? 0;
  const holdUntil = Math.min(args.startAge + hold, args.targetAge);
  const path = [
    { age: args.startAge, equityPct: args.startEquityPct },
    { age: holdUntil, equityPct: args.startEquityPct },
    { age: args.targetAge, equityPct: args.endEquityPct },
    { age: args.targetAge + 30, equityPct: args.endEquityPct },
  ];
  return path.filter((p, i) => i === 0 || p.age > path[i - 1]!.age);
}
