import { createFileRoute } from "@tanstack/react-router";
import { AppShell, Panel } from "@/components/AppShell";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy — Sahil's Finance Intelligence" },
      {
        name: "description",
        content:
          "How this private, single-user financial workspace stores data, what leaves the app, and how the session is protected.",
      },
      { property: "og:title", content: "Privacy — Sahil's Finance Intelligence" },
      {
        property: "og:description",
        content: "Single-user, passcode-gated, no analytics, no third-party tracking.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PrivacyPage,
});

const POINTS: { title: string; body: string }[] = [
  {
    title: "Single user, private by design",
    body: "This workspace exists for one person. There are no public sign-ups, no shared accounts and no multi-tenant data. Every screen is behind a passcode gate checked on the server.",
  },
  {
    title: "Session security",
    body: "Unlocking sets an encrypted, HTTP-only session cookie. Repeated wrong passcodes are throttled, state-changing requests carry CSRF protection, and Lock ends the session immediately.",
  },
  {
    title: "Where data lives",
    body: "Holdings, transactions, goals, plans, assumptions and snapshots are stored in your own managed backend database. Nothing is written to third-party analytics or advertising systems.",
  },
  {
    title: "What leaves the app",
    body: "Outbound requests go only to the official market-data feeds listed on the Data sources page (fund NAVs, stock quotes, macro series). Those requests carry instrument identifiers, never your balances.",
  },

  {
    title: "AI narrative",
    body: "When you ask for a written brief, a set of already-computed figures is sent to the model to phrase them. The model has no database access and cannot calculate. Turn the feature off and nothing is sent at all.",
  },
  {
    title: "Privacy mode and export",
    body: "Privacy mode blurs every figure on screen for shoulder-safe use. You can export a full JSON backup or per-table CSVs at any time; the data is yours and portable.",
  },
];

function PrivacyPage() {
  return (
    <AppShell
      title="Privacy"
      subtitle="A plain statement of how this private workspace handles your financial data."
    >
      <div className="grid gap-5 lg:grid-cols-2">
        {POINTS.map((point) => (
          <Panel key={point.title} title={point.title}>
            <p className="text-[13px] leading-relaxed text-[color:var(--text-secondary)]">{point.body}</p>
          </Panel>
        ))}
      </div>
    </AppShell>
  );
}
