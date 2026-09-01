/**
 * Broker statement import.
 *
 * Handles pasted CSV/TSV text from Zerodha Console holdings, Groww stock and
 * mutual-fund holdings exports, and any generic sheet that has a name column
 * plus quantity/price columns. Header names are matched loosely so small
 * broker-side renames do not break the import.
 */
import { DEFAULT_ASSET_CLASS, type AssetClass, type InstrumentType } from "@/lib/finance/types";

export type ParsedHolding = {
  name: string;
  symbol: string | null;
  isin: string | null;
  instrument_type: InstrumentType;
  asset_class: AssetClass;
  quantity: number | null;
  avg_price: number | null;
  current_price: number | null;
  cost_basis: number | null;
  current_value: number | null;
};

export type ParseResult = {
  rows: ParsedHolding[];
  /** Row-level problems, reported back to the user instead of silently dropped. */
  skipped: { line: number; reason: string }[];
  headers: string[];
  delimiter: string;
};

/** Split one delimited line, honouring double-quoted fields. */
export function splitLine(line: string, delimiter: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else quoted = false;
      } else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delimiter) {
      out.push(cur.trim());
      cur = "";
    } else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

function detectDelimiter(line: string): string {
  const counts: Record<string, number> = { ",": 0, "\t": 0, ";": 0, "|": 0 };
  let quoted = false;
  for (const ch of line) {
    if (ch === '"') quoted = !quoted;
    else if (!quoted && ch in counts) counts[ch]!++;
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]![1] > 0
    ? Object.entries(counts).sort((a, b) => b[1] - a[1])[0]![0]
    : ",";
}

const normalise = (s: string) =>
  s
    .toLowerCase()
    .replace(/[₹%]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** Candidate header labels per field, first match wins. */
const FIELD_ALIASES: Record<keyof ParsedHolding | "ignore", string[]> = {
  name: ["instrument", "stock name", "scheme name", "symbol name", "name", "security", "company name", "fund name"],
  symbol: ["symbol", "tradingsymbol", "trading symbol", "ticker", "nse code", "bse code", "scheme code"],
  isin: ["isin", "isin code"],
  quantity: ["qty", "quantity", "quantity available", "units", "shares", "holdings qty", "qty available"],
  avg_price: ["avg cost", "average price", "average buying price", "avg price", "buy avg", "avg buy price", "average nav"],
  current_price: ["ltp", "last traded price", "closing price", "current price", "market price", "nav", "current nav", "price"],
  cost_basis: ["invested", "buy value", "investment value", "invested value", "cost", "total investment", "invested amount"],
  current_value: ["cur val", "current value", "closing value", "market value", "present value", "value"],
  instrument_type: [],
  asset_class: [],
  ignore: [],
};

function mapHeaders(headers: string[]): Partial<Record<keyof ParsedHolding, number>> {
  const norm = headers.map(normalise);
  const map: Partial<Record<keyof ParsedHolding, number>> = {};
  for (const field of ["isin", "name", "symbol", "quantity", "avg_price", "current_price", "cost_basis", "current_value"] as const) {
    const aliases = FIELD_ALIASES[field];
    let idx = norm.findIndex((h) => aliases.includes(h));
    if (idx === -1) idx = norm.findIndex((h) => h !== "" && aliases.some((a) => h.startsWith(a) || h.includes(a)));
    if (idx !== -1 && !Object.values(map).includes(idx)) map[field] = idx;
  }
  return map;
}

/** Indian statements use lakh grouping and sometimes wrap negatives in brackets. */
export function parseAmount(raw: string | undefined): number | null {
  if (raw === undefined) return null;
  let s = raw.replace(/["₹\s,]/g, "").replace(/[A-Za-z]+$/g, "");
  if (s === "" || s === "-" || s === "--") return null;
  let sign = 1;
  if (/^\(.*\)$/.test(s)) {
    sign = -1;
    s = s.slice(1, -1);
  }
  if (s.startsWith("-")) {
    sign = -1;
    s = s.slice(1);
  }
  const n = Number(s);
  return Number.isFinite(n) ? sign * n : null;
}

const looksLikeIsin = (s: string) => /^IN[A-Z0-9]{10}$/i.test(s.trim());

/** Guess instrument type from the row's own text. */
export function guessInstrument(name: string, isin: string | null, fallback: InstrumentType): InstrumentType {
  const n = name.toLowerCase();
  if (/\betf\b|bees\b|exchange traded/.test(n)) return "etf";
  if (/\bfund\b|scheme|\bmf\b|direct plan|regular plan|growth option/.test(n)) return "mutual_fund";
  if (isin && /^INF/i.test(isin)) return "mutual_fund";
  if (/\bgold\b|sgb|sovereign gold/.test(n)) return "gold";
  return fallback;
}

export function parseBrokerCsv(
  text: string,
  opts: { defaultInstrument?: InstrumentType } = {},
): ParseResult {
  const fallback = opts.defaultInstrument ?? "stock";
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l !== "" && !/^[,;\t|"\s]+$/.test(l));

  if (lines.length === 0) return { rows: [], skipped: [], headers: [], delimiter: "," };

  const delimiter = detectDelimiter(lines[0]!);

  // Broker exports often start with title/metadata lines; find the real header row.
  let headerIdx = 0;
  let headers: string[] = [];
  let map: Partial<Record<keyof ParsedHolding, number>> = {};
  for (let i = 0; i < Math.min(lines.length, 15); i++) {
    const cells = splitLine(lines[i]!, delimiter);
    if (cells.length < 2) continue;
    const candidate = mapHeaders(cells);
    if (candidate.name !== undefined && (candidate.quantity !== undefined || candidate.current_value !== undefined)) {
      headerIdx = i;
      headers = cells;
      map = candidate;
      break;
    }
  }

  if (map.name === undefined) {
    return {
      rows: [],
      skipped: [{ line: 1, reason: "Could not find a header row with a holding name and quantity/value column." }],
      headers: splitLine(lines[0]!, delimiter),
      delimiter,
    };
  }

  const rows: ParsedHolding[] = [];
  const skipped: ParseResult["skipped"] = [];

  for (let i = headerIdx + 1; i < lines.length; i++) {
    const cells = splitLine(lines[i]!, delimiter);
    const name = (cells[map.name] ?? "").replace(/^"|"$/g, "").trim();
    if (!name) {
      skipped.push({ line: i + 1, reason: "No holding name in this row." });
      continue;
    }
    if (/^(total|grand total|sub total)/i.test(name)) continue;

    const at = (k: keyof ParsedHolding) => (map[k] === undefined ? undefined : cells[map[k]!]);
    const quantity = parseAmount(at("quantity"));
    const avg_price = parseAmount(at("avg_price"));
    const current_price = parseAmount(at("current_price"));
    let cost_basis = parseAmount(at("cost_basis"));
    let current_value = parseAmount(at("current_value"));

    const rawSymbol = (at("symbol") ?? "").trim() || null;
    let isin = (at("isin") ?? "").trim() || null;
    let symbol = rawSymbol;
    if (symbol && looksLikeIsin(symbol) && !isin) {
      isin = symbol;
      symbol = null;
    }
    if (!isin && looksLikeIsin(name)) isin = name;

    if (quantity === null && current_value === null) {
      skipped.push({ line: i + 1, reason: `"${name}" has neither a quantity nor a value.` });
      continue;
    }

    if (cost_basis === null && quantity !== null && avg_price !== null) cost_basis = quantity * avg_price;
    if (current_value === null && quantity !== null && current_price !== null) current_value = quantity * current_price;

    const instrument_type = guessInstrument(name, isin, fallback);

    rows.push({
      name,
      symbol: symbol ? symbol.toUpperCase() : null,
      isin: isin ? isin.toUpperCase() : null,
      instrument_type,
      asset_class: DEFAULT_ASSET_CLASS[instrument_type],
      quantity,
      avg_price: avg_price ?? (cost_basis !== null && quantity ? cost_basis / quantity : null),
      current_price: current_price ?? (current_value !== null && quantity ? current_value / quantity : null),
      cost_basis,
      current_value,
    });
  }

  return { rows, skipped, headers, delimiter };
}
