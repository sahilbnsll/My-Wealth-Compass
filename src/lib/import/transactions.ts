/**
 * Transaction statement import.
 *
 * Reads broker tradebooks and mutual-fund transaction statements that have
 * been converted to delimited text. Column names are matched loosely, dates
 * are read in the formats Indian brokers actually emit, and anything that
 * cannot be read confidently is marked for review rather than dropped.
 */
import { splitLine, parseAmount, guessInstrument } from "./csv";
import { DEFAULT_ASSET_CLASS, type AssetClass, type InstrumentType } from "@/lib/finance/types";
import { TRANSACTION_KINDS, type TransactionKind } from "@/lib/finance/ledger";

export type ParsedTransaction = {
  kind: TransactionKind;
  trade_date: string;
  name: string;
  symbol: string | null;
  isin: string | null;
  asset_class: AssetClass;
  instrument_type: InstrumentType;
  quantity: number | null;
  price: number | null;
  amount: number;
  fees: number;
  taxes: number;
  external_id: string | null;
  confidence: "high" | "medium" | "review";
  reason: string | null;
};

export type TransactionParseResult = {
  rows: ParsedTransaction[];
  skipped: { line: number; reason: string }[];
  headers: string[];
  delimiter: string;
};

type Field =
  | "date"
  | "name"
  | "symbol"
  | "isin"
  | "kind"
  | "quantity"
  | "price"
  | "amount"
  | "fees"
  | "taxes"
  | "external_id";

const ALIASES: Record<Field, string[]> = {
  date: ["trade date", "date", "transaction date", "order execution time", "nav date", "value date"],
  name: ["instrument", "scheme name", "stock name", "name", "security", "symbol name", "particulars", "description"],
  symbol: ["symbol", "tradingsymbol", "trading symbol", "ticker", "scheme code"],
  isin: ["isin", "isin code"],
  kind: ["trade type", "transaction type", "type", "buy sell", "side", "action"],
  quantity: ["quantity", "qty", "units", "shares"],
  price: ["price", "nav", "rate", "average price", "trade price"],
  amount: ["amount", "value", "trade value", "net amount", "gross amount", "total"],
  fees: ["brokerage", "charges", "fees", "commission", "transaction charges"],
  taxes: ["taxes", "tax", "stt", "gst", "stamp duty"],
  external_id: ["order id", "trade id", "transaction id", "reference", "folio transaction id"],
};

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[₹%.]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

function detectDelimiter(line: string): string {
  const counts: Record<string, number> = { ",": 0, "\t": 0, ";": 0, "|": 0 };
  let quoted = false;
  for (const ch of line) {
    if (ch === '"') quoted = !quoted;
    else if (!quoted && ch in counts) counts[ch]! += 1;
  }
  const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]!;
  return best[1] > 0 ? best[0] : ",";
}

export function mapTransactionHeaders(headers: string[]): Partial<Record<Field, number>> {
  const normed = headers.map(norm);
  const map: Partial<Record<Field, number>> = {};
  for (const field of Object.keys(ALIASES) as Field[]) {
    const aliases = ALIASES[field];
    let idx = normed.findIndex((h) => aliases.includes(h));
    if (idx === -1) idx = normed.findIndex((h) => h !== "" && aliases.some((a) => h.startsWith(a)));
    if (idx === -1) idx = normed.findIndex((h) => h !== "" && aliases.some((a) => h.includes(a)));
    if (idx !== -1 && !Object.values(map).includes(idx)) map[field] = idx;
  }
  return map;
}

const MONTHS: Record<string, string> = {
  jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
  jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
};

/** Read the date formats Indian brokers emit; returns ISO or null. */
export function parseStatementDate(raw: string | undefined): string | null {
  if (!raw) return null;
  const s = raw.trim().replace(/^"|"$/g, "").split(/[T ]/)[0]!;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  let m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/.exec(s);
  if (m) {
    const day = m[1]!.padStart(2, "0");
    const month = m[2]!.padStart(2, "0");
    let year = m[3]!;
    if (year.length === 2) year = Number(year) > 70 ? `19${year}` : `20${year}`;
    if (Number(month) > 12) return null;
    return `${year}-${month}-${day}`;
  }
  m = /^(\d{1,2})[-\s]([A-Za-z]{3,})[-\s](\d{2,4})$/.exec(s);
  if (m) {
    const month = MONTHS[m[2]!.slice(0, 3).toLowerCase()];
    if (!month) return null;
    let year = m[3]!;
    if (year.length === 2) year = `20${year}`;
    return `${year}-${month}-${m[1]!.padStart(2, "0")}`;
  }
  return null;
}

/** Map a broker's transaction-type word onto a ledger event kind. */
export function parseKind(raw: string | undefined): TransactionKind | null {
  if (!raw) return null;
  const s = norm(raw);
  if (s === "") return null;
  if (TRANSACTION_KINDS.includes(s as TransactionKind)) return s as TransactionKind;
  if (/\bsip\b|systematic/.test(s)) return "sip";
  if (/purchase|buy|bought|switch in|subscription|credit/.test(s)) return "buy";
  if (/redemption|redeem|sell|sold|switch out/.test(s)) return "sell";
  if (/dividend|idcw|payout/.test(s)) return "dividend";
  if (/interest|coupon/.test(s)) return "interest";
  if (/withdraw|debit/.test(s)) return "withdrawal";
  if (/contribut/.test(s)) return "contribution";
  if (/deposit/.test(s)) return "deposit";
  return null;
}

const looksLikeIsin = (s: string) => /^IN[A-Z0-9]{10}$/i.test(s.trim());

export function parseTransactionCsv(
  text: string,
  opts: { defaultInstrument?: InstrumentType; overrides?: Partial<Record<Field, number>> } = {},
): TransactionParseResult {
  const fallbackInstrument = opts.defaultInstrument ?? "stock";
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l !== "" && !/^[,;\t|"\s]+$/.test(l));
  if (lines.length === 0) return { rows: [], skipped: [], headers: [], delimiter: "," };

  const delimiter = detectDelimiter(lines[0]!);

  let headerIdx = -1;
  let headers: string[] = [];
  let map: Partial<Record<Field, number>> = {};
  for (let i = 0; i < Math.min(lines.length, 20); i++) {
    const cells = splitLine(lines[i]!, delimiter);
    if (cells.length < 3) continue;
    const candidate = mapTransactionHeaders(cells);
    if (candidate.date !== undefined && candidate.name !== undefined) {
      headerIdx = i;
      headers = cells;
      map = candidate;
      break;
    }
  }

  if (headerIdx === -1) {
    return {
      rows: [],
      skipped: [{ line: 1, reason: "Could not find a header row with a date and an instrument column." }],
      headers: splitLine(lines[0]!, delimiter),
      delimiter,
    };
  }

  map = { ...map, ...(opts.overrides ?? {}) };

  const rows: ParsedTransaction[] = [];
  const skipped: TransactionParseResult["skipped"] = [];

  for (let i = headerIdx + 1; i < lines.length; i++) {
    const cells = splitLine(lines[i]!, delimiter);
    const at = (f: Field) => (map[f] === undefined ? undefined : cells[map[f]!]);

    const name = (at("name") ?? "").replace(/^"|"$/g, "").trim();
    if (!name || /^(total|grand total|opening|closing)/i.test(name)) continue;

    const trade_date = parseStatementDate(at("date"));
    if (!trade_date) {
      skipped.push({ line: i + 1, reason: `"${name}" has no readable transaction date.` });
      continue;
    }

    const quantity = parseAmount(at("quantity"));
    const price = parseAmount(at("price"));
    let amount = parseAmount(at("amount"));
    const fees = parseAmount(at("fees")) ?? 0;
    const taxes = parseAmount(at("taxes")) ?? 0;

    let kind = parseKind(at("kind"));
    let confidence: ParsedTransaction["confidence"] = "high";
    let reason: string | null = null;

    if (!kind) {
      // Some statements encode direction in the sign of quantity or amount.
      const signal = quantity ?? amount;
      if (signal !== null && signal < 0) kind = "sell";
      else if (signal !== null && signal > 0) kind = "buy";
      else {
        skipped.push({ line: i + 1, reason: `Could not tell whether "${name}" was a buy or a sell.` });
        continue;
      }
      confidence = "review";
      reason = "Transaction type was inferred from the sign of the amount.";
    }

    if (amount === null && quantity !== null && price !== null) {
      amount = Math.abs(quantity) * price;
      if (confidence === "high") confidence = "medium";
      reason = reason ?? "Amount derived from quantity × price.";
    }
    if (amount === null) {
      skipped.push({ line: i + 1, reason: `"${name}" has no amount and no quantity × price to derive one.` });
      continue;
    }

    let isin = (at("isin") ?? "").trim() || null;
    let symbol = (at("symbol") ?? "").trim() || null;
    if (symbol && looksLikeIsin(symbol) && !isin) {
      isin = symbol;
      symbol = null;
    }

    const instrument_type = guessInstrument(name, isin, fallbackInstrument);
    const asset_class: AssetClass = DEFAULT_ASSET_CLASS[instrument_type];

    rows.push({
      kind,
      trade_date,
      name,
      symbol,
      isin,
      asset_class,
      instrument_type,
      quantity: quantity === null ? null : Math.abs(quantity),
      price,
      amount: Math.abs(amount),
      fees: Math.abs(fees),
      taxes: Math.abs(taxes),
      external_id: (at("external_id") ?? "").trim() || null,
      confidence,
      reason,
    });
  }

  return { rows, skipped, headers, delimiter };
}
