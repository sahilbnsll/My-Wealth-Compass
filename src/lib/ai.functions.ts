/**
 * AI narrative layer.
 *
 * The model never calculates. It receives a structured brief produced by the
 * finance engine and may only explain, prioritise and reference facts by id.
 * Any fact id it returns is validated against the brief before display, so an
 * insight can always be traced back to a computed number.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireUnlocked } from "./gate.server";
import { briefForModel, buildPortfolioBrief, type BriefFact } from "./finance/brief";

// A workspace can bring its own OpenAI-compatible provider without exposing a
// key to the browser. `AI_*` takes precedence; the existing Lovable gateway
// remains a safe zero-config fallback.
const MODEL = process.env["AI_MODEL"] || "google/gemini-2.5-flash";
const GATEWAY = process.env["AI_BASE_URL"] || "https://ai.gateway.lovable.dev/v1/chat/completions";

export type Insight = {
  title: string;
  body: string;
  /** Facts from the brief that support the statement. */
  evidence: BriefFact[];
  /** Ids the model cited that did not exist; surfaced for transparency. */
  unverified: string[];
};

export type InsightResponse = {
  generatedAt: string;
  model: string;
  insights: Insight[];
  unknowns: string[];
  factCount: number;
};

/**
 * A useful briefing must not depend on a provider being online. These lines
 * reuse the engine's ranked findings and only cite facts already in the brief.
 */
function deterministicInsights(brief: Awaited<ReturnType<typeof loadBrief>>): InsightResponse {
  const factsByLabel = new Map(brief.facts.map((item) => [item.label.toLowerCase(), item]));
  const fallbackEvidence = brief.facts.filter((item) => ["total_value", "monthly_sip", "emergency_coverage"].includes(item.id));
  const insights = brief.actions.slice(0, 4).map((action) => ({
    title: action.headline,
    body: action.detail,
    evidence: action.evidence
      .map((item) => factsByLabel.get(item.label.toLowerCase()))
      .filter((item): item is BriefFact => Boolean(item))
      .slice(0, 3),
    unverified: [],
  }));
  if (insights.length === 0 && fallbackEvidence.length > 0) {
    insights.push({
      title: "Your financial picture is ready to review",
      body: "The calculated portfolio summary is available. Add transactions, plans and goals to make the guidance more specific.",
      evidence: fallbackEvidence,
      unverified: [],
    });
  }
  return {
    generatedAt: brief.generatedAt,
    model: "Deterministic finance engine",
    insights,
    unknowns: brief.unknowns,
    factCount: brief.facts.length,
  };
}

const SYSTEM_PROMPT = `You are the narrative layer of a private Indian investment terminal.

Hard rules:
- You NEVER calculate, estimate, extrapolate or infer a numeric value. Every figure you mention must be copied verbatim from the CALCULATED FACTS or ENGINE FINDINGS you are given.
- If something is listed as unknown or unavailable, say it is unavailable and what the owner would need to record. Never fill the gap with a guess, a market average, or a typical value.
- No product, fund, stock or scheme recommendations. Discuss allocation, coverage, cadence and trade-offs in general terms.
- Be specific, calm and concise. Short declarative sentences. No hype, no emoji, no disclaimers about being an AI.

Respond with strict JSON only, no markdown fences:
{"insights":[{"title":"short sentence","body":"2-4 sentences","evidence":["fact_id","fact_id"]}]}
Return 3 to 5 insights ordered by importance. Every insight must cite at least one fact id that appears in the brief.`;

async function callGateway(messages: { role: string; content: string }[]): Promise<string> {
  const apiKey = process.env["AI_API_KEY"] || process.env["LOVABLE_API_KEY"];
  if (!apiKey) throw new Error("The AI layer is not configured for this workspace.");

  const res = await fetch(GATEWAY, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: MODEL, messages, temperature: 0.2 }),
  });

  if (res.status === 429) throw new Error("The AI layer is rate limited right now. Try again shortly.");
  if (res.status === 402) throw new Error("AI credits are exhausted for this workspace.");
  if (!res.ok) {
    // Never log provider response bodies: they can include implementation
    // details or echoed request context. Status is enough for diagnostics.
    console.error(`AI gateway failed with status ${res.status}`);
    throw new Error(`The AI layer returned an error (${res.status}).`);
  }

  const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const content = json.choices?.[0]?.message?.content;
  if (!content) throw new Error("The AI layer returned an empty response.");
  return content;
}

function stripFences(text: string): string {
  return text
    .replace(/^\s*```(?:json)?/i, "")
    .replace(/```\s*$/, "")
    .trim();
}

async function loadBrief() {
  const { fetchWorkspace } = await import("./workspace.server");
  const ws = await fetchWorkspace();
  return buildPortfolioBrief({
    profile: ws.profile,
    holdings: ws.holdings,
    planned: ws.planned,
    goals: ws.goals,
    assumptions: ws.assumptions.base,
    transactions: ws.transactions ?? [],
  });
}

/** The calculated brief on its own — no model involved. Always available. */
export const getPortfolioBrief = createServerFn({ method: "GET" }).handler(async () => {
  await requireUnlocked();
  const brief = await loadBrief();
  return {
    generatedAt: brief.generatedAt,
    hasData: brief.hasData,
    facts: brief.facts,
    unknowns: brief.unknowns,
    actionCount: brief.actions.length,
  };
});

/** Ranked narrative over the brief, with every claim tied back to a fact. */
export const generateInsights = createServerFn({ method: "POST" }).handler(async (): Promise<InsightResponse> => {
  await requireUnlocked();
  const brief = await loadBrief();

  if (!brief.hasData) {
    return { generatedAt: brief.generatedAt, model: MODEL, insights: [], unknowns: brief.unknowns, factCount: 0 };
  }

  let raw: string;
  try {
    raw = await callGateway([
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: briefForModel(brief) },
    ]);
  } catch {
    return deterministicInsights(brief);
  }

  let parsed: { insights?: { title?: string; body?: string; evidence?: string[] }[] };
  try {
    parsed = JSON.parse(stripFences(raw));
  } catch {
    throw new Error("The AI layer returned an unreadable response. Try again.");
  }

  const byId = new Map(brief.facts.map((f) => [f.id, f]));
  const insights: Insight[] = (parsed.insights ?? [])
    .filter((i) => i.title && i.body)
    .map((i) => {
      const cited = i.evidence ?? [];
      return {
        title: String(i.title),
        body: String(i.body),
        evidence: cited.map((id) => byId.get(id)).filter((f): f is BriefFact => Boolean(f)),
        unverified: cited.filter((id) => !byId.has(id)),
      };
    })
    .filter((i) => i.evidence.length > 0);

  return {
    generatedAt: brief.generatedAt,
    model: MODEL,
    insights,
    unknowns: brief.unknowns,
    factCount: brief.facts.length,
  };
});

export type AskResponse = {
  answer: string;
  evidence: BriefFact[];
  unverified: string[];
  model: string;
};

/** Grounded Q&A: the answer may only use facts already in the brief. */
export const askPortfolio = createServerFn({ method: "POST" })
  .inputValidator((data: { question: string }) => {
    const question = data.question.trim();
    if (question.length < 3) throw new Error("Ask a longer question.");
    if (question.length > 500) throw new Error("Keep the question under 500 characters.");
    return { question };
  })
  .handler(async ({ data }): Promise<AskResponse> => {
    await requireUnlocked();
    const brief = await loadBrief();

    let raw: string;
    try {
      raw = await callGateway([
        {
          role: "system",
          content: `${SYSTEM_PROMPT}

For a question, respond instead with strict JSON:
{"answer":"2-5 sentences","evidence":["fact_id"]}
If the brief does not contain what is needed, say so plainly in the answer and cite the closest available facts.`,
        },
        { role: "user", content: `${briefForModel(brief)}\n\nQUESTION: ${data.question}` },
      ]);
    } catch {
      const fallback = deterministicInsights(brief);
      return {
        answer: fallback.insights[0]?.body ?? "AI is unavailable. Your calculated portfolio summary remains available above.",
        evidence: fallback.insights[0]?.evidence ?? brief.facts.slice(0, 3),
        unverified: [],
        model: "Deterministic finance engine",
      };
    }

    let parsed: { answer?: string; evidence?: string[] };
    try {
      parsed = JSON.parse(stripFences(raw));
    } catch {
      throw new Error("The AI layer returned an unreadable response. Try again.");
    }

    const byId = new Map(brief.facts.map((f) => [f.id, f]));
    const cited = parsed.evidence ?? [];
    return {
      answer: parsed.answer?.trim() || "No answer was produced.",
      evidence: cited.map((id) => byId.get(id)).filter((f): f is BriefFact => Boolean(f)),
      unverified: cited.filter((id) => !byId.has(id)),
      model: MODEL,
    };
  });
