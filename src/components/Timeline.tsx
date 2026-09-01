import { useState } from "react";
import { AnimatedNumber } from "@/components/Bits";

export type Milestone = { year: number; label: string };

/**
 * Scrubbable year timeline. Dragging the slider moves through the projection
 * and the three callouts above it animate to that year's figures.
 */
export function YearScrubber({
  years,
  displayValues,
  selectionLabel = "Projection year",
  index,
  onIndexChange,
  milestones = [],
  callouts,
}: {
  years: number[];
  displayValues?: (number | string)[];
  selectionLabel?: string;
  index: number;
  onIndexChange: (i: number) => void;
  milestones?: Milestone[];
  callouts: { label: string; value: number; format: (n: number) => string; tone?: "neutral" | "positive" }[];
}) {
  const [hover, setHover] = useState<string | null>(null);
  const first = years[0] ?? 0;
  const last = years[years.length - 1] ?? first;
  const span = Math.max(1, last - first);
  const current = years[index] ?? first;

  return (
    <div>
      <div className="grid gap-4 sm:grid-cols-3">
        {callouts.map((c) => (
          <div key={c.label} className="card-base px-5 py-4">
            <p className="text-[11px] uppercase tracking-[0.1em] text-[color:var(--text-secondary)]">{c.label}</p>
            <p
              className={`privacy-sensitive mt-2 font-display text-[26px] font-semibold leading-none tracking-tight ${
                c.tone === "positive" ? "text-positive" : "text-foreground"
              }`}
            >
              <AnimatedNumber value={c.value} format={c.format} durationMs={280} />
            </p>
          </div>
        ))}
      </div>

      <div className="mt-6">
        <div className="flex items-baseline justify-between text-[12px] text-[color:var(--text-secondary)]">
          <span>{displayValues?.[0] ?? first}</span>
          <span className="tabular font-display text-lg font-semibold text-foreground">
            {selectionLabel}: {displayValues?.[index] ?? current}
          </span>
          <span>{displayValues?.[displayValues.length - 1] ?? last}</span>
        </div>

        <div className="relative mt-2 pb-6">
          <input
            type="range"
            min={0}
            max={Math.max(0, years.length - 1)}
            step={1}
            value={index}
            aria-label="Projection year"
            onChange={(e) => onIndexChange(Number(e.target.value))}
            className="scrubber w-full"
          />
          {/* Milestone dots sit on the track and label themselves on hover. */}
          <div className="pointer-events-none absolute inset-x-0 top-[7px] h-0">
            {milestones
              .filter((m) => m.year >= first && m.year <= last)
              .map((m) => {
                const pct = ((m.year - first) / span) * 100;
                return (
                  <span
                    key={`${m.year}-${m.label}`}
                    className="pointer-events-auto absolute -translate-x-1/2"
                    style={{ left: `${pct}%` }}
                    onMouseEnter={() => setHover(`${m.year}-${m.label}`)}
                    onMouseLeave={() => setHover(null)}
                  >
                    <button
                      type="button"
                      aria-label={`${m.label} (${m.year})`}
                      onClick={() => onIndexChange(Math.round(m.year - first))}
                      className="block h-2 w-2 rounded-full border border-background"
                      style={{ background: "var(--accent-primary)" }}
                    />
                    {hover === `${m.year}-${m.label}` ? (
                      <span className="absolute left-1/2 top-4 z-10 -translate-x-1/2 whitespace-nowrap rounded-md border border-border-subtle bg-popover px-2 py-1 text-[11px] text-foreground shadow-lg">
                        {m.label} · {m.year}
                      </span>
                    ) : null}
                  </span>
                );
              })}
          </div>
        </div>
      </div>
    </div>
  );
}
