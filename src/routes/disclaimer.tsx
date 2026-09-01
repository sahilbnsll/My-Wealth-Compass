import { createFileRoute } from "@tanstack/react-router";
import { AppShell, Panel } from "@/components/AppShell";

export const Route = createFileRoute("/disclaimer")({
  head: () => ({
    meta: [
      { title: "Disclaimer — Sahil's Finance Intelligence" },
      {
        name: "description",
        content:
          "Modelled outcomes, data limitations and the boundaries of what this personal investment tool can tell you.",
      },
      { property: "og:title", content: "Disclaimer — Sahil's Finance Intelligence" },
      {
        property: "og:description",
        content: "Personal planning software. Modelled outcomes, not financial advice.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DisclaimerPage,
});

function DisclaimerPage() {
  return (
    <AppShell
      title="Disclaimer"
      subtitle="What this tool is, and what it deliberately is not."
    >
      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="Not financial advice">
          <p className="text-[13px] leading-relaxed text-[color:var(--text-secondary)]">
            This is personal planning software built for one investor's own use. Nothing here is a
            recommendation to buy, sell or hold any security, and no output should be treated as advice
            from a registered adviser or distributor.
          </p>
        </Panel>
        <Panel title="Modelled, not predicted">
          <p className="text-[13px] leading-relaxed text-[color:var(--text-secondary)]">
            Projections, retirement outcomes and stress tests are arithmetic applied to assumptions you
            control. Change an assumption and the answer changes. Real markets deviate from every model,
            and past returns do not carry forward.
          </p>
        </Panel>
        <Panel title="Data limitations">
          <p className="text-[13px] leading-relaxed text-[color:var(--text-secondary)]">
            Prices, NAVs and macro series come from public feeds that can be delayed, revised or briefly
            unavailable. The app labels every figure with its source and age rather than filling gaps
            silently — check the freshness indicator before acting on a number.
          </p>
        </Panel>
        <Panel title="Tax figures are estimates">
          <p className="text-[13px] leading-relaxed text-[color:var(--text-secondary)]">
            Capital gains and dividend tax are estimated under current Indian rules using FIFO lot
            matching. They ignore set-offs, carried-forward losses, surcharge nuances and your wider
            income position. Use a qualified professional for filing.
          </p>
        </Panel>
      </div>
    </AppShell>
  );
}
