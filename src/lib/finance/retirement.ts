import { project, type DecumulationInput, type ProjectionInput, type ProjectionYear } from "./projection";

export type RetirementInput = Omit<ProjectionInput, "decumulation"> & {
  decumulation: DecumulationInput;
};

export type RetirementAnalysis = {
  rows: ProjectionYear[];
  /** Corpus at the start of the retirement year, in nominal rupees. */
  corpusAtRetirement: number | null;
  /** Same corpus expressed in today's rupees. */
  realCorpusAtRetirement: number | null;
  /** First year the portfolio runs out, or null if it survives the horizon. */
  depletionYear: number | null;
  depletionAge: number | null;
  /** True when the portfolio still holds money at the end of the planning horizon. */
  survives: boolean;
  /** Nominal value left at the end of the horizon. */
  terminalValue: number;
  realTerminalValue: number;
  /** First-year retirement spend after inflation, in nominal rupees. */
  firstYearWithdrawal: number;
  /** That withdrawal as a share of the corpus at retirement. */
  initialWithdrawalRatePct: number | null;
  yearsOfSpendCovered: number | null;
};

/**
 * Runs the core projection engine with a decumulation phase and summarises survival.
 * No separate forecasting model: this is `project()` plus interpretation.
 */
export function analyseRetirement(input: RetirementInput): RetirementAnalysis {
  const rows = project(input);
  const retirementAge = input.decumulation.retirementAge;

  const retirementRow = rows.find((r) => r.age !== null && r.age >= retirementAge) ?? null;
  const corpusAtRetirement = retirementRow ? retirementRow.opening : null;

  const yearsToRetirement = retirementRow ? rows.indexOf(retirementRow) : null;
  const inflation = input.assumptions.inflation / 100;
  const realCorpusAtRetirement =
    corpusAtRetirement === null || yearsToRetirement === null
      ? null
      : corpusAtRetirement / Math.pow(1 + inflation, yearsToRetirement);

  const withdrawingRows = rows.filter((r) => r.withdrawal > 0 || (r.age !== null && r.age >= retirementAge));
  const firstYearWithdrawal = withdrawingRows[0]?.withdrawal ?? 0;

  const depletedRow = rows.find((r) => r.depleted) ?? null;
  const terminal = rows[rows.length - 1];
  const terminalValue = terminal?.closing ?? 0;

  const yearsOfSpendCovered = depletedRow
    ? Math.max(0, rows.indexOf(depletedRow) - (yearsToRetirement ?? 0))
    : withdrawingRows.length > 0
      ? withdrawingRows.length
      : null;

  return {
    rows,
    corpusAtRetirement,
    realCorpusAtRetirement,
    depletionYear: depletedRow?.year ?? null,
    depletionAge: depletedRow?.age ?? null,
    survives: depletedRow === null && terminalValue > 1,
    terminalValue,
    realTerminalValue: terminal?.realClosing ?? 0,
    firstYearWithdrawal,
    initialWithdrawalRatePct:
      corpusAtRetirement && corpusAtRetirement > 0
        ? (firstYearWithdrawal / corpusAtRetirement) * 100
        : null,
    yearsOfSpendCovered,
  };
}

/**
 * Largest annual spend (in today's rupees) the portfolio can sustain to the end of
 * the horizon. Bisection over the same engine — never a closed-form shortcut.
 */
export function sustainableAnnualSpend(input: RetirementInput, iterations = 40): number {
  const test = (spendToday: number) =>
    analyseRetirement({
      ...input,
      decumulation: { ...input.decumulation, annualSpendToday: spendToday },
    }).survives;

  let low = 0;
  let high = Math.max(input.decumulation.annualSpendToday * 4, 1_200_000);
  if (test(high)) return high;

  for (let i = 0; i < iterations; i++) {
    const mid = (low + high) / 2;
    if (test(mid)) low = mid;
    else high = mid;
  }
  return low;
}
