import { ASSET_CLASSES, type AssetClass, type Profile } from "./types";
import { emergencyCoverageMonths } from "./core";

export type Recommendation = {
  title: string;
  why: string;
  evidence: string;
  risk: string;
  alternative?: string;
  changeWhen: string;
};

export type MissingInput = { field: string; whyItMatters: string };

export type TargetAllocation = {
  target: Record<AssetClass, number>;
  rationale: Record<string, string>;
  missing: MissingInput[];
  equitySplit: { key: string; pct: number; role: string }[];
};

/** Recommended emergency-fund months, derived from the user's own situation. */
export function recommendedEmergencyMonths(p: Profile): { months: number; reasons: string[] } {
  let months = 4;
  const reasons: string[] = ["Baseline of 4 months of essential expenses for a salaried earner."];

  if (p.job_stability === "low") {
    months += 3;
    reasons.push("Job stability is marked low, so the fund needs to cover a longer search.");
  } else if (p.job_stability === "medium") {
    months += 1;
    reasons.push("Moderate job stability adds a month of buffer.");
  }
  if ((p.dependents ?? 0) > 0) {
    months += 1;
    reasons.push(`${p.dependents} dependent(s) mean household obligations continue regardless of income.`);
  }
  if ((p.existing_debt ?? 0) > 0) {
    months += 1;
    reasons.push("Outstanding debt creates fixed monthly obligations that must be serviced through a gap.");
  }
  const variableShare =
    p.annual_bonus && p.monthly_income ? p.annual_bonus / (p.monthly_income * 12 + p.annual_bonus) : 0;
  if (variableShare > 0.2) {
    months += 1;
    reasons.push("More than a fifth of compensation is variable, which makes income less predictable.");
  }
  return { months: Math.min(months, 12), reasons };
}

/**
 * Build a target allocation from the user's actual circumstances.
 * Returns explicitly which inputs are missing rather than inventing them.
 */
export function buildTargetAllocation(p: Profile, emergencyCovered: boolean): TargetAllocation {
  const missing: MissingInput[] = [];
  if (p.current_age === null) missing.push({ field: "Current age", whyItMatters: "Sets the investment horizon and the equity share." });
  if (p.retirement_age === null) missing.push({ field: "Retirement age", whyItMatters: "Defines when the accumulation phase ends." });
  if (p.essential_monthly_expenses === null)
    missing.push({ field: "Essential monthly expenses", whyItMatters: "Determines the emergency fund target." });
  if (p.risk_tolerance === null) missing.push({ field: "Risk tolerance", whyItMatters: "Adjusts equity within the horizon-implied range." });
  if (p.monthly_income === null) missing.push({ field: "Monthly income", whyItMatters: "Needed for savings rate and contribution capacity." });

  const horizon =
    p.current_age !== null && p.retirement_age !== null
      ? Math.max(0, p.retirement_age - p.current_age)
      : (p.investment_horizon_years ?? 15);

  // Horizon sets the base equity share; risk tolerance nudges it; a missing
  // emergency fund caps it because liquidity comes before growth.
  let equity = horizon >= 25 ? 70 : horizon >= 15 ? 65 : horizon >= 10 ? 55 : horizon >= 5 ? 40 : 20;
  if (p.risk_tolerance === "high") equity += 5;
  if (p.risk_tolerance === "low") equity -= 10;
  if ((p.dependents ?? 0) >= 2) equity -= 5;
  if ((p.existing_debt ?? 0) > 0) equity -= 5;
  equity = Math.max(0, Math.min(80, equity));

  const cash = emergencyCovered ? 5 : 15;
  const gold = 10;
  const debt = Math.max(0, 100 - equity - cash - gold);

  const target = Object.fromEntries(ASSET_CLASSES.map((c) => [c, 0])) as Record<AssetClass, number>;
  target.equity = equity;
  target.debt = debt;
  target.gold = gold;
  target.cash = cash;

  const rationale: Record<string, string> = {
    equity: `A ${horizon}-year horizon to retirement supports ${equity}% equity. Equity is the growth engine and is expected to be the most volatile part of the portfolio; it is sized so a deep drawdown never forces a sale.`,
    debt: `${debt}% in debt provides stability and funds near-term needs without depending on market levels. It also gives something to rebalance from when equity falls.`,
    gold: `${gold}% gold is a diversifier, not a growth engine. It has historically behaved differently from Indian equity during currency and inflation stress.`,
    cash: emergencyCovered
      ? `${cash}% cash covers routine liquidity now that the emergency fund is funded.`
      : `${cash}% cash is elevated because the emergency fund is not yet fully funded. Liquidity comes before additional market risk.`,
  };

  // Equity is deliberately kept to a small number of intentional buckets.
  const equitySplit =
    equity > 0
      ? [
          { key: "Nifty 50 / large-cap index", pct: 60, role: "Core, lowest-cost, broadest market exposure." },
          { key: "Flexi-cap", pct: 25, role: "Lets one manager move across market caps without adding overlap." },
          { key: "Mid-cap", pct: 10, role: "Higher expected return, deeper drawdowns; sized so it cannot dominate outcomes." },
          { key: "Small-cap", pct: 5, role: "Only justified with a long horizon and no near-term withdrawal need." },
        ].filter((s) => horizon >= 10 || (s.key !== "Small-cap" && s.key !== "Mid-cap"))
      : [];
  const splitTotal = equitySplit.reduce((a, s) => a + s.pct, 0);
  const normalisedSplit = equitySplit.map((s) => ({ ...s, pct: splitTotal > 0 ? (s.pct / splitTotal) * 100 : 0 }));

  return { target, rationale, missing, equitySplit: normalisedSplit };
}

export type Alert = { level: "critical" | "warning" | "info"; title: string; detail: string };

export function buildAlerts(args: {
  profile: Profile;
  liquidValue: number;
  monthlySip: number;
  staleDataCount: number;
  missing: MissingInput[];
  rebalanceBreaches: string[];
}): Alert[] {
  const out: Alert[] = [];
  const { profile: p } = args;

  const essential = p.essential_monthly_expenses ?? p.monthly_expenses;
  if (essential) {
    const rec = recommendedEmergencyMonths(p);
    const coverage = emergencyCoverageMonths(args.liquidValue, essential);
    if (coverage !== null && coverage < rec.months) {
      out.push({
        level: coverage < rec.months / 2 ? "critical" : "warning",
        title: "Emergency fund below target",
        detail: `Liquid assets cover ${coverage.toFixed(1)} months of essential expenses against a ${rec.months}-month target for your situation.`,
      });
    }
  }

  for (const b of args.rebalanceBreaches) {
    out.push({ level: "warning", title: "Allocation off target", detail: b });
  }

  if (args.staleDataCount > 0) {
    out.push({
      level: "warning",
      title: "Market data is stale",
      detail: `${args.staleDataCount} price(s) have not been refreshed recently and are labelled stale. They are still used in totals but flagged everywhere they appear.`,
    });
  }

  if (args.missing.length > 0) {
    out.push({
      level: "info",
      title: "Missing information required for a more reliable analysis",
      detail: args.missing.map((m) => m.field).join(", "),
    });
  }

  if (args.monthlySip <= 0) {
    out.push({
      level: "info",
      title: "No planned investments recorded",
      detail: "Projections currently grow only the existing portfolio, with no future contributions.",
    });
  }

  return out;
}
