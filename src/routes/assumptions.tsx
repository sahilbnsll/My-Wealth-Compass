import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { Check } from "lucide-react";
import { parsePercentInput } from "@/lib/finance/percent";
import { AppShell, Panel } from "@/components/AppShell";
import { Figure, buttonClass, ghostButtonClass, inputClass } from "@/components/Bits";
import { loadWorkspace, markAssumptionReviewed, saveAssumption } from "@/lib/data.functions";
import { formatPct, relativeTime } from "@/lib/finance/format";
import type { ScenarioName } from "@/lib/finance/types";

export const Route = createFileRoute("/assumptions")({
  loader: () => loadWorkspace(),
  head: () => ({
    meta: [
      { title: "Sahil's Finance Intelligence — Assumptions" },
      {
        name: "description",
        content:
          "Every planning number in one place, with why and when you set it.",
      },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Sahil's Finance Intelligence — Assumptions" },
      {
        property: "og:description",
        content: "The numbers every projection depends on.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AssumptionsPage,
});

const SCENARIOS: ScenarioName[] = ["conservative", "base", "optimistic"];

const KEY_META: Record<string, { label: string; meaning: string; sanity: [number, number] }> = {
  equity_return: {
    label: "Equity return",
    meaning: "Nominal annual return on the equity sleeve, before tax and before inflation.",
    sanity: [4, 16],
  },
  debt_return: {
    label: "Debt return",
    meaning: "Nominal annual return on debt funds, deposits and bonds.",
    sanity: [3, 10],
  },
  gold_return: {
    label: "Gold return",
    meaning: "Nominal annual return on gold, in rupees, so it carries currency movement too.",
    sanity: [2, 12],
  },
  cash_return: {
    label: "Cash return",
    meaning: "Rate earned on the liquid sleeve held for emergencies.",
    sanity: [2, 8],
  },
  inflation: {
    label: "Inflation",
    meaning: "Rate used to convert future rupees to today's money and to inflate goal costs.",
    sanity: [3, 9],
  },
  sip_step_up: {
    label: "SIP step-up",
    meaning: "Annual increase applied to recurring contributions, usually tracking salary growth.",
    sanity: [0, 20],
  },
};

const STALE_AFTER_DAYS = 180;

function daysSince(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return Math.floor((Date.now() - t) / 86_400_000);
}

function AssumptionsPage() {
  const { assumptionRows } = Route.useLoaderData();
  const router = useRouter();
  const save = useServerFn(saveAssumption);
  const stamp = useServerFn(markAssumptionReviewed);

  const [edits, setEdits] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const grouped = useMemo(() => {
    return Object.keys(KEY_META).map((key) => ({
      key,
      meta: KEY_META[key]!,
      rows: SCENARIOS.map((scenario) => assumptionRows.find((r) => r.key === key && r.scenario === scenario) ?? null),
    }));
  }, [assumptionRows]);

  const reviewAges = assumptionRows.map((r) => daysSince(r.reviewed_at ?? r.updated_at));
  const stale = reviewAges.filter((d) => d === null || d > STALE_AFTER_DAYS).length;
  const lastReview = assumptionRows.reduce<string | null>((acc, r) => {
    const v = r.reviewed_at ?? r.updated_at ?? null;
    return v && (!acc || v > acc) ? v : acc;
  }, null);

  const spread = (() => {
    const c = assumptionRows.find((r) => r.key === "equity_return" && r.scenario === "conservative")?.value;
    const o = assumptionRows.find((r) => r.key === "equity_return" && r.scenario === "optimistic")?.value;
    return c !== undefined && o !== undefined ? o - c : null;
  })();

  const dirty = Object.keys(edits).length > 0;

  async function commit() {
    setBusy(true);
    try {
      for (const [id, raw] of Object.entries(edits)) {
        const [key, scenario] = id.split("|") as [string, ScenarioName];
        const parsed = parsePercentInput(raw, { min: -100, max: 100 });
        if (!parsed.ok) continue;
        const value = parsed.value;

        await save({ data: { key, scenario, value } });
        await stamp({ data: { key, scenario } });
      }
      setEdits({});
      await router.invalidate();
    } finally {
      setBusy(false);
    }
  }

  async function reviewAll(key: string) {
    setBusy(true);
    try {
      for (const scenario of SCENARIOS) await stamp({ data: { key, scenario } });
      await router.invalidate();
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell
      title="Assumptions"
      subtitle="Every projection resolves to these six numbers."
      actions={
        dirty ? (
          <div className="flex items-center gap-3">
            <span className="text-[12px] text-[color:var(--text-tertiary)]">
              {Object.keys(edits).length} unsaved
            </span>
            <button className={ghostButtonClass} onClick={() => setEdits({})} disabled={busy}>
              Discard
            </button>
            <button className={buttonClass} onClick={commit} disabled={busy}>
              {busy ? "Saving…" : "Save changes"}
            </button>
          </div>
        ) : null
      }
    >
      <dl className="grid gap-x-10 gap-y-6 border-b border-border-subtle pb-8 sm:grid-cols-3">
        <Figure
          label="Assumptions tracked"
          value={String(assumptionRows.length)}
          note={`${Object.keys(KEY_META).length} drivers across three scenarios`}
          sensitive={false}
        />
        <Figure
          label="Overdue a review"
          value={String(stale)}
          tone={stale > 0 ? "negative" : "positive"}
          note={`Anything untouched for ${STALE_AFTER_DAYS} days is flagged`}
          sensitive={false}
        />
        <Figure
          label="Scenario spread on equity"
          value={spread !== null ? `${formatPct(spread)} wide` : "—"}
          note={lastReview ? `Last reviewed ${relativeTime(lastReview)}` : "Never reviewed"}
          sensitive={false}
        />
      </dl>

      <div className="mt-8 space-y-5">
        {grouped.map(({ key, meta, rows }) => {
          const age = daysSince(rows.find((r) => r?.reviewed_at ?? r?.updated_at)?.reviewed_at ?? rows[1]?.updated_at);
          const isStale = age === null || age > STALE_AFTER_DAYS;
          return (
            <Panel
              key={key}
              title={meta.label}
              description={meta.meaning}
              actions={
                <div className="flex items-center gap-3">
                  <span className={`text-[12px] ${isStale ? "text-warning" : "text-[color:var(--text-tertiary)]"}`}>
                    {age === null ? "Never reviewed" : `Reviewed ${age} day${age === 1 ? "" : "s"} ago`}
                  </span>
                  <button
                    className="inline-flex items-center gap-1.5 rounded-md border border-border-subtle px-2.5 py-1.5 text-[12px] text-[color:var(--text-secondary)] transition-colors hover:text-foreground"
                    onClick={() => reviewAll(key)}
                    disabled={busy}
                  >
                    <Check className="h-3.5 w-3.5" strokeWidth={1.75} />
                    Still right
                  </button>
                </div>
              }
            >
              <div className="grid gap-6 sm:grid-cols-3">
                {SCENARIOS.map((scenario, i) => {
                  const row = rows[i];
                  const id = `${key}|${scenario}`;
                  const value = edits[id] ?? (row ? String(row.value) : "");
                  const parsed = value.trim() === "" ? null : parsePercentInput(value, { min: -100, max: 100 });
                  const parseError = parsed && !parsed.ok ? parsed.error : null;
                  const numeric = parsed && parsed.ok ? parsed.value : Number.NaN;
                  const [lo, hi] = meta.sanity;
                  const outOfRange = Number.isFinite(numeric) && (numeric < lo || numeric > hi);
                  return (
                    <div key={scenario}>
                      <label className="block">
                        <span className="text-[11px] uppercase tracking-[0.1em] text-[color:var(--text-tertiary)]">
                          {scenario}
                        </span>
                        <div className="relative mt-2">
                          <input
                            className={`${inputClass} pr-8`}
                            inputMode="decimal"
                            placeholder={`e.g. ${lo}`}
                            aria-invalid={parseError ? true : undefined}
                            value={value}
                            onChange={(e) => setEdits((prev) => ({ ...prev, [id]: e.target.value }))}
                          />
                          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[13px] text-[color:var(--text-tertiary)]">
                            %
                          </span>
                        </div>
                      </label>
                      {parseError ? (
                        <p className="mt-1.5 text-[12px] text-destructive">{parseError}</p>
                      ) : null}
                      {outOfRange ? (
                        <p className="mt-1.5 text-[12px] text-warning">
                          Outside the defensible {lo}–{hi}% range. It will still be used exactly as entered.
                        </p>
                      ) : (
                        <p className="mt-1.5 text-[12px] text-[color:var(--text-secondary)]">
                          {row?.rationale ?? "No reason recorded."}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
              <p className="mt-5 border-t border-border-subtle pt-3 text-[12px] text-[color:var(--text-tertiary)]">
                Source: {rows.find((r) => r?.source)?.source ?? "User-configurable planning assumption"}
              </p>
            </Panel>
          );
        })}
      </div>
    </AppShell>
  );
}
