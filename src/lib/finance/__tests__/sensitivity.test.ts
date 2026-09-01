import { describe, expect, it } from "vitest";
import { buildGlidePath, sensitivity, sensitivityRanking } from "../sensitivity";
import type { ProjectionInput } from "../projection";
import { ASSET_CLASSES, type AssetClass, type Assumptions } from "../types";

const assumptions: Assumptions = {
  equity_return: 11,
  debt_return: 6.5,
  gold_return: 7,
  cash_return: 4,
  inflation: 5,
  sip_step_up: 5,
};

function zeros(): Record<AssetClass, number> {
  return Object.fromEntries(ASSET_CLASSES.map((c) => [c, 0])) as Record<AssetClass, number>;
}

const base: ProjectionInput = {
  startingValues: { ...zeros(), equity: 1000000, debt: 500000 },
  monthlyContribution: { ...zeros(), equity: 40000, debt: 10000 },
  assumptions,
  startYear: 2026,
  years: 20,
  startAge: 30,
};

describe("sensitivity", () => {
  it("includes a zero-delta point equal to the base run", () => {
    const r = sensitivity(base, "equity_return");
    const zero = r.points.find((p) => p.delta === 0)!;
    expect(zero.deltaReal).toBeCloseTo(0);
    expect(zero.finalReal).toBeGreaterThan(0);
  });

  it("higher equity return increases real terminal wealth", () => {
    const r = sensitivity(base, "equity_return");
    const up = r.points.find((p) => p.delta === 2)!;
    const down = r.points.find((p) => p.delta === -2)!;
    expect(up.finalReal).toBeGreaterThan(down.finalReal);
    expect(r.slopePerUnit).toBeGreaterThan(0);
  });

  it("higher inflation reduces real terminal wealth", () => {
    const r = sensitivity(base, "inflation");
    const up = r.points.find((p) => p.delta === 2)!;
    expect(up.deltaReal).toBeLessThan(0);
  });

  it("scales contributions proportionally", () => {
    const r = sensitivity(base, "contribution");
    const up = r.points.find((p) => p.delta === 20)!;
    const zero = r.points.find((p) => p.delta === 0)!;
    expect(up.finalReal).toBeGreaterThan(zero.finalReal);
  });

  it("ranks levers by the spread they create", () => {
    const ranked = sensitivityRanking(base, ["equity_return", "sip_step_up"]);
    expect(ranked).toHaveLength(2);
    const spread = (points: { finalReal: number }[]) =>
      Math.max(...points.map((p) => p.finalReal)) - Math.min(...points.map((p) => p.finalReal));
    expect(spread(ranked[0]!.points)).toBeGreaterThanOrEqual(spread(ranked[1]!.points));
  });
});

describe("buildGlidePath", () => {
  it("holds then steps equity down to the floor", () => {
    const path = buildGlidePath({ startAge: 30, targetAge: 60, startEquityPct: 70, endEquityPct: 30, holdYears: 10 });
    expect(path[0]).toEqual({ age: 30, equityPct: 70 });
    expect(path.some((p) => p.age === 40 && p.equityPct === 70)).toBe(true);
    expect(path.some((p) => p.age === 60 && p.equityPct === 30)).toBe(true);
    for (let i = 1; i < path.length; i++) expect(path[i]!.age).toBeGreaterThan(path[i - 1]!.age);
  });
});
