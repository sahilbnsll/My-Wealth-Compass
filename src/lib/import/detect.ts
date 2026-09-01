/**
 * Document identification for the import centre.
 *
 * Given the raw text of a statement (CSV, a sheet flattened to CSV, or text
 * pulled out of a PDF), work out which broker produced it and whether it is a
 * holdings snapshot or a transaction statement. Detection is advisory only —
 * the user always sees and confirms the result before anything is written.
 */

export type ImportSource =
  | "zerodha"
  | "groww"
  | "upstox"
  | "angel_one"
  | "icici_direct"
  | "kuvera"
  | "cams_karvy"
  | "generic";

export type ImportKind = "holdings" | "transactions";

export const SOURCE_LABELS: Record<ImportSource, string> = {
  zerodha: "Zerodha",
  groww: "Groww",
  upstox: "Upstox",
  angel_one: "Angel One",
  icici_direct: "ICICI Direct",
  kuvera: "Kuvera",
  cams_karvy: "CAMS / KFintech",
  generic: "Generic CSV / XLSX",
};

export type Detection = {
  source: ImportSource;
  kind: ImportKind;
  confidence: "high" | "medium" | "low";
  reasons: string[];
};

const BRANDS: { source: ImportSource; patterns: RegExp[] }[] = [
  { source: "zerodha", patterns: [/zerodha/i, /\bkite\b/i, /console\.zerodha/i, /avg\.\s*cost/i] },
  { source: "groww", patterns: [/groww/i, /average buying price/i] },
  { source: "upstox", patterns: [/upstox/i, /rksv/i] },
  { source: "angel_one", patterns: [/angel\s*one/i, /angel broking/i] },
  { source: "icici_direct", patterns: [/icici\s*direct/i, /icicidirect/i] },
  { source: "kuvera", patterns: [/kuvera/i] },
  { source: "cams_karvy", patterns: [/\bcams\b/i, /kfintech/i, /karvy/i, /consolidated account statement/i] },
];

const TRANSACTION_HINTS = [
  /trade\s*date/i,
  /trade\s*type/i,
  /transaction\s*type/i,
  /order\s*execution\s*time/i,
  /\bbuy\b.*\bsell\b/i,
  /order\s*id/i,
  /tradebook/i,
];

const HOLDING_HINTS = [
  /avg\.?\s*(cost|price)/i,
  /average buying price/i,
  /\bltp\b/i,
  /cur\.?\s*val/i,
  /current value/i,
  /holdings?/i,
  /closing balance/i,
];

function count(patterns: RegExp[], text: string): number {
  return patterns.reduce((n, re) => (re.test(text) ? n + 1 : n), 0);
}

export function detectDocument(text: string, fileName = ""): Detection {
  const haystack = `${fileName}\n${text.slice(0, 4000)}`;
  const reasons: string[] = [];

  let source: ImportSource = "generic";
  for (const brand of BRANDS) {
    if (count(brand.patterns, haystack) > 0) {
      source = brand.source;
      reasons.push(`${SOURCE_LABELS[brand.source]} markers found in the file.`);
      break;
    }
  }
  if (source === "generic") reasons.push("No broker signature — reading it as a generic sheet.");

  const txScore = count(TRANSACTION_HINTS, haystack);
  const holdScore = count(HOLDING_HINTS, haystack);
  const kind: ImportKind = txScore > holdScore ? "transactions" : "holdings";
  reasons.push(
    kind === "transactions"
      ? "Dated rows with a buy/sell column — treating this as a transaction statement."
      : "Quantity and price columns without trade dates — treating this as a holdings snapshot.",
  );

  const spread = Math.abs(txScore - holdScore);
  const confidence: Detection["confidence"] =
    source !== "generic" && spread >= 2 ? "high" : spread >= 1 ? "medium" : "low";
  if (confidence === "low") reasons.push("Confirm the document type below before continuing.");

  return { source, kind, confidence, reasons };
}
