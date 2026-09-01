import { describe, expect, it } from "vitest";
import { formatPercent, parsePercentInput } from "../percent";

describe("parsePercentInput", () => {
  it("accepts plain and marked percentages", () => {
    expect(parsePercentInput("10")).toMatchObject({ ok: true, value: 10 });
    expect(parsePercentInput("10%")).toMatchObject({ ok: true, value: 10 });
    expect(parsePercentInput(" 7.5 pct ")).toMatchObject({ ok: true, value: 7.5 });
    expect(parsePercentInput("12 percent")).toMatchObject({ ok: true, value: 12 });
    expect(parsePercentInput("6% p.a.")).toMatchObject({ ok: true, value: 6 });
  });

  it("treats a bare sub-1 decimal as ambiguous", () => {
    const parsed = parsePercentInput("0.10");
    expect(parsed.ok).toBe(false);
    expect(parsed.ok === false && parsed.error).toContain("Ambiguous");
  });

  it("accepts sub-1 values when the user marks them", () => {
    expect(parsePercentInput("0.25%")).toMatchObject({ ok: true, value: 0.25 });
  });

  it("validates range", () => {
    expect(parsePercentInput("120").ok).toBe(false);
    expect(parsePercentInput("-5").ok).toBe(false);
    expect(parsePercentInput("-5", { min: -100 })).toMatchObject({ ok: true, value: -5 });
  });

  it("rejects junk", () => {
    expect(parsePercentInput("abc").ok).toBe(false);
    expect(parsePercentInput("").ok).toBe(false);
  });

  it("formats", () => {
    expect(formatPercent(10)).toBe("10%");
    expect(formatPercent(7.5)).toBe("7.5%");
    expect(formatPercent(null)).toBe("—");
  });
});
