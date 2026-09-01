import { EmptyLedgerArt } from "@/components/Art";
import { toast } from "sonner";
import { createFileRoute, useRouter, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Fragment, useMemo, useState } from "react";
import { Check, Pencil, Trash2, X } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useLaunchAction } from "@/lib/launch";
import { AppShell, EmptyState, Panel } from "@/components/AppShell";
import {
  DeltaValue,
  Figure,
  ProvenanceBadge,
  buttonClass,
  ghostButtonClass,
} from "@/components/Bits";
import {
  AdvancedDetails,
  DatePickerInput,
  NotesInput,
  FinancialAmountInput,
  PercentInput,
  Segmented,
  WizardField,
  WizardModal,
  wizardInputClass,
} from "@/components/Wizard";
import { ASSET_CLASS_COLORS, Donut, DonutLegend } from "@/components/Charts";
import {
  deleteHolding,
  loadWorkspace,
  loadSnapshots,
  lookupQuote,
  refreshNavPrices,
  refreshStockQuotes,
  saveHolding,
  type HoldingInput,
  type InstrumentHit,
} from "@/lib/data.functions";
import { InstrumentSearch } from "@/components/InstrumentSearch";
import type { ResolvedInstrument } from "@/lib/instruments";


import { formatCompactRupees, formatPct, formatRupees, relativeTime } from "@/lib/finance/format";
import {
  monthlyContribution,
  rebalance,
  summarisePortfolio,
  valueHolding,
  xirrLabel,
} from "@/lib/finance/portfolio";
import { buildPerformanceHistory } from "@/lib/finance/performance";
import { portfolioHealth, riskAxes, taxEfficiency } from "@/lib/finance/risk";
import {
  AllocationAnalysis,
  HealthSignals,
  PerformanceAnalysis,
  RiskAxes,
  HoldingDetailExpandable,
  RebalanceAnalysis,
} from "@/components/PortfolioAnalytics";
import { buildRebalancePlan } from "@/lib/finance/rebalance";
import { buildTargetAllocation, recommendedEmergencyMonths } from "@/lib/finance/strategy";
import { emergencyCoverageMonths } from "@/lib/finance/core";
import {
  ASSET_CLASSES,
  DEFAULT_ASSET_CLASS,
  INSTRUMENT_TYPES,
  UNIT_PRICED,
  type AssetClass,
  type Holding,
  type InstrumentType,
} from "@/lib/finance/types";

export const Route = createFileRoute("/portfolio")({
  loader: async () => {
    const [workspace, snapshots] = await Promise.all([loadWorkspace(), loadSnapshots()]);
    return { ...workspace, snapshots };
  },
  head: () => ({
    meta: [
      { title: "Sahil's Finance Intelligence — Holdings" },
      {
        name: "description",
        content: "What you own, what it is worth, and where each price came from.",
      },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Sahil's Finance Intelligence — Holdings" },
      {
        property: "og:description",
        content: "Current holdings, valuations and concentration risk.",
      },
    ],
  }),
  component: PortfolioPage,
});

const BLANK: HoldingInput = {
  asset_class: "equity",
  instrument_type: "stock",
  name: "",
  symbol: null,
  isin: null,
  category: null,
  quantity: null,
  avg_price: null,
  current_price: null,
  current_value: null,
  price_source: "manual",
  price_updated_at: null,
  purchase_date: null,
  maturity_date: null,
  interest_rate: null,
  cost_basis: null,
  target_allocation_pct: null,
  tax_treatment: null,
  liquidity: null,
  sector: null,
  cap_segment: null,
  geography: "india",
  is_demo: false,
  notes: null,
};

type PortfolioView = "overview" | "holdings" | "allocation" | "risk" | "performance";

const VIEWS: { id: PortfolioView; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "holdings", label: "Holdings" },
  { id: "allocation", label: "Allocation" },
  { id: "risk", label: "Risk" },
  { id: "performance", label: "Performance" },
];

function PortfolioPage() {
  const { holdings, transactions, profile, planned, snapshots } = Route.useLoaderData();
  const router = useRouter();
  const save = useServerFn(saveHolding);
  const remove = useServerFn(deleteHolding);
  const [editing, setEditing] = useState<HoldingInput | null>(null);
  const [expandedHoldingId, setExpandedHoldingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const refreshNav = useServerFn(refreshNavPrices);
  const [navNote, setNavNote] = useState<string | null>(null);
  const [quickEdit, setQuickEdit] = useState<{ id: string; value: string } | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);

  // Launched from the ⌘K palette: open the add form, prefilled when the palette
  // passed an instrument it already resolved.
  useLaunchAction("add-holding", (payload) => {
    setEditing({ ...BLANK, ...((payload ?? {}) as Partial<HoldingInput>) });
  });

  async function onRefreshNav() {
    setBusy(true);
    setError(null);
    setNavNote(null);
    try {
      const res = await refreshNav({});
      await router.invalidate();
      setNavNote(
        res.updated === 0
          ? "No funds matched. Add an ISIN or scheme code."
          : `Updated ${res.updated} fund NAV${res.updated === 1 ? "" : "s"} from AMFI${res.asOf ? ` (as of ${res.asOf})` : ""}.` +
              (res.unmatched.length
                ? ` ${res.unmatched.length} fund(s) had no ISIN/scheme code match.`
                : ""),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not reach the AMFI NAV feed.");
    } finally {
      setBusy(false);
    }
  }

  const refreshQuotes = useServerFn(refreshStockQuotes);

  async function onRefreshQuotes() {
    setBusy(true);
    setError(null);
    setNavNote(null);
    try {
      const res = await refreshQuotes({});
      await router.invalidate();
      setNavNote(
        res.skipped
          ? "Add a symbol like RELIANCE to price stocks automatically."
          : `Updated ${res.updated} live price${res.updated === 1 ? "" : "s"} from Yahoo Finance (delayed quotes).` +
              (res.unmatched.length ? ` No match for: ${res.unmatched.join(", ")}.` : ""),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not reach the quote feed.");
    } finally {
      setBusy(false);
    }
  }

  const summary = useMemo(
    () => summarisePortfolio(holdings, transactions),
    [holdings, transactions],
  );
  const xirrMeta = xirrLabel(summary.xirrBasis, summary.xirrCoveragePct);
  const valued = useMemo(() => holdings.map(valueHolding), [holdings]);
  const largest = useMemo(() => {
    if (summary.totalValue <= 0) return null;
    const top = [...summary.holdings].sort((a, b) => b.value - a.value)[0];
    return top ? { name: top.name, sharePct: (top.value / summary.totalValue) * 100 } : null;
  }, [summary]);
  const [classFilter, setClassFilter] = useState<AssetClass | "all">("all");
  const presentClasses = useMemo(
    () => ASSET_CLASSES.filter((c) => valued.some((h) => h.asset_class === c)),
    [valued],
  );
  const filteredValued = useMemo(
    () => (classFilter === "all" ? valued : valued.filter((h) => h.asset_class === classFilter)),
    [valued, classFilter],
  );
  const [view, setView] = useState<PortfolioView>("overview");

  // Rebalancing: target allocation comes from the strategy engine, drift and the
  // correction plan from the finance library. Nothing is computed in this component.
  const monthlyPlanned = useMemo(() => monthlyContribution(planned), [planned]);
  const rebalancePlan = useMemo(() => {
    const essential = profile.essential_monthly_expenses ?? profile.monthly_expenses;
    const liquid = valued
      .filter((h) => h.asset_class === "cash" || h.liquidity === "liquid")
      .reduce((a, h) => a + h.value, 0);
    const months = recommendedEmergencyMonths(profile).months;
    const coverage = essential ? emergencyCoverageMonths(liquid, essential) : null;
    const target = buildTargetAllocation(profile, coverage !== null && coverage >= months);
    const rows = rebalance(summary, target.target, 5);
    return {
      target,
      rows,
      plan: buildRebalancePlan({
        rows,
        totalValue: summary.totalValue,
        monthlyContribution: monthlyPlanned,
      }),
    };
  }, [profile, summary, valued, monthlyPlanned]);

  const analysis = useMemo(() => {
    const essential = profile.essential_monthly_expenses ?? profile.monthly_expenses;
    const liquid = valued
      .filter((h) => h.asset_class === "cash" || h.liquidity === "liquid")
      .reduce((total, h) => total + h.value, 0);
    const emergency = recommendedEmergencyMonths(profile);
    const coverage = essential ? emergencyCoverageMonths(liquid, essential) : null;
    const axes = riskAxes(summary);
    const tax = taxEfficiency(summary);
    const maxDriftPp =
      rebalancePlan.rows.length > 0
        ? Math.max(...rebalancePlan.rows.map((row) => Math.abs(row.deltaPct)))
        : null;
    return {
      axes,
      health: portfolioHealth({
        summary,
        axes,
        maxDriftPp,
        emergencyCoverageMonths: coverage,
        emergencyTargetMonths: emergency.months,
        taxEfficientPct: tax.efficientPct,
        shortTermEquityPct: tax.shortTermEquityPct,
      }),
      performance: buildPerformanceHistory(
        snapshots,
        { totalValue: summary.totalValue, invested: summary.invested },
        transactions,
      ),
    };
  }, [profile, summary, valued, rebalancePlan, snapshots, transactions]);

  const pieSlices = useMemo(
    () =>
      ASSET_CLASSES.filter((c) => summary.valueByAssetClass[c] > 0).map((c) => ({
        name: c,
        value: Math.round(summary.valueByAssetClass[c] * 100) / 100,
        fill: ASSET_CLASS_COLORS[c],
      })),
    [summary],
  );

  async function onSave() {
    if (!editing) return;
    setBusy(true);
    setError(null);
    try {
      await save({ data: { ...editing, name: editing.name.trim() } });
      await router.invalidate();
      setEditing(null);
      toast.success("Holding saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the holding.");
    } finally {
      setBusy(false);
    }
  }

  async function onDelete(id: string) {
    setBusy(true);
    try {
      await remove({ data: { id } });
      await router.invalidate();
      toast.success("Holding deleted.");
      if (editing && "id" in editing && editing.id === id) setEditing(null);
      setDeleteTarget(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete holding.");
    } finally {
      setBusy(false);
    }
  }

  function beginQuickEdit(holding: (typeof valued)[number]) {
    const sourceValue = holding.current_price ?? holding.current_value ?? holding.value;
    setQuickEdit({ id: holding.id, value: String(sourceValue) });
  }

  async function saveQuickEdit(holding: (typeof valued)[number]) {
    const amount = Number(quickEdit?.value);
    if (!Number.isFinite(amount) || amount < 0) {
      toast.error("Enter a valid non-negative amount.");
      return;
    }
    setBusy(true);
    try {
      const isUnitPriced = UNIT_PRICED.includes(holding.instrument_type);
      await save({
        data: {
          ...holding,
          current_price: isUnitPriced ? amount : null,
          current_value: isUnitPriced ? holding.current_value : amount,
          price_source: "manual",
          price_updated_at: new Date().toISOString(),
        },
      });
      await router.invalidate();
      setQuickEdit(null);
      toast.success(`${isUnitPriced ? "Price" : "Balance"} updated.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update the valuation.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell
      title="Holdings"
      subtitle="Units price as quantity × price; EPF, PPF and deposits carry a balance."
      actions={
        <div className="flex gap-2">
          <Link className={ghostButtonClass} to="/import">
            Import statement
          </Link>
          <button className={ghostButtonClass} onClick={onRefreshQuotes} disabled={busy}>
            {busy ? "Working…" : "Refresh stock prices"}
          </button>
          <button className={ghostButtonClass} onClick={onRefreshNav} disabled={busy}>
            {busy ? "Working…" : "Refresh fund NAVs"}
          </button>
          <button className={buttonClass} onClick={() => setEditing({ ...BLANK })}>
            Add holding
          </button>
        </div>
      }
    >
      {navNote ? (
        <div className="mb-6 border-l-2 border-teal/50 py-1 pl-3 text-[13px] text-[color:var(--text-secondary)]">
          {navNote}
        </div>
      ) : null}

      <section className="border-b border-border-subtle pb-8">
        <p className="eyebrow text-[color:var(--text-secondary)]">Value of everything recorded</p>
        <p className="metric-xl privacy-sensitive mt-3 text-foreground">
          {formatRupees(summary.totalValue)}
        </p>
        <p className="mt-3 text-[13px] text-[color:var(--text-secondary)]">
          <span className={summary.unrealisedGain >= 0 ? "text-positive" : "text-destructive"}>
            <span className="tabular privacy-sensitive">
              {summary.unrealisedGain >= 0 ? "+" : "−"}
              {formatCompactRupees(Math.abs(summary.unrealisedGain))}
            </span>{" "}
            unrealised
            {summary.unrealisedGainPct !== null
              ? ` (${formatPct(summary.unrealisedGainPct)} on cost)`
              : ""}
          </span>
        </p>

        <dl className="mt-8 grid gap-x-10 gap-y-6 sm:grid-cols-2 lg:grid-cols-5">
          <Figure
            label="Invested (cost basis)"
            value={formatCompactRupees(summary.invested)}
            note={
              summary.invested === 0 ? "Cost basis missing on every holding" : "As entered by you"
            }
          />
          <Figure
            label="Gain"
            value={formatCompactRupees(summary.unrealisedGain)}
            note={
              summary.unrealisedGainPct !== null
                ? `${formatPct(summary.unrealisedGainPct)} on cost`
                : "No cost basis"
            }
            tone={summary.unrealisedGain >= 0 ? "positive" : "negative"}
          />
          <Figure
            label={xirrMeta.title}
            value={summary.xirrPct !== null ? formatPct(summary.xirrPct) : "—"}
            note={xirrMeta.source}
            sensitive={false}
          />
          <Figure
            label="CAGR"
            value={summary.cagrPct !== null ? formatPct(summary.cagrPct) : "—"}
            note="Annualised growth"
            sensitive={false}
          />
          <Figure
            label="Liquidity"
            value={formatCompactRupees(summary.liquidValue)}
            note={
              summary.totalValue > 0
                ? `${formatPct((summary.liquidValue / summary.totalValue) * 100)} of value`
                : "No liquid assets recorded"
            }
          />
        </dl>
      </section>

      <div className="mt-8 flex flex-wrap gap-1.5" role="tablist" aria-label="Portfolio view">
        {VIEWS.map((v) => {
          const active = view === v.id;
          return (
            <button
              key={v.id}
              role="tab"
              aria-selected={active}
              onClick={() => setView(v.id)}
              className={`rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors duration-100 ${
                active
                  ? "border-primary/50 bg-primary/15 text-primary"
                  : "border-border bg-transparent text-muted-foreground hover:border-primary/30 hover:text-foreground"
              }`}
            >
              {v.label}
            </button>
          );
        })}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <div className="min-w-0 space-y-6">
          {view === "overview" ? (
            <Panel title="Largest positions" description="Where most of your money sits.">
              {valued.length === 0 ? (
                <EmptyState
                  art={<EmptyLedgerArt />}
                  title="Nothing here yet"
                  detail="Add your first holding to start valuing the portfolio."
                  action={
                    <button className={buttonClass} onClick={() => setEditing({ ...BLANK })}>
                      Add your first holding
                    </button>
                  }
                />
              ) : (
                <ul className="divide-y divide-[color:var(--border-subtle)] border-t border-border-subtle text-sm">
                  {[...valued]
                    .sort((a, b) => b.value - a.value)
                    .slice(0, 10)
                    .map((h) => (
                      <li key={h.id} className="flex items-center justify-between gap-4 py-3 group">
                        <div className="min-w-0 flex-1">
                          <span className="block truncate font-medium text-foreground">{h.name}</span>
                          <span className="tabular block text-xs capitalize text-muted-foreground">
                            {[h.symbol, h.asset_class].filter(Boolean).join(" · ")}
                          </span>
                        </div>
                        <div className="flex shrink-0 items-center gap-3">
                          <div className="text-right">
                            <span className="tabular privacy-sensitive block font-medium text-foreground">
                              {formatCompactRupees(h.value)}
                            </span>
                            <span className="tabular block text-[11px] text-muted-foreground">
                              {summary.totalValue > 0
                                ? `${formatPct((h.value / summary.totalValue) * 100)} share`
                                : "—"}
                            </span>
                          </div>
                          <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
                            <button
                              type="button"
                              className="inline-flex items-center gap-1 rounded border border-border-subtle bg-surface-2 px-2 py-1 text-[11px] font-medium text-muted-foreground hover:bg-surface-3 hover:text-foreground transition-colors"
                              onClick={() => setEditing(h)}
                              title="Edit holding"
                            >
                              <Pencil className="h-3 w-3" />
                              <span className="hidden sm:inline">Edit</span>
                            </button>
                            <button
                              type="button"
                              className="inline-flex items-center gap-1 rounded border border-border-subtle bg-surface-2 px-2 py-1 text-[11px] font-medium text-muted-foreground hover:bg-destructive/15 hover:text-destructive transition-colors"
                              onClick={() => setDeleteTarget({ id: h.id, name: h.name })}
                              disabled={busy}
                              title="Delete holding"
                            >
                              <Trash2 className="h-3 w-3" />
                              <span className="hidden sm:inline">Delete</span>
                            </button>
                          </div>
                        </div>
                      </li>
                    ))}
                </ul>
              )}
            </Panel>
          ) : null}

          {view === "holdings" ? (
            <Panel title="All holdings" description="Sorted by value. Select one for detail.">
              {valued.length === 0 ? (
                <EmptyState
                  art={<EmptyLedgerArt />}
                  title="Nothing here yet"
                  detail="Add your first holding to start valuing the portfolio."
                  action={
                    <button className={buttonClass} onClick={() => setEditing({ ...BLANK })}>
                      Add your first holding
                    </button>
                  }
                />
              ) : (
                <>
                  <div
                    className="mb-4 flex flex-wrap gap-1.5"
                    role="tablist"
                    aria-label="Filter by asset class"
                  >
                    {(["all", ...presentClasses] as const).map((c) => {
                      const active = classFilter === c;
                      return (
                        <button
                          key={c}
                          role="tab"
                          aria-selected={active}
                          onClick={() => setClassFilter(c)}
                          className={`rounded-full border px-3 py-1 text-xs font-medium capitalize transition-colors duration-100 ${
                            active
                              ? "border-primary/50 bg-primary/15 text-primary"
                              : "border-border bg-transparent text-muted-foreground hover:border-primary/30 hover:text-foreground"
                          }`}
                        >
                          {c === "all" ? "All" : c}
                        </button>
                      );
                    })}
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                          <th className="py-2 pr-3 font-medium">Holding</th>
                          <th className="py-2 pr-3 text-right font-medium">Value</th>
                          <th className="py-2 pr-3 text-right font-medium">Gain</th>
                          <th className="py-2 pr-3 font-medium">Valuation</th>
                          <th className="py-2 pr-3 font-medium">Price source</th>
                          <th className="py-2 pr-2 text-right font-medium">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...filteredValued]
                          .sort((a, b) => b.value - a.value)
                          .map((h) => {
                            const color = ASSET_CLASS_COLORS[h.asset_class];
                            const share =
                              summary.totalValue > 0 ? (h.value / summary.totalValue) * 100 : 0;
                            const expanded = expandedHoldingId === h.id;
                            const isQuickEditing = quickEdit?.id === h.id;
                            const isUnitPriced = UNIT_PRICED.includes(h.instrument_type);
                            return (
                              <Fragment key={h.id}>
                                <tr className="group border-b border-border/60 transition-colors duration-100 last:border-0 hover:bg-secondary/40">
                                  <td className="py-2.5 pr-3">
                                    <button
                                      className="flex items-center gap-3 text-left"
                                      onClick={() => setExpandedHoldingId(expanded ? null : h.id)}
                                      aria-expanded={expanded}
                                    >
                                      <span
                                        aria-hidden
                                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-xs font-semibold uppercase"
                                        style={{
                                          backgroundColor: `color-mix(in oklab, ${color} 18%, transparent)`,
                                          color,
                                        }}
                                      >
                                        {h.name.trim().charAt(0) || "?"}
                                      </span>
                                      <span>
                                        <span className="block font-medium text-foreground group-hover:text-primary">
                                          {h.name}
                                        </span>
                                        <span className="tabular block text-xs capitalize text-muted-foreground">
                                          {[h.symbol, h.asset_class].filter(Boolean).join(" · ")}
                                        </span>
                                      </span>
                                    </button>
                                  </td>
                                  <td className="py-2.5 pr-3 text-right">
                                    <span className="tabular block text-foreground">
                                      {formatCompactRupees(h.value)}
                                    </span>
                                    <span className="tabular block text-[11px] text-muted-foreground">
                                      {formatPct(share)} of portfolio
                                    </span>
                                  </td>
                                  <td className="py-2.5 pr-3 text-right">
                                    {h.invested > 0 ? (
                                      <DeltaValue value={h.gain} pct={h.gainPct} />
                                    ) : (
                                      <span className="text-xs text-muted-foreground">—</span>
                                    )}
                                  </td>
                                  <td className="py-2.5 pr-3">
                                    {isQuickEditing ? (
                                      <div className="flex min-w-[172px] items-center gap-1.5">
                                        <input
                                          autoFocus
                                          aria-label={`Update ${isUnitPriced ? "price" : "balance"} for ${h.name}`}
                                          inputMode="decimal"
                                          value={quickEdit.value}
                                          onChange={(e) => setQuickEdit({ id: h.id, value: e.target.value })}
                                          onKeyDown={(e) => {
                                            if (e.key === "Enter") void saveQuickEdit(h);
                                            if (e.key === "Escape") setQuickEdit(null);
                                          }}
                                          className="w-24 rounded-md border border-primary/35 bg-surface-1 px-2 py-1 text-right text-xs tabular text-foreground outline-none focus:ring-1 focus:ring-primary"
                                        />
                                        <button type="button" onClick={() => void saveQuickEdit(h)} disabled={busy} className="rounded p-1 text-teal hover:bg-teal/10" aria-label="Save valuation">
                                          <Check className="size-3.5" />
                                        </button>
                                        <button type="button" onClick={() => setQuickEdit(null)} className="rounded p-1 text-muted-foreground hover:bg-surface-2" aria-label="Cancel valuation edit">
                                          <X className="size-3.5" />
                                        </button>
                                      </div>
                                    ) : (
                                      <button type="button" onClick={() => beginQuickEdit(h)} className="group/value inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-left transition-colors hover:bg-surface-2" title={`Quick update ${isUnitPriced ? "price" : "balance"}`}>
                                        <span className="tabular text-xs text-foreground">{isUnitPriced ? formatRupees(h.current_price ?? 0) : formatCompactRupees(h.current_value ?? h.value)}</span>
                                        <Pencil className="size-3 text-muted-foreground opacity-0 transition-opacity group-hover/value:opacity-100" />
                                      </button>
                                    )}
                                    <p className="mt-0.5 text-[10px] text-muted-foreground">{isUnitPriced ? "price / unit" : "recorded balance"}</p>
                                  </td>
                                  <td className="py-2.5 pr-3">
                                    <div className="flex items-center gap-2">
                                      <ProvenanceBadge
                                        kind={h.price_source === "manual" ? "manual" : "current"}
                                        note={`Source: ${h.price_source}`}
                                      />
                                      <span className="text-[11px] text-muted-foreground">
                                        {relativeTime(h.price_updated_at)}
                                      </span>
                                    </div>
                                  </td>
                                  <td className="py-2.5 pr-2 text-right">
                                    <div className="flex items-center justify-end gap-1">
                                      <button
                                        type="button"
                                        className="inline-flex items-center gap-1 rounded border border-border-subtle bg-surface-2 px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-surface-3 hover:text-foreground"
                                        onClick={() => setEditing(h)}
                                        title="Edit holding"
                                      >
                                        <Pencil className="h-3.5 w-3.5" />
                                        <span className="hidden sm:inline">Edit</span>
                                      </button>
                                      <button
                                        type="button"
                                        className="inline-flex items-center gap-1 rounded border border-border-subtle bg-surface-2 px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-destructive/15 hover:text-destructive"
                                        onClick={() => setDeleteTarget({ id: h.id, name: h.name })}
                                        disabled={busy}
                                        title="Delete holding"
                                      >
                                        <Trash2 className="h-3.5 w-3.5" />
                                        <span className="hidden sm:inline">Delete</span>
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                                <tr>
                                  <td colSpan={6} className="p-0">
                                    <HoldingDetailExpandable
                                      holding={h}
                                      totalValue={summary.totalValue}
                                      transactions={transactions.filter(
                                        (transaction) => transaction.holding_id === h.id,
                                      )}
                                      open={expanded}
                                      onToggle={() => setExpandedHoldingId(expanded ? null : h.id)}
                                      onEdit={() => setEditing(h)}
                                      onDelete={() => setDeleteTarget({ id: h.id, name: h.name })}
                                    />
                                  </td>
                                </tr>
                              </Fragment>
                            );
                          })}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </Panel>
          ) : null}

          {view === "allocation" ? (
            <Panel
              title="Allocation"
              description="Current allocation, target allocation, drift and how the mix has moved."
            >
              <AllocationAnalysis
                rows={rebalancePlan.rows}
                target={rebalancePlan.target.target}
                snapshots={snapshots}
              />
              <RebalanceAnalysis
                rows={rebalancePlan.rows}
                actions={rebalancePlan.plan.actions}
                monthlyContribution={rebalancePlan.plan.contributionRoute.monthlyContribution}
                monthsToCorrect={rebalancePlan.plan.contributionRoute.monthsToCorrect}
              />
            </Panel>
          ) : null}

          {view === "risk" ? (
            <Panel
              title="Portfolio health"
              description="Five useful signals instead of one composite score."
            >
              <HealthSignals signals={analysis.health} />
              <div className="mt-10 border-t border-border-subtle pt-8">
                <div className="mb-6">
                  <h3 className="text-[14px] font-medium text-foreground">Risk exposures</h3>
                  <p className="mt-1 text-[12px] text-muted-foreground">
                    Where concentration, overlap and access could change the outcome.
                  </p>
                </div>
                <RiskAxes axes={analysis.axes} />
              </div>
            </Panel>
          ) : null}

          {view === "performance" ? (
            <Panel
              title="Performance"
              description="Portfolio value history, invested capital, contributions, drawdown and recovery."
            >
              <PerformanceAnalysis points={analysis.performance} />
            </Panel>
          ) : null}
        </div>

        <div className="space-y-6">
          {view === "overview" && pieSlices.length > 0 ? (
            <Panel title="Where the money sits">
              <Donut
                slices={pieSlices}
                centreLabel="Portfolio"
                centreValue={summary.totalValue}
                formatValue={formatCompactRupees}
                size={188}
              />
              <DonutLegend
                slices={pieSlices}
                total={summary.totalValue}
                format={formatCompactRupees}
              />
            </Panel>
          ) : null}

          {editing ? (
            <HoldingForm
              value={editing}
              onChange={setEditing}
              onSubmit={onSave}
              busy={busy}
              error={error}
              onCancel={() => setEditing(null)}
            />
          ) : null}
        </div>
      </div>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleteTarget?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes it from your active portfolio calculations. Historical ledger events will remain intact.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={busy}
              onClick={() => deleteTarget && void onDelete(deleteTarget.id)}
            >
              {busy ? "Deleting…" : "Delete holding"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}

function HoldingForm({
  value,
  onChange,
  onSubmit,
  onCancel,
  busy,
  error,
}: {
  value: HoldingInput;
  onChange: (v: HoldingInput) => void;
  onSubmit: () => void | Promise<void>;
  onCancel: () => void;
  busy: boolean;
  error?: string | null;
}) {
  const unitPriced = UNIT_PRICED.includes(value.instrument_type);
  const set = <K extends keyof HoldingInput>(k: K, v: HoldingInput[K]) =>
    onChange({ ...value, [k]: v });
  const numberOrNull = (raw: string) => (raw.trim() === "" ? null : Number(raw));

  const quote = useServerFn(lookupQuote);
  const [quoting, setQuoting] = useState(false);
  const [quoteNote, setQuoteNote] = useState<string | null>(null);

  // Universal instrument lookup: one box across AMFI funds and NSE/BSE listings.
  function pickInstrument(hit: InstrumentHit) {
    const next: HoldingInput = { ...value, name: hit.name, symbol: hit.symbol };
    next.instrument_type = hit.kind;
    next.asset_class = DEFAULT_ASSET_CLASS[hit.kind];
    if (hit.kind === "mutual_fund") {
      next.isin = hit.isin;
      next.current_price = hit.price;
      next.price_source = "amfi_nav";
      next.price_updated_at = new Date().toISOString();
    }
    onChange(next);
  }

  /** Shared resolver reply — fills the price and class we couldn't know from the hit alone. */
  function applyResolved(r: ResolvedInstrument) {
    onChange({
      ...value,
      name: r.name,
      symbol: r.symbol,
      isin: r.isin,
      instrument_type: r.type,
      asset_class: r.assetClass,
      ...(r.price !== null
        ? {
            current_price: r.price,
            price_source: r.source === "amfi_nav" ? "amfi_nav" : "yahoo_quote",
            price_updated_at: r.asOf ?? new Date().toISOString(),
          }
        : {}),
    });
  }

  async function onFetchPrice() {
    if (!value.symbol) return;
    setQuoting(true);
    setQuoteNote(null);
    try {
      const res = await quote({ data: { symbol: value.symbol } });
      if (!res.ok) {
        setQuoteNote(res.reason);
        return;
      }
      onChange({
        ...value,
        current_price: res.quote.price,
        price_source: "yahoo_quote",
        price_updated_at: new Date().toISOString(),
      });
      setQuoteNote(`${res.quote.resolvedSymbol}: ₹${res.quote.price} (delayed quote)`);
    } catch (e) {
      setQuoteNote(e instanceof Error ? e.message : "Quote lookup failed.");
    } finally {
      setQuoting(false);
    }
  }

  const nameValid = value.name.trim().length > 1;
  const positionValid = unitPriced
    ? (value.quantity ?? 0) > 0 && (value.current_price ?? 0) > 0
    : (value.current_value ?? 0) > 0;

  return (
    <WizardModal
      open
      title={value.id ? "Edit holding" : "Add holding"}
      busy={busy}
      onClose={onCancel}
      onSubmit={onSubmit}
      saveLabel="Save holding"
      steps={[
        {
          title: "What do you own?",
          blurb: "Search the official fund list and NSE/BSE — the rest fills itself in.",
          valid: nameValid,
          content: (
            <>
              <WizardField label="Search or enter investment" valid={nameValid}>
                <InstrumentSearch onPick={pickInstrument} onResolve={applyResolved} />
              </WizardField>
              <WizardField label="Name" valid={nameValid}>
                <input
                  className={wizardInputClass}
                  value={value.name}
                  onChange={(e) => set("name", e.target.value)}
                  placeholder="Or type any name"
                />
              </WizardField>
              <WizardField label="Type">
                <Segmented
                  ariaLabel="Instrument type"
                  value={value.instrument_type}
                  onChange={(t) =>
                    onChange({
                      ...value,
                      instrument_type: t as InstrumentType,
                      asset_class: DEFAULT_ASSET_CLASS[t as InstrumentType],
                    })
                  }
                  options={INSTRUMENT_TYPES.map((t) => ({ value: t, label: t.replace("_", " ") }))}
                />
              </WizardField>
              <p className="text-[12px] text-[color:var(--text-tertiary)]">
                Asset class, ISIN and price are derived automatically where a feed exists.
              </p>
            </>
          ),
        },
        {
          title: "How much?",
          blurb: unitPriced ? "Units you hold today." : "Balance as it stands today.",
          valid: unitPriced ? (value.quantity ?? 0) > 0 : (value.current_value ?? 0) > 0,
          content: unitPriced ? (
            <>
              <WizardField label="Quantity" valid={(value.quantity ?? 0) > 0}>
                <input
                  className={wizardInputClass}
                  inputMode="decimal"
                  value={value.quantity ?? ""}
                  onChange={(e) => set("quantity", numberOrNull(e.target.value))}
                />
              </WizardField>
              <WizardField
                label="Symbol or scheme code"
                hint={quoteNote ?? "Needed only to refresh the price automatically."}
              >
                <div className="flex gap-2">
                  <input
                    className={wizardInputClass}
                    value={value.symbol ?? ""}
                    onChange={(e) => set("symbol", e.target.value || null)}
                  />
                  <button
                    type="button"
                    className={ghostButtonClass}
                    onClick={onFetchPrice}
                    disabled={quoting || !value.symbol}
                  >
                    {quoting ? "…" : "Fetch price"}
                  </button>
                </div>
              </WizardField>
            </>
          ) : (
            <WizardField label="Current balance" valid={(value.current_value ?? 0) > 0}>
              <FinancialAmountInput
                value={value.current_value}
                onChange={(v) => set("current_value", v)}
              />
            </WizardField>
          ),
        },
        {
          title: "What did you pay?",
          blurb: "Cost drives gain, XIRR and tax.",
          valid: positionValid,
          content: unitPriced ? (
            <>
              <WizardField label="Average buy price">
                <FinancialAmountInput
                  value={value.avg_price}
                  onChange={(v) => set("avg_price", v)}
                  placeholder="Per unit"
                />
              </WizardField>
              <WizardField label="Current price" valid={(value.current_price ?? 0) > 0}>
                <FinancialAmountInput
                  value={value.current_price}
                  onChange={(v) => set("current_price", v)}
                  placeholder="Per unit"
                />
              </WizardField>
            </>
          ) : (
            <>
              <WizardField label="Amount contributed" hint="Used for gain and XIRR.">
                <FinancialAmountInput
                  value={value.cost_basis}
                  onChange={(v) => set("cost_basis", v)}
                />
              </WizardField>
              <WizardField label="Interest rate">
                <PercentInput
                  value={value.interest_rate}
                  onChange={(v) => set("interest_rate", v)}
                  min={0}
                  max={30}
                  placeholder="e.g. 7.1"
                />
              </WizardField>
            </>
          ),
        },
        {
          title: "When did you buy it?",
          blurb: "Sets the holding period for capital gains tax.",
          content: (
            <>
              <WizardField label="Purchase date">
                <DatePickerInput
                  value={value.purchase_date}
                  onChange={(v) => set("purchase_date", v)}
                  placeholder="e.g. 12 Jan 2024"
                  min="1980-01-01"
                  max={new Date().toISOString().slice(0, 10)}
                  ariaLabel="Purchase date"
                />
              </WizardField>
              <AdvancedDetails summary="Sector, tax, liquidity, notes">
                <WizardField
                  label="Asset class"
                  hint="Derived from the type — override only if you disagree."
                >
                  <Segmented
                    ariaLabel="Asset class"
                    value={value.asset_class}
                    onChange={(c) => set("asset_class", c as AssetClass)}
                    options={ASSET_CLASSES.map((c) => ({ value: c, label: c }))}
                  />
                </WizardField>
                <WizardField label="ISIN" hint="Matches AMFI NAVs and broker imports.">
                  <input
                    className={wizardInputClass}
                    value={value.isin ?? ""}
                    onChange={(e) => set("isin", e.target.value.toUpperCase() || null)}
                  />
                </WizardField>
                <div className="grid gap-5 sm:grid-cols-2">
                  <WizardField label="Sector">
                    <input
                      className={wizardInputClass}
                      value={value.sector ?? ""}
                      onChange={(e) => set("sector", e.target.value || null)}
                    />
                  </WizardField>
                  <WizardField label="Geography">
                    <input
                      className={wizardInputClass}
                      value={value.geography ?? ""}
                      onChange={(e) => set("geography", e.target.value || null)}
                      placeholder="India"
                    />
                  </WizardField>
                </div>
                <WizardField label="Cap segment">
                  <Segmented
                    ariaLabel="Cap segment"
                    value={value.cap_segment ?? ""}
                    onChange={(v) => set("cap_segment", v || null)}
                    options={[
                      { value: "large", label: "Large" },
                      { value: "mid", label: "Mid" },
                      { value: "small", label: "Small" },
                      { value: "multi", label: "Multi" },
                    ]}
                  />
                </WizardField>
                <WizardField
                  label="Tax treatment"
                  hint="Overrides the default rule for this instrument."
                >
                  <input
                    className={wizardInputClass}
                    value={value.tax_treatment ?? ""}
                    onChange={(e) => set("tax_treatment", e.target.value || null)}
                    placeholder="e.g. equity LTCG"
                  />
                </WizardField>
                <WizardField label="Liquidity" hint="Feeds emergency-fund coverage.">
                  <Segmented
                    ariaLabel="Liquidity"
                    value={value.liquidity ?? ""}
                    onChange={(v) => set("liquidity", v || null)}
                    options={[
                      { value: "liquid", label: "Liquid" },
                      { value: "semi_liquid", label: "Semi-liquid" },
                      { value: "locked", label: "Locked" },
                    ]}
                  />
                </WizardField>
                <WizardField label="Notes">
                  <NotesInput value={value.notes} onChange={(v) => set("notes", v)} />
                </WizardField>
              </AdvancedDetails>
            </>
          ),
        },
      ]}
      review={[
        { label: "Name", value: value.name },
        { label: "Type", value: value.instrument_type.replace("_", " ") },
        { label: "Asset class", value: value.asset_class },
        ...(unitPriced
          ? [
              { label: "Quantity", value: String(value.quantity ?? "—") },
              {
                label: "Current price",
                value: value.current_price ? formatRupees(value.current_price) : "—",
              },
              {
                label: "Value",
                value: formatRupees((value.quantity ?? 0) * (value.current_price ?? 0)),
              },
            ]
          : [{ label: "Current balance", value: formatRupees(value.current_value ?? 0) }]),
        { label: "ISIN", value: value.isin ?? "—" },
        { label: "Purchase date", value: value.purchase_date ?? "—" },
        { label: "Liquidity", value: (value.liquidity ?? "not set").replace("_", " ") },
        ...(error ? [{ label: "Error", value: error }] : []),
      ]}
    />
  );
}

export type { Holding };
