/**
 * Valuation is expressed twice: in TypeScript (`valueHolding`) for the app and
 * in SQL (`capture_portfolio_snapshot`) for the scheduled snapshot job. The
 * duplication is unavoidable, so these tests assert the two definitions agree.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { valueHolding } from "../portfolio";
import { UNIT_PRICED, type Holding, type InstrumentType } from "../types";

const MIGRATIONS_DIR = join(process.cwd(), "supabase", "migrations");

/** The most recent definition of the snapshot function wins, as in the database. */
function latestSnapshotFunctionSql(): string {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  let latest: string | null = null;
  for (const f of files) {
    const sql = readFileSync(join(MIGRATIONS_DIR, f), "utf8");
    if (sql.includes("capture_portfolio_snapshot")) latest = sql;
  }
  if (!latest) throw new Error("No migration defines capture_portfolio_snapshot");
  return latest;
}

/** Every `instrument_type IN (...)` list used by the SQL valuation branches. */
function sqlUnitPricedLists(sql: string): string[][] {
  const matches = [...sql.matchAll(/instrument_type\s+IN\s*\(([^)]*)\)/gi)];
  return matches.map((m) =>
    (m[1] ?? "")
      .split(",")
      .map((s) => s.trim().replace(/^'|'$/g, ""))
      .filter(Boolean),
  );
}

function holding(over: Partial<Holding>): Holding {
  return {
    id: "h",
    asset_class: "equity",
    instrument_type: "stock",
    name: "X",
    symbol: null,
    isin: null,
    category: null,
    quantity: null,
    avg_price: null,
    current_price: null,
    current_value: null,
    price_source: "manual",
    price_updated_at: null,
    purchase_date: null,
    maturity_date: null,
    interest_rate: null,
    cost_basis: null,
    target_allocation_pct: null,
    tax_treatment: null,
    liquidity: null,
    sector: null,
    cap_segment: null,
    geography: "india",
    is_demo: false,
    notes: null,
    ...over,
  } as Holding;
}

/** Mirror of the SQL CASE expressions, evaluated in JS for row-level comparison. */
function sqlValue(h: Holding, unitPriced: Set<string>): { value: number; invested: number } {
  const isUnit = unitPriced.has(h.instrument_type);
  const value = isUnit ? (h.quantity ?? 0) * (h.current_price ?? 0) : (h.current_value ?? 0);
  const invested =
    h.cost_basis ?? (isUnit ? (h.quantity ?? 0) * (h.avg_price ?? 0) : (h.current_value ?? 0));
  return { value, invested };
}

describe("TypeScript / SQL valuation parity", () => {
  const sql = latestSnapshotFunctionSql();
  const lists = sqlUnitPricedLists(sql);

  it("the SQL function classifies unit-priced instruments consistently", () => {
    expect(lists.length).toBeGreaterThan(0);
    for (const list of lists) expect([...list].sort()).toEqual([...(lists[0] ?? [])].sort());
  });

  it("the SQL unit-priced list matches UNIT_PRICED in TypeScript", () => {
    expect([...(lists[0] ?? [])].sort()).toEqual([...UNIT_PRICED].sort());
  });

  it("produces identical value and cost basis for representative rows", () => {
    const unitPriced = new Set(lists[0] ?? []);
    const rows: Holding[] = [
      holding({ instrument_type: "stock", quantity: 100, current_price: 250, avg_price: 180 }),
      holding({ instrument_type: "mutual_fund", quantity: 512.34, current_price: 91.2, avg_price: 70 }),
      holding({ instrument_type: "gold", quantity: 20, current_price: 7300, cost_basis: 120000 }),
      holding({ instrument_type: "fd", current_value: 500000, asset_class: "debt" }),
      holding({ instrument_type: "epf", current_value: 100100, cost_basis: 50570, asset_class: "debt" }),
      holding({ instrument_type: "cash", current_value: 250000, asset_class: "cash" }),
      // Missing inputs must degrade the same way on both sides.
      holding({ instrument_type: "stock" }),
      holding({ instrument_type: "ppf", asset_class: "debt" }),
    ];

    for (const row of rows) {
      const ts = valueHolding(row);
      const pg = sqlValue(row, unitPriced);
      expect({ value: ts.value, invested: ts.invested }).toEqual(pg);
    }
  });

  it("covers every instrument type the app can store", () => {
    const unitPriced = new Set(lists[0] ?? []);
    const all: InstrumentType[] = [
      "stock",
      "etf",
      "mutual_fund",
      "gold",
      "silver",
      "bond",
      "fd",
      "ppf",
      "epf",
      "nps",
      "cash",
      "other",
    ];
    for (const t of all) {
      const row = holding({ instrument_type: t, quantity: 3, current_price: 11, current_value: 900 });
      expect(valueHolding(row).value).toBe(sqlValue(row, unitPriced).value);
    }
  });
});
