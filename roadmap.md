# Roadmap — Sahil Investment Intelligence premium rebuild

Global constraints: see mem://constraints/engineering (typography-driven design, finance engine as source of truth,
phase isolation with typecheck + tests + build + UI checkpoint, no fabricated data, AI as narrative layer only).

## Phase 1 — Foundation (design system) — DONE
- [x] Dual-theme tokens in src/styles.css (warm light / pitch dark, amber accent)
- [x] ThemeToggle + flash-free init script
- [x] AppShell branding, sidebar sections, footer, privacy/lock affordances
- [x] Fix planned-investment date regex bug

## Phase 2 — Core UX — DONE
- [x] Dashboard action center: what needs attention, ranked, evidence-backed
- [x] Portfolio: hero metric, quiet figures, plain-list concentration checks
- [x] Planning: hero commitment metric + supporting figures
- [x] Goals: per-goal distance-to-target with disclosure of the maths
- [ ] UI checkpoint: light/dark, desktop/mobile screenshots (blocked behind passcode gate)

## Phase 3 — Intelligence pages
- [ ] Projections wealth curve with scenario envelope
- [x] Retirement decumulation model — projection engine now has a decumulation phase
      (contributions stop at retirement age, inflation-linked withdrawals drawn pro-rata),
      src/lib/finance/retirement.ts adds survival/sustainable-spend analysis, /retirement route
- [x] Stress test page — src/lib/finance/stress.ts composes segmented runs of project()
      (instant shock, return/inflation deltas, contribution pauses); /stress shows damage,
      drawdown, recovery time and the historical basis of each shock
- [x] Research terminal — /research shows every reference level with source, publication
      date, freshness and confidence; unavailable groups say so instead of estimating

## Phase 4 — Data, integrations, ledger
- [x] Durable transaction event model (FIFO lot matching, XIRR, realised gains, cost basis)
- [x] Gold/Silver/FX feeds with provenance (fetchCommoditiesFx via Yahoo, unit notes on each)
- [x] JSON/CSV exports — per-table CSV plus full workspace JSON backup, from /settings
- [x] Data health panel — AMFI, Yahoo, DBnomics and Notion each report status and freshness

## Phase D — Intelligence, data and integrations — DONE
- [x] Commodities and currency on the research terminal
- [x] /settings hub: theme, privacy mode, exports, planning rules
- [x] Command palette gains theme, privacy and export actions
- [x] Unlock form hardened against pre-hydration native submit (no passcode in the URL)

## Phase 5 — AI layer
- [x] Insight engine over calculated context, with evidence disclosure
- [x] "Ask my portfolio" conversation grounded in computed context

## Phase 6 — Reliability, security, correctness
- [x] Rate limiting on /unlock (durable attempt ladder), same-origin checks on gate mutations
- [x] TS/SQL valuation parity tests (4 tests comparing valueHolding with capture_portfolio_snapshot)
- [x] Accessibility pass (skip link, landmarks, aria-current, labelled controls)

## Phase B — Universal instrument lookup — DONE
- [x] searchInstruments server fn merges AMFI funds + NSE/BSE listings (Yahoo symbol search)
- [x] Shared InstrumentSearch combobox (debounced, keyboard-navigable, provenance shown)
- [x] Wired into Holding wizard and SIP wizard, replacing the fund-only picker

## Phase C — Core screens — DONE
- [x] Dashboard: attention list ranked, top 3 with "View all"; severity reads
      Needs attention / Worth reviewing / On track; allocation donut now uses
      rupee values instead of percentages
- [x] Portfolio: segmented view modes (Overview / Holdings / Allocation / Risk)
      with donut on Overview and concentration checks under Risk
- [x] Projections: "Where could this take me?" hero, segmented scenario selector,
      opt-in Compare mode (fan band only when comparing), year scrubber retained
- [x] Retirement: survival/depletion answer leads the page
- [x] Stress test: worst-case hero, drawdown, recovery, per-scenario readout

## Phase E — Mobile and polish — DONE
- [x] Bottom tab bar reduced to 4 primary tabs plus a "More" sheet holding
      Portfolio / Planning / Intelligence / Setup sections
- [x] Safe-area padding under the tab bar, mobile type scale on page headers
- [x] Page action rows scroll horizontally instead of wrapping; icon-only search on small screens
- [x] Verified at 402px: no horizontal overflow on dashboard, holdings, projections,
      research, ledger or settings; charts, scrubber and tables legible

## Phase F — Import truth and portfolio detail — DONE
- [x] Deterministic holding reconciliation with ISIN → symbol → normalised name matching
- [x] Broker transaction parser with Indian dates, inferred direction and review confidence
- [x] Smart Import Center with paste/upload, preview, duplicate detection and explicit commit
- [x] Server-side transaction deduplication and holding linking on import
- [x] Holding detail panel with valuation provenance and linked ledger activity
- [x] Advanced portfolio decisions: rebalancing, glide path and sensitivity analysis (Phase G)

## Phase G — Advanced analysis — DONE
- [x] src/lib/finance/rebalance.ts — drift-to-plan converter: sell/buy legs, turnover,
      tax caution on realising gains, and a no-sell route that redirects new contributions
- [x] Portfolio gains a Rebalance view: drift per class against the strategy target,
      rupee correction per class, months to fix with contributions alone
- [x] src/lib/finance/sensitivity.ts — one-way sensitivity on equity return, inflation,
      contribution, step-up and years, ranked by the spread each lever creates
- [x] Projections gains "What actually moves the outcome" and an opt-in age-based glide path
      (new contributions only; existing holdings are never sold)
- [x] 12 new tests (149 total), typecheck clean

## Phase H — Assumptions centre, monthly review, watchlist — COMPLETE
- [x] Assumptions centre: every assumption editable in one place with its source and last review
- [x] Monthly review flow: what changed, what needs a decision, mark reviewed
- [x] Watchlist of instruments not yet owned, priced from the same feeds
- [x] Financial calendar: SIPs, goals, maturities, statutory dates and custom entries
- [x] Home screen aggregates plan, goals, research, watchlist and monthly review context

## Phase I — AI provider flexibility — TODO
- [ ] Model selection and graceful degradation when the gateway is unavailable

## Phase J — Correctness, drafts/undo, final polish — TODO
- [ ] Draft state and undo on destructive actions
- [ ] Final performance and premium polish pass

## Phase K — Portfolio analytical workspace — DONE
- [x] Portfolio overview, allocation, risk and performance views
- [x] Qualitative portfolio health signals without composite scores
- [x] Inline expandable holding analysis with role, risk, gain, target and price freshness
- [x] Contribution-first rebalancing decisions with explicit sell conditions and gap evidence


