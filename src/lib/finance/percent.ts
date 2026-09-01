/**
 * One shared percentage parser for the whole app.
 *
 * Accepts the ways a rate is actually typed — 10, 10%, 10 pct, 7.5 percent —
 * and refuses to guess when a value could mean two things. A bare 0.10 could
 * be a tenth of a percent or ten percent, so we ask instead of silently
 * choosing. Everything normalises to a percent number (10 means 10%).
 */

export type PercentParse =
  | { ok: true; value: number; explicit: boolean }
  | { ok: false; value: null; error: string };

export type PercentOptions = {
  /** Lowest accepted percent value. Default 0. */
  min?: number;
  /** Highest accepted percent value. Default 100. */
  max?: number;
};

/** Parse a percentage string and explain why it failed when it does. */
export function parsePercentInput(
  input: string | number | null | undefined,
  options: PercentOptions = {},
): PercentParse {
  const min = options.min ?? 0;
  const max = options.max ?? 100;

  const bounded = (value: number, explicit: boolean): PercentParse => {
    const rounded = Number(value.toFixed(4));
    if (rounded < min) return { ok: false, value: null, error: `Must be at least ${formatPercent(min)}.` };
    if (rounded > max) return { ok: false, value: null, error: `Must be ${formatPercent(max)} or less.` };
    return { ok: true, value: rounded, explicit };
  };

  if (typeof input === "number") {
    if (!Number.isFinite(input)) return { ok: false, value: null, error: "Enter a number." };
    return bounded(input, true);
  }
  if (input === null || input === undefined) return { ok: false, value: null, error: "Enter a percentage." };

  let text = input.trim().toLowerCase();
  if (text === "") return { ok: false, value: null, error: "Enter a percentage." };

  const explicitMarker = /(%|\bpct\b|\bper\s?cents?\b|\bpercents?\b)/.test(text);
  text = text
    .replace(/%/g, "")
    .replace(/\bpct\b|\bper\s?cents?\b|\bpercents?\b/g, "")
    .replace(/\bp\.?\s?a\.?/g, "")
    .replace(/\bper\s?annum\b/g, "")
    .replace(/[,\s]/g, "");

  if (text === "") return { ok: false, value: null, error: "Enter a percentage." };
  if (!/^[+-]?\d*\.?\d+$/.test(text)) {
    return { ok: false, value: null, error: "Use digits only, e.g. 12 or 12%." };
  }

  const numeric = Number(text);
  if (!Number.isFinite(numeric)) return { ok: false, value: null, error: "Enter a number." };

  // A bare decimal below 1 is genuinely ambiguous — never guess.
  if (!explicitMarker && numeric !== 0 && Math.abs(numeric) < 1) {
    return {
      ok: false,
      value: null,
      error: `Ambiguous. Write ${formatPercent(numeric)} for ${formatPercent(numeric)}, or ${formatPercent(numeric * 100)} for ${formatPercent(numeric * 100)}.`,
    };
  }

  return bounded(numeric, explicitMarker);
}

/** Display a percent number the way the app shows rates: 10%, 7.5%, 0.25%. */
export function formatPercent(value: number | null | undefined, maxDecimals = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  const fixed = Number(value.toFixed(maxDecimals));
  return `${fixed.toLocaleString("en-IN", { maximumFractionDigits: maxDecimals })}%`;
}

/** Value shown inside a percent input box (no suffix — the field renders it). */
export function formatPercentInput(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "";
  return String(Number(value.toFixed(4)));
}
