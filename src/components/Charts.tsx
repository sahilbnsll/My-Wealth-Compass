import { useState, type CSSProperties, type ReactNode } from "react";
import type { AssetClass } from "@/lib/finance/types";

export type DonutSlice = { name: string; value: number; fill: string };

/** Shared asset-class palette (tokens defined in styles.css). */
export const ASSET_CLASS_COLORS: Record<AssetClass, string> = {
  equity: "var(--color-chart-equity)",
  debt: "var(--color-chart-debt)",
  gold: "var(--color-chart-gold)",
  cash: "var(--color-chart-cash)",
  other: "var(--color-chart-5)",
};

/**
 * Shared Recharts chrome. Every chart reserves the same bottom margin so the
 * legend row and x-axis labels never clip, and the legend always sits in its
 * own row under the plot rather than floating over the data.
 */
export const CHART_MARGIN = { top: 12, right: 12, bottom: 8, left: 8 };

export const chartTooltipStyle: CSSProperties = {
  background: "var(--color-popover)",
  border: "1px solid var(--color-border)",
  borderRadius: 8,
  color: "var(--color-foreground)",
  fontSize: 12,
  padding: "8px 10px",
};

export const legendStyle: React.CSSProperties = { fontSize: 11, paddingTop: 16 };

/**
 * Allocation donut with a live centre readout. Hovering a segment swaps the
 * centre label to that slice, so the chart reads without a separate legend.
 */
export function Donut({
  slices,
  centreLabel,
  centreValue,
  formatValue,
  size = 200,
  thickness = 22,
}: {
  slices: DonutSlice[];
  centreLabel: string;
  centreValue: number;
  formatValue: (n: number) => string;
  size?: number;
  thickness?: number;
}) {
  const [active, setActive] = useState<number | null>(null);
  const total = slices.reduce((a, s) => a + s.value, 0);
  if (total <= 0) return null;

  const r = size / 2 - thickness / 2 - 2;
  const c = size / 2;
  const circumference = 2 * Math.PI * r;
  const gap = 2;

  let offset = 0;
  const arcs = slices.map((s, i) => {
    const frac = s.value / total;
    const len = Math.max(0, frac * circumference - gap);
    const arc = { ...s, len, dashOffset: -offset, index: i };
    offset += frac * circumference;
    return arc;
  });

  const shown = active === null ? null : slices[active];

  return (
    <div className="relative mx-auto" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={c} cy={c} r={r} fill="none" stroke="var(--bg-surface-2)" strokeWidth={thickness} />
        {arcs.map((a) => (
          <circle
            key={a.name}
            cx={c}
            cy={c}
            r={r}
            fill="none"
            stroke={a.fill}
            strokeWidth={active === a.index ? thickness + 4 : thickness}
            strokeDasharray={`${a.len} ${circumference - a.len}`}
            strokeDashoffset={a.dashOffset}
            strokeLinecap="butt"
            className="cursor-pointer transition-[stroke-width,opacity] duration-150"
            opacity={active === null || active === a.index ? 1 : 0.35}
            onMouseEnter={() => setActive(a.index)}
            onMouseLeave={() => setActive(null)}
          />
        ))}
      </svg>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
        <p className="text-[10px] uppercase tracking-[0.1em] text-[color:var(--text-tertiary)]">
          {shown ? shown.name : centreLabel}
        </p>
        <p className="tabular privacy-sensitive mt-1 font-display text-[20px] font-semibold leading-none text-foreground">
          {formatValue(shown ? shown.value : centreValue)}
        </p>
        {shown ? (
          <p className="tabular mt-1 text-[11px] text-[color:var(--text-secondary)]">
            {((shown.value / total) * 100).toFixed(1)}%
          </p>
        ) : null}
      </div>
    </div>
  );
}

/** Legend rows that pair with the donut. */
export function DonutLegend({
  slices,
  total,
  format,
}: {
  slices: DonutSlice[];
  total: number;
  format: (n: number) => string;
}) {
  return (
    <ul className="mt-4 space-y-1.5">
      {slices.map((s) => (
        <li key={s.name} className="flex items-center gap-2 text-[12px]">
          <span className="h-2 w-2 shrink-0 rounded-[2px]" style={{ background: s.fill }} />
          <span className="flex-1 capitalize text-[color:var(--text-secondary)]">{s.name}</span>
          <span className="tabular privacy-sensitive text-foreground">{format(s.value)}</span>
          <span className="tabular w-12 text-right text-[color:var(--text-tertiary)]">
            {total > 0 ? `${((s.value / total) * 100).toFixed(1)}%` : "—"}
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Diverging bar around a centre line: left of centre means under target,
 * right means over. The tolerance band is drawn so "on target" is visible.
 */
export function DriftBar({
  deltaPct,
  tolerancePct = 5,
  maxPct = 25,
}: {
  deltaPct: number;
  tolerancePct?: number;
  maxPct?: number;
}) {
  const clamped = Math.max(-maxPct, Math.min(maxPct, deltaPct));
  const half = Math.abs(clamped) / maxPct / 2; // fraction of full width
  const within = Math.abs(deltaPct) <= tolerancePct;
  const bandHalf = tolerancePct / maxPct / 2;
  return (
    <div className="relative h-2 w-full overflow-hidden rounded-full bg-surface-2">
      <div
        className="absolute inset-y-0 bg-[color:var(--text-tertiary)]/15"
        style={{ left: `${50 - bandHalf * 100}%`, width: `${bandHalf * 200}%` }}
      />
      <div
        className="absolute inset-y-0 rounded-full transition-all duration-300"
        style={{
          left: clamped >= 0 ? "50%" : `${50 - half * 100}%`,
          width: `${half * 100}%`,
          background: within
            ? "var(--text-tertiary)"
            : clamped >= 0
              ? "var(--positive)"
              : "var(--negative)",
        }}
      />
      <div className="absolute inset-y-0 left-1/2 w-px bg-border" />
    </div>
  );
}

/** Goal funding progress with a marker for the on-track position. */
export function GoalProgress({
  fundedPct,
  tone = "neutral",
}: {
  fundedPct: number;
  tone?: "neutral" | "positive" | "warning" | "negative";
}) {
  const pct = Math.max(0, Math.min(100, fundedPct));
  const colour =
    tone === "positive"
      ? "var(--positive)"
      : tone === "warning"
        ? "var(--warning)"
        : tone === "negative"
          ? "var(--negative)"
          : "var(--text-tertiary)";
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
      <div
        className="h-full rounded-full transition-[width] duration-500"
        style={{ width: `${pct}%`, background: colour }}
      />
    </div>
  );
}

export function ChartFrame({ children, height = 320 }: { children: ReactNode; height?: number }) {
  return <div style={{ height }}>{children}</div>;
}
