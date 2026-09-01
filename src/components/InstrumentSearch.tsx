import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { resolveInstrument, searchInstruments, type InstrumentHit } from "@/lib/data.functions";
import type { ResolvedInstrument } from "@/lib/instruments";
import { wizardInputClass } from "@/components/Wizard";

/**
 * Universal instrument lookup field.
 *
 * One box across AMFI mutual funds and NSE/BSE listings. Keyboard navigable,
 * debounced, and honest about provenance: every row shows where its figure
 * came from, and symbol rows show no price at all until one is fetched.
 */
export function InstrumentSearch({
  kinds,
  placeholder = "Search funds, stocks or ETFs…",
  onPick,
  onResolve,
  autoFocus,
}: {
  kinds?: Array<"mutual_fund" | "stock" | "etf">;
  placeholder?: string;
  onPick: (hit: InstrumentHit) => void;
  /** Fires once the shared resolver has normalised the pick (price, ISIN, class). */
  onResolve?: (resolved: ResolvedInstrument) => void;
  autoFocus?: boolean;
}) {
  const search = useServerFn(searchInstruments);
  const resolve = useServerFn(resolveInstrument);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<InstrumentHit[]>([]);
  const [busy, setBusy] = useState(false);
  const [active, setActive] = useState(0);
  const listId = useRef(`instr-${Math.random().toString(36).slice(2, 8)}`).current;

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setHits([]);
      setBusy(false);
      return;
    }
    let cancelled = false;
    setBusy(true);
    const timer = setTimeout(() => {
      search({ data: { query: q, ...(kinds ? { kinds } : {}) } })
        .then((rows) => {
          if (cancelled) return;
          setHits(rows);
          setActive(0);
        })
        .catch(() => {
          if (!cancelled) setHits([]);
        })
        .finally(() => {
          if (!cancelled) setBusy(false);
        });
    }, 280);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, kinds?.join(",")]);

  function choose(hit: InstrumentHit) {
    onPick(hit);
    if (onResolve) {
      const key = hit.kind === "mutual_fund" ? hit.symbol : hit.symbol;
      resolve({ data: { query: key } })
        .then((r) => {
          if (r) onResolve(r);
        })
        .catch(() => {
          /* manual entry stays available */
        });
    }
    setQuery("");
    setHits([]);
  }

  return (
    <div>
      <input
        className={wizardInputClass}
        placeholder={placeholder}
        value={query}
        autoFocus={autoFocus}
        role="combobox"
        aria-expanded={hits.length > 0}
        aria-controls={listId}
        aria-autocomplete="list"
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (!hits.length) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((i) => (i + 1) % hits.length);
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((i) => (i - 1 + hits.length) % hits.length);
          } else if (e.key === "Enter") {
            e.preventDefault();
            const hit = hits[active];
            if (hit) choose(hit);
          } else if (e.key === "Escape") {
            setHits([]);
          }
        }}
      />
      {busy ? (
        <p className="mt-1.5 text-[11px] text-[color:var(--text-tertiary)]">Searching AMFI and exchange listings…</p>
      ) : null}
      {!busy && query.trim().length >= 2 && hits.length === 0 ? (
        <p className="mt-1.5 text-[11px] text-[color:var(--text-tertiary)]">
          No match in the official feeds. Type the name manually below.
        </p>
      ) : null}
      {hits.length > 0 ? (
        <ul
          id={listId}
          role="listbox"
          className="mt-2 max-h-56 divide-y divide-[color:var(--border-subtle)] overflow-y-auto rounded-md border border-border-subtle bg-surface-1"
        >
          {hits.map((hit, i) => (
            <li key={hit.id} role="option" aria-selected={i === active}>
              <button
                type="button"
                className={`block w-full px-3 py-2 text-left transition-colors duration-100 hover:bg-surface-2 ${
                  i === active ? "bg-surface-2" : ""
                }`}
                onMouseEnter={() => setActive(i)}
                onClick={() => choose(hit)}
              >
                <span className="flex items-baseline justify-between gap-3">
                  <span className="truncate text-[13px] text-foreground">{hit.name}</span>
                  <span className="shrink-0 text-[10px] uppercase tracking-[0.08em] text-[color:var(--text-tertiary)]">
                    {hit.kind.replace("_", " ")}
                  </span>
                </span>
                <span className="tabular block text-[11px] text-[color:var(--text-tertiary)]">{hit.priceLabel}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
