import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Provenance } from "@/lib/finance/types";
import { formatCompactRupees, formatPct } from "@/lib/finance/format";

const PROVENANCE_LABEL: Record<Provenance, string> = {
  current: "Current",
  historical: "Historical",
  assumption: "Assumption",
  forecast: "Forecast",
  user_input: "You entered",
  manual: "Manual",
  stale: "Stale",
};

/* Badge weighting: teal = live, amber = modelled, grey = inert. */
const PROVENANCE_CLASS: Record<Provenance, string> = {
  current: "border-teal/45 text-teal",
  historical: "border-border-subtle text-[color:var(--text-tertiary)]",
  assumption: "border-primary/40 text-primary",
  forecast: "border-primary/40 text-primary",
  user_input: "border-border-subtle text-[color:var(--text-secondary)]",
  manual: "border-border-subtle text-[color:var(--text-tertiary)]",
  stale: "border-destructive/50 text-destructive",
};

export function ProvenanceBadge({ kind, note }: { kind: Provenance; note?: string }) {
  return (
    <span
      title={note}
      className={`inline-flex items-center rounded-sm border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.08em] ${PROVENANCE_CLASS[kind]}`}
    >
      {PROVENANCE_LABEL[kind]}
    </span>
  );
}

/**
 * Counts up to `value` on first paint and whenever the value changes.
 * `format` keeps the rendering identical to the static formatters.
 */
export function AnimatedNumber({
  value,
  format,
  className = "",
  durationMs = 650,
}: {
  value: number;
  format: (n: number) => string;
  className?: string;
  durationMs?: number;
}) {
  const [display, setDisplay] = useState(value);
  const fromRef = useRef(value);
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    const from = fromRef.current;
    const to = value;
    if (from === to) {
      setDisplay(to);
      return;
    }
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(from + (to - from) * eased);
      if (t < 1) frameRef.current = requestAnimationFrame(tick);
      else fromRef.current = to;
    };
    frameRef.current = requestAnimationFrame(tick);
    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      fromRef.current = to;
    };
  }, [value, durationMs]);

  return <span className={`tabular ${className}`}>{format(display)}</span>;
}

/** Desaturated trend line, no axes — context only. */
export function Sparkline({
  points,
  tone = "neutral",
  className = "",
}: {
  points: number[];
  tone?: "neutral" | "positive" | "negative";
  className?: string;
}) {
  if (points.length < 2) return null;
  const w = 100;
  const h = 24;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const d = points
    .map((p, i) => {
      const x = (i / (points.length - 1)) * w;
      const y = h - ((p - min) / span) * h;
      return `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
  const stroke =
    tone === "positive"
      ? "var(--positive)"
      : tone === "negative"
        ? "var(--negative)"
        : "var(--text-tertiary)";
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className={`h-6 w-full opacity-70 ${className}`}>
      <path d={d} fill="none" stroke={stroke} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export function Stat({
  label,
  value,
  numeric,
  format,
  sub,
  provenance,
  tone = "neutral",
  spark,
  hero = false,
  sensitive = true,
}: {
  label: string;
  value: string;
  /** Supply with `format` to animate the figure on change. */
  numeric?: number;
  format?: (n: number) => string;
  sub?: ReactNode;
  provenance?: Provenance;
  tone?: "neutral" | "positive" | "negative";
  spark?: number[];
  hero?: boolean;
  sensitive?: boolean;
}) {
  const toneClass =
    tone === "positive" ? "text-positive" : tone === "negative" ? "text-destructive" : "text-foreground";
  return (
    <div className={`${hero ? "card-hero" : "card-base"} px-6 py-5`}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[12px] uppercase tracking-[0.08em] text-[color:var(--text-secondary)]">{label}</p>
        {provenance ? <ProvenanceBadge kind={provenance} /> : null}
      </div>
      <p
        className={`mt-3 font-display text-[28px] font-semibold leading-none tracking-tight ${toneClass} ${
          sensitive ? "privacy-sensitive" : ""
        }`}
      >
        {numeric !== undefined && format ? (
          <AnimatedNumber value={numeric} format={format} />
        ) : (
          <span className="tabular">{value}</span>
        )}
      </p>
      {spark && spark.length > 1 ? (
        <div className="mt-3">
          <Sparkline points={spark} tone={tone} />
        </div>
      ) : null}
      {sub ? <p className="mt-2 text-[12px] text-[color:var(--text-secondary)]">{sub}</p> : null}
    </div>
  );
}

export function DeltaValue({ value, pct }: { value: number; pct?: number | null }) {
  const up = value >= 0;
  const tone = up ? "text-positive" : "text-destructive";
  return (
    <span className={`tabular inline-flex items-center gap-1 ${tone}`}>
      <span aria-hidden className="text-[10px]">
        {up ? "▲" : "▼"}
      </span>
      {up ? "+" : "-"}
      {formatCompactRupees(Math.abs(value))}
      {pct !== null && pct !== undefined ? ` (${up ? "+" : "-"}${formatPct(Math.abs(pct))})` : ""}
    </span>
  );
}

export function AlertRow({
  level,
  title,
  detail,
}: {
  level: "critical" | "warning" | "info";
  title: string;
  detail: string;
}) {
  const cls =
    level === "critical"
      ? "border-destructive/50 bg-destructive/10"
      : level === "warning"
        ? "border-warning/40 bg-warning/10"
        : "border-border-subtle bg-surface-2";
  return (
    <div className={`rounded-md border px-4 py-3 ${cls}`}>
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="mt-1 text-[12px] text-[color:var(--text-secondary)]">{detail}</p>
    </div>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-[13px] font-medium text-foreground">{label}</span>
      {hint ? (
        <span className="mt-0.5 block text-[12px] text-[color:var(--text-tertiary)]">{hint}</span>
      ) : null}
      <div className="mt-1.5">{children}</div>
    </label>
  );
}

export const inputClass =
  "input-recessed tabular w-full rounded-lg px-3.5 py-2.5 text-sm text-foreground outline-none transition-[background-color,border-color,box-shadow] duration-150 placeholder:text-[color:var(--text-tertiary)] focus:border-primary/45 focus:bg-surface-1 focus:ring-4 focus:ring-primary/10";

export const buttonClass =
  "inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-[0_7px_16px_-12px_color-mix(in_oklab,var(--primary)_82%,transparent)] transition-[transform,background-color,box-shadow] duration-150 hover:bg-primary/90 hover:shadow-[0_10px_20px_-13px_color-mix(in_oklab,var(--primary)_90%,transparent)] active:scale-[0.985] disabled:opacity-60";

export const ghostButtonClass =
  "inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-border-subtle bg-surface-1 px-4 py-2 text-sm font-medium text-[color:var(--text-secondary)] transition-[background-color,border-color,color,box-shadow] duration-150 hover:border-border hover:bg-surface-2 hover:text-foreground hover:shadow-[var(--shadow-card)]";

/**
 * Quiet supporting figure: label above, figure below, no container.
 * Used wherever a group of secondary numbers would otherwise become cards.
 */
export function Figure({
  label,
  value,
  note,
  tone = "neutral",
  sensitive = true,
}: {
  label: string;
  value: string;
  note?: ReactNode;
  tone?: "neutral" | "positive" | "negative";
  sensitive?: boolean;
}) {
  const toneClass =
    tone === "positive" ? "text-positive" : tone === "negative" ? "text-destructive" : "text-foreground";
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-[0.1em] text-[color:var(--text-tertiary)]">{label}</dt>
      <dd className={`metric-md mt-2 ${sensitive ? "privacy-sensitive" : ""} ${toneClass}`}>{value}</dd>
      {note ? <p className="mt-1 text-[12px] text-[color:var(--text-secondary)]">{note}</p> : null}
    </div>
  );
}
