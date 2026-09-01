import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChartFrame, CHART_MARGIN, chartTooltipStyle, ASSET_CLASS_COLORS } from "./Charts";
import { formatCompactRupees, formatPct, formatRupees, relativeTime } from "@/lib/finance/format";
import type { ConcentrationAxis, HealthSignal } from "@/lib/finance/risk";
import type { PerformancePoint } from "@/lib/finance/performance";
import { holdingAnalysis, type ValuedHolding, type RebalanceRow } from "@/lib/finance/portfolio";
import type { RebalanceAction } from "@/lib/finance/rebalance";
import type { Transaction } from "@/lib/finance/ledger";
import { ChevronDown, ChevronUp } from "lucide-react";
import { allocationHistory } from "@/lib/finance/performance";
import type { AssetClass } from "@/lib/finance/types";

const axisTone = (status: ConcentrationAxis["status"]) =>
  status === "concentrated"
    ? "text-warning"
    : status === "watch"
      ? "text-primary"
      : status === "spread"
        ? "text-positive"
        : "text-muted-foreground";

export function HealthSignals({ signals }: { signals: HealthSignal[] }) {
  return (
    <div className="divide-y divide-[color:var(--border-subtle)] border-y border-border-subtle">
      {signals.map((signal) => (
        <div key={signal.id} className="flex items-start justify-between gap-5 py-4">
          <div>
            <p className="text-[13px] font-medium text-foreground">{signal.label}</p>
            <p className="mt-1 max-w-xl text-[12px] leading-relaxed text-muted-foreground">
              {signal.reason}
            </p>
          </div>
          <span
            className={`shrink-0 text-[12px] font-medium ${signal.tone === "positive" ? "text-positive" : signal.tone === "warning" ? "text-warning" : signal.tone === "unknown" ? "text-muted-foreground" : "text-foreground"}`}
          >
            {signal.rating}
          </span>
        </div>
      ))}
    </div>
  );
}

export function RiskAxes({ axes }: { axes: ConcentrationAxis[] }) {
  return (
    <div className="grid gap-x-10 gap-y-8 md:grid-cols-2">
      {axes.map((axis) => (
        <div key={axis.id}>
          <div className="flex items-baseline justify-between gap-4">
            <div>
              <h3 className="text-[14px] font-medium text-foreground">{axis.title}</h3>
              <p className="mt-1 text-[11px] text-muted-foreground">{axis.basis}</p>
            </div>
            <span className={`text-[12px] ${axisTone(axis.status)}`}>
              {axis.status === "concentrated"
                ? "Concentrated"
                : axis.status === "watch"
                  ? "Review"
                  : axis.status === "spread"
                    ? "Spread"
                    : "Incomplete"}
            </span>
          </div>
          <div className="mt-4 space-y-3">
            {axis.slices.length === 0 ? (
              <p className="text-[12px] text-muted-foreground">No data recorded.</p>
            ) : (
              axis.slices.slice(0, 4).map((slice) => (
                <div key={slice.key}>
                  <div className="flex items-center justify-between gap-3 text-[12px]">
                    <span
                      className={slice.unclassified ? "text-muted-foreground" : "text-foreground"}
                    >
                      {slice.label}
                    </span>
                    <span className="tabular text-muted-foreground">{formatPct(slice.pct)}</span>
                  </div>
                  <div className="mt-1.5 h-1 overflow-hidden bg-secondary">
                    <div
                      className={`h-full ${slice.unclassified ? "bg-muted-foreground/40" : axis.status === "concentrated" ? "bg-warning" : "bg-primary"}`}
                      style={{ width: `${Math.min(100, slice.pct)}%` }}
                    />
                  </div>
                </div>
              ))
            )}
          </div>
          <p className="mt-4 text-[12px] leading-relaxed text-muted-foreground">{axis.note}</p>
        </div>
      ))}
    </div>
  );
}

export function AllocationAnalysis({
  rows,
  target,
  snapshots,
}: {
  rows: {
    assetClass: AssetClass;
    currentPct: number;
    targetPct: number;
    deltaPct: number;
    deltaValue: number;
    status: string;
  }[];
  target: Record<AssetClass, number>;
  snapshots: {
    taken_on: string;
    total_value: number;
    invested: number;
    allocation: Record<string, number>;
  }[];
}) {
  const [selected, setSelected] = useState<AssetClass>(rows[0]?.assetClass ?? "equity");
  const trajectory = useMemo(() => allocationHistory(snapshots, selected), [snapshots, selected]);
  return (
    <div className="space-y-10">
      <div className="space-y-5">
        <div className="grid grid-cols-[minmax(120px,1fr)_70px_70px_70px] gap-3 border-b border-border-subtle pb-2 text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
          <span>Asset class</span>
          <span className="text-right">Current</span>
          <span className="text-right">Target</span>
          <span className="text-right">Drift</span>
        </div>
        {rows.map((row) => (
          <button
            key={row.assetClass}
            type="button"
            onClick={() => setSelected(row.assetClass)}
            className="block w-full text-left"
          >
            <div className="grid grid-cols-[minmax(120px,1fr)_70px_70px_70px] items-center gap-3 text-[13px]">
              <span className="capitalize text-foreground">{row.assetClass}</span>
              <span className="tabular text-right text-foreground">
                {formatPct(row.currentPct)}
              </span>
              <span className="tabular text-right text-muted-foreground">
                {formatPct(row.targetPct)}
              </span>
              <span
                className={`tabular text-right ${row.status === "on_target" ? "text-muted-foreground" : row.deltaPct > 0 ? "text-warning" : "text-teal"}`}
              >
                {row.deltaPct > 0 ? "+" : ""}
                {row.deltaPct.toFixed(1)} pp
              </span>
            </div>
            <div className="relative mt-2 h-2 bg-secondary">
              <div
                className="absolute inset-y-0 border-l border-primary/70"
                style={{ left: `${Math.min(100, row.targetPct)}%` }}
              />
              <div
                className="h-full"
                style={{
                  width: `${Math.min(100, row.currentPct)}%`,
                  backgroundColor: ASSET_CLASS_COLORS[row.assetClass],
                }}
              />
            </div>
          </button>
        ))}
      </div>
      <div>
        <div className="flex items-baseline justify-between gap-4">
          <div>
            <h3 className="text-[14px] font-medium text-foreground">Allocation trajectory</h3>
            <p className="mt-1 text-[12px] text-muted-foreground">
              Captured portfolio positions over time.
            </p>
          </div>
          <span className="text-[12px] capitalize text-muted-foreground">{selected}</span>
        </div>
        {trajectory.length < 2 ? (
          <p className="mt-5 text-[12px] text-muted-foreground">
            Capture two snapshots to see this allocation move.
          </p>
        ) : (
          <ChartFrame height={190}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trajectory} margin={CHART_MARGIN}>
                <CartesianGrid vertical={false} stroke="var(--border-subtle)" />
                <XAxis
                  dataKey="date"
                  tick={{ fill: "var(--text-tertiary)", fontSize: 10 }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  domain={[0, 100]}
                  tickFormatter={(v) => `${v}%`}
                  tick={{ fill: "var(--text-tertiary)", fontSize: 10 }}
                  tickLine={false}
                  axisLine={false}
                  width={38}
                />
                <Tooltip
                  contentStyle={chartTooltipStyle}
                  formatter={(v: number) => [`${v.toFixed(1)}%`, selected]}
                />
                <Line
                  type="monotone"
                  dataKey="pct"
                  stroke={ASSET_CLASS_COLORS[selected]}
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </ChartFrame>
        )}
      </div>
    </div>
  );
}

export function PerformanceAnalysis({ points }: { points: PerformancePoint[] }) {
  const [mode, setMode] = useState<"value" | "drawdown" | "contributions">("value");
  const noHistory = points.length < 2;
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Performance view">
        {(
          [
            ["value", "Value history"],
            ["drawdown", "Drawdown"],
            ["contributions", "Contributions"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={mode === id}
            onClick={() => setMode(id)}
            className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${mode === id ? "border-primary/50 bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground"}`}
          >
            {label}
          </button>
        ))}
      </div>
      {noHistory ? (
        <div className="border-y border-border-subtle py-8">
          <p className="text-[14px] text-foreground">History starts with your first snapshot.</p>
          <p className="mt-1 text-[12px] text-muted-foreground">
            Nothing is back-filled. Capture snapshots regularly to measure value, invested capital,
            drawdown and contributions.
          </p>
        </div>
      ) : (
        <ChartFrame height={320}>
          <ResponsiveContainer width="100%" height="100%">
            {mode === "contributions" ? (
              <BarChart data={points} margin={CHART_MARGIN}>
                <CartesianGrid vertical={false} stroke="var(--border-subtle)" />
                <XAxis
                  dataKey="label"
                  tick={{ fill: "var(--text-tertiary)", fontSize: 10 }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  tickFormatter={(v) => formatCompactRupees(v)}
                  tick={{ fill: "var(--text-tertiary)", fontSize: 10 }}
                  tickLine={false}
                  axisLine={false}
                  width={58}
                />
                <Tooltip
                  contentStyle={chartTooltipStyle}
                  formatter={(v: number) => [formatCompactRupees(v), "Contributions"]}
                />
                <Bar
                  dataKey="contribution"
                  fill="var(--color-chart-equity)"
                  radius={[2, 2, 0, 0]}
                />
              </BarChart>
            ) : (
              <LineChart data={points} margin={CHART_MARGIN}>
                <CartesianGrid vertical={false} stroke="var(--border-subtle)" />
                <XAxis
                  dataKey="label"
                  tick={{ fill: "var(--text-tertiary)", fontSize: 10 }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  tickFormatter={(v) =>
                    mode === "drawdown" ? `${v.toFixed(0)}%` : formatCompactRupees(v)
                  }
                  tick={{ fill: "var(--text-tertiary)", fontSize: 10 }}
                  tickLine={false}
                  axisLine={false}
                  width={62}
                />
                <Tooltip
                  contentStyle={chartTooltipStyle}
                  formatter={(v: number, key: string) => [
                    mode === "drawdown" ? `${v.toFixed(1)}%` : formatCompactRupees(v),
                    key === "value" ? "Portfolio value" : "Invested capital",
                  ]}
                />
                <Line
                  type="monotone"
                  dataKey={mode === "drawdown" ? "drawdownPct" : "value"}
                  stroke={
                    mode === "drawdown" ? "var(--color-warning)" : "var(--color-chart-equity)"
                  }
                  strokeWidth={2}
                  dot={false}
                />
                {mode !== "drawdown" ? (
                  <Line
                    type="monotone"
                    dataKey="invested"
                    stroke="var(--color-chart-debt)"
                    strokeWidth={1.5}
                    dot={false}
                    strokeDasharray="4 4"
                  />
                ) : null}
              </LineChart>
            )}
          </ResponsiveContainer>
        </ChartFrame>
      )}
      <div className="grid gap-5 border-t border-border-subtle pt-5 sm:grid-cols-3">
        <div>
          <p className="eyebrow">Growth</p>
          <p className="mt-1 tabular text-[14px] text-foreground">
            {formatCompactRupees((points[points.length - 1]?.value ?? 0) - (points[0]?.value ?? 0))}
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">Change in portfolio value</p>
        </div>
        <div>
          <p className="eyebrow">Invested capital</p>
          <p className="mt-1 tabular text-[14px] text-foreground">
            {formatCompactRupees(points[points.length - 1]?.invested ?? 0)}
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">Latest captured cost basis</p>
        </div>
        <div>
          <p className="eyebrow">Contributions</p>
          <p className="mt-1 tabular text-[14px] text-foreground">
            {formatCompactRupees(points.reduce((sum, point) => sum + point.contribution, 0))}
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Recorded buy, SIP and contribution events
          </p>
        </div>
      </div>
    </div>
  );
}

export function HoldingDetailExpandable({
  holding,
  totalValue,
  transactions,
  open,
  onToggle,
  onEdit,
  onDelete,
}: {
  holding: ValuedHolding;
  totalValue: number;
  transactions: Transaction[];
  open: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onDelete?: () => void;
}) {
  const detail = holdingAnalysis(holding, totalValue);
  return (
    <>
      <button
        type="button"
        aria-expanded={open}
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-3 border-t border-border-subtle bg-secondary/20 px-4 py-3 text-left hover:bg-secondary/40"
      >
        <span className="text-[12px] font-medium text-foreground">
          {open ? "Hide analysis" : "View analysis"}
        </span>
        {open ? (
          <ChevronUp className="size-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="size-4 text-muted-foreground" />
        )}
      </button>
      {open ? (
        <div className="border-t border-border-subtle bg-secondary/10 px-4 py-5">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <AnalysisValue
              label="Gain"
              value={holding.gainPct === null ? "Not available" : formatPct(holding.gainPct)}
              tone={holding.gain >= 0 ? "default" : "warning"}
            />
            <AnalysisValue label="Role" value={detail.role} />
            <AnalysisValue label="Risk" value={`${detail.risk} concentration`} />
            <AnalysisValue
              label="Target"
              value={detail.targetPct === null ? "Not set" : formatPct(detail.targetPct)}
            />
            <AnalysisValue
              label="Status"
              value={detail.status}
              tone={detail.status === "Above target" ? "warning" : "default"}
            />
          </div>
          <div className="mt-5 grid gap-4 border-t border-border-subtle pt-4 sm:grid-cols-3">
            <AnalysisValue label="Portfolio share" value={formatPct(detail.sharePct)} />
            <AnalysisValue
              label="Price"
              value={
                holding.current_price === null
                  ? "Balance instrument"
                  : formatRupees(holding.current_price)
              }
            />
            <AnalysisValue label="Updated" value={relativeTime(holding.price_updated_at)} />
          </div>
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-border-subtle pt-4">
            <p className="text-[11px] text-muted-foreground">
              {transactions.length === 0
                ? "No linked transaction history. Returns remain estimated."
                : `${transactions.length} linked ledger ${transactions.length === 1 ? "event" : "events"}.`}
            </p>
            <div className="flex items-center gap-3">
              <button
                type="button"
                className="text-xs font-medium text-primary hover:underline"
                onClick={onEdit}
              >
                Edit holding
              </button>
              {onDelete ? (
                <button
                  type="button"
                  className="text-xs font-medium text-destructive hover:underline"
                  onClick={onDelete}
                >
                  Delete holding
                </button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function AnalysisValue({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "warning";
}) {
  return (
    <div>
      <p className="eyebrow text-muted-foreground">{label}</p>
      <p
        className={`mt-1 text-[13px] font-medium ${tone === "warning" ? "text-warning" : "text-foreground"}`}
      >
        {value}
      </p>
    </div>
  );
}

export function RebalanceAnalysis({
  rows,
  actions,
  monthlyContribution,
  monthsToCorrect,
}: {
  rows: RebalanceRow[];
  actions: RebalanceAction[];
  monthlyContribution: number;
  monthsToCorrect: number | null;
}) {
  const activeRows = rows.filter((row) => Math.abs(row.deltaPct) >= 5);
  return (
    <div className="mt-10 border-t border-border-subtle pt-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="text-[14px] font-medium text-foreground">Rebalancing</h3>
          <p className="mt-1 text-[12px] text-muted-foreground">
            Use new money first. Sell only when the gap warrants it.
          </p>
        </div>
        <span className="eyebrow text-muted-foreground">Decision support</span>
      </div>
      {activeRows.length === 0 ? (
        <p className="mt-5 border-y border-border-subtle py-5 text-[12px] text-muted-foreground">
          Every recorded asset class is within the 5-point review threshold.
        </p>
      ) : (
        <div className="mt-5 space-y-4">
          {activeRows.map((row) => {
            const action = actions.find((item) => item.assetClass === row.assetClass);
            return (
              <div key={row.assetClass} className="border-y border-border-subtle py-4">
                <div className="grid gap-4 sm:grid-cols-[1fr_auto_auto_auto] sm:items-end">
                  <div>
                    <p className="capitalize text-[13px] font-medium text-foreground">
                      {row.assetClass}
                    </p>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {action?.reason ?? "Outside the review threshold."}
                    </p>
                  </div>
                  <AnalysisValue label="Current" value={formatPct(row.currentPct)} />
                  <AnalysisValue label="Target" value={formatPct(row.targetPct)} />
                  <AnalysisValue
                    label="Gap"
                    value={`${row.deltaPct > 0 ? "+" : ""}${row.deltaPct.toFixed(1)} pp`}
                    tone={row.deltaPct > 0 ? "warning" : "default"}
                  />
                </div>
                {action ? (
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3 bg-secondary/30 px-3 py-3">
                    <div>
                      <p className="eyebrow text-muted-foreground">Preferred action</p>
                      <p className="mt-1 text-[12px] font-medium text-primary">
                        {action.preferredAction}
                      </p>
                    </div>
                    <span className="tabular text-[12px] text-foreground">
                      {formatCompactRupees(action.amount)}
                    </span>
                  </div>
                ) : null}
                {action?.sellCondition ? (
                  <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
                    {action.sellCondition}
                  </p>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
      <p className="mt-4 text-[11px] text-muted-foreground">
        {monthlyContribution > 0 && monthsToCorrect !== null
          ? `At ${formatCompactRupees(monthlyContribution)} per month, the underweight gap takes about ${monthsToCorrect} month${monthsToCorrect === 1 ? "" : "s"} to close.`
          : "No recurring contribution is recorded, so new-money correction cannot be estimated."}
      </p>
    </div>
  );
}
