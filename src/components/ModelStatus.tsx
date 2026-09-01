import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Activity } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { modelStatus } from "@/lib/data.functions";
import { formatDateIST, relativeTime } from "@/lib/finance/format";

function Row({ label, value, note }: { label: string; value: string; note?: string | undefined }) {
  return (
    <div className="flex items-start justify-between gap-4 py-1.5">
      <span className="text-[12px] text-[color:var(--text-secondary)]">{label}</span>
      <span className="text-right">
        <span className="tabular block text-[12px] text-foreground">{value}</span>
        {note ? <span className="block text-[11px] text-[color:var(--text-tertiary)]">{note}</span> : null}
      </span>
    </div>
  );
}

/** Subtle header pill: when the on-screen model was last recomputed, and on what. */
export function ModelStatus() {
  const [open, setOpen] = useState(false);
  const fetchStatus = useServerFn(modelStatus);
  const { data } = useQuery({
    queryKey: ["model-status"],
    queryFn: () => fetchStatus({}),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const stale = data?.staleSources.length ?? 0;
  const stamp = data?.generatedAt ?? null;

  const ago = (iso: string | null | undefined, fallback = "Never") =>
    iso ? relativeTime(iso) : fallback;
  const on = (iso: string | null | undefined) => (iso ? formatDateIST(iso) : undefined);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Model status and data freshness"
          className="hidden items-center gap-1.5 rounded-full border border-border-subtle bg-surface-2 px-2.5 py-1 text-[11px] text-[color:var(--text-secondary)] transition-colors hover:text-foreground lg:inline-flex"
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${stale > 0 ? "bg-attention" : "bg-positive"}`}
            aria-hidden="true"
          />
          <span className="whitespace-nowrap">
            {stamp ? `Model updated ${relativeTime(stamp)}` : "Model status"}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[320px] p-4">
        <p className="text-[11px] uppercase tracking-[0.1em] text-[color:var(--text-tertiary)]">Model status</p>
        <div className="mt-3 divide-y divide-border-subtle">
          <Row
            label="Portfolio prices"
            value={ago(data?.portfolioPricedAt, "Not priced")}
            note={
              data
                ? `${data.holdingsPriced} of ${data.holdings} holdings priced`
                : undefined
            }
          />
          <Row label="Market data" value={ago(data?.marketRefreshedAt)} note={on(data?.marketRefreshedAt)} />
          <Row label="Macro series" value={ago(data?.macroRefreshedAt)} note={on(data?.macroRefreshedAt)} />
          <Row
            label="Assumptions version"
            value={ago(data?.assumptionsUpdatedAt, "Defaults")}
            note={
              data
                ? `${data.assumptionCount} assumptions · reviewed ${ago(data.assumptionsReviewedAt, "never")}`
                : undefined
            }
          />
          <Row
            label="Tax rules effective"
            value={data ? formatDateIST(data.taxRulesEffectiveFrom) : "—"}
            note="Post-Budget 2024 capital gains regime"
          />
          <Row label="Last snapshot" value={ago(data?.lastSnapshotAt, "None yet")} note={on(data?.lastSnapshotAt)} />
          <Row label="Last calculation" value={ago(stamp, "—")} />
        </div>
        <p className="mt-3 text-[11px] leading-relaxed text-[color:var(--text-secondary)]">
          {stale > 0
            ? `Stale or unavailable: ${data?.staleSources.join(", ")}. Refresh before relying on these figures.`
            : "All sources current. Every figure is computed locally from stored data."}
        </p>
      </PopoverContent>
    </Popover>
  );
}
