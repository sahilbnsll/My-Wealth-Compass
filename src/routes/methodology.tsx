import { createFileRoute } from "@tanstack/react-router";
import { AppShell, Panel } from "@/components/AppShell";

export const Route = createFileRoute("/methodology")({
  head: () => ({
    meta: [
      { title: "Methodology — Sahil's Finance Intelligence" },
      {
        name: "description",
        content:
          "How returns, projections, tax and retirement outcomes are calculated in Sahil's Finance Intelligence.",
      },
      { property: "og:title", content: "Methodology — Sahil's Finance Intelligence" },
      {
        property: "og:description",
        content: "The models, formulas and assumptions behind every figure in the app.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MethodologyPage,
});

const SECTIONS: { title: string; body: string[] }[] = [
  {
    title: "Valuation",
    body: [
      "A holding's value is quantity × latest price when both exist, otherwise the stored current value. Mutual funds price from the AMFI NAV feed, stocks and ETFs from a public quote feed, everything else stays manual.",
      "Nothing is ever estimated silently. If a price is missing or old, the figure carries its source and timestamp so you can see exactly what it is based on.",
    ],
  },
  {
    title: "Returns",
    body: [
      "XIRR is solved on the dated cash flows of your ledger (purchases negative, current value as a terminal inflow) using bisection on the net-present-value function, so irregular contributions are handled correctly.",
      "Where no ledger exists, a CAGR from dated purchases is used instead and labelled as such. Simple absolute gain is never presented as an annualised return.",
    ],
  },
  {
    title: "Projections",
    body: [
      "Projections compound the current corpus at your assumed return and add each SIP month by month, applying annual step-ups on the SIP anniversary and pausing contributions you have paused.",
      "The outcome fan is a spread around the base assumption, not a probability guarantee. Real (inflation-adjusted) values discount by your CPI assumption.",
    ],
  },
  {
    title: "Tax",
    body: [
      "Capital gains follow the post-July-2024 Indian regime: 12.5% long-term on equity above the annual exemption, 20% short-term on equity, and slab or 12.5% treatment on other asset classes depending on holding period.",
      "Realised gains are matched FIFO against your ledger lots. Tax shown on projections is an estimate of drag, not a filing computation.",
    ],
  },
  {
    title: "Retirement",
    body: [
      "The decumulation model grows the corpus at the post-retirement return, withdraws inflation-adjusted expenses each year, and reports the year the corpus depletes or the surplus that remains.",
      "Stress tests replay historical shock magnitudes against your actual allocation; they show sensitivity, not prediction.",
    ],
  },
  {
    title: "What the app will not do",
    body: [
      "No figure is invented. When a feed is unavailable the app shows the gap and lets you enter the value manually with its own provenance.",
      "The AI narrative can only describe numbers that were already computed by the finance engine. It never calculates.",
    ],
  },
];

function MethodologyPage() {
  return (
    <AppShell
      title="Methodology"
      subtitle="Every number in this app is produced by a tested calculation engine. This page states which model produced which figure, and where each model stops being reliable."
    >
      <div className="grid gap-5 lg:grid-cols-2">
        {SECTIONS.map((section) => (
          <Panel key={section.title} title={section.title}>
            <div className="space-y-3">
              {section.body.map((paragraph) => (
                <p key={paragraph} className="text-[13px] leading-relaxed text-[color:var(--text-secondary)]">
                  {paragraph}
                </p>
              ))}
            </div>
          </Panel>
        ))}
      </div>
    </AppShell>
  );
}
