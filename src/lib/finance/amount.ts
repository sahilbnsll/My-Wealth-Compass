/**
 * One shared money parser for the whole app.
 *
 * Understands the way amounts are actually written in India:
 * 100000, 1,00,000, 1 lakh, 1 lac, 1L, 10k, ₹10k, 1.5 lakh, 2.25Cr, 1 crore.
 * Everything normalises to a plain numeric rupee value.
 */

export type AmountCurrency = "INR" | "USD";

export type AmountParse =
  | { ok: true; value: number; currency: AmountCurrency }
  | { ok: false; value: null; error: string };

const UNITS: Array<{ match: RegExp; factor: number }> = [
  { match: /^(?:cr|crore|crores|crs)$/, factor: 1_00_00_000 },
  { match: /^(?:l|lakh|lakhs|lac|lacs)$/, factor: 1_00_000 },
  { match: /^(?:m|mn|million|millions)$/, factor: 1_000_000 },
  { match: /^(?:k|thousand)$/, factor: 1_000 },
];


/** Parse a money string and explain why it failed when it does. */
export function parseAmountInput(
  input: string | number | null | undefined,
  options: { allowNegative?: boolean } = {},
): AmountParse {
  const allowNegative = options.allowNegative ?? false;

  if (typeof input === "number") {
    if (!Number.isFinite(input)) return { ok: false, value: null, error: "Enter a number." };
    if (input < 0 && !allowNegative) return { ok: false, value: null, error: "Amount can't be negative." };
    return { ok: true, value: input, currency: "INR" };
  }
  if (input === null || input === undefined) return { ok: false, value: null, error: "Enter an amount." };

  // Case insensitive, spaces, commas, ₹ and $ all allowed.
  let text = input.trim().toLowerCase();
  const usd = /(\$|\busd\b|\bdollars?\b)/.test(text);
  const currency: AmountCurrency = usd ? "USD" : "INR";

  const cleaned = text
    .replace(/[₹$\s,_]/g, "")
    .replace(/usd/g, "")
    .replace(/dollars?/g, "")
    .replace(/rs\.?/g, "")
    .replace(/rupees?/g, "");

  if (!cleaned) return { ok: false, value: null, error: "Enter an amount." };

  const signed = cleaned.match(/^([+-]?)(.*)$/);
  const negative = signed?.[1] === "-";
  const body = signed?.[2] ?? "";

  const match = body.match(/^(\d+(?:\.\d+)?)([a-z]*)$/);
  if (!match) {
    return { ok: false, value: null, error: "Use digits, with k, L or Cr — e.g. 1.5L." };
  }

  const value = Number(match[1]);
  if (!Number.isFinite(value)) return { ok: false, value: null, error: "Enter a valid number." };

  const suffix = match[2] ?? "";
  let factor = 1;
  if (suffix) {
    const unit = UNITS.find((u) => u.match.test(suffix));
    if (!unit) return { ok: false, value: null, error: `"${suffix}" isn't a unit. Try k, L or Cr.` };
    factor = unit.factor;
  }

  const result = Number(((negative ? -value : value) * factor).toFixed(2));
  if (!Number.isFinite(result)) return { ok: false, value: null, error: "That number is too large." };
  if (result < 0 && !allowNegative) return { ok: false, value: null, error: "Amount can't be negative." };
  return { ok: true, value: result, currency };

}

/** Convenience wrapper: the value, or null when the text can't be understood. */
export function parseFinancialAmount(
  input: string | number | null | undefined,
  options?: { allowNegative?: boolean },
): number | null {
  const parsed = parseAmountInput(input, options);
  return parsed.ok ? parsed.value : null;
}

/** Indian-grouped plain number for input fields (no symbol). */
export function formatAmountInput(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "";
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(value);
}

/** Human echo shown under a money field: ₹1,50,000 (1.5 lakh). */
export function describeAmount(value: number): string {
  const formatted = `₹${formatAmountInput(value)}`;
  const abs = Math.abs(value);
  if (abs >= 1_00_00_000) return `${formatted} (${trim(abs / 1_00_00_000)} crore)`;
  if (abs >= 1_00_000) return `${formatted} (${trim(abs / 1_00_000)} lakh)`;
  if (abs >= 1_000) return `${formatted} (${trim(abs / 1_000)}k)`;
  return formatted;
}

function trim(n: number): string {
  return Number(n.toFixed(2)).toString();
}
