import { describe, expect, it } from "vitest";
import { buildPerformanceHistory, largestDrawdown } from "../performance";

describe("portfolio performance history", () => {
  it("does not fabricate a history point without a snapshot", () => {
    expect(buildPerformanceHistory([])).toEqual([]);
  });
  it("adds the current position only as a current observation", () => {
    const points = buildPerformanceHistory([{ taken_on: "2026-01-01", total_value: 100, invested: 80 }], { totalValue: 120, invested: 90, asOf: "2026-02-01" });
    expect(points).toHaveLength(2);
    expect(points[1]?.gain).toBe(30);
  });
  it("finds an observed drawdown and leaves recovery open when not recovered", () => {
    const points = buildPerformanceHistory([
      { taken_on: "2026-01-01", total_value: 100, invested: 100 },
      { taken_on: "2026-02-01", total_value: 80, invested: 100 },
      { taken_on: "2026-03-01", total_value: 90, invested: 100 },
    ]);
    const drawdown = largestDrawdown(points);
    expect(drawdown?.drawdownPct).toBe(-20);
    expect(drawdown?.recoveredDate).toBeNull();
  });
});
