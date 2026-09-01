import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { Download, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useLaunchAction } from "@/lib/launch";
import { AppShell, Panel } from "@/components/AppShell";
import { AlertRow, Figure, buttonClass, ghostButtonClass } from "@/components/Bits";
import { DatePickerInput, FinancialAmountInput, NotesInput, WizardModal, WizardField, Segmented, wizardInputClass, type WizardStep } from "@/components/Wizard";
import {
  deleteTransaction,
  exportWorkspace,
  loadTransactions,
  loadWorkspace,
  saveTransaction,
  type TransactionInput,
} from "@/lib/data.functions";
import { formatPct, formatRupees } from "@/lib/finance/format";
import {
  buildLedger,
  ledgerXirr,
  summariseByFinancialYear,
  TRANSACTION_KINDS,
  TRANSACTION_LABELS,
  type TransactionKind,
} from "@/lib/finance/ledger";
import { summarisePortfolio } from "@/lib/finance/portfolio";
import { ASSET_CLASSES, INSTRUMENT_TYPES, type AssetClass, type InstrumentType } from "@/lib/finance/types";

export const Route = createFileRoute("/ledger")({
  loader: async () => {
    const [workspace, transactions] = await Promise.all([loadWorkspace(), loadTransactions()]);
    return { workspace, transactions };
  },
  head: () => ({
    meta: [
      { title: "Sahil's Finance Intelligence — Ledger" },
      {
        name: "description",
        content:
          "Every buy, sell, dividend and withdrawal in one event log, with FIFO cost basis, realised gains by financial year and money-weighted return.",
      },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Sahil's Finance Intelligence — Ledger" },
      {
        property: "og:description",
        content: "The transaction record behind cost basis, realised gains and XIRR.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: LedgerPage,
});

const today = () => new Date().toISOString().slice(0, 10);

function emptyDraft(): TransactionInput {
  return {
    kind: "buy",
    trade_date: today(),
    settlement_date: null,
    name: "",
    symbol: null,
    isin: null,
    asset_class: "equity",
    instrument_type: "mutual_fund",
    quantity: null,
    price: null,
    amount: 0,
    fees: 0,
    taxes: 0,
    currency: "INR",
    source: "manual",
    external_id: null,
    notes: null,
    holding_id: null,
  };
}

function LedgerPage() {
  const { workspace, transactions } = Route.useLoaderData();
  const router = useRouter();
  const save = useServerFn(saveTransaction);
  const remove = useServerFn(deleteTransaction);
  const exportAll = useServerFn(exportWorkspace);

  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<TransactionInput>(emptyDraft);
  useLaunchAction("add-transaction", () => {
    setDraft(emptyDraft);
    setOpen(true);
  });

  const portfolio = useMemo(
    () => summarisePortfolio(workspace.holdings, transactions),
    [workspace.holdings, transactions],
  );
  const ledger = useMemo(() => buildLedger(transactions), [transactions]);
  const fyRows = useMemo(
    () => summariseByFinancialYear(transactions, ledger.realised),
    [transactions, ledger.realised],
  );
  const xirrPct = useMemo(
    () => ledgerXirr(transactions, portfolio.totalValue),
    [transactions, portfolio.totalValue],
  );
  const currentFy = fyRows[0] ?? null;

  const totalIncome = useMemo(
    () => ledger.positions.reduce((a, p) => a + p.income, 0),
    [ledger.positions],
  );
  const totalRealised = useMemo(
    () => ledger.realised.reduce((a, r) => a + r.gain, 0),
    [ledger.realised],
  );

  const update = (patch: Partial<TransactionInput>) => setDraft((d) => ({ ...d, ...patch }));
  const needsUnits = draft.kind === "buy" || draft.kind === "sell" || draft.kind === "bonus";

  async function submit() {
    setBusy(true);
    try {
      await save({ data: draft });
      toast.success("Transaction recorded");
      setOpen(false);
      setDraft(emptyDraft());
      await router.invalidate();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save the transaction");
    } finally {
      setBusy(false);
    }
  }

  async function onDelete(id: string, name: string) {
    try {
      await remove({ data: { id } });
      toast.success(`Removed ${name}`);
      await router.invalidate();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not delete the transaction");
    }
  }

  function download(filename: string, content: string, type: string) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportLedgerCsv() {
    const header = [
      "trade_date",
      "kind",
      "name",
      "symbol",
      "isin",
      "asset_class",
      "instrument_type",
      "quantity",
      "price",
      "amount",
      "fees",
      "taxes",
      "notes",
    ];
    const escape = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const rows = transactions.map((t) =>
      [
        t.trade_date,
        t.kind,
        t.name,
        t.symbol,
        t.isin,
        t.asset_class,
        t.instrument_type,
        t.quantity,
        t.price,
        t.amount,
        t.fees,
        t.taxes,
        t.notes,
      ]
        .map(escape)
        .join(","),
    );
    download(`ledger-${today()}.csv`, [header.join(","), ...rows].join("\n"), "text/csv");
    toast.success("Ledger exported as CSV");
  }

  async function exportJson() {
    try {
      const data = await exportAll();
      download(`investment-workspace-${today()}.json`, JSON.stringify(data, null, 2), "application/json");
      toast.success("Full workspace exported");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed");
    }
  }

  const steps: WizardStep[] = [
    {
      title: "What happened",
      blurb: "Pick the event and when it took place.",
      valid: draft.trade_date.length === 10,
      content: (
        <div className="grid gap-5">
          <WizardField label="Event">
            <Segmented
              value={draft.kind}
              ariaLabel="Transaction type"
              options={TRANSACTION_KINDS.map((k) => ({ value: k, label: TRANSACTION_LABELS[k] }))}
              onChange={(kind: TransactionKind) => update({ kind })}
            />
          </WizardField>
          <WizardField label="Trade date" hint="The date the money actually moved.">
            <DatePickerInput
              value={draft.trade_date}
              onChange={(v) => update({ trade_date: v ?? "" })}
              placeholder="Today"
              clearable={false}
              min="1980-01-01"
              max={new Date().toISOString().slice(0, 10)}
              ariaLabel="Trade date"
            />
          </WizardField>
        </div>
      ),
    },
    {
      title: "Which instrument",
      blurb: "Name it the same way each time so events group into one position.",
      valid: draft.name.trim().length > 1,
      content: (
        <div className="grid gap-5">
          <WizardField label="Name" valid={draft.name.trim().length > 1}>
            <input
              className={wizardInputClass}
              value={draft.name}
              placeholder="e.g. Parag Parikh Flexi Cap"
              onChange={(e) => update({ name: e.target.value })}
            />
          </WizardField>
          <div className="grid gap-4 sm:grid-cols-2">
            <WizardField label="Symbol" hint="Optional — NSE symbol or scheme code.">
              <input
                className={wizardInputClass}
                value={draft.symbol ?? ""}
                onChange={(e) => update({ symbol: e.target.value || null })}
              />
            </WizardField>
            <WizardField label="ISIN" hint="Optional, but the most reliable way to match events.">
              <input
                className={wizardInputClass}
                value={draft.isin ?? ""}
                onChange={(e) => update({ isin: e.target.value.toUpperCase() || null })}
              />
            </WizardField>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <WizardField label="Asset class">
              <select
                className={wizardInputClass}
                value={draft.asset_class}
                onChange={(e) => update({ asset_class: e.target.value as AssetClass })}
              >
                {ASSET_CLASSES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </WizardField>
            <WizardField label="Instrument type" hint="Drives the holding period used for tax.">
              <select
                className={wizardInputClass}
                value={draft.instrument_type}
                onChange={(e) => update({ instrument_type: e.target.value as InstrumentType })}
              >
                {INSTRUMENT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t.replace("_", " ")}
                  </option>
                ))}
              </select>
            </WizardField>
          </div>
        </div>
      ),
    },
    {
      title: "Amounts",
      blurb: "Enter gross amounts; fees and taxes are handled separately.",
      valid: draft.kind === "bonus" ? (draft.quantity ?? 0) > 0 : draft.amount > 0,
      content: (
        <div className="grid gap-5">
          {needsUnits ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <WizardField label="Units" hint="Leave blank for balance-style instruments like an FD.">
                <input
                  type="number"
                  step="0.0001"
                  placeholder="e.g. 100"
                  className={wizardInputClass}
                  value={draft.quantity ?? ""}
                  onChange={(e) => update({ quantity: e.target.value === "" ? null : Number(e.target.value) })}
                />
              </WizardField>
              <WizardField label="Price per unit">
                <FinancialAmountInput
                  placeholder="e.g. 1,250"
                  value={draft.price}
                  onChange={(price) => {
                    const amount =
                      price !== null && draft.quantity ? Number((price * draft.quantity).toFixed(2)) : draft.amount;
                    update({ price, amount });
                  }}
                />
              </WizardField>
            </div>
          ) : null}
          <WizardField label="Gross amount" hint="Units × price for trades; the payout for dividends.">
            <FinancialAmountInput
              value={draft.amount}
              onChange={(v) => update({ amount: v ?? 0 })}
            />
          </WizardField>
          <div className="grid gap-4 sm:grid-cols-2">
            <WizardField label="Fees & brokerage">
              <FinancialAmountInput
                value={draft.fees}
                onChange={(v) => update({ fees: v ?? 0 })}
              />
            </WizardField>
            <WizardField label="Taxes (STT, stamp duty)">
              <FinancialAmountInput
                value={draft.taxes}
                onChange={(v) => update({ taxes: v ?? 0 })}
              />
            </WizardField>
          </div>
          <WizardField label="Notes" hint="Optional context you'll want in a year's time.">
            <NotesInput value={draft.notes} onChange={(notes) => update({ notes })} />
          </WizardField>
        </div>
      ),
    },
  ];

  return (
    <AppShell
      title="Ledger"
      subtitle="The event record behind every derived number: FIFO cost basis, realised gains by financial year, income and money-weighted return all come from these rows."
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className={ghostButtonClass} onClick={exportLedgerCsv}>
            <Download className="mr-1.5 inline h-3.5 w-3.5" /> CSV
          </button>
          <button type="button" className={ghostButtonClass} onClick={exportJson}>
            <Download className="mr-1.5 inline h-3.5 w-3.5" /> Full JSON
          </button>
          <button type="button" className={buttonClass} onClick={() => setOpen(true)}>
            <Plus className="mr-1.5 inline h-3.5 w-3.5" /> Record transaction
          </button>
        </div>
      }
    >
      <section className="border-b border-border-subtle pb-8">
        <p className="eyebrow text-[color:var(--text-secondary)]">
          {transactions.length === 0 ? "Money-weighted return — estimated" : "Money-weighted return"}
        </p>
        <p className="metric-xl mt-3 privacy-sensitive">
          {xirrPct === null ? "—" : formatPct(xirrPct)}
        </p>
        <p className="mt-3 max-w-2xl text-[13px] leading-relaxed text-[color:var(--text-secondary)]">
          {transactions.length === 0
            ? "Record your first transaction to unlock realised gains, cost basis and a true XIRR. Until then, returns fall back to the purchase dates on your holdings."
            : `Based on transaction history: ${transactions.length} recorded events and a current portfolio value of ${formatRupees(portfolio.totalValue)}. Every dated cash flow is included, plus today's value as the closing inflow.`}
        </p>

        <dl className="mt-8 grid gap-x-10 gap-y-6 sm:grid-cols-2 lg:grid-cols-4">
          <Figure
            label="Realised gains"
            value={formatRupees(totalRealised)}
            note="All years, after fees"
            tone={totalRealised >= 0 ? "positive" : "negative"}
          />
          <Figure label="Dividends & interest" value={formatRupees(totalIncome)} note="Recorded income" />
          <Figure
            label={currentFy ? `Invested in ${currentFy.label}` : "Invested this year"}
            value={formatRupees(currentFy?.invested ?? 0)}
            note={currentFy ? `${currentFy.transactions} events` : "No events yet"}
          />
          <Figure
            label="Open positions"
            value={String(ledger.positions.filter((p) => p.quantity > 1e-9 || p.costBasis > 1).length)}
            note="Reconstructed from the ledger"
            sensitive={false}
          />
        </dl>
      </section>

      {ledger.warnings.length > 0 ? (
        <div className="mt-6 grid gap-2">
          {ledger.warnings.map((w) => (
            <AlertRow key={w} level="warning" title="Incomplete history" detail={w} />
          ))}
        </div>
      ) : null}

      <div className="mt-8 grid gap-8 lg:grid-cols-[1.4fr_1fr]">
        <section>
          <p className="eyebrow text-[color:var(--text-secondary)]">Events</p>
          {transactions.length === 0 ? (
            <p className="mt-4 max-w-md text-[13px] leading-relaxed text-[color:var(--text-secondary)]">
              Nothing recorded yet. Add a buy to start building cost basis — the ledger never invents history,
              so gains only appear once the matching purchase exists.
            </p>
          ) : (
            <ul className="mt-4 divide-y divide-[color:var(--border-subtle)]">
              {transactions.map((t) => (
                <li key={t.id} className="group flex items-baseline justify-between gap-4 py-3.5">
                  <div className="min-w-0">
                    <p className="truncate text-[14px] text-foreground">{t.name}</p>
                    <p className="mt-0.5 text-[12px] text-[color:var(--text-tertiary)]">
                      {TRANSACTION_LABELS[t.kind]} · {t.trade_date}
                      {t.quantity ? ` · ${t.quantity} units` : ""}
                      {t.price ? ` @ ${formatRupees(t.price)}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="privacy-sensitive tabular text-[13px] text-foreground">
                      {formatRupees(t.amount)}
                    </span>
                    <button
                      type="button"
                      aria-label={`Delete ${t.name} on ${t.trade_date}`}
                      onClick={() => onDelete(t.id, t.name)}
                      className="rounded p-1 text-[color:var(--text-tertiary)] opacity-0 transition-opacity hover:text-destructive focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--color-primary)] group-hover:opacity-100"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="grid gap-6">
          <Panel collapsible title="By financial year" description="April to March.">
            {fyRows.length === 0 ? (
              <p className="text-[13px] text-[color:var(--text-secondary)]">No events recorded yet.</p>
            ) : (
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="text-left text-[color:var(--text-tertiary)]">
                    <th className="pb-2 font-normal">Year</th>
                    <th className="pb-2 text-right font-normal">Invested</th>
                    <th className="pb-2 text-right font-normal">Short term</th>
                    <th className="pb-2 text-right font-normal">Long term</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[color:var(--border-subtle)]">
                  {fyRows.map((r) => (
                    <tr key={r.label}>
                      <td className="py-2 text-foreground">{r.label}</td>
                      <td className="privacy-sensitive tabular py-2 text-right">{formatRupees(r.invested)}</td>
                      <td className="privacy-sensitive tabular py-2 text-right">
                        {formatRupees(r.realisedShortTerm)}
                      </td>
                      <td className="privacy-sensitive tabular py-2 text-right">
                        {formatRupees(r.realisedLongTerm)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Panel>

          <Panel collapsible title="Positions from the ledger" description="Rebuilt FIFO from transactions.">
            {ledger.positions.length === 0 ? (
              <p className="text-[13px] text-[color:var(--text-secondary)]">Nothing to reconstruct yet.</p>
            ) : (
              <ul className="divide-y divide-[color:var(--border-subtle)]">
                {ledger.positions.slice(0, 12).map((p) => (
                  <li key={p.key} className="flex items-baseline justify-between gap-4 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-[13px] text-foreground">{p.name}</p>
                      <p className="text-[11px] text-[color:var(--text-tertiary)]">
                        {p.quantity > 1e-9 ? `${p.quantity.toFixed(3)} units` : "Balance"}
                        {p.averageCost ? ` · avg ${formatRupees(p.averageCost)}` : ""}
                      </p>
                    </div>
                    <span className="privacy-sensitive tabular text-[13px]">{formatRupees(p.costBasis)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>

      <WizardModal
        open={open}
        title="Record a transaction"
        steps={steps}
        busy={busy}
        saveLabel="Record"
        onClose={() => setOpen(false)}
        onSubmit={submit}
        review={[
          { label: "Event", value: TRANSACTION_LABELS[draft.kind] },
          { label: "Date", value: draft.trade_date },
          { label: "Instrument", value: draft.name || "—" },
          { label: "Units", value: draft.quantity ? String(draft.quantity) : "—" },
          { label: "Amount", value: formatRupees(draft.amount) },
          { label: "Fees & taxes", value: formatRupees(draft.fees + draft.taxes) },
        ]}
      />
    </AppShell>
  );
}
