import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { AppShell, EmptyState, Panel } from "@/components/AppShell";
import { buttonClass } from "@/components/Bits";
import { loadMacro, refreshMacro, type MacroPointRow } from "@/lib/data.functions";
import { formatDateIST, relativeTime } from "@/lib/finance/format";

export const Route = createFileRoute("/research")({
  loader: () => loadMacro(),
  head: () => ({
    meta: [
      { title: "Sahil's Finance Intelligence — Research" },
      {
        name: "description",
        content:
          "Gold, silver, the rupee, indices, CPI and the repo rate — with sources.",
      },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Sahil's Finance Intelligence — Research" },
      {
        property: "og:description",
        content: "Reference levels, never estimated.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ResearchPage,
});

const GROUPS: { id: string; heading: string; blurb: string; kinds: string[] }[] = [
  {
    id: "metals",
    heading: "Metals and currency",
    blurb: "International spot. Indian physical prices run higher.",
    kinds: ["commodity", "fx"],
  },
  {
    id: "equity",
    heading: "Equity indices",
    blurb: "Index levels and one-year price return.",
    kinds: ["index", "index_return"],
  },
  {
    id: "economy",
    heading: "Economy",
    blurb: "Official series. Watch the publication date.",
    kinds: ["inflation", "policy_rate"],
  },
];

const CONFIDENCE_TONE: Record<string, string> = {
  high: "border-positive/40 text-positive",
  medium: "border-warning/40 text-warning",
  low: "border-destructive/40 text-destructive",
};

function formatValue(row: MacroPointRow): string {
  if (row.kind === "index") return row.value.toLocaleString("en-IN", { maximumFractionDigits: 2 });
  if (row.kind === "commodity" || row.kind === "fx") {
    const symbol = row.currency === "INR" ? "₹" : row.currency === "USD" ? "$" : `${row.currency} `;
    return `${symbol}${row.value.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
  }
  return `${row.value.toFixed(2)}%`;
}

function MetricCard({ row }: { row: MacroPointRow }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="card-base px-5 py-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[12px] uppercase tracking-[0.08em] text-[color:var(--text-secondary)]">
          {row.label ?? row.symbol}
        </p>
        <span
          className={`shrink-0 rounded border px-1.5 py-0.5 text-[10px] uppercase tracking-wide ${
            CONFIDENCE_TONE[row.confidence] ?? "border-border-subtle text-[color:var(--text-tertiary)]"
          }`}
        >
          {row.confidence}
        </span>
      </div>
      <p className="metric-md mt-3 tabular text-foreground">{formatValue(row)}</p>
      <p className="mt-2 text-[12px] text-[color:var(--text-secondary)]">
        As of {row.data_date ? formatDateIST(row.data_date) : "an unpublished date"} · fetched {relativeTime(row.fetched_at)}
      </p>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="mt-3 text-[12px] text-[color:var(--text-tertiary)] underline-offset-4 hover:text-foreground hover:underline"
        aria-expanded={open}
      >
        {open ? "Hide method" : "How this is measured"}
      </button>
      {open ? (
        <div className="mt-2 space-y-1.5 border-t border-border-subtle pt-2 text-[12px] text-[color:var(--text-secondary)]">
          <p>{row.note ?? "No note recorded."}</p>
          <p>
            Source: {row.source}
            {row.source_url ? (
              <>
                {" — "}
                <a className="underline underline-offset-2" href={row.source_url} target="_blank" rel="noreferrer">
                  open
                </a>
              </>
            ) : null}
          </p>
          <p>Type: {row.source_type.replace("_", " ")} · freshness: {row.freshness}</p>
        </div>
      ) : null}
    </div>
  );
}

function ResearchPage() {
  const rows = Route.useLoaderData();
  const router = useRouter();
  const refresh = useServerFn(refreshMacro);
  const [busy, setBusy] = useState(false);
  const [failures, setFailures] = useState<string[]>([]);

  const freshest = rows.reduce<string | null>(
    (acc, r) => (!acc || r.fetched_at > acc ? r.fetched_at : acc),
    null,
  );

  async function run() {
    setBusy(true);
    try {
      const res = await refresh({});
      setFailures(res.failures);
      await router.invalidate();
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell
      title="Research"
      subtitle="The levels behind your assumptions. Missing data is shown as missing."
      actions={
        <div className="flex items-center gap-3">
          <span className="text-[12px] text-[color:var(--text-tertiary)]">
            {freshest ? `Updated ${relativeTime(freshest)}` : "Never fetched"}
          </span>
          <button className={buttonClass} onClick={run} disabled={busy}>
            <RefreshCw className={`mr-2 inline h-3.5 w-3.5 ${busy ? "animate-spin" : ""}`} strokeWidth={1.75} />
            {busy ? "Refreshing…" : "Refresh data"}
          </button>
        </div>
      }
    >
      {failures.length > 0 ? (
        <div className="mb-6 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-[12px] text-foreground">
          Unavailable this refresh: {failures.join(", ")}. Previously stored values are kept and marked with their own date.
        </div>
      ) : null}

      {rows.length === 0 ? (
        <EmptyState
          title="No market data yet"
          detail="Refresh to pull metals, currency, indices, CPI and the repo rate."
          action={
            <button className={buttonClass} onClick={run} disabled={busy}>
              {busy ? "Refreshing…" : "Fetch market data"}
            </button>
          }
        />
      ) : (
        <div className="space-y-6">
          {GROUPS.map((group) => {
            const items = rows.filter((r) => group.kinds.includes(r.kind));
            return (
              <Panel key={group.id} title={group.heading} description={group.blurb}>
                {items.length === 0 ? (
                  <p className="text-[12px] text-[color:var(--text-secondary)]">
                    Unavailable — this group has not been fetched, or the provider did not return data.
                  </p>
                ) : (
                  <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    {items.map((row) => (
                      <MetricCard key={row.symbol} row={row} />
                    ))}
                  </div>
                )}
              </Panel>
            );
          })}
        </div>
      )}
    </AppShell>
  );
}
