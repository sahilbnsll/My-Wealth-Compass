/**
 * Import reconciliation.
 *
 * Nothing an importer parses is written directly. Every parsed row is first
 * matched against what is already stored, classified, and given a confidence
 * so the user can accept, edit or skip it. Matching is deterministic — ISIN,
 * then symbol, then a normalised name — and anything ambiguous is reported as
 * a conflict rather than guessed at.
 */
import type { ParsedHolding } from "./csv";
import type { ParsedTransaction } from "./transactions";

export type MatchBasis = "isin" | "symbol" | "name" | "external_id" | "signature" | "none";
export type RowStatus = "new" | "updated" | "unchanged" | "conflict";
export type Confidence = "high" | "medium" | "review";

export type FieldChange = { field: string; from: number | string | null; to: number | string | null };

export type ReconciledHolding = {
  index: number;
  row: ParsedHolding;
  status: RowStatus;
  confidence: Confidence;
  matchedId: string | null;
  matchedBy: MatchBasis;
  matchedName: string | null;
  changes: FieldChange[];
  reason: string | null;
};

export type ExistingHolding = {
  id: string;
  name: string;
  symbol: string | null;
  isin: string | null;
  quantity: number | null;
  avg_price: number | null;
  current_price: number | null;
  current_value: number | null;
};

export const normaliseName = (s: string) =>
  s
    .toLowerCase()
    .replace(/\b(direct|regular)\b/g, "")
    .replace(/\b(plan|growth|option|scheme|fund)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const near = (a: number | null, b: number | null) => {
  if (a === null && b === null) return true;
  if (a === null || b === null) return false;
  const scale = Math.max(Math.abs(a), Math.abs(b), 1);
  return Math.abs(a - b) / scale < 0.0005;
};

function diffHolding(row: ParsedHolding, existing: ExistingHolding): FieldChange[] {
  const fields: { field: string; label: string; next: number | null; prev: number | null }[] = [
    { field: "quantity", label: "Quantity", next: row.quantity, prev: existing.quantity },
    { field: "avg_price", label: "Average price", next: row.avg_price, prev: existing.avg_price },
    { field: "current_price", label: "Current price", next: row.current_price, prev: existing.current_price },
    { field: "current_value", label: "Value", next: row.current_value, prev: existing.current_value },
  ];
  const out: FieldChange[] = [];
  for (const f of fields) {
    if (f.next === null) continue;
    if (!near(f.next, f.prev)) out.push({ field: f.label, from: f.prev, to: f.next });
  }
  return out;
}

/** Classify every parsed holding against the stored portfolio. */
export function reconcileHoldings(rows: ParsedHolding[], existing: ExistingHolding[]): ReconciledHolding[] {
  const byIsin = new Map<string, ExistingHolding[]>();
  const bySymbol = new Map<string, ExistingHolding[]>();
  const byName = new Map<string, ExistingHolding[]>();
  const push = (map: Map<string, ExistingHolding[]>, key: string, h: ExistingHolding) => {
    const list = map.get(key) ?? [];
    list.push(h);
    map.set(key, list);
  };
  for (const h of existing) {
    if (h.isin) push(byIsin, h.isin.toUpperCase(), h);
    if (h.symbol) push(bySymbol, h.symbol.toUpperCase(), h);
    push(byName, normaliseName(h.name), h);
  }

  const seen = new Map<string, number>();

  return rows.map((row, index) => {
    const candidates: { list: ExistingHolding[]; basis: MatchBasis; confidence: Confidence } | null =
      (row.isin && byIsin.has(row.isin.toUpperCase())
        ? { list: byIsin.get(row.isin.toUpperCase())!, basis: "isin" as const, confidence: "high" as const }
        : null) ??
      (row.symbol && bySymbol.has(row.symbol.toUpperCase())
        ? { list: bySymbol.get(row.symbol.toUpperCase())!, basis: "symbol" as const, confidence: "high" as const }
        : null) ??
      (byName.has(normaliseName(row.name))
        ? { list: byName.get(normaliseName(row.name))!, basis: "name" as const, confidence: "medium" as const }
        : null);

    const base = {
      index,
      row,
      matchedId: null as string | null,
      matchedBy: "none" as MatchBasis,
      matchedName: null as string | null,
      changes: [] as FieldChange[],
      reason: null as string | null,
    };

    // Duplicate rows inside the same file are a review case, not a silent overwrite.
    const dupKey = (row.isin ?? row.symbol ?? normaliseName(row.name)).toUpperCase();
    const firstSeen = seen.get(dupKey);
    seen.set(dupKey, index);
    if (firstSeen !== undefined) {
      return {
        ...base,
        status: "conflict",
        confidence: "review",
        reason: `The same instrument appears earlier in this file (row ${firstSeen + 1}).`,
      };
    }

    if (!candidates) {
      const thin = row.quantity === null && row.current_value === null;
      return {
        ...base,
        status: "new",
        confidence: thin ? "review" : row.isin || row.symbol ? "high" : "medium",
        reason: thin ? "No quantity or value on this row." : null,
      };
    }

    if (candidates.list.length > 1) {
      return {
        ...base,
        status: "conflict",
        confidence: "review",
        matchedBy: candidates.basis,
        reason: `Matches ${candidates.list.length} existing holdings by ${candidates.basis}.`,
      };
    }

    const match = candidates.list[0]!;
    const changes = diffHolding(row, match);
    return {
      ...base,
      status: changes.length === 0 ? "unchanged" : "updated",
      confidence: candidates.confidence,
      matchedId: match.id,
      matchedBy: candidates.basis,
      matchedName: match.name,
      changes,
      reason: candidates.basis === "name" ? "Matched on name only — no ISIN or symbol in this file." : null,
    };
  });
}

/* ------------------------------------------------------------------ *
 * Transactions
 * ------------------------------------------------------------------ */

export type ExistingTransaction = {
  id: string;
  external_id: string | null;
  kind: string;
  trade_date: string;
  name: string;
  amount: number;
  quantity: number | null;
};

export type ReconciledTransaction = {
  index: number;
  row: ParsedTransaction;
  status: RowStatus;
  confidence: Confidence;
  matchedId: string | null;
  matchedBy: MatchBasis;
  reason: string | null;
};

/** Deterministic signature for a transaction: instrument, date, kind and amount. */
export function transactionSignature(tx: {
  name: string;
  kind: string;
  trade_date: string;
  amount: number;
}): string {
  return [normaliseName(tx.name), tx.kind, tx.trade_date, Math.round(Math.abs(tx.amount) * 100)].join("|");
}

export function reconcileTransactions(
  rows: ParsedTransaction[],
  existing: ExistingTransaction[],
): ReconciledTransaction[] {
  const byExternal = new Map(existing.filter((t) => t.external_id).map((t) => [t.external_id!, t]));
  const bySignature = new Map<string, ExistingTransaction[]>();
  for (const t of existing) {
    const sig = transactionSignature(t);
    const list = bySignature.get(sig) ?? [];
    list.push(t);
    bySignature.set(sig, list);
  }

  const seen = new Set<string>();

  return rows.map((row, index) => {
    const base = { index, row, matchedId: null as string | null, matchedBy: "none" as MatchBasis, reason: null };

    if (row.external_id && byExternal.has(row.external_id)) {
      const match = byExternal.get(row.external_id)!;
      return {
        ...base,
        status: "unchanged" as RowStatus,
        confidence: "high" as Confidence,
        matchedId: match.id,
        matchedBy: "external_id" as MatchBasis,
        reason: "Already imported — same broker reference.",
      };
    }

    const sig = transactionSignature(row);
    if (seen.has(sig)) {
      return {
        ...base,
        status: "conflict" as RowStatus,
        confidence: "review" as Confidence,
        reason: "An identical transaction appears earlier in this file.",
      };
    }
    seen.add(sig);

    const existingMatches = bySignature.get(sig) ?? [];
    if (existingMatches.length > 0) {
      return {
        ...base,
        status: "unchanged" as RowStatus,
        confidence: "medium" as Confidence,
        matchedId: existingMatches[0]!.id,
        matchedBy: "signature" as MatchBasis,
        reason: "A transaction with the same instrument, date, type and amount already exists.",
      };
    }

    const thin = row.amount === 0;
    return {
      ...base,
      status: "new" as RowStatus,
      confidence: thin ? ("review" as Confidence) : row.confidence,
      reason: thin ? "No amount could be read for this transaction." : row.reason,
    };
  });
}

export type ReconcileSummary = {
  total: number;
  new: number;
  updated: number;
  unchanged: number;
  conflict: number;
  review: number;
};

export function summariseReconciliation(
  rows: { status: RowStatus; confidence: Confidence }[],
): ReconcileSummary {
  const s: ReconcileSummary = { total: rows.length, new: 0, updated: 0, unchanged: 0, conflict: 0, review: 0 };
  for (const r of rows) {
    s[r.status] += 1;
    if (r.confidence === "review") s.review += 1;
  }
  return s;
}
