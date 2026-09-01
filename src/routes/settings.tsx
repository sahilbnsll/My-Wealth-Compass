import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { Download, KeyRound, Sparkles, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { AppShell, Panel } from "@/components/AppShell";
import { buttonClass, ghostButtonClass } from "@/components/Bits";
import { ThemeToggle, useTheme } from "@/components/theme";
import { EXPORT_DATASETS, exportDataset, exportWorkspace, type ExportDataset } from "@/lib/data.functions";
import { requireSession, setupPasscode } from "@/lib/gate.functions";
import { CESS_RATE, EQUITY_LTCG_RATE, EQUITY_STCG_RATE, LTCG_EQUITY_EXEMPTION } from "@/lib/finance/tax";
import { formatRupees } from "@/lib/finance/format";


export const Route = createFileRoute("/settings")({
  loader: () => requireSession(),
  head: () => ({
    meta: [
      { title: "Sahil's Finance Intelligence — Settings" },
      {
        name: "description",
        content: "Appearance, privacy, exports and planning rules.",
      },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Sahil's Finance Intelligence — Settings" },
      { property: "og:description", content: "Appearance, privacy, exports and planning rules." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SettingsPage,
});

const DATASET_LABEL: Record<ExportDataset, string> = {
  holdings: "Holdings",
  transactions: "Transactions",
  goals: "Goals",
  planned_investments: "SIPs and planned investments",
  snapshots: "Portfolio snapshots",
  assumptions: "Scenario assumptions",
  market_data: "Market data",
};

function download(name: string, body: string, type: string) {
  const url = URL.createObjectURL(new Blob([body], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function SettingsPage() {
  const { choice, set } = useTheme();
  const csv = useServerFn(exportDataset);
  const full = useServerFn(exportWorkspace);
  const [busy, setBusy] = useState<string | null>(null);
  const [privacy, setPrivacy] = useState(false);

  useEffect(() => {
    setPrivacy(window.localStorage.getItem("ii.privacy") === "1");
  }, []);

  function setPrivacyMode(next: boolean) {
    setPrivacy(next);
    try {
      window.localStorage.setItem("ii.privacy", next ? "1" : "0");
    } catch {
      /* storage unavailable */
    }
    window.location.reload();
  }

  async function downloadCsv(dataset: ExportDataset) {
    setBusy(dataset);
    try {
      const res = await csv({ data: { dataset } });
      if (res.rows === 0) {
        download(`${dataset}-${today()}.csv`, "", "text/csv");
      } else {
        download(`${dataset}-${today()}.csv`, res.csv, "text/csv");
      }
    } finally {
      setBusy(null);
    }
  }

  async function downloadBackup() {
    setBusy("backup");
    try {
      const res = await full();
      download(`sahil-finance-backup-${today()}.json`, JSON.stringify(res, null, 2), "application/json");
    } finally {
      setBusy(null);
    }
  }

  const savePasscode = useServerFn(setupPasscode);
  const [newPasscode, setNewPasscode] = useState("");
  const [showPasscode, setShowPasscode] = useState(false);
  const [savingPasscode, setSavingPasscode] = useState(false);

  function generatePasscode(): string {
    const adj = ["amber", "quiet", "steady", "swift", "silver", "golden", "granite", "stellar"];
    const noun = ["compass", "shield", "beacon", "harbor", "horizon", "vault", "anchor", "summit"];
    const a = adj[Math.floor(Math.random() * adj.length)];
    const n = noun[Math.floor(Math.random() * noun.length)];
    const num = Math.floor(1000 + Math.random() * 9000);
    return `${a}-${n}-${num}`;
  }

  async function handleUpdatePasscode(e: React.FormEvent) {
    e.preventDefault();
    if (newPasscode.trim().length < 4) {
      toast.error("Passcode must be at least 4 characters.");
      return;
    }
    setSavingPasscode(true);
    try {
      await savePasscode({ data: { passcode: newPasscode.trim() } });
      toast.success("Passcode updated and stored in database!");
      setNewPasscode("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update passcode.");
    } finally {
      setSavingPasscode(false);
    }
  }

  return (
    <AppShell
      title="Settings"
      subtitle="Look, privacy, security and exports."
    >
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Appearance" description="Light is the default. The choice is remembered on this device.">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm text-foreground">Colour theme</p>
              <p className="mt-1 text-[12px] text-[color:var(--text-secondary)]">
                Light for daytime review, dark for evening reading. Both use the same figures and contrast rules.
              </p>
            </div>
            <ThemeToggle choice={choice} onChange={set} />
          </div>
        </Panel>

        <Panel title="Privacy" description="Blur every monetary figure until you click it.">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm text-foreground">Privacy mode</p>
              <p className="mt-1 text-[12px] text-[color:var(--text-secondary)]">
                Amounts render as ₹•••• across the app. Click any figure to reveal it briefly. Also available from the
                header at any time.
              </p>
            </div>
            <button
              className={privacy ? buttonClass : ghostButtonClass}
              onClick={() => setPrivacyMode(!privacy)}
              aria-pressed={privacy}
            >
              {privacy ? "On" : "Off"}
            </button>
          </div>
        </Panel>

        <Panel
          title="Security & Passcode"
          description="Your workspace passcode is stored securely hashed in your database."
          className="lg:col-span-2"
        >
          <form onSubmit={handleUpdatePasscode} className="space-y-4 max-w-lg">
            <div>
              <label className="block text-xs font-medium text-foreground">Change or set new passcode</label>
              <div className="mt-1.5 flex gap-2">
                <div className="relative flex-1">
                  <input
                    type={showPasscode ? "text" : "password"}
                    value={newPasscode}
                    onChange={(e) => setNewPasscode(e.target.value)}
                    placeholder="Enter or generate new passcode"
                    className="w-full rounded-md border border-input bg-surface-2 px-3 py-2 pr-10 text-sm font-mono text-foreground outline-none focus:ring-2 focus:ring-ring"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPasscode(!showPasscode)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    title={showPasscode ? "Hide" : "Show"}
                  >
                    {showPasscode ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const gen = generatePasscode();
                    setNewPasscode(gen);
                    setShowPasscode(true);
                    try {
                      void navigator.clipboard.writeText(gen);
                      toast.success("Generated & copied to clipboard!");
                    } catch {
                      toast.success("Generated new passcode.");
                    }
                  }}
                  className="inline-flex items-center gap-1.5 rounded-md border border-border-subtle bg-surface-2 px-3 py-2 text-xs font-medium text-foreground hover:bg-surface-3 transition-colors"
                >
                  <Sparkles className="h-3.5 w-3.5 text-primary" />
                  Generate
                </button>
              </div>
            </div>
            <button
              type="submit"
              disabled={savingPasscode || newPasscode.trim().length < 4}
              className="rounded-md bg-primary px-4 py-2 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {savingPasscode ? "Updating…" : "Update passcode in database"}
            </button>
          </form>
        </Panel>


        <Panel
          title="Data"
          description="Exports carry your records only — never keys or passcodes."
          className="lg:col-span-2"
        >
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {EXPORT_DATASETS.map((dataset) => (
              <button
                key={dataset}
                className="flex items-center justify-between gap-3 rounded-md border border-border-subtle bg-surface-1 px-4 py-3 text-left text-[13px] text-foreground transition-colors hover:bg-surface-2 disabled:opacity-60"
                onClick={() => downloadCsv(dataset)}
                disabled={busy !== null}
              >
                <span>{DATASET_LABEL[dataset]}</span>
                <span className="text-[11px] text-[color:var(--text-tertiary)]">
                  {busy === dataset ? "Preparing…" : "CSV"}
                </span>
              </button>
            ))}
          </div>
          <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-border-subtle pt-5">
            <button className={buttonClass} onClick={downloadBackup} disabled={busy !== null}>
              <Download className="mr-2 inline h-3.5 w-3.5" strokeWidth={1.75} />
              {busy === "backup" ? "Preparing…" : "Full backup (JSON)"}
            </button>
            <p className="text-[12px] text-[color:var(--text-secondary)]">
              Every table in one file, restorable by hand if you ever move this workspace elsewhere.
            </p>
          </div>
        </Panel>

        <Panel title="Data sources" description="External market feeds and database health.">
          <p className="text-[12px] text-[color:var(--text-secondary)]">
            AMFI, Yahoo Finance, DBnomics and your Supabase database each report their own status and freshness.
          </p>
          <Link to="/integrations" className={`${ghostButtonClass} mt-4 inline-flex`}>
            Open data sources and health
          </Link>
        </Panel>


        <Panel title="Planning rules" description="What the engine assumes when it computes tax and projections.">
          <dl className="space-y-2 text-[12px] text-[color:var(--text-secondary)]">
            <div className="flex justify-between gap-4">
              <dt>Tax rules version</dt>
              <dd className="tabular text-foreground">Post 23 July 2024 regime</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt>Equity LTCG</dt>
              <dd className="tabular text-foreground">
                {EQUITY_LTCG_RATE}% above {formatRupees(LTCG_EQUITY_EXEMPTION)} a year
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt>Equity STCG</dt>
              <dd className="tabular text-foreground">{EQUITY_STCG_RATE}%</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt>Cess</dt>
              <dd className="tabular text-foreground">{CESS_RATE}%</dd>
            </div>
          </dl>
          <Link to="/inputs" className={`${ghostButtonClass} mt-4 inline-flex`}>
            Change your inputs and assumptions
          </Link>
        </Panel>

        <Panel title="About" description="What this workspace is, and what it is not." className="lg:col-span-2">
          <p className="text-[13px] leading-relaxed text-[color:var(--text-secondary)]">
            Sahil's Finance Intelligence is a private, single-user planning workspace. Every number on screen is
            computed by the finance engine from your own records and the assumptions you set — the AI layer only puts
            those computed figures into words, and never calculates. Projections are scenarios, not forecasts, and
            nothing here is financial advice.
          </p>
        </Panel>
      </div>
    </AppShell>
  );
}
