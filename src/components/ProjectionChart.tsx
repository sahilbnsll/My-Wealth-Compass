import { useMemo } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CHART_MARGIN } from "@/components/Charts";
import { formatCompactRupees } from "@/lib/finance/format";
import type { ProjectionYear } from "@/lib/finance/projection";

export type ProjectionMarker = { year: number; label: string; kind: "retirement" | "goal" };

export type ProjectionChartMode = "value" | "composition";

type Point = {
  year: number;
  age: number | null;
  value: number;
  contributed: number;
  growth: number;
  real: number;
  equity: number;
  debt: number;
  gold: number;
  bandFloor: number;
  bandSpan: number;
  low: number;
  high: number;
};

/**
 * Premium wealth trajectory. One chart carries nominal/real, the
 * contribution-versus-growth split, the scenario band and every marker, so the
 * page never shows three competing charts at once.
 */
export function ProjectionChart({
  rows,
  low,
  high,
  showReal,
  mode = "value",
  showBand = false,
  markers = [],
  selectedIndex,
  onSelectIndex,
  height = 340,
}: {
  rows: ProjectionYear[];
  low: ProjectionYear[];
  high: ProjectionYear[];
  showReal: boolean;
  mode?: ProjectionChartMode;
  showBand?: boolean;
  markers?: ProjectionMarker[];
  selectedIndex: number;
  onSelectIndex?: (i: number) => void;
  height?: number;
}) {
  const data = useMemo<Point[]>(
    () =>
      rows.map((r, i) => {
        const pick = (row: ProjectionYear) => (showReal ? row.realClosing : row.closing);
        const deflator = r.closing > 0 ? r.realClosing / r.closing : 1;
        const scale = showReal ? deflator : 1;
        const lo = Math.round(pick(low[i] ?? r));
        const hi = Math.round(pick(high[i] ?? r));
        return {
          year: r.year,
          age: r.age,
          value: Math.round(pick(r)),
          contributed: Math.round(r.totalInvested * scale),
          growth: Math.round(Math.max(0, r.totalGains) * scale),
          real: Math.round(r.realClosing),
          equity: Math.round((r.byAssetClass.equity ?? 0) * scale),
          debt: Math.round((r.byAssetClass.debt ?? 0) * scale),
          gold: Math.round((r.byAssetClass.gold ?? 0) * scale),
          bandFloor: Math.min(lo, hi),
          bandSpan: Math.max(0, hi - lo),
          low: lo,
          high: hi,
        };
      }),
    [rows, low, high, showReal],
  );

  const selected = data[Math.min(selectedIndex, Math.max(0, data.length - 1))];

  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart
          data={data}
          margin={CHART_MARGIN}
          onClick={(e: { activeTooltipIndex?: number }) => {
            if (onSelectIndex && typeof e?.activeTooltipIndex === "number") {
              onSelectIndex(e.activeTooltipIndex);
            }
          }}
        >
          <defs>
            <linearGradient id="projBand" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-chart-1)" stopOpacity={0.24} />
              <stop offset="100%" stopColor="var(--color-chart-1)" stopOpacity={0.04} />
            </linearGradient>
            <linearGradient id="projLine" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-chart-1)" stopOpacity={0.22} />
              <stop offset="100%" stopColor="var(--color-chart-1)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="year"
            stroke="var(--color-muted-foreground)"
            fontSize={11}
            tickLine={false}
            minTickGap={24}
          />
          <YAxis
            stroke="var(--color-muted-foreground)"
            fontSize={11}
            tickLine={false}
            width={72}
            tickFormatter={(v: number) => formatCompactRupees(v)}
          />
          <Tooltip
            cursor={{ stroke: "var(--color-chart-1)", strokeWidth: 1, strokeDasharray: "3 3" }}
            content={<TrajectoryTooltip showReal={showReal} />}
            isAnimationActive={false}
          />

          {showBand && mode === "value" ? (
            <>
              <Area
                dataKey="bandFloor"
                stackId="band"
                stroke="none"
                fill="none"
                isAnimationActive={false}
              />
              <Area
                dataKey="bandSpan"
                stackId="band"
                stroke="none"
                fill="url(#projBand)"
                isAnimationActive={false}
              />
            </>
          ) : null}

          {mode === "composition" ? (
            <>
              <Area
                type="monotone"
                dataKey="contributed"
                stackId="mix"
                name="Contributed"
                stroke="var(--color-chart-debt)"
                fill="var(--color-chart-debt)"
                fillOpacity={0.3}
                isAnimationActive={false}
              />
              <Area
                type="monotone"
                dataKey="growth"
                stackId="mix"
                name="Growth"
                stroke="var(--color-chart-equity)"
                fill="var(--color-chart-equity)"
                fillOpacity={0.3}
                isAnimationActive={false}
              />
            </>
          ) : (
            <>
              <Area
                type="monotone"
                dataKey="value"
                stroke="none"
                fill="url(#projLine)"
                isAnimationActive={false}
              />
              <Line
                type="monotone"
                dataKey="value"
                stroke="var(--color-chart-1)"
                strokeWidth={2.25}
                dot={false}
                isAnimationActive={false}
              />
            </>
          )}

          {markers.map((m) => (
            <ReferenceLine
              key={`${m.kind}-${m.year}-${m.label}`}
              x={m.year}
              stroke={
                m.kind === "retirement" ? "var(--color-chart-3)" : "var(--color-muted-foreground)"
              }
              strokeDasharray="4 4"
              strokeOpacity={m.kind === "retirement" ? 0.8 : 0.45}
              label={{
                value: m.label,
                position: "insideTopLeft",
                fontSize: 10,
                fill: "var(--color-muted-foreground)",
              }}
            />
          ))}

          {selected ? (
            <ReferenceLine x={selected.year} stroke="var(--color-chart-1)" strokeOpacity={0.5} />
          ) : null}
          {selected ? (
            <ReferenceDot
              x={selected.year}
              y={mode === "composition" ? selected.contributed + selected.growth : selected.value}
              r={4.5}
              fill="var(--color-chart-1)"
              stroke="var(--color-background)"
              strokeWidth={2}
              isFront
            />
          ) : null}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

function TrajectoryTooltip({
  active,
  payload,
  showReal,
}: {
  active?: boolean;
  payload?: { payload: Point }[];
  showReal?: boolean;
}) {
  const p = payload?.[0]?.payload;
  if (!active || !p) return null;
  const lines: [string, string][] = [
    ["Portfolio value", formatCompactRupees(showReal ? p.real : p.value)],
    ["Today's money", formatCompactRupees(p.real)],
    ["Nominal value", formatCompactRupees(p.value)],
    ["Contributed", formatCompactRupees(p.contributed)],
    ["Growth", formatCompactRupees(p.growth)],
  ];
  lines.push(["Equity", formatCompactRupees(p.equity)]);
  lines.push(["Debt", formatCompactRupees(p.debt)]);
  lines.push(["Gold", formatCompactRupees(p.gold)]);

  return (
    <div className="rounded-lg border border-border bg-popover/95 px-3 py-2.5 shadow-lg backdrop-blur">
      <p className="font-display text-[13px] font-semibold text-foreground">
        {p.year}
        {p.age !== null ? (
          <span className="ml-2 text-[11px] font-normal text-muted-foreground">age {p.age}</span>
        ) : null}
      </p>
      <dl className="mt-1.5 space-y-1">
        {lines.map(([k, v]) => (
          <div key={k} className="flex items-baseline justify-between gap-6 text-[11px]">
            <dt className="text-muted-foreground">{k}</dt>
            <dd className="tabular privacy-sensitive text-foreground">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
