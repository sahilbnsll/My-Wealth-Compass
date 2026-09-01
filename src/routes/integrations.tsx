import { createFileRoute } from "@tanstack/react-router";
import { AppShell, Panel } from "@/components/AppShell";
import { dataHealth } from "@/lib/data.functions";
import type { SourceHealth } from "@/lib/data.functions";
import { relativeTime } from "@/lib/finance/format";

export const Route = createFileRoute("/integrations")({
  loader: async () => {
    const health = await dataHealth();
    return { health };
  },
  head: () => ({
    meta: [
      { title: "Sahil's Finance Intelligence — Data Sources & Feeds" },
      { name: "description", content: "Status and freshness of official market data feeds and database connection." },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Sahil's Finance Intelligence — Data Sources & Feeds" },
      { property: "og:description", content: "Status and freshness of official market data feeds and database connection." },
    ],
  }),
  component: IntegrationsPage,
});

const HEALTH_TONE: Record<string, string> = {
  ok: "bg-positive",
  stale: "bg-warning",
  unconfigured: "bg-[color:var(--text-tertiary)]",
  unavailable: "bg-destructive",
};

const HEALTH_LABEL: Record<string, string> = {
  ok: "Healthy",
  stale: "Needs a refresh",
  unconfigured: "Not set up",
  unavailable: "No data yet",
};

function DataHealth({ rows }: { rows: SourceHealth[] }) {
  return (
    <Panel title="Data sources & external feeds" description="Source, provenance and freshness of every number.">
      <ul className="divide-y divide-border-subtle">
        {rows.map((row) => (
          <li key={row.id} className="flex flex-wrap items-start justify-between gap-3 py-4 first:pt-0 last:pb-0">
            <div className="min-w-[240px] flex-1">
              <p className="flex items-center gap-2 text-sm font-medium text-foreground">
                <span className={`h-2 w-2 rounded-full ${HEALTH_TONE[row.status] ?? "bg-border"}`} aria-hidden="true" />
                {row.name}
                <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                  {HEALTH_LABEL[row.status] ?? row.status}
                </span>
              </p>
              <p className="mt-1 text-xs text-muted-foreground">{row.purpose}</p>
            </div>
            <div className="text-right text-xs text-muted-foreground">
              <p className="font-medium text-foreground">
                {row.lastRefresh ? `Refreshed ${relativeTime(row.lastRefresh)}` : "Never refreshed"}
              </p>
              <p className="mt-0.5 text-[11px] text-[color:var(--text-tertiary)]">{row.detail}</p>
            </div>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function IntegrationsPage() {
  const { health } = Route.useLoaderData();

  return (
    <AppShell
      title="Data sources"
      subtitle="Your Postgres database is the single source of truth. External feeds provide market valuation context."
    >
      <DataHealth rows={health} />

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Panel title="Market data architecture" description="How prices and indices reach your workspace.">
          <ul className="space-y-4 text-xs text-muted-foreground">
            <li>
              <strong className="text-foreground">AMFI Mutual Fund NAVs:</strong> Daily official NAV file published by AMFI India. Updated each evening after market close.
            </li>
            <li>
              <strong className="text-foreground">NSE / BSE Stock & ETF Quotes:</strong> 15-minute delayed market quotes via Yahoo Finance API with automatic ISIN and symbol resolution.
            </li>
            <li>
              <strong className="text-foreground">DBnomics Macro Series:</strong> Official Indian CPI inflation series and Reserve Bank of India (RBI) policy repo rate.
            </li>
            <li>
              <strong className="text-foreground">Currency & Commodities:</strong> Real-time USD/INR foreign exchange rate and gold/silver spot pricing.
            </li>
          </ul>
        </Panel>

        <Panel title="Data sovereignty" description="Private, durable, self-hosted.">
          <p className="text-xs leading-relaxed text-muted-foreground">
            All your holdings, planned contributions, goals, assumptions, and daily historical snapshots reside in your own private Supabase Postgres database. No third-party data aggregator or external cloud document workspace has access to your private ledger.
          </p>
        </Panel>
      </div>
    </AppShell>
  );
}
