import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, FileUp, ShieldCheck, TriangleAlert } from "lucide-react";
import { AppShell, Panel } from "@/components/AppShell";
import { buttonClass, ghostButtonClass } from "@/components/Bits";
import { Segmented } from "@/components/Wizard";
import { loadWorkspace, importHoldings, importTransactions } from "@/lib/data.functions";
import { parseBrokerCsv, type ParsedHolding } from "@/lib/import/csv";
import { parseTransactionCsv, type ParsedTransaction } from "@/lib/import/transactions";
import {
  reconcileHoldings,
  reconcileTransactions,
  summariseReconciliation,
  type ReconciledHolding,
  type ReconciledTransaction,
} from "@/lib/import/reconcile";
import { detectDocument, SOURCE_LABELS, type Detection, type ImportKind } from "@/lib/import/detect";
import { extractFile, isSupportedFile, type Extraction } from "@/lib/import/extract";
import {
  findStatedTotal,
  reconcileHoldingBalances,
  reconcileTransactionBalances,
  type Reconciliation,
} from "@/lib/import/balance";
import { formatCompactRupees, formatRupees } from "@/lib/finance/format";
import { TRANSACTION_LABELS } from "@/lib/finance/ledger";

export const Route = createFileRoute("/import")({
  loader: () => loadWorkspace(),
  head: () => ({
    meta: [
      { title: "Sahil's Finance Intelligence — Import data" },
      {
        name: "description",
        content:
          "Bring in broker statements from CSV, XLSX or PDF. Every row is identified, matched and reviewed before anything is written.",
      },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Sahil's Finance Intelligence — Import data" },
      { property: "og:description", content: "Review every parsed row before it reaches your portfolio." },
    ],
  }),
  component: ImportPage,
});

type Stage = "upload" | "identify" | "review" | "report";

type Report = {
  kind: ImportKind;
  imported: number;
  skipped: number;
  needReview: number;
  unreadable: number;
};

const STAGES: { id: Stage; label: string }[] = [
  { id: "upload", label: "Upload" },
  { id: "identify", label: "Identify" },
  { id: "review", label: "Review" },
  { id: "report", label: "Report" },
];

function ImportPage() {
  const { holdings, transactions } = Route.useLoaderData();
  const router = useRouter();
  const runHoldings = useServerFn(importHoldings);
  const runTransactions = useServerFn(importTransactions);

  const [stage, setStage] = useState<Stage>("upload");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [extraction, setExtraction] = useState<Extraction | null>(null);
  const [detection, setDetection] = useState<Detection | null>(null);
  const [kind, setKind] = useState<ImportKind>("holdings");
  const [raw, setRaw] = useState("");
  const [excluded, setExcluded] = useState<Set<number>>(new Set());
  const [showOnlyAttention, setShowOnlyAttention] = useState(false);
  const [report, setReport] = useState<Report | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);

  const parsedHoldings = useMemo(
    () => (kind === "holdings" && raw.trim() ? parseBrokerCsv(raw) : null),
    [kind, raw],
  );
  const parsedTransactions = useMemo(
    () => (kind === "transactions" && raw.trim() ? parseTransactionCsv(raw) : null),
    [kind, raw],
  );
  const reconciledHoldings = useMemo(
    () => (parsedHoldings ? reconcileHoldings(parsedHoldings.rows, holdings) : []),
    [parsedHoldings, holdings],
  );
  const reconciledTransactions = useMemo(
    () => (parsedTransactions ? reconcileTransactions(parsedTransactions.rows, transactions) : []),
    [parsedTransactions, transactions],
  );

  const rows: (ReconciledHolding | ReconciledTransaction)[] =
    kind === "holdings" ? reconciledHoldings : reconciledTransactions;
  const parseResult = kind === "holdings" ? parsedHoldings : parsedTransactions;
  const summary = summariseReconciliation(rows);

  const attention = (item: ReconciledHolding | ReconciledTransaction) =>
    item.status === "conflict" || item.confidence === "review";
  const readyByDefault = (item: ReconciledHolding | ReconciledTransaction) =>
    !attention(item) && item.status !== "unchanged";

  // A row is selected when it is ready and not excluded, or when the user has
  // explicitly opted a questionable row in.
  const [manuallyIncluded, setManuallyIncluded] = useState<Set<number>>(new Set());
  const selected = rows.filter(
    (item) => !excluded.has(item.index) && (readyByDefault(item) || manuallyIncluded.has(item.index)),
  );

  const stated = useMemo(() => (raw.trim() ? findStatedTotal(raw) : null), [raw]);

  const reconciliation: Reconciliation = useMemo(
    () =>
      kind === "holdings"
        ? reconcileHoldingBalances(selected as ReconciledHolding[], holdings, stated?.value ?? null)
        : reconcileTransactionBalances(selected as ReconciledTransaction[], transactions, stated?.value ?? null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [kind, rows, excluded, manuallyIncluded, holdings, transactions, stated],
  );

  function toggleRow(item: ReconciledHolding | ReconciledTransaction) {
    const isOn = !excluded.has(item.index) && (readyByDefault(item) || manuallyIncluded.has(item.index));
    if (isOn) {
      setExcluded((prev) => new Set(prev).add(item.index));
      setManuallyIncluded((prev) => {
        const next = new Set(prev);
        next.delete(item.index);
        return next;
      });
    } else {
      setExcluded((prev) => {
        const next = new Set(prev);
        next.delete(item.index);
        return next;
      });
      setManuallyIncluded((prev) => new Set(prev).add(item.index));
    }
  }

  async function onFile(file: File) {
    setError(null);
    if (!isSupportedFile(file)) {
      setError("Supported files: CSV, TSV, XLSX or PDF.");
      return;
    }
    setBusy(true);
    setFileName(file.name);
    try {
      const result = await extractFile(file);
      setExtraction(result);
      setRaw(result.text);
      const detected = detectDocument(result.text, file.name);
      setDetection(detected);
      setKind(detected.kind);
      reset();
      setStage("identify");
    } catch (e) {
      setError(e instanceof Error ? e.message : "That file could not be read.");
    } finally {
      setBusy(false);
    }
  }

  function usePasted() {
    if (!raw.trim()) return;
    setFileName(null);
    setExtraction({
      text: raw,
      method: "paste",
      confidence: "high",
      notes: ["Pasted text — read exactly as given."],
    });
    const detected = detectDocument(raw, "");
    setDetection(detected);
    setKind(detected.kind);
    reset();
    setStage("identify");
  }

  function reset() {
    setExcluded(new Set());
    setManuallyIncluded(new Set());
    setReport(null);
    setAcknowledged(false);
  }

  function startOver() {
    setRaw("");
    setFileName(null);
    setExtraction(null);
    setDetection(null);
    setError(null);
    reset();
    setStage("upload");
  }

  async function commit() {
    setBusy(true);
    setError(null);
    try {
      const unreadable = parseResult?.skipped.length ?? 0;
      const needReview = rows.filter((item) => attention(item) && !manuallyIncluded.has(item.index)).length;
      if (kind === "holdings") {
        const payload = (selected as ReconciledHolding[]).map((item) => item.row as ParsedHolding);
        const res = await runHoldings({ data: { rows: payload, source: sourceTag() } });
        setReport({
          kind,
          imported: res.created + res.updated,
          skipped: rows.length - selected.length - needReview,
          needReview,
          unreadable,
        });
      } else {
        const payload = (selected as ReconciledTransaction[]).map((item) => item.row as ParsedTransaction);
        const res = await runTransactions({ data: { rows: payload, source: sourceTag() } });
        setReport({
          kind,
          imported: res.created,
          skipped: res.skipped + (rows.length - selected.length - needReview),
          needReview,
          unreadable,
        });
      }
      await router.invalidate();
      setStage("report");
      toast.success("Import complete.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "The import could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  const sourceTag = () => (detection ? `${detection.source}_${extraction?.method ?? "csv"}` : "broker_statement");

  const visibleRows = showOnlyAttention ? rows.filter(attention) : rows;

  return (
    <AppShell
      title="Import data"
      subtitle="Nothing is written until you confirm. Rows that cannot be read confidently are shown to you, never dropped."
      actions={
        stage !== "upload" ? (
          <button className={ghostButtonClass} onClick={startOver} type="button">
            Start over
          </button>
        ) : null
      }
    >
      <ol className="mb-8 flex flex-wrap items-center gap-x-3 gap-y-2 text-[11px] uppercase tracking-[0.12em]">
        {STAGES.map((s, i) => {
          const active = s.id === stage;
          const done = STAGES.findIndex((x) => x.id === stage) > i;
          return (
            <li key={s.id} className="flex items-center gap-3">
              <span
                className={
                  active
                    ? "text-[color:var(--accent)]"
                    : done
                      ? "text-[color:var(--text-secondary)]"
                      : "text-[color:var(--text-tertiary)]"
                }
              >
                {String(i + 1).padStart(2, "0")} {s.label}
              </span>
              {i < STAGES.length - 1 ? <span className="text-[color:var(--text-tertiary)]">→</span> : null}
            </li>
          );
        })}
      </ol>

      {error ? (
        <p className="mb-6 border-l-2 border-destructive/60 py-1 pl-3 text-[13px] text-destructive">{error}</p>
      ) : null}

      {stage === "upload" ? (
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <Panel title="Add a statement" description="CSV, XLSX or a text-based PDF.">
              <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-md border border-dashed border-border bg-surface-1 px-6 py-10 text-center text-sm text-[color:var(--text-secondary)] transition-colors hover:border-[color:var(--accent)] hover:text-foreground">
                <FileUp className="h-5 w-5" />
                <span className="text-foreground">{busy ? "Reading file…" : "Choose a file"}</span>
                <span className="text-[12px]">Zerodha, Groww, Upstox, Angel One, ICICI Direct, CAMS or any structured sheet</span>
                <input
                  className="sr-only"
                  type="file"
                  accept=".csv,.tsv,.txt,.xlsx,.xls,.pdf"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void onFile(file);
                    event.target.value = "";
                  }}
                />
              </label>
              <p className="mt-5 text-[12px] text-[color:var(--text-secondary)]">Or paste the export, including its header row.</p>
              <textarea
                className="tabular mt-2 h-36 w-full resize-y rounded-md border border-border bg-surface-1 p-3 font-mono text-xs text-foreground outline-none focus:border-[color:var(--accent)]"
                placeholder="Instrument,Qty.,Avg. cost,LTP,Invested,Cur. val"
                value={raw}
                onChange={(event) => setRaw(event.target.value)}
                spellCheck={false}
              />
              <div className="mt-3">
                <button className={buttonClass} type="button" onClick={usePasted} disabled={!raw.trim()}>
                  Read pasted text
                </button>
              </div>
            </Panel>
          </div>
          <Panel title="How this works" description="Ten checks between the file and your portfolio.">
            <ol className="space-y-1.5 text-[13px] text-[color:var(--text-secondary)]">
              {[
                "Identify the document and its source",
                "Extract rows and report extraction confidence",
                "Map columns to fields",
                "Normalise amounts, dates and instrument types",
                "Validate every row",
                "Detect duplicates against what you already hold",
                "Show conflicts and questionable rows",
                "Preview the exact result",
                "Persist only what you confirm",
                "Show an import report",
              ].map((step, i) => (
                <li key={step} className="flex gap-2">
                  <span className="tabular text-[color:var(--text-tertiary)]">{String(i + 1).padStart(2, "0")}</span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          </Panel>
        </div>
      ) : null}

      {stage === "identify" && detection && extraction ? (
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <Panel title="What we found" description={fileName ?? "Pasted text"}>
              <dl className="grid gap-x-8 sm:grid-cols-2">
                <Row label="Source" value={SOURCE_LABELS[detection.source]} />
                <Row label="Document" value={detection.kind === "holdings" ? "Holdings snapshot" : "Transaction statement"} />
                <Row label="Identification" value={`${detection.confidence} confidence`} />
                <Row
                  label="Extraction"
                  value={`${extraction.method.toUpperCase()} · ${extraction.confidence} confidence`}
                />
                <Row label="Rows read" value={String(parseResult?.rows.length ?? 0)} />
                <Row label="Unreadable rows" value={String(parseResult?.skipped.length ?? 0)} />
              </dl>
              <div className="mt-5 space-y-1.5 text-[12px] text-[color:var(--text-secondary)]">
                {[...detection.reasons, ...extraction.notes].map((note) => (
                  <p key={note}>{note}</p>
                ))}
              </div>
              <div className="mt-6">
                <p className="eyebrow mb-2 text-[color:var(--text-secondary)]">Treat this file as</p>
                <Segmented
                  ariaLabel="Document type"
                  value={kind}
                  onChange={(v) => {
                    setKind(v as ImportKind);
                    reset();
                  }}
                  options={[
                    { value: "holdings", label: "Holdings" },
                    { value: "transactions", label: "Transactions" },
                  ]}
                />
              </div>
              <div className="mt-6 flex gap-2">
                <button
                  className={buttonClass}
                  type="button"
                  onClick={() => setStage("review")}
                  disabled={(parseResult?.rows.length ?? 0) === 0}
                >
                  Preview {parseResult?.rows.length ?? 0} row{(parseResult?.rows.length ?? 0) === 1 ? "" : "s"}
                </button>
                <button className={ghostButtonClass} type="button" onClick={startOver}>
                  Use a different file
                </button>
              </div>
              {(parseResult?.rows.length ?? 0) === 0 ? (
                <p className="mt-3 text-[12px] text-warning">
                  No rows could be read. Switch the document type above, or export a CSV/XLSX from your broker.
                </p>
              ) : null}
            </Panel>
          </div>
          <Panel title="Extraction confidence" description="What this means for your data.">
            <p className="text-[13px] leading-relaxed text-[color:var(--text-secondary)]">
              {extraction.method === "pdf-text"
                ? "PDF layouts vary between brokers and between statements. Columns are inferred from spacing, so an unusual layout can shift a value into the wrong field. Scanned or image-only PDFs cannot be read here at all."
                : extraction.method === "xlsx"
                  ? "Spreadsheets read cleanly. Formulas are read as their last saved values, so refresh the workbook in Excel if a total looks stale."
                  : "Delimited text reads exactly as given."}
            </p>
            {extraction.confidence === "low" || extraction.confidence === "none" ? (
              <p className="mt-3 flex gap-2 text-[13px] text-warning">
                <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                Every row from this file needs your confirmation before it is saved.
              </p>
            ) : null}
          </Panel>
        </div>
      ) : null}

      {stage === "review" ? (
        <div className="space-y-6">
          <Panel title="Review" description="Tick a questionable row to include it, untick a ready row to leave it out.">
            <div className="grid grid-cols-2 gap-4 border-b border-border-subtle pb-5 sm:grid-cols-5">
              <Stat label="Rows found" value={summary.total} />
              <Stat label="Ready" value={selected.length} tone="positive" />
              <Stat label="Possible duplicates" value={summary.unchanged} />
              <Stat label="Need attention" value={rows.filter(attention).length} tone="warning" />
              <Stat label="Unreadable" value={parseResult?.skipped.length ?? 0} tone="warning" />
            </div>

            <div className="mt-4 flex items-center justify-between gap-4">
              <div className="flex items-start gap-2 text-[12px] text-[color:var(--text-secondary)]">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-teal" />
                <span>
                  {kind === "holdings"
                    ? "Matched on ISIN, then symbol, then normalised name."
                    : "Matched on broker reference, then date + instrument + amount."}
                </span>
              </div>
              <label className="flex shrink-0 items-center gap-2 text-[12px] text-[color:var(--text-secondary)]">
                <input
                  type="checkbox"
                  checked={showOnlyAttention}
                  onChange={(e) => setShowOnlyAttention(e.target.checked)}
                />
                Only rows needing attention
              </label>
            </div>

            <div className="mt-4 max-h-[28rem] overflow-auto rounded-md border border-border">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-surface-2 text-left uppercase tracking-wide text-[color:var(--text-secondary)]">
                  <tr>
                    <th className="px-2 py-2 font-medium">Import</th>
                    <th className="px-2 py-2 font-medium">Instrument</th>
                    <th className="px-2 py-2 font-medium">Result</th>
                    <th className="px-2 py-2 text-right font-medium">Amount</th>
                    <th className="px-2 py-2 font-medium">Why</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map((item) => {
                    const on = !excluded.has(item.index) && (readyByDefault(item) || manuallyIncluded.has(item.index));
                    const row = item.row;
                    const amount =
                      kind === "holdings"
                        ? ((row as ParsedHolding).current_value ?? (row as ParsedHolding).cost_basis ?? 0)
                        : (row as ParsedTransaction).amount;
                    const status =
                      item.status === "unchanged"
                        ? "Already recorded"
                        : item.status === "conflict"
                          ? "Conflict"
                          : item.status === "new"
                            ? "New"
                            : "Update";
                    return (
                      <tr key={item.index} className="border-t border-border/60">
                        <td className="px-2 py-2">
                          <input
                            type="checkbox"
                            checked={on}
                            onChange={() => toggleRow(item)}
                            aria-label={`Import ${row.name}`}
                          />
                        </td>
                        <td className="max-w-[220px] truncate px-2 py-2 text-foreground">{row.name}</td>
                        <td
                          className={`px-2 py-2 ${
                            attention(item)
                              ? "text-warning"
                              : item.status === "unchanged"
                                ? "text-[color:var(--text-tertiary)]"
                                : "text-positive"
                          }`}
                        >
                          {status}
                        </td>
                        <td className="tabular privacy-sensitive px-2 py-2 text-right text-foreground">
                          {formatCompactRupees(amount)}
                        </td>
                        <td className="max-w-[280px] truncate px-2 py-2 text-[color:var(--text-secondary)]">
                          {item.reason ??
                            (kind === "transactions"
                              ? TRANSACTION_LABELS[(row as ParsedTransaction).kind]
                              : "Ready to import")}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {parseResult && parseResult.skipped.length > 0 ? (
              <details className="mt-4 text-[12px] text-[color:var(--text-secondary)]">
                <summary className="cursor-pointer text-foreground">
                  {parseResult.skipped.length} row{parseResult.skipped.length === 1 ? "" : "s"} could not be read
                </summary>
                <ul className="mt-2 space-y-1">
                  {parseResult.skipped.map((s) => (
                    <li key={`${s.line}-${s.reason}`}>
                      Line {s.line}: {s.reason}
                    </li>
                  ))}
                </ul>
                <p className="mt-2">Add these by hand — they are reported here rather than discarded.</p>
              </details>
            ) : null}

            <div className="mt-6 flex flex-wrap items-center gap-2">
              <button
                className={buttonClass}
                type="button"
                onClick={() => void commit()}
                disabled={busy || selected.length === 0 || (!reconciliation.balanced && !acknowledged)}
              >
                {busy ? "Saving…" : `Confirm ${selected.length} row${selected.length === 1 ? "" : "s"}`}
              </button>
              <button className={ghostButtonClass} type="button" onClick={() => setStage("identify")}>
                Back
              </button>
            </div>
          </Panel>

          <ReconcilePanel
            reconciliation={reconciliation}
            statedLabel={stated?.label ?? null}
            acknowledged={acknowledged}
            onAcknowledge={setAcknowledged}
          />
        </div>
      ) : null}

      {stage === "report" && report ? (
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <Panel title="Import report" description={fileName ?? "Pasted text"}>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <Stat label="Imported" value={report.imported} tone="positive" />
                <Stat label="Skipped" value={report.skipped} />
                <Stat label="Need review" value={report.needReview} tone="warning" />
                <Stat label="Unreadable" value={report.unreadable} tone="warning" />
              </div>
              <p className="mt-5 flex gap-2 text-[13px] text-[color:var(--text-secondary)]">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-positive" />
                {report.kind === "holdings"
                  ? "Holdings are live in your portfolio and priced on the next refresh."
                  : "Transactions are in the ledger and included in gains and tax."}
              </p>
              {report.needReview + report.unreadable > 0 ? (
                <p className="mt-3 text-[13px] text-warning">
                  {report.needReview + report.unreadable} row
                  {report.needReview + report.unreadable === 1 ? "" : "s"} were left out and are still in your file. Nothing was
                  discarded — re-run the import and tick them, or add them manually.
                </p>
              ) : null}
              <div className="mt-6 flex gap-2">
                <button className={buttonClass} type="button" onClick={startOver}>
                  Import another file
                </button>
                {report.needReview > 0 ? (
                  <button
                    className={ghostButtonClass}
                    type="button"
                    onClick={() => {
                      setShowOnlyAttention(true);
                      setStage("review");
                    }}
                  >
                    Review the remaining rows
                  </button>
                ) : null}
              </div>
            </Panel>
          </div>
        </div>
      ) : null}
    </AppShell>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-border-subtle py-2.5">
      <dt className="text-[12px] text-[color:var(--text-secondary)]">{label}</dt>
      <dd className="tabular text-sm capitalize text-foreground">{value}</dd>
    </div>
  );
}

function ReconcilePanel({
  reconciliation,
  statedLabel,
  acknowledged,
  onAcknowledge,
}: {
  reconciliation: Reconciliation;
  statedLabel: string | null;
  acknowledged: boolean;
  onAcknowledge: (v: boolean) => void;
}) {
  const r = reconciliation;
  return (
    <Panel
      title="Reconciliation"
      description="The arithmetic has to close before anything is written."
    >
      <dl className="text-sm">
        <BalanceRow label={r.openingLabel} value={r.opening} />
        {r.lines.map((line) => (
          <BalanceRow key={line.label} label={line.label} value={line.value} hint={line.hint} muted />
        ))}
        <BalanceRow label={r.activityLabel} value={r.activity} />
        <BalanceRow label={r.closingLabel} value={r.closing} strong />
        {r.statedTotal !== null ? (
          <BalanceRow
            label={`Stated in file${statedLabel ? ` (${statedLabel})` : ""}`}
            value={r.statedTotal}
            muted
          />
        ) : null}
      </dl>

      {r.difference !== null && !r.balanced ? (
        <div className="mt-5 rounded-md border border-warning/40 bg-warning/5 p-4">
          <p className="flex items-center gap-2 text-[13px] text-warning">
            <TriangleAlert className="h-4 w-4 shrink-0" />
            Difference of <span className="tabular privacy-sensitive">{formatRupees(Math.abs(r.difference))}</span>
          </p>
          <p className="mt-2 text-[13px] text-[color:var(--text-secondary)]">
            Expected <span className="tabular privacy-sensitive">{formatRupees(r.statedTotal ?? 0)}</span> from the
            file, calculated <span className="tabular privacy-sensitive">{formatRupees(r.closing)}</span>. Investigate
            before confirming — usually a missing, duplicated or misread row.
          </p>
          <label className="mt-3 flex items-start gap-2 text-[13px] text-foreground">
            <input
              type="checkbox"
              className="mt-1"
              checked={acknowledged}
              onChange={(e) => onAcknowledge(e.target.checked)}
            />
            I have checked the difference and want to import anyway.
          </label>
        </div>
      ) : r.statedTotal !== null ? (
        <p className="mt-5 flex gap-2 text-[13px] text-positive">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          Reconciles with the total stated in this file.
        </p>
      ) : (
        <p className="mt-5 text-[13px] text-[color:var(--text-secondary)]">
          This file states no grand total, so the closing figure above is the only check available. Compare it with your
          broker before confirming.
        </p>
      )}

      {r.warnings.length > 0 ? (
        <ul className="mt-4 space-y-1.5 text-[12px] text-warning">
          {r.warnings.map((w) => (
            <li key={w} className="flex gap-2">
              <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{w}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </Panel>
  );
}

function BalanceRow({
  label,
  value,
  hint,
  muted,
  strong,
}: {
  label: string;
  value: number;
  hint?: string | undefined;
  muted?: boolean;
  strong?: boolean;
}) {
  return (
    <div
      className={`flex items-baseline justify-between gap-4 border-b py-2.5 ${
        strong ? "border-border" : "border-border-subtle"
      }`}
    >
      <dt className={`text-[13px] ${muted ? "text-[color:var(--text-tertiary)] pl-3" : "text-[color:var(--text-secondary)]"}`}>
        {label}
        {hint ? <span className="ml-2 text-[11px] text-[color:var(--text-tertiary)]">{hint}</span> : null}
      </dt>
      <dd
        className={`tabular privacy-sensitive ${
          strong ? "text-base text-foreground" : muted ? "text-[13px] text-[color:var(--text-tertiary)]" : "text-sm text-foreground"
        }`}
      >
        {value < 0 ? `−${formatRupees(Math.abs(value))}` : formatRupees(value)}
      </dd>
    </div>
  );
}

function Stat({ label, value, tone = "neutral" }: { label: string; value: number; tone?: "neutral" | "positive" | "warning" }) {
  return (
    <div className="border-l border-border-subtle pl-3">
      <p className="eyebrow text-[color:var(--text-secondary)]">{label}</p>
      <p
        className={`tabular mt-1 text-lg ${
          tone === "positive" ? "text-positive" : tone === "warning" ? "text-warning" : "text-foreground"
        }`}
      >
        {value}
      </p>
    </div>
  );
}
