import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CHART_MARGIN, ChartFrame, chartTooltipStyle } from "@/components/Charts";
import { Segmented } from "@/components/Wizard";
import { formatCompactRupees } from "@/lib/finance/format";
import type { ProjectionYear } from "@/lib/finance/projection";

export type TrajectoryMarker = { year: number; label: string };

export type TrajectoryProps = {
  base: ProjectionYear[];
  conservative?: ProjectionYear[] | undefined;
  optimistic?: ProjectionYear[] | undefined;
  /** Retirement year, drawn as a vertical marker. */
  retirementYear?: number | null | undefined;
  /** Goal target years, drawn as points on the base line. */
  markers?: TrajectoryMarker[];
  height?: number;
};

type Basis = "nominal" | "real";

/**
 * Compact wealth trajectory. One question only: where is this going? The band
 * appears only when both alternative scenarios are supplied, so the chart never
 * implies precision it does not have.
 */
export function Trajectory({
  base,
  conservative,
  optimistic,
  retirementYear,
  markers = [],
  height = 240,
}: TrajectoryProps) {
  const [basis, setBasis] = useState<Basis>("nominal");
  const [showBand, setShowBand] = useState(Boolean(conservative && optimistic));
  const hasBand = Boolean(conservative?.length && optimistic?.length);

  const pick = (row: ProjectionYear) => (basis === "real" ? row.realClosing : row.closing);

  const data = useMemo(
    () =>
      base.map((row, i) => {
        const low = conservative?.[i] ? pick(conservative[i]!) : null;
        const high = optimistic?.[i] ? pick(optimistic[i]!) : null;
        return {
          year: row.year,
          value: Math.round(pick(row)),
          floor: low !== null ? Math.round(low) : null,
          span: low !== null && high !== null ? Math.max(0, Math.round(high - low)) : null,
        };
      }),
    [base, conservative, optimistic, basis],
  );

  const markerPoints = markers
    .map((m) => {
      const row = data.find((d) => d.year === m.year);
      return row ? { ...m, value: row.value } : null;
    })
    .filter((m): m is TrajectoryMarker & { value: number } => m !== null);

  if (base.length === 0) {
    return (
      <p className="text-[13px] text-[color:var(--text-tertiary)]">
        Add your age and retirement age to draw the trajectory.
      </p>
    );
  }

  const final = data[data.length - 1]!;

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="metric-lg privacy-sensitive tabular text-foreground">{formatCompactRupees(final.value)}</p>
          <p className="mt-1 text-[12px] text-[color:var(--text-secondary)]">
            by {final.year}
            {basis === "real" ? ", in today's money" : ", at future prices"}
            {retirementYear ? ` · retirement ${retirementYear}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Segmented
            value={basis}
            onChange={(v) => setBasis(v as Basis)}
            options={[
              { value: "nominal", label: "Portfolio value" },
              { value: "real", label: "Today's money" },
            ]}
          />
          {hasBand ? (
            <button
              type="button"
              onClick={() => setShowBand((s) => !s)}
              className="rounded-md border border-border-subtle px-2.5 py-1.5 text-[12px] text-[color:var(--text-secondary)] transition-colors hover:text-foreground"
            >
              {showBand ? "Hide range" : "Show range"}
            </button>
          ) : null}
        </div>
      </div>

      <ChartFrame height={height}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={CHART_MARGIN}>
            <defs>
              <linearGradient id="trajFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--color-chart-1)" stopOpacity={0.28} />
                <stop offset="100%" stopColor="var(--color-chart-1)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="year" stroke="var(--color-muted-foreground)" fontSize={11} tickLine={false} />
            <YAxis
              stroke="var(--color-muted-foreground)"
              fontSize={11}
              tickLine={false}
              width={64}
              tickFormatter={(v: number) => formatCompactRupees(v)}
            />
            <Tooltip
              contentStyle={chartTooltipStyle}
              formatter={(v: number, name: string) => [formatCompactRupees(v), name === "span" ? "Range" : "Projected"]}
              labelFormatter={(l) => `Year ${l}`}
            />
            {hasBand && showBand ? (
              <>
                <Area dataKey="floor" stackId="band" stroke="none" fill="none" isAnimationActive={false} />
                <Area
                  dataKey="span"
                  stackId="band"
                  stroke="none"
                  fill="var(--color-chart-1)"
                  fillOpacity={0.1}
                  isAnimationActive={false}
                />
              </>
            ) : null}
            <Area
              dataKey="value"
              stroke="var(--color-chart-1)"
              strokeWidth={2}
              fill="url(#trajFill)"
              isAnimationActive={false}
            />
            {retirementYear ? (
              <ReferenceLine
                x={retirementYear}
                stroke="var(--color-muted-foreground)"
                strokeDasharray="4 4"
                label={{ value: "Retire", position: "insideTopRight", fontSize: 10, fill: "var(--color-muted-foreground)" }}
              />
            ) : null}
            {markerPoints.map((m) => (
              <ReferenceDot
                key={`${m.year}-${m.label}`}
                x={m.year}
                y={m.value}
                r={3.5}
                fill="var(--color-chart-3)"
                stroke="var(--color-background)"
                strokeWidth={1.5}
                label={{ value: m.label, position: "top", fontSize: 10, fill: "var(--color-muted-foreground)" }}
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </ChartFrame>
    </div>
  );
}
