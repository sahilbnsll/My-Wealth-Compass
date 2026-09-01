import { useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState, type ComponentType } from "react";
import {
  ArrowRight,
  Download,
  Eye,
  EyeOff,
  Flag,
  Hourglass,
  LayoutDashboard,
  LineChart,
  Lock,
  Moon,
  Receipt,
  RefreshCw,
  Search,
  Settings as SettingsIcon,
  ShieldAlert,
  Sparkles,
  Sun,
  Target,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from "@/components/ui/command";
import {
  exportDataset,
  exportWorkspace,
  refreshMacro,
  refreshNavPrices,
  refreshStockQuotes,
  searchInstruments,
  type InstrumentHit,
} from "@/lib/data.functions";
import { fireAction, queueAction, type LaunchAction } from "@/lib/launch";

export type PaletteNavItem = { to: string; label: string; icon: ComponentType<{ className?: string }> };

type Entry = {
  id: string;
  label: string;
  hint?: string;
  keywords: string;
  icon: ComponentType<{ className?: string }>;
  group: "Actions" | "Go to" | "Data" | "Session";
  shortcut?: string;
  run: () => void | Promise<void>;
};

function download(name: string, body: string, type: string) {
  const url = URL.createObjectURL(new Blob([body], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

function score(entry: { label: string; keywords: string }, query: string): number {
  if (!query) return 1;
  const q = query.toLowerCase();
  const label = entry.label.toLowerCase();
  if (label.startsWith(q)) return 100;
  if (label.includes(q)) return 70;
  if (entry.keywords.includes(q)) return 45;
  // subsequence match, so "adhl" still finds "Add holding"
  let i = 0;
  for (const ch of label) if (ch === q[i]) i += 1;
  return i === q.length ? 20 : 0;
}

export function CommandPalette({
  open,
  onOpenChange,
  navItems,
  privacyHidden,
  onTogglePrivacy,
  theme,
  onToggleTheme,
  onLock,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  navItems: PaletteNavItem[];
  privacyHidden: boolean;
  onTogglePrivacy: () => void;
  theme: string;
  onToggleTheme: () => void;
  onLock: () => void | Promise<void>;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<InstrumentHit[]>([]);
  const [searching, setSearching] = useState(false);

  const search = useServerFn(searchInstruments);
  const runRefreshNav = useServerFn(refreshNavPrices);
  const runRefreshQuotes = useServerFn(refreshStockQuotes);
  const runRefreshMacro = useServerFn(refreshMacro);
  const runExportDataset = useServerFn(exportDataset);
  const runExportWorkspace = useServerFn(exportWorkspace);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setHits([]);
    }
  }, [open]);

  // Debounced instrument lookup — local entries stay instant while this resolves.
  const reqId = useRef(0);
  useEffect(() => {
    const q = query.trim();
    if (!open || q.length < 2) {
      setHits([]);
      setSearching(false);
      return;
    }
    const id = ++reqId.current;
    setSearching(true);
    const timer = setTimeout(() => {
      search({ data: { query: q } })
        .then((rows) => {
          if (reqId.current === id) setHits(rows);
        })
        .catch(() => {
          if (reqId.current === id) setHits([]);
        })
        .finally(() => {
          if (reqId.current === id) setSearching(false);
        });
    }, 180);
    return () => clearTimeout(timer);
  }, [query, open, search]);

  const close = () => onOpenChange(false);

  const go = (to: string) => {
    close();
    void router.navigate({ to });
  };

  const launch = (to: string, action: LaunchAction, payload?: Record<string, unknown>) => {
    close();
    if (window.location.pathname === to) {
      fireAction(action, payload);
      return;
    }
    queueAction(action, payload);
    void router.navigate({ to });
  };

  const entries = useMemo<Entry[]>(() => {
    const base: Entry[] = [
      {
        id: "add-holding",
        label: "Add holding",
        hint: "Portfolio",
        keywords: "new investment stock fund position buy",
        icon: Wallet,
        group: "Actions",
        run: () => launch("/portfolio", "add-holding"),
      },
      {
        id: "add-sip",
        label: "Add SIP",
        hint: "Plan",
        keywords: "monthly contribution recurring systematic investment plan",
        icon: Target,
        group: "Actions",
        run: () => launch("/plan", "add-sip"),
      },
      {
        id: "add-goal",
        label: "Add goal",
        hint: "Goals",
        keywords: "target objective milestone corpus",
        icon: Flag,
        group: "Actions",
        run: () => launch("/goals", "add-goal"),
      },
      {
        id: "add-transaction",
        label: "Add transaction",
        hint: "Ledger",
        keywords: "buy sell trade ledger entry contribution",
        icon: Receipt,
        group: "Actions",
        run: () => launch("/ledger", "add-transaction"),
      },
      {
        id: "stress",
        label: "Run stress test",
        hint: "Stress",
        keywords: "crash drawdown shock scenario 2008 covid",
        icon: ShieldAlert,
        group: "Actions",
        run: () => go("/stress"),
      },
      {
        id: "ask",
        label: "Ask my portfolio",
        hint: "Insights",
        keywords: "ai question narrative explain brief",
        icon: Sparkles,
        group: "Actions",
        run: () => go("/insights"),
      },
      {
        id: "dashboard",
        label: "Open dashboard",
        keywords: "home overview",
        icon: LayoutDashboard,
        group: "Go to",
        run: () => go("/"),
      },
      {
        id: "portfolio",
        label: "Open portfolio",
        keywords: "holdings allocation risk rebalance",
        icon: Wallet,
        group: "Go to",
        run: () => go("/portfolio"),
      },
      {
        id: "projections",
        label: "Open projections",
        keywords: "forecast future corpus fan",
        icon: LineChart,
        group: "Go to",
        run: () => go("/projections"),
      },
      {
        id: "retirement",
        label: "Open retirement",
        keywords: "decumulation withdrawal fire corpus",
        icon: Hourglass,
        group: "Go to",
        run: () => go("/retirement"),
      },
      {
        id: "settings",
        label: "Open settings",
        keywords: "preferences configuration",
        icon: SettingsIcon,
        group: "Go to",
        run: () => go("/settings"),
      },
      {
        id: "refresh",
        label: "Refresh market data",
        hint: "NAVs, quotes, macro",
        keywords: "update prices amfi nav stock quote cpi repo",
        icon: RefreshCw,
        group: "Data",
        run: async () => {
          close();
          const t = toast.loading("Refreshing market data…");
          try {
            const [nav, quotes] = await Promise.all([
              runRefreshNav({}).catch(() => null),
              runRefreshQuotes({}).catch(() => null),
              runRefreshMacro({}).catch(() => null),
            ]);
            await router.invalidate();
            toast.success(
              `Refreshed ${(nav?.updated ?? 0) + (quotes?.updated ?? 0)} price(s) and macro series.`,
              { id: t },
            );
          } catch (error) {
            toast.error(error instanceof Error ? error.message : "Refresh failed.", { id: t });
          }
        },
      },
      {
        id: "export-portfolio",
        label: "Export portfolio",
        hint: "CSV",
        keywords: "download holdings spreadsheet csv",
        icon: Download,
        group: "Data",
        run: async () => {
          close();
          try {
            const res = await runExportDataset({ data: { dataset: "holdings" } });
            download(`holdings-${new Date().toISOString().slice(0, 10)}.csv`, res.csv, "text/csv");
            toast.success(`Exported ${res.rows} holding(s).`);
          } catch (error) {
            toast.error(error instanceof Error ? error.message : "Export failed.");
          }
        },
      },
      {
        id: "export-backup",
        label: "Export backup",
        hint: "Full JSON",
        keywords: "download everything json archive snapshot",
        icon: Download,
        group: "Data",
        run: async () => {
          close();
          try {
            const res = await runExportWorkspace();
            download(
              `finance-backup-${new Date().toISOString().slice(0, 10)}.json`,
              JSON.stringify(res, null, 2),
              "application/json",
            );
            toast.success("Backup downloaded.");
          } catch (error) {
            toast.error(error instanceof Error ? error.message : "Backup failed.");
          }
        },
      },
      {
        id: "privacy",
        label: privacyHidden ? "Show figures" : "Blur figures",
        hint: "Privacy mode",
        keywords: "hide amounts privacy blur screen share",
        icon: privacyHidden ? Eye : EyeOff,
        group: "Session",
        run: () => {
          close();
          onTogglePrivacy();
        },
      },
      {
        id: "theme",
        label: `Switch to ${theme === "dark" ? "light" : "dark"} theme`,
        keywords: "appearance dark light mode",
        icon: theme === "dark" ? Sun : Moon,
        group: "Session",
        run: () => {
          close();
          onToggleTheme();
        },
      },
      {
        id: "lock",
        label: "Lock application",
        keywords: "sign out logout secure passcode",
        icon: Lock,
        group: "Session",
        shortcut: "Esc",
        run: async () => {
          close();
          await onLock();
        },
      },
    ];

    const pages: Entry[] = navItems
      .filter((item) => !base.some((b) => b.group === "Go to" && b.label === `Open ${item.label.toLowerCase()}`))
      .map((item) => ({
        id: `page:${item.to}`,
        label: item.label,
        hint: "Page",
        keywords: item.to.replace("/", " "),
        icon: item.icon,
        group: "Go to" as const,
        run: () => go(item.to),
      }));

    return [...base, ...pages];
  }, [navItems, privacyHidden, theme]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return entries
      .map((entry) => ({ entry, s: score(entry, q) }))
      .filter((r) => r.s > 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, 24)
      .map((r) => r.entry);
  }, [entries, query]);

  const groups: Entry["group"][] = ["Actions", "Go to", "Data", "Session"];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="overflow-hidden p-0">
        <DialogTitle className="sr-only">Command palette</DialogTitle>
        <Command
          shouldFilter={false}
          className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-[0.14em] [&_[cmdk-group-heading]]:text-[color:var(--text-tertiary)] [&_[cmdk-item]_svg]:size-4"
        >
          <CommandInput
            value={query}
            onValueChange={setQuery}
            placeholder="Search investments, actions and pages…"
          />
          <CommandList className="max-h-[420px]">
            {filtered.length === 0 && hits.length === 0 ? (
              <CommandEmpty>{searching ? "Searching…" : "No matches."}</CommandEmpty>
            ) : null}

            {hits.length > 0 ? (
              <CommandGroup heading="Investments">
                {hits.map((hit) => (
                  <CommandItem
                    key={hit.id}
                    value={hit.id}
                    onSelect={() =>
                      launch("/portfolio", "add-holding", {
                        name: hit.name,
                        symbol: hit.kind === "mutual_fund" ? null : hit.symbol,
                        isin: hit.isin,
                        current_price: hit.price,
                        instrument_type: hit.kind,
                        price_source: hit.source,
                      })
                    }
                  >
                    <Search />
                    <span className="min-w-0 flex-1 truncate">{hit.name}</span>
                    <span className="ml-auto shrink-0 font-mono text-[11px] text-[color:var(--text-tertiary)]">
                      {hit.priceLabel}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            ) : null}

            {groups.map((group) => {
              const items = filtered.filter((e) => e.group === group);
              if (items.length === 0) return null;
              return (
                <CommandGroup key={group} heading={group}>
                  {items.map((entry) => {
                    const Icon = entry.icon;
                    return (
                      <CommandItem key={entry.id} value={entry.id} onSelect={() => void entry.run()}>
                        <Icon />
                        <span className="truncate">{entry.label}</span>
                        {entry.hint ? (
                          <span className="ml-2 shrink-0 text-[11px] text-[color:var(--text-tertiary)]">
                            {entry.hint}
                          </span>
                        ) : null}
                        <CommandShortcut>
                          {entry.shortcut ?? <ArrowRight className="inline h-3 w-3 opacity-50" />}
                        </CommandShortcut>
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              );
            })}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
