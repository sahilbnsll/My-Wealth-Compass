import { Link, useRouter, useRouterState } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useState, type CSSProperties, type ReactNode } from "react";
import {
  BarChart3,
  CalendarDays,
  ClipboardCheck,
  Scale,
  Command as CommandIcon,

  Download,
  Eye,
  EyeOff,
  Flag,
  Receipt,
  FileUp,
  Globe2,
  Hourglass,
  LayoutDashboard,
  LineChart,
  Lock,
  PanelLeftClose,
  PanelLeftOpen,
  PieChart,
  Plug,
  Menu,
  Microscope,
  Moon,
  Settings,
  ShieldAlert,
  SlidersHorizontal,
  Sparkles,
  Sun,
  Target,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ThemeToggle, useTheme } from "@/components/theme";
import { ModelStatus } from "@/components/ModelStatus";
import { CommandPalette } from "@/components/CommandPalette";
import { AppFooter } from "@/components/AppFooter";
import { lockSite } from "@/lib/gate.functions";


type NavItem = { to: string; label: string; icon: typeof LayoutDashboard; primary?: boolean };

export const NAV_SECTIONS: { heading: string; items: NavItem[] }[] = [
  {
    heading: "Overview",
    items: [{ to: "/", label: "Dashboard", icon: LayoutDashboard, primary: true }],
  },
  {
    heading: "Portfolio",
    items: [
      { to: "/portfolio", label: "Holdings", icon: Wallet, primary: true },
      { to: "/ledger", label: "Ledger", icon: Receipt },
      { to: "/import", label: "Import data", icon: FileUp },
    ],
  },
  {
    heading: "Planning",
    items: [
      { to: "/plan", label: "Plan & SIPs", icon: Target, primary: true },
      { to: "/goals", label: "Goals", icon: Flag, primary: true },
      { to: "/retirement", label: "Retirement", icon: Hourglass },
    ],
  },
  {
    heading: "Intelligence",
    items: [
      { to: "/projections", label: "Projections", icon: LineChart },
      { to: "/stress", label: "Stress tests", icon: ShieldAlert },
      { to: "/insights", label: "Insights", icon: Sparkles },
      { to: "/scenarios", label: "Scenarios", icon: BarChart3 },
      { to: "/market-tax", label: "Market & Tax", icon: Globe2 },
      { to: "/research", label: "Research", icon: Microscope },
    ],
  },
  {
    heading: "Setup",
    items: [
      { to: "/inputs", label: "Inputs", icon: SlidersHorizontal },
      { to: "/integrations", label: "Integrations", icon: Plug },
      { to: "/settings", label: "Settings", icon: Settings },
    ],
  },
];

// Supporting screens that stay out of the sidebar so no group competes for
// attention — reachable from the command palette and the mobile "More" sheet.
const EXTRA_ITEMS: NavItem[] = [
  { to: "/watchlist", label: "Watchlist", icon: Eye },
  { to: "/calendar", label: "Calendar", icon: CalendarDays },
  { to: "/review", label: "Monthly review", icon: ClipboardCheck },
  { to: "/assumptions", label: "Assumptions", icon: Scale },
];

const ALL_ITEMS = [...NAV_SECTIONS.flatMap((s) => s.items), ...EXTRA_ITEMS];


function usePrivacyMode() {
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    setHidden(window.localStorage.getItem("ii.privacy") === "1");
  }, []);
  const toggle = useCallback(() => {
    setHidden((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem("ii.privacy", next ? "1" : "0");
      } catch {
        /* storage unavailable — privacy mode stays session-only */
      }
      return next;
    });
  }, []);
  return { hidden, toggle };
}

function isActive(pathname: string, to: string) {
  return to === "/" ? pathname === "/" : pathname.startsWith(to);
}

export function AppShell({
  title,
  subtitle,
  actions,
  children,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const router = useRouter();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const lock = useServerFn(lockSite);
  const { hidden, toggle } = usePrivacyMode();
  const { choice, set: setTheme } = useTheme();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setCollapsed(window.localStorage.getItem("ii.sidebar") === "collapsed");
  }, []);

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem("ii.sidebar", next ? "collapsed" : "expanded");
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const go = (to: string) => {
    setPaletteOpen(false);
    void router.navigate({ to });
  };

  // Phones get the four screens worth a permanent tab; everything else lives one
  // tap away in a sheet, so no section is unreachable without a keyboard.
  const primary = ALL_ITEMS.filter((n) => n.primary).slice(0, 4);
  const secondarySections = [...NAV_SECTIONS, { heading: "More", items: EXTRA_ITEMS }]
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => !primary.some((p) => p.to === item.to)),
    }))
    .filter((section) => section.items.length > 0);
  const width = collapsed ? "64px" : "240px";

  return (
    <div
      className={`min-h-screen bg-background ${hidden ? "privacy-on" : ""}`}
      style={{ "--sidebar-w": width } as CSSProperties}
      onClick={(e) => {
        if (!hidden) return;
        const el = (e.target as HTMLElement).closest(".privacy-sensitive");
        if (el) el.classList.toggle("privacy-revealed");
      }}
    >
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:border focus:border-border-subtle focus:bg-surface-2 focus:px-3 focus:py-2 focus:text-[13px] focus:text-foreground"
      >
        Skip to content
      </a>

      {/* Left sidebar — persists across pages, collapses to an icon rail. */}
      <aside
        className="fixed inset-y-0 left-0 z-30 hidden flex-col border-r border-border-subtle bg-sidebar transition-[width] duration-150 ease-out md:flex"
        style={{ width: "var(--sidebar-w)" }}
      >
        <Link to="/" aria-label="Sahil's Finance Intelligence home" className="flex h-14 shrink-0 items-center gap-2 overflow-hidden px-4">
          <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-primary/40 font-display text-sm font-semibold text-primary">
            S
          </span>
          <span
            className={`min-w-0 whitespace-nowrap transition-opacity duration-150 ${
              collapsed ? "pointer-events-none opacity-0" : "opacity-100"
            }`}
          >
            <span className="block font-display text-sm font-semibold leading-tight tracking-tight text-foreground">
              Sahil's Finance
            </span>
            <span className="block text-[11px] leading-tight tracking-[0.08em] text-[color:var(--text-tertiary)]">
              Personal Investment Intelligence
            </span>
          </span>
        </Link>

        <TooltipProvider delayDuration={400}>
          <nav aria-label="Primary" className="flex-1 overflow-y-auto px-2 pb-4">
            {NAV_SECTIONS.map((section) => (
              <div key={section.heading} className="mt-5 first:mt-1">
                <p
                  className={`px-2 pb-2 text-[11px] font-medium uppercase tracking-[0.14em] text-[color:var(--text-tertiary)] transition-opacity duration-150 ${
                    collapsed ? "opacity-0" : "opacity-100"
                  }`}
                >
                  {collapsed ? "\u00a0" : section.heading}
                </p>
                <ul className="space-y-1">
                  {section.items.map((item) => {
                    const Icon = item.icon;
                    const active = isActive(pathname, item.to);
                    return (
                      <li key={item.to}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Link
                              to={item.to}
                              aria-current={active ? "page" : undefined}
                              aria-label={collapsed ? item.label : undefined}
                              className={`flex items-center gap-2.5 overflow-hidden rounded-md border-l-2 py-2 pl-2.5 pr-2 text-[13px] transition-colors duration-150 ${
                                active
                                  ? "border-l-teal bg-surface-2 text-foreground"
                                  : "border-l-transparent text-[color:var(--text-secondary)] hover:bg-surface-2 hover:text-foreground"
                              }`}
                            >
                              <Icon className="h-4 w-4 shrink-0" strokeWidth={1.75} />
                              <span
                                className={`whitespace-nowrap transition-opacity duration-150 ${
                                  collapsed ? "pointer-events-none opacity-0" : "opacity-100"
                                }`}
                              >
                                {item.label}
                              </span>
                            </Link>
                          </TooltipTrigger>
                          <TooltipContent side="right">{item.label}</TooltipContent>
                        </Tooltip>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </nav>
        </TooltipProvider>

        <TooltipProvider delayDuration={400}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                onClick={toggleCollapsed}
                aria-expanded={!collapsed}
                aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
                className="h-auto justify-start gap-2.5 overflow-hidden rounded-none border-t border-border-subtle px-4 py-3 text-[12px] font-normal text-[color:var(--text-secondary)] hover:text-foreground"
              >
                {collapsed ? (
                  <PanelLeftOpen className="h-4 w-4 shrink-0" strokeWidth={1.75} />
                ) : (
                  <PanelLeftClose className="h-4 w-4 shrink-0" strokeWidth={1.75} />
                )}
                <span className={`whitespace-nowrap transition-opacity duration-150 ${collapsed ? "opacity-0" : "opacity-100"}`}>
                  Collapse
                </span>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">{collapsed ? "Expand sidebar" : "Collapse sidebar"}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </aside>

      <div
        className="pb-[calc(4.5rem+env(safe-area-inset-bottom))] transition-[padding] duration-150 ease-out md:pb-0 md:pl-[var(--sidebar-w)]"
      >
        {/* Global controls stay limited to search, appearance, privacy, and session. */}
        <header className="sticky top-0 z-20 border-b border-border-subtle bg-sidebar/90 backdrop-blur">
          <div className="flex h-14 items-center gap-2 page-gutter">
            <Link to="/" aria-label="Sahil's Finance Intelligence home" className="flex items-center gap-2 md:hidden">
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-primary/40 font-display text-sm font-semibold text-primary">
                S
              </span>
              <span className="font-display text-sm font-semibold tracking-tight text-foreground">Sahil</span>
            </Link>
            <div className="hidden min-w-0 items-center gap-2 md:flex">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-positive" aria-hidden="true" />
              <span className="truncate text-[12px] font-medium text-[color:var(--text-secondary)]">Sahil's Finance Intelligence</span>
              <ModelStatus />
            </div>
            <TooltipProvider delayDuration={400}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    onClick={() => setPaletteOpen(true)}
                    aria-label="Search and jump to a page"
                    aria-keyshortcuts="Meta+K Control+K"
                    className="ml-auto h-9 gap-2 border-border-subtle bg-surface-2 px-2.5 text-[12px] font-normal text-[color:var(--text-secondary)] hover:text-foreground"
                  >
                    <CommandIcon className="h-3.5 w-3.5" strokeWidth={1.75} />
                    <span className="hidden sm:inline">Search</span>
                    <span className="hidden rounded border border-border-subtle px-1 text-[11px] sm:inline">K</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Search and jump (⌘K)</TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <ThemeToggle choice={choice} onChange={setTheme} />
            <TooltipProvider delayDuration={400}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={toggle}
                    aria-label={hidden ? "Show figures" : "Mask figures"}
                    className="min-h-11 min-w-11 border-border-subtle bg-surface-2 text-[color:var(--text-secondary)] hover:text-foreground"
                  >
                    {hidden ? <EyeOff className="h-4 w-4" strokeWidth={1.75} /> : <Eye className="h-4 w-4" strokeWidth={1.75} />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{hidden ? "Show figures" : "Mask figures (privacy mode)"}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <TooltipProvider delayDuration={400}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={async () => {
                      await lock();
                      await router.navigate({ to: "/unlock" });
                    }}
                    aria-label="Lock session"
                    className="min-h-11 min-w-11 border-border-subtle bg-surface-2 text-[color:var(--text-secondary)] hover:text-foreground"
                  >
                    <Lock className="h-4 w-4" strokeWidth={1.75} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Lock this session</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </header>

        <main
          id="main-content"
          key={pathname}
          className="page-enter app-container page-gutter py-6 md:py-8 xl:py-10"
        >
          <div className="flex flex-col items-start gap-4 md:flex-row md:flex-wrap md:items-end md:justify-between">
            <div className="min-w-0">
              <h1 className="type-page-title">{title}</h1>
              {subtitle ? <p className="type-body mt-1.5 max-w-[62ch]">{subtitle}</p> : null}
            </div>
            {actions ? (
              <div className="-mx-4 w-[calc(100%+2rem)] overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [&_button]:shrink-0 [&_button]:whitespace-nowrap md:mx-0 md:w-auto md:overflow-visible md:px-0 md:pb-0">
                {actions}
              </div>
            ) : null}
          </div>
          <div className="mt-6 md:mt-8">{children}</div>
        </main>
        <AppFooter />

      </div>

      {/* Mobile: primary sections as a bottom tab bar, the rest behind "More". */}
      <nav
        aria-label="Primary mobile"
        className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-border-subtle bg-sidebar/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
      >
        {primary.map((item) => {
          const Icon = item.icon;
          const active = isActive(pathname, item.to);
          return (
            <Link
              key={item.to}
              to={item.to}
              aria-current={active ? "page" : undefined}
              className={`flex min-h-14 flex-col items-center justify-center gap-1 py-2 text-[11px] ${
                active ? "text-teal" : "text-[color:var(--text-tertiary)]"
              }`}
            >
              <Icon className="h-4 w-4" strokeWidth={1.75} />
              {item.label}
            </Link>
          );
        })}
        <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
          <SheetTrigger
            className={`flex min-h-14 flex-col items-center justify-center gap-1 py-2 text-[11px] ${
              secondarySections.some((s) => s.items.some((i) => isActive(pathname, i.to)))
                ? "text-teal"
                : "text-[color:var(--text-tertiary)]"
            }`}
          >
            <Menu className="h-4 w-4" strokeWidth={1.75} />
            More
          </SheetTrigger>
          <SheetContent side="bottom" className="max-h-[80vh] overflow-y-auto rounded-t-2xl border-border-subtle bg-sidebar">
            <SheetHeader className="text-left">
              <SheetTitle className="font-display text-base">Everything else</SheetTitle>
            </SheetHeader>
            <div className="mt-4 space-y-5 pb-[env(safe-area-inset-bottom)]">
              {secondarySections.map((section) => (
                <div key={section.heading}>
                  <p className="px-1 text-[11px] font-medium uppercase tracking-[0.14em] text-[color:var(--text-tertiary)]">
                    {section.heading}
                  </p>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    {section.items.map((item) => {
                      const Icon = item.icon;
                      const active = isActive(pathname, item.to);
                      return (
                        <Link
                          key={item.to}
                          to={item.to}
                          onClick={() => setMoreOpen(false)}
                          aria-current={active ? "page" : undefined}
                          className={`flex min-h-12 items-center gap-2.5 rounded-lg border border-border-subtle px-3 text-[13px] ${
                            active ? "bg-surface-2 text-teal" : "text-[color:var(--text-secondary)]"
                          }`}
                        >
                          <Icon className="h-4 w-4 shrink-0" strokeWidth={1.75} />
                          {item.label}
                        </Link>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </SheetContent>
        </Sheet>
      </nav>

      <CommandPalette
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        navItems={ALL_ITEMS.map((i) => ({ to: i.to, label: i.label, icon: i.icon }))}
        privacyHidden={hidden}
        onTogglePrivacy={toggle}
        theme={choice}
        onToggleTheme={() => setTheme(choice === "dark" ? "light" : "dark")}
        onLock={async () => {
          await lock();
          await router.navigate({ to: "/unlock" });
        }}
      />

    </div>
  );
}

export function Panel({
  title,
  description,
  actions,
  children,
  className = "",
  collapsible = false,
  defaultOpen = false,
}: {
  title?: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Secondary or technical detail: collapsed until asked for. */
  collapsible?: boolean;
  defaultOpen?: boolean;
}) {
  const header = title ? (
    <div>
      <h2 className="font-display text-sm font-semibold tracking-tight text-foreground">{title}</h2>
      {description ? <p className="mt-1 text-[12px] text-[color:var(--text-secondary)]">{description}</p> : null}
    </div>
  ) : null;

  if (collapsible && title) {
    return (
      <details className={`card-base group ${className}`} open={defaultOpen}>
        <summary className="flex cursor-pointer list-none flex-wrap items-start justify-between gap-3 px-6 py-4 [&::-webkit-details-marker]:hidden">
          {header}
          <span className="text-[12px] text-[color:var(--text-tertiary)] transition-colors group-hover:text-foreground">
            <span className="group-open:hidden">Details</span>
            <span className="hidden group-open:inline">Hide</span>
          </span>
        </summary>
        <div className="border-t border-border-subtle p-6">{children}</div>
      </details>
    );
  }

  return (
    <section className={`card-base ${className}`}>
      {title ? (
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border-subtle px-6 py-4">
          {header}
          {actions}
        </header>
      ) : null}
      <div className="p-6">{children}</div>
    </section>
  );
}


export function EmptyState({
  title,
  detail,
  action,
  art,
}: {
  title: string;
  detail: string;
  action?: ReactNode;
  art?: ReactNode;
}) {
  return (
    <div className="rounded-[10px] border border-dashed border-border-subtle bg-surface-1/40 px-6 py-10 text-center">
      {art ? <div className="mx-auto mb-4 flex justify-center text-[color:var(--text-tertiary)]">{art}</div> : null}
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="mx-auto mt-1.5 max-w-md text-[12px] leading-relaxed text-[color:var(--text-secondary)]">
        {detail}
      </p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
