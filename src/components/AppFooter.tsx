import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { dataHealth, type SourceHealth } from "@/lib/data.functions";

const LINKS = [
  { to: "/methodology", label: "Methodology" },
  { to: "/privacy", label: "Privacy" },
  { to: "/integrations", label: "Data sources" },
  { to: "/disclaimer", label: "Disclaimer" },
] as const;

/** Small, honest freshness indicator driven by the same health check as Integrations. */
function FreshnessBadge() {
  const load = useServerFn(dataHealth);
  const [rows, setRows] = useState<SourceHealth[] | null>(null);

  useEffect(() => {
    let alive = true;
    load()
      .then((r) => {
        if (alive) setRows(r);
      })
      .catch(() => {
        if (alive) setRows([]);
      });
    return () => {
      alive = false;
    };
  }, [load]);

  if (!rows) {
    return <span className="text-[color:var(--text-tertiary)]">Checking data…</span>;
  }

  const tracked = rows.filter((r) => r.status !== "unconfigured");
  const degraded = tracked.filter((r) => r.status === "stale" || r.status === "unavailable");
  const ok = degraded.length === 0 && tracked.length > 0;
  const label = tracked.length === 0
    ? "No live sources configured"
    : ok
      ? "Data current"
      : `${degraded.length} source${degraded.length === 1 ? "" : "s"} stale`;

  return (
    <Link
      to="/integrations"
      title={degraded.map((d) => `${d.name}: ${d.detail}`).join("\n") || "All configured feeds are fresh."}
      className="inline-flex items-center gap-1.5 transition-colors duration-150 hover:text-foreground"
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${ok ? "bg-positive" : tracked.length === 0 ? "bg-[color:var(--text-tertiary)]" : "bg-attention"}`}
        aria-hidden="true"
      />
      {label}
    </Link>
  );
}

export function AppFooter() {
  return (
    <footer className="app-container page-gutter border-t border-border-subtle py-8 text-[12px] text-[color:var(--text-tertiary)]">
      <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0">
          <p className="font-display text-[13px] font-semibold tracking-tight text-foreground">
            Sahil's Finance Intelligence
          </p>
          <p className="mt-1 tracking-[0.02em]">Personal Investment Intelligence</p>
        </div>

        <div className="flex flex-col gap-3 md:items-end">
          <nav aria-label="Footer" className="flex flex-wrap items-center gap-x-4 gap-y-2">
            {LINKS.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                className="transition-colors duration-150 hover:text-foreground"
              >
                {link.label}
              </Link>
            ))}
          </nav>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <FreshnessBadge />
            <span>Modelled, not financial advice</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
