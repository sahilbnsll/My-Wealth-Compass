import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { RefreshCw, Trash2 } from "lucide-react";
import { AppShell, EmptyState, Panel } from "@/components/AppShell";
import { FinancialAmountInput, Segmented } from "@/components/Wizard";
import { Figure, ProvenanceBadge, buttonClass, ghostButtonClass, inputClass } from "@/components/Bits";
import { InstrumentSearch } from "@/components/InstrumentSearch";
import {
  deleteWatchItem,
  loadWatchlist,
  refreshWatchlist,
  saveWatchItem,
  type WatchlistRow,
} from "@/lib/data.functions";
import { formatDateIST, formatPct, formatRupees, relativeTime } from "@/lib/finance/format";
import type { AssetClass } from "@/lib/finance/types";

export const Route = createFileRoute("/watchlist")({
  loader: () => loadWatchlist(),
  head: () => ({
    meta: [
      { title: "Sahil's Finance Intelligence — Watchlist" },
      {
        name: "description",
        content:
          "What you are watching, priced from the same feeds as your portfolio.",
      },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Sahil's Finance Intelligence — Watchlist" },
      {
        property: "og:description",
        content: "Candidates tracked against your buy level.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: WatchlistPage,
});

const ASSET_CLASSES: AssetClass[] = ["equity", "debt", "gold", "cash", "other"];

function moveSinceReference(row: WatchlistRow): number | null {
  if (row.last_price === null || !row.reference_price) return null;
  return ((row.last_price - row.reference_price) / row.reference_price) * 100;
}

function WatchlistPage() {
  const rows = Route.useLoaderData();
  const router = useRouter();
  const save = useServerFn(saveWatchItem);
  const remove = useServerFn(deleteWatchItem);
  const refresh = useServerFn(refreshWatchlist);

  const [busy, setBusy] = useState(false);
  const [unmatched, setUnmatched] = useState<string[]>([]);
  const [draft, setDraft] = useState<Partial<WatchlistRow> | null>(null);

  const priced = rows.filter((r) => r.last_price !== null);
  const atOrBelowTarget = rows.filter(
    (r) => r.target_buy_price !== null && r.last_price !== null && r.last_price <= r.target_buy_price,
  );
  const freshest = rows.reduce<string | null>(
    (acc, r) => (r.price_updated_at && (!acc || r.price_updated_at > acc) ? r.price_updated_at : acc),
    null,
  );

  async function run() {
    setBusy(true);
    try {
      const res = await refresh({});
      setUnmatched(res.unmatched);
      await router.invalidate();
    } finally {
      setBusy(false);
    }
  }

  async function commit() {
    if (!draft?.name) return;
    setBusy(true);
    try {
      await save({ data: { ...draft, name: draft.name } as WatchlistRow });
      setDraft(null);
      await router.invalidate();
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell
      title="Watchlist"
      subtitle="Ideas you do not own yet, priced like your holdings."
      actions={
        <div className="flex items-center gap-3">
          <span className="hidden text-[12px] text-[color:var(--text-tertiary)] sm:inline">
            {freshest ? `Priced ${relativeTime(freshest)}` : "Never priced"}
          </span>
          <button className={ghostButtonClass} onClick={run} disabled={busy || rows.length === 0}>
            <RefreshCw className={`h-3.5 w-3.5 ${busy ? "animate-spin" : ""}`} strokeWidth={1.75} />
            Refresh prices
          </button>
          <button className={buttonClass} onClick={() => setDraft({ asset_class: "equity" })}>
            Add instrument
          </button>
        </div>
      }
    >
      {unmatched.length > 0 ? (
        <div className="mb-6 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-[12px] text-foreground">
          No price returned for {unmatched.join(", ")}. Those rows keep their last figure and its date.
        </div>
      ) : null}

      {draft ? (
        <Panel
          title="Add to the watchlist"
          description="Pick a result and pricing works automatically."
          className="mb-8"
        >
          <div className="space-y-5">
            <InstrumentSearch
              autoFocus
              onPick={(hit) =>
                setDraft((d) => ({
                  ...d,
                  name: hit.name,
                  symbol: hit.kind === "mutual_fund" ? null : hit.symbol,
                  scheme_code: hit.kind === "mutual_fund" ? hit.symbol : null,
                  isin: hit.isin,
                  instrument_type: hit.kind,
                  asset_class: hit.kind === "mutual_fund" ? "equity" : "equity",
                  last_price: hit.price,
                  reference_price: hit.price,
                  quote_source: hit.source,
                }))
              }
            />

            {draft.name ? (
              <div className="rounded-md border border-border-subtle bg-surface-2 px-4 py-3">
                <p className="text-sm text-foreground">{draft.name}</p>
                <p className="mt-1 text-[12px] text-[color:var(--text-secondary)]">
                  {[draft.symbol, draft.scheme_code, draft.isin].filter(Boolean).join(" · ") || "No identifier"}
                  {draft.last_price ? ` · ₹${draft.last_price}` : " · price on next refresh"}
                </p>
              </div>
            ) : null}

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="block">
                <span className="text-[13px] font-medium text-foreground">Asset class</span>
                <div className="mt-1.5">
                  <Segmented
                    ariaLabel="Asset class"
                    value={draft.asset_class ?? "equity"}
                    onChange={(c) => setDraft((d) => (d ? { ...d, asset_class: c as AssetClass } : d))}
                    options={ASSET_CLASSES.map((c) => ({ value: c, label: c }))}
                  />
                </div>
              </div>
              <div className="block">
                <span className="text-[13px] font-medium text-foreground">Buy below</span>
                <div className="mt-1.5">
                  <FinancialAmountInput
                    value={draft.target_buy_price ?? null}
                    onChange={(v) => setDraft((d) => (d ? { ...d, target_buy_price: v } : d))}
                    placeholder="Optional — e.g. ₹1,250"
                  />
                </div>
              </div>
              <label className="block sm:col-span-1">
                <span className="text-[13px] font-medium text-foreground">Why you are watching it</span>
                <input
                  className={`${inputClass} mt-1.5`}
                  value={draft.thesis ?? ""}
                  onChange={(e) => setDraft((d) => ({ ...d, thesis: e.target.value }))}
                  placeholder="e.g. Cheap vs history, waiting for a dip"
                />
              </label>
            </div>

            <div className="flex gap-2">
              <button className={buttonClass} onClick={commit} disabled={!draft.name || busy}>
                Add to watchlist
              </button>
              <button className={ghostButtonClass} onClick={() => setDraft(null)}>
                Cancel
              </button>
            </div>
          </div>
        </Panel>
      ) : null}

      {rows.length === 0 ? (
        <EmptyState
          title="Nothing on the watchlist"
          detail="Nothing to re-enter when you buy."
          action={
            <button className={buttonClass} onClick={() => setDraft({ asset_class: "equity" })}>
              Add the first instrument
            </button>
          }
        />
      ) : (
        <>
          <dl className="grid gap-x-10 gap-y-6 border-b border-border-subtle pb-8 sm:grid-cols-3">
            <Figure label="Tracked" value={String(rows.length)} note={`${priced.length} carry a live price`} sensitive={false} />
            <Figure
              label="At or below your buy level"
              value={String(atOrBelowTarget.length)}
              tone={atOrBelowTarget.length > 0 ? "positive" : "neutral"}
              note={
                atOrBelowTarget.length > 0
                  ? atOrBelowTarget.map((r) => r.name).slice(0, 2).join(", ")
                  : "No candidate has reached its level"
              }
              sensitive={false}
            />
            <Figure
              label="Last priced"
              value={freshest ? relativeTime(freshest) : "—"}
              note="Refresh pulls AMFI NAVs and market quotes"
              sensitive={false}
            />
          </dl>

          <ul className="mt-2 divide-y divide-[color:var(--border-subtle)]">
            {rows.map((row) => {
              const move = moveSinceReference(row);
              const hit =
                row.target_buy_price !== null && row.last_price !== null && row.last_price <= row.target_buy_price;
              return (
                <li key={row.id} className="row-hover -mx-3 rounded-md px-3 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-sm text-foreground">{row.name}</p>
                        <ProvenanceBadge
                          kind={row.last_price === null ? "manual" : row.price_updated_at ? "current" : "manual"}
                          note={row.quote_source ?? "No price feed yet"}
                        />
                        {hit ? (
                          <span className="rounded-sm border border-positive/40 px-1.5 py-0.5 text-[10px] uppercase tracking-[0.08em] text-positive">
                            At your level
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-1 text-[12px] text-[color:var(--text-secondary)]">
                        {[row.symbol ?? row.scheme_code, row.asset_class, row.thesis].filter(Boolean).join(" · ")}
                      </p>
                    </div>

                    <div className="flex items-center gap-6">
                      <div className="text-right">
                        <p className="tabular text-sm text-foreground">
                          {row.last_price !== null ? formatRupees(row.last_price, 2) : "Unpriced"}
                        </p>
                        <p className="text-[12px] text-[color:var(--text-tertiary)]">
                          {row.price_updated_at ? relativeTime(row.price_updated_at) : "Refresh to price"}
                        </p>
                      </div>
                      <div className="hidden text-right sm:block">
                        <p
                          className={`tabular text-sm ${
                            move === null ? "text-[color:var(--text-tertiary)]" : move >= 0 ? "text-positive" : "text-destructive"
                          }`}
                        >
                          {move === null ? "—" : `${move >= 0 ? "+" : "−"}${formatPct(Math.abs(move))}`}
                        </p>
                        <p className="text-[12px] text-[color:var(--text-tertiary)]">
                          {row.reference_set_on ? `since ${formatDateIST(row.reference_set_on)}` : "no reference"}
                        </p>
                      </div>
                      <div className="hidden text-right md:block">
                        <p className="tabular text-sm text-[color:var(--text-secondary)]">
                          {row.target_buy_price !== null ? formatRupees(row.target_buy_price, 2) : "—"}
                        </p>
                        <p className="text-[12px] text-[color:var(--text-tertiary)]">buy below</p>
                      </div>
                      <button
                        aria-label={`Remove ${row.name}`}
                        className="text-[color:var(--text-tertiary)] transition-colors hover:text-destructive"
                        onClick={async () => {
                          await remove({ data: { id: row.id } });
                          await router.invalidate();
                        }}
                      >
                        <Trash2 className="h-4 w-4" strokeWidth={1.75} />
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </AppShell>
  );
}
