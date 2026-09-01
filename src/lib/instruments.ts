/**
 * Client-safe types for the universal instrument lookup.
 * The resolver itself lives in instruments.server.ts.
 */

export type InstrumentKind = "mutual_fund" | "stock" | "etf";

export type InstrumentHit =
  | {
      kind: "mutual_fund";
      id: string;
      name: string;
      symbol: string;
      isin: string | null;
      price: number;
      priceLabel: string;
      source: "amfi_nav";
      asOf: string;
    }
  | {
      kind: "stock" | "etf";
      id: string;
      name: string;
      symbol: string;
      isin: null;
      price: null;
      priceLabel: string;
      source: "yahoo_quote";
      asOf: null;
    };

export type ResolvedInstrument = {
  name: string;
  symbol: string;
  isin: string | null;
  type: InstrumentKind;
  assetClass: "equity" | "debt" | "gold" | "cash" | "other";
  /** NAV for funds, last traded price for listings. Null when no feed answered. */
  price: number | null;
  priceKind: "nav" | "price";
  currency: string;
  source: "amfi_nav" | "yahoo_quote" | "none";
  sourceLabel: string;
  asOf: string | null;
};
