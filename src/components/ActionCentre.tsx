import { useState } from "react";
import { Link } from "@tanstack/react-router";
import type { ActionItem, ActionSeverity } from "@/lib/finance/attention";

const SEVERITY_LABEL: Record<ActionSeverity, string> = {
  critical: "Needs attention",
  attention: "Worth reviewing",
  opportunity: "On track",
};

const SEVERITY_MARK: Record<ActionSeverity, string> = {
  critical: "bg-destructive",
  attention: "bg-warning",
  opportunity: "bg-teal",
};

const SEVERITY_TEXT: Record<ActionSeverity, string> = {
  critical: "text-destructive",
  attention: "text-warning",
  opportunity: "text-teal",
};

/**
 * Ranked list of decisions. Each row states the finding in a sentence and
 * hides the calculated evidence behind a disclosure, so the page reads as
 * prose first and a data table second. Only the top few rows are shown by
 * default — a dashboard that lists everything ranks nothing.
 */
export function ActionCentre({ items, initialVisible }: { items: ActionItem[]; initialVisible?: number }) {
  const limit = initialVisible ?? items.length;
  const [expanded, setExpanded] = useState(false);

  if (items.length === 0) {
    return (
      <div className="border-t border-border-subtle py-10 text-center">
        <p className="font-display text-[20px] tracking-tight text-foreground">Nothing needs a decision today</p>
        <p className="mx-auto mt-2 max-w-md text-[13px] text-[color:var(--text-secondary)]">
          Liquidity, allocation and goal funding are all inside their tolerances on the numbers currently recorded.
        </p>
      </div>
    );
  }

  const visible = expanded ? items : items.slice(0, limit);
  const hidden = items.length - visible.length;

  return (
    <>
      <ul className="divide-y divide-[color:var(--border-subtle)] border-t border-border-subtle">
        {visible.map((item) => (
          <ActionRow key={item.id} item={item} />
        ))}
      </ul>
      {hidden > 0 || expanded ? (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-4 text-[12px] text-primary underline-offset-4 transition-colors hover:underline"
        >
          {expanded ? "Show fewer" : `View all ${items.length}`}
        </button>
      ) : null}
    </>
  );
}


function ActionRow({ item }: { item: ActionItem }) {
  const [open, setOpen] = useState(false);
  const panelId = `evidence-${item.id}`;

  return (
    <li className="py-5">
      <div className="flex gap-4">
        <span
          aria-hidden
          className={`mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full ${SEVERITY_MARK[item.severity]}`}
        />
        <div className="min-w-0 flex-1">
          <p className={`text-[11px] uppercase tracking-[0.1em] ${SEVERITY_TEXT[item.severity]}`}>
            {SEVERITY_LABEL[item.severity]}
          </p>
          <h3 className="mt-1.5 font-display text-[18px] leading-snug tracking-tight text-foreground">
            {item.headline}
          </h3>
          <p className="mt-1.5 max-w-2xl text-[13px] leading-relaxed text-[color:var(--text-secondary)]">
            {item.detail}
          </p>

          <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2">
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              aria-controls={panelId}
              className="text-[12px] text-[color:var(--text-secondary)] underline-offset-4 transition-colors hover:text-foreground hover:underline"
            >
              {open ? "Hide evidence" : "Show evidence"}
            </button>
            {item.action ? (
              <Link
                to={item.action.to}
                className="text-[12px] text-primary underline-offset-4 transition-colors hover:underline"
              >
                {item.action.label} →
              </Link>
            ) : null}
          </div>

          {open ? (
            <dl
              id={panelId}
              className="mt-3 grid gap-x-8 gap-y-1.5 border-l border-border-subtle pl-4 text-[12px] sm:grid-cols-2"
            >
              {item.evidence.map((e) => (
                <div key={e.label} className="flex justify-between gap-4">
                  <dt className="text-[color:var(--text-tertiary)]">{e.label}</dt>
                  <dd className="tabular privacy-sensitive text-right text-foreground">{e.value}</dd>
                </div>
              ))}
            </dl>
          ) : null}
        </div>
      </div>
    </li>
  );
}
