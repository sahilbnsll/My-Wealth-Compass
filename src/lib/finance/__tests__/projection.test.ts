import { describe, it, expect } from "vitest";
import { project, validateProjection, interpolateGlide, type ProjectionInput } from "../projection";
import { ASSET_CLASSES, type AssetClass, type Assumptions } from "../types";
import { sipFutureValue, futureValue, realValue } from "../core";

const assumptions: Assumptions = {
  equity_return: 12,
  debt_return: 7,
  gold_return: 6,
  cash_return: 3,
  inflation: 6,
  sip_step_up: 0,
};

function zeroMap(): Record<AssetClass, number> {
  return Object.fromEntries(ASSET_CLASSES.map((c) => [c, 0])) as Record<AssetClass, number>;
}

function baseInput(over: Partial<ProjectionInput> = {}): ProjectionInput {
  return {
    startingValues: zeroMap(),
    monthlyContribution: zeroMap(),
    assumptions,
    startYear: 2026,
    years: 10,
    startAge: 30,
    ...over,
  };
}

describe("project", () => {
  it("matches the closed-form SIP future value with no step-up", () => {
    const rows = project(baseInput({ monthlyContribution: { ...zeroMap(), equity: 10000 } }));
    expect(rows).toHaveLength(10);
    expect(rows[9]!.closing).toBeCloseTo(sipFutureValue(10000, 12, 10), 2);
  });

  it("matches lump-sum compounding with no contributions", () => {
    const rows = project(baseInput({ startingValues: { ...zeroMap(), equity: 100000 } }));
    // Monthly compounding of a 12% nominal rate.
    expect(rows[9]!.closing).toBeCloseTo(100000 * Math.pow(1.01, 120), 2);
  });

  it("reconciles opening + contribution + gain = closing every year", () => {
    const rows = project(
      baseInput({
        startingValues: { ...zeroMap(), equity: 500000, debt: 200000, gold: 100000, cash: 50000 },
        monthlyContribution: { ...zeroMap(), equity: 30000, debt: 10000, gold: 5000 },
        assumptions: { ...assumptions, sip_step_up: 10 },
        years: 30,
      }),
    );
    expect(validateProjection(rows)).toEqual([]);
  });

  it("chains closing balance into the next year's opening", () => {
    const rows = project(baseInput({ startingValues: { ...zeroMap(), equity: 100000 }, years: 5 }));
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i]!.opening).toBeCloseTo(rows[i - 1]!.closing, 6);
    }
  });

  it("applies the annual step-up to contributions", () => {
    const noStep = project(baseInput({ monthlyContribution: { ...zeroMap(), equity: 10000 } }));
    const withStep = project(
      baseInput({
        monthlyContribution: { ...zeroMap(), equity: 10000 },
        assumptions: { ...assumptions, sip_step_up: 10 },
      }),
    );
    expect(withStep[0]!.contribution).toBeCloseTo(120000);
    expect(withStep[1]!.contribution).toBeCloseTo(132000);
    expect(withStep[9]!.closing).toBeGreaterThan(noStep[9]!.closing);
  });

  it("computes real values consistently with the nominal series", () => {
    const rows = project(baseInput({ startingValues: { ...zeroMap(), equity: 100000 } }));
    rows.forEach((r, idx) => {
      expect(r.realClosing).toBeCloseTo(realValue(r.closing, assumptions.inflation, idx + 1), 6);
    });
  });

  it("tracks contributions versus compounding", () => {
    const rows = project(
      baseInput({ monthlyContribution: { ...zeroMap(), equity: 10000 }, investedToDate: 0 }),
    );
    const last = rows[9]!;
    expect(last.totalInvested).toBeCloseTo(10000 * 120, 2);
    expect(last.totalGains).toBeCloseTo(last.closing - last.totalInvested, 6);
    expect(last.totalGains).toBeGreaterThan(0);
  });

  it("advances age each year and honours the horizon length", () => {
    const rows = project(baseInput({ startAge: 32, years: 45 }));
    expect(rows).toHaveLength(45);
    expect(rows[0]!.age).toBe(32);
    expect(rows[44]!.age).toBe(76);
    expect(rows[44]!.year).toBe(2070);
  });

  it("grows debt at the debt rate, not the equity rate", () => {
    const rows = project(baseInput({ startingValues: { ...zeroMap(), debt: 100000 }, years: 1 }));
    expect(rows[0]!.closing).toBeCloseTo(futureValue(100000, 0, 0) * Math.pow(1 + 0.07 / 12, 12), 2);
  });
});

describe("glide path", () => {
  it("interpolates between points", () => {
    const glide = [
      { age: 30, equityPct: 80 },
      { age: 60, equityPct: 50 },
    ];
    expect(interpolateGlide(glide, 30)).toBe(80);
    expect(interpolateGlide(glide, 45)).toBeCloseTo(65);
    expect(interpolateGlide(glide, 70)).toBe(50);
    expect(interpolateGlide(glide, 20)).toBe(80);
  });

  it("shifts new contributions toward debt as age rises", () => {
    const glide = [
      { age: 30, equityPct: 90 },
      { age: 60, equityPct: 30 },
    ];
    const rows = project(
      baseInput({
        monthlyContribution: { ...zeroMap(), equity: 40000, debt: 10000 },
        glidePath: glide,
        years: 30,
      }),
    );
    expect(validateProjection(rows)).toEqual([]);
    expect(rows[29]!.allocationPct.debt!).toBeGreaterThan(rows[0]!.allocationPct.debt!);
  });
});

describe("validateProjection", () => {
  it("reports a broken reconciliation", () => {
    const rows = project(baseInput({ startingValues: { ...zeroMap(), equity: 1000 }, years: 1 }));
    rows[0]!.closing += 500;
    expect(validateProjection(rows).length).toBeGreaterThan(0);
  });
});
