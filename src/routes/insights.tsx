import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Sparkles, Send, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { AppShell, Panel } from "@/components/AppShell";
import { AlertRow, buttonClass, ghostButtonClass } from "@/components/Bits";
import {
  askPortfolio,
  generateInsights,
  getPortfolioBrief,
  type AskResponse,
  type InsightResponse,
} from "@/lib/ai.functions";
import type { BriefFact } from "@/lib/finance/brief";

export const Route = createFileRoute("/insights")({
  loader: () => getPortfolioBrief(),
  head: () => ({
    meta: [
      { title: "Sahil's Finance Intelligence — Insights" },
      {
        name: "description",
        content:
          "A plain-language reading of the calculated portfolio brief, with every statement traced back to the figure behind it.",
      },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Sahil's Finance Intelligence — Insights" },
      {
        property: "og:description",
        content: "Narrative over calculated facts. The model explains; the finance engine computes.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: InsightsPage,
});

function Evidence({ facts, unverified }: { facts: BriefFact[]; unverified: string[] }) {
  if (facts.length === 0 && unverified.length === 0) return null;
  return (
    <details className="mt-4 group">
      <summary className="cursor-pointer text-xs uppercase tracking-[0.14em] text-muted-foreground hover:text-foreground transition-colors">
        Evidence · {facts.length}
      </summary>
      <dl className="mt-3 space-y-2 border-l border-border pl-4">
        {facts.map((f) => (
          <div key={f.id} className="text-sm">
            <dt className="text-muted-foreground">{f.label}</dt>
            <dd className="font-mono tabular-nums">
              {f.value}
              <span className="ml-2 text-xs font-sans text-muted-foreground">{f.basis}</span>
            </dd>
          </div>
        ))}
        {unverified.length > 0 && (
          <div className="text-xs text-destructive">
            Uncited references ignored: {unverified.join(", ")}
          </div>
        )}
      </dl>
    </details>
  );
}

function InsightsPage() {
  const brief = Route.useLoaderData();
  const runInsights = useServerFn(generateInsights);
  const ask = useServerFn(askPortfolio);

  const [result, setResult] = useState<InsightResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<AskResponse | null>(null);
  const [asking, setAsking] = useState(false);

  async function onGenerate() {
    setLoading(true);
    try {
      setResult(await runInsights({ data: undefined }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not generate insights.");
    } finally {
      setLoading(false);
    }
  }

  async function onAsk(e: React.FormEvent) {
    e.preventDefault();
    if (question.trim().length < 3) return;
    setAsking(true);
    try {
      setAnswer(await ask({ data: { question } }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not answer that.");
    } finally {
      setAsking(false);
    }
  }

  return (
    <AppShell
      title="Insights"
      subtitle="Evidence first. The finance engine computes; your configured AI provider only explains the verified brief."
    >
      <div className="space-y-8">
        <Panel
          title="Reading of the current brief"
          description={`${brief.facts.length} calculated facts · ${brief.actionCount} engine findings`}
          actions={
            <button type="button" onClick={onGenerate} disabled={loading || !brief.hasData} className={buttonClass}>
              {loading ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
              {result ? "Regenerate" : "Generate"}
            </button>
          }
        >
          {!brief.hasData ? (
            <p className="text-sm text-muted-foreground">
              Add holdings or planned investments first — there is nothing calculated to explain yet.
            </p>
          ) : !result ? (
            <p className="text-sm text-muted-foreground">
              Nothing is sent to the model except labelled figures the engine has already computed, plus an explicit list
              of what is unknown. Every claim below can be expanded to the numbers behind it.
            </p>
          ) : result.insights.length === 0 ? (
            <p className="text-sm text-muted-foreground">No insight cited a verifiable figure, so nothing is shown.</p>
          ) : (
            <ol className="space-y-6">
              {result.insights.map((insight, i) => (
                <li key={i} className="border-b border-border pb-6 last:border-0 last:pb-0">
                  <h3 className="text-lg font-medium tracking-tight">{insight.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{insight.body}</p>
                  <Evidence facts={insight.evidence} unverified={insight.unverified} />
                </li>
              ))}
            </ol>
          )}
        </Panel>

        <Panel title="Ask my portfolio" description="Contextual answers, grounded only in calculated figures.">
          <form onSubmit={onAsk} className="flex gap-2">
            <input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              maxLength={500}
              placeholder="Am I on track for the goals I've recorded?"
              className="flex-1 rounded-[10px] border border-border bg-transparent px-3 py-2 text-sm outline-none focus:border-primary"
            />
            <button type="submit" disabled={asking} className={ghostButtonClass}>
              {asking ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
              Ask
            </button>
          </form>
          {answer && (
            <div className="mt-5">
              <p className="text-sm leading-relaxed">{answer.answer}</p>
              <Evidence facts={answer.evidence} unverified={answer.unverified} />
            </div>
          )}
          <p className="mt-4 text-[11px] leading-relaxed text-muted-foreground">
            Your AI key stays server-side. Set AI_API_KEY, AI_BASE_URL and AI_MODEL in the deployment environment to use a private OpenAI-compatible provider.
          </p>
        </Panel>

        {brief.unknowns.length > 0 && (
          <Panel title="Not known" description="Unavailable — never guessed.">
            <div className="space-y-2">
              {brief.unknowns.map((u, i) => (
                <AlertRow key={i} level="info" title="Unavailable" detail={u} />
              ))}
            </div>
          </Panel>
        )}
      </div>
    </AppShell>
  );
}
