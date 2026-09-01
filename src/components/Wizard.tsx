import { useUsdInr, formatUsd } from "@/lib/fx";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Check, X, CalendarDays } from "lucide-react";
import { format } from "date-fns";
import { buttonClass, ghostButtonClass } from "@/components/Bits";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { describeAmount, formatAmountInput, parseAmountInput } from "@/lib/finance/amount";
import { formatPercentInput, parsePercentInput } from "@/lib/finance/percent";

/** A single wizard step. `valid` gates the Next button. */
export type WizardStep = {
  title: string;
  /** One-line explanation of what this step is for. */
  blurb?: string;
  content: ReactNode;
  valid?: boolean;
};

/**
 * Multi-step data entry in a modal. Steps are rendered one at a time with a
 * progress indicator, and the final step is always a review summary followed
 * by an explicit Save.
 */
export function WizardModal({
  open,
  title,
  steps,
  review,
  onClose,
  onSubmit,
  busy = false,
  saveLabel = "Save",
  initialStep = 0,
}: {
  open: boolean;
  title: string;
  steps: WizardStep[];
  /** Step to open on, so a section link can jump straight to its questions. */
  initialStep?: number;
  /** Summary rows rendered on the final review step. */
  review: { label: string; value: ReactNode }[];
  onClose: () => void;
  onSubmit: () => void | Promise<void>;
  busy?: boolean;
  saveLabel?: string;
}) {
  const [index, setIndex] = useState(initialStep);
  const bodyRef = useRef<HTMLDivElement>(null);
  const total = steps.length + 1; // + review
  const onReview = index === steps.length;
  const current = steps[index];

  useEffect(() => {
    if (open) setIndex(0);
  }, [open]);

  // Autofocus the first input of each step.
  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => {
      const el = bodyRef.current?.querySelector<HTMLElement>(
        "input:not([type=hidden]):not([disabled]), select, textarea",
      );
      el?.focus();
    }, 60);
    return () => window.clearTimeout(t);
  }, [open, index]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const canAdvance = onReview || current?.valid !== false;

  function next() {
    if (!canAdvance) return;
    setIndex((i) => Math.min(steps.length, i + 1));
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 backdrop-blur-sm sm:items-center sm:p-6">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="card-raised flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden"
      >
        <header className="flex items-start justify-between gap-4 border-b border-border-subtle px-6 py-4">
          <div>
            <p className="text-[11px] uppercase tracking-[0.12em] text-[color:var(--text-tertiary)]">
              Step {index + 1} of {total}
            </p>
            <h2 className="mt-1 font-display text-base font-semibold tracking-tight text-foreground">
              {onReview ? "Review and save" : current?.title}
            </h2>
            {!onReview && current?.blurb ? (
              <p className="mt-1 text-[12px] text-[color:var(--text-secondary)]">{current.blurb}</p>
            ) : null}
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-md border border-border-subtle bg-surface-2 p-1.5 text-[color:var(--text-secondary)] transition-colors hover:text-foreground"
          >
            <X className="h-4 w-4" strokeWidth={1.75} />
          </button>
        </header>

        <div className="flex gap-1 px-6 pt-4">
          {Array.from({ length: total }).map((_, i) => (
            <span
              key={i}
              className="h-1 flex-1 rounded-full transition-colors duration-150"
              style={{ background: i <= index ? "var(--accent-teal)" : "var(--bg-surface-3)" }}
            />
          ))}
        </div>

        <form
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={(e) => {
            e.preventDefault();
            if (onReview) void onSubmit();
            else next();
          }}
          onKeyDown={(e) => {
            // Enter advances rather than submitting mid-wizard.
            if (e.key === "Enter" && !onReview && (e.target as HTMLElement).tagName !== "TEXTAREA") {
              e.preventDefault();
              next();
            }
          }}
        >
          <div ref={bodyRef} className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
            {onReview ? (
              <dl className="card-base divide-y divide-[color:var(--border-subtle)]">
                {review.map((r) => (
                  <div key={r.label} className="flex items-baseline justify-between gap-4 px-4 py-2.5">
                    <dt className="text-[12px] text-[color:var(--text-secondary)]">{r.label}</dt>
                    <dd className="tabular text-right text-sm text-foreground">{r.value || "—"}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <div className="space-y-5">{current?.content}</div>
            )}
          </div>

          <footer className="flex items-center justify-between gap-3 border-t border-border-subtle px-6 py-4">
            <button
              type="button"
              className={ghostButtonClass}
              onClick={() => (index === 0 ? onClose() : setIndex((i) => i - 1))}
            >
              {index === 0 ? "Cancel" : "Back"}
            </button>
            <button type="submit" className={buttonClass} disabled={busy || !canAdvance}>
              {onReview ? (busy ? "Saving…" : saveLabel) : "Continue"}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}

/** Pill row replacing a dropdown when there are four or fewer options. */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  ariaLabel?: string;
}) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={`rounded-full border px-3.5 py-2 text-[13px] font-medium capitalize transition-colors duration-100 ${
              active
                ? "border-teal/50 bg-teal/15 text-teal"
                : "border-border-subtle bg-surface-2 text-[color:var(--text-secondary)] hover:text-foreground"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Larger field for wizard steps: 48px inputs, a validity tick, and help text
 * that appears on focus or hover rather than sitting under every field.
 */
export function WizardField({
  label,
  hint,
  valid,
  error,
  children,
}: {
  label: string;
  hint?: string;
  valid?: boolean;
  error?: string | null;
  children: ReactNode;
}) {
  const [show, setShow] = useState(false);
  return (
    <div
      className="group"
      onFocusCapture={() => setShow(true)}
      onBlurCapture={() => setShow(false)}
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[13px] font-medium text-foreground">{label}</span>
        {valid ? (
          <span className="inline-flex items-center gap-1 text-[11px] text-positive">
            <Check className="h-3.5 w-3.5" strokeWidth={2.25} />
          </span>
        ) : null}
      </div>
      <div className="mt-2">{children}</div>
      {error ? (
        <p className="mt-1.5 text-[12px] text-destructive">{error}</p>
      ) : hint ? (
        <p
          className={`mt-1.5 text-[12px] leading-relaxed text-[color:var(--text-tertiary)] transition-opacity duration-150 ${
            show ? "opacity-100" : "opacity-0"
          }`}
        >
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Progressive disclosure inside a wizard step. Everything a careful person can
 * skip lives here, so the primary flow stays four plain questions.
 */
export function AdvancedDetails({
  label = "Advanced details",
  summary,
  defaultOpen = false,
  children,
}: {
  label?: string;
  summary?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  return (
    <details className="card-base group mt-1 overflow-hidden" open={defaultOpen}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-[13px] font-medium text-foreground marker:hidden">
        <span>{label}</span>
        <span className="text-[11px] font-normal text-[color:var(--text-tertiary)]">
          {summary ?? "Optional"}
        </span>
      </summary>
      <div className="space-y-5 border-t border-border-subtle px-4 py-4">{children}</div>
    </details>
  );
}

/** Small badge marking a value that overrides the inherited scenario. */
export function OverrideBadge({ children = "Custom assumption" }: { children?: ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border border-border-subtle bg-surface-2 px-2 py-0.5 text-[10px] uppercase tracking-[0.1em] text-[color:var(--text-secondary)]">
      {children}
    </span>
  );
}


/** 48px-tall input styling used inside wizards. */
export const wizardInputClass =
  "input-recessed tabular h-12 w-full rounded-md px-3.5 text-[15px] text-foreground outline-none transition-colors placeholder:text-[color:var(--text-tertiary)] focus:border-teal/50 focus:ring-2 focus:ring-teal/25";

/** Long-text styling: same recessed surface, three lines tall. */
export const wizardTextareaClass =
  "input-recessed w-full rounded-md px-3.5 py-3 text-[15px] leading-relaxed text-foreground outline-none transition-colors placeholder:text-[color:var(--text-tertiary)] focus:border-teal/50 focus:ring-2 focus:ring-teal/25";

/** Shared long-text control. Used for every notes field in the app. */
export function NotesInput({
  value,
  onChange,
  placeholder = "Optional — anything useful",
  rows = 3,
  ariaLabel = "Notes",
}: {
  value: string | null | undefined;
  onChange: (value: string | null) => void;
  placeholder?: string;
  rows?: number;
  ariaLabel?: string;
}) {
  return (
    <textarea
      className={wizardTextareaClass}
      rows={rows}
      maxLength={1000}
      aria-label={ariaLabel}
      placeholder={placeholder}
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value || null)}
    />
  );
}

/**
 * The one money input for the whole app. Understands 1,00,000 / 1 lakh / 1.5L /
 * 10k / ₹2.25Cr, echoes the normalised rupee value, and explains bad entries.
 */
export function FinancialAmountInput({
  value,
  onChange,
  placeholder = "e.g. 1.5L or 1,50,000",
  className = wizardInputClass,
  allowNegative = false,
}: {
  value: number | null | undefined;
  onChange: (value: number | null) => void;
  placeholder?: string;
  className?: string;
  allowNegative?: boolean;
}) {
  const [raw, setRaw] = useState(() => formatAmountInput(value));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (document.activeElement?.getAttribute("data-financial-amount") !== "true") {
      setRaw(formatAmountInput(value));
    }
  }, [value]);

  const trimmed = raw.trim();
  const parsed = trimmed === "" ? null : parseAmountInput(trimmed, { allowNegative });
  const error = parsed && !parsed.ok ? parsed.error : null;
  const isUsd = parsed?.ok === true && parsed.currency === "USD";
  const fx = useUsdInr(isUsd);
  const converted = isUsd && fx?.rate ? Number((parsed.value * fx.rate).toFixed(2)) : null;
  const echo = parsed && parsed.ok && !isUsd ? describeAmount(parsed.value) : null;
  const showEcho = focused && echo && echo !== `₹${trimmed}`;

  const applyConversion = () => {
    if (converted === null) return;
    onChange(converted);
    setRaw(formatAmountInput(converted));
  };

  return (
    <div>
      <div className="relative">
        <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-[color:var(--text-tertiary)]">
          {isUsd ? "$" : "₹"}
        </span>
        <input
          data-financial-amount="true"
          className={`${className} pl-8 ${error ? "border-destructive/60" : ""}`}
          inputMode="decimal"
          value={raw}
          placeholder={placeholder}
          aria-invalid={error ? true : undefined}
          onFocus={() => setFocused(true)}
          onChange={(e) => {
            setRaw(e.target.value);
            const next = parseAmountInput(e.target.value, { allowNegative });
            if (next.ok && next.currency === "INR") onChange(next.value);
          }}
          onBlur={() => {
            setFocused(false);
            const next = parseAmountInput(raw, { allowNegative });
            if (raw.trim() === "") onChange(null);
            else if (next.ok && next.currency === "INR") {
              onChange(next.value);
              setRaw(formatAmountInput(next.value));
            }
          }}
        />
      </div>
      {error ? (
        <p className="mt-1.5 text-[12px] text-destructive">{error}</p>
      ) : isUsd ? (
        converted !== null ? (
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[12px]">
            <span className="tabular text-[color:var(--text-tertiary)]">
              {formatUsd(parsed.value)} ≈ ₹{formatAmountInput(converted)} at {fx?.rate?.toFixed(2)}
            </span>
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={applyConversion}
              className="rounded-full border border-teal/40 px-2 py-0.5 font-medium text-teal transition-colors hover:bg-teal/10"
            >
              Convert to ₹
            </button>
          </div>
        ) : (
          <p className="mt-1.5 text-[12px] text-[color:var(--text-tertiary)]">
            {fx ? "No live USD rate — refresh market data or enter rupees." : "Fetching USD rate…"}
          </p>
        )
      ) : showEcho ? (
        <p className="mt-1.5 text-[12px] tabular text-[color:var(--text-tertiary)]">{echo}</p>
      ) : null}
    </div>
  );
}



/**
 * The one percentage input for the whole app. Accepts 10, 10% or 7.5 pct,
 * refuses ambiguous bare decimals like 0.10, validates range and always
 * displays a % suffix.
 */
export function PercentInput({
  value,
  onChange,
  placeholder = "e.g. 12",
  className = wizardInputClass,
  min = 0,
  max = 100,
  hint,
  onCommit,
  disabled,
}: {
  value: number | null | undefined;
  onChange: (value: number | null) => void;
  placeholder?: string;
  className?: string;
  min?: number;
  max?: number;
  hint?: string;
  /** Fired on blur with the settled value — for fields that save immediately. */
  onCommit?: (value: number | null) => void;
  disabled?: boolean;
}) {
  const [raw, setRaw] = useState(() => formatPercentInput(value));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setRaw(formatPercentInput(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const trimmed = raw.trim();
  const parsed = trimmed === "" ? null : parsePercentInput(trimmed, { min, max });
  const error = parsed && !parsed.ok ? parsed.error : null;

  return (
    <div>
      <div className="relative">
        <input
          className={`${className} pr-9 ${error ? "border-destructive/60" : ""}`}
          inputMode="decimal"
          value={raw}
          placeholder={placeholder}
          aria-invalid={error ? true : undefined}
          disabled={disabled}
          onFocus={() => setFocused(true)}
          onChange={(e) => {
            setRaw(e.target.value);
            const next = parsePercentInput(e.target.value, { min, max });
            if (next.ok) onChange(next.value);
            else if (e.target.value.trim() === "") onChange(null);
          }}
          onBlur={() => {
            setFocused(false);
            if (raw.trim() === "") {
              onChange(null);
              onCommit?.(null);
              return;
            }
            const next = parsePercentInput(raw, { min, max });
            if (next.ok) {
              onChange(next.value);
              setRaw(formatPercentInput(next.value));
              onCommit?.(next.value);
            }
          }}
        />
        <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-sm text-[color:var(--text-tertiary)]">
          %
        </span>
      </div>
      {error ? (
        <p className="mt-1.5 text-[12px] text-destructive">{error}</p>
      ) : hint ? (
        <p className="mt-1.5 text-[12px] text-[color:var(--text-tertiary)]">{hint}</p>
      ) : null}
    </div>
  );
}

/** Parse an ISO yyyy-mm-dd string at local noon, avoiding timezone drift. */
function parseISODate(v: string | null | undefined): Date | undefined {
  if (!v) return undefined;
  const d = new Date(`${v}T12:00:00`);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

/**
 * The one calendar used everywhere: SIPs, goals, holdings, transactions,
 * research, snapshots and settings. Keyboard and mobile friendly, themed,
 * never a native browser date control.
 */
export function DatePickerInput({
  value,
  onChange,
  placeholder = "Choose a date",
  className = wizardInputClass,
  min,
  max,
  clearable = true,
  ariaLabel,
}: {
  value: string | null | undefined;
  onChange: (value: string | null) => void;
  placeholder?: string;
  className?: string;
  /** Earliest selectable date, ISO yyyy-mm-dd. */
  min?: string;
  /** Latest selectable date, ISO yyyy-mm-dd. */
  max?: string;
  clearable?: boolean;
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = parseISODate(value);
  const minDate = parseISODate(min);
  const maxDate = parseISODate(max);

  const disabled = [
    ...(minDate ? [{ before: minDate }] : []),
    ...(maxDate ? [{ after: maxDate }] : []),
  ];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <div className="relative">
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={ariaLabel ?? placeholder}
            className={`${className} flex items-center justify-between text-left ${
              value ? "text-foreground" : "text-[color:var(--text-tertiary)]"
            } ${clearable && value ? "pr-16" : ""}`}
          >
            <span>{selected ? format(selected, "d MMM yyyy") : placeholder}</span>
            <CalendarDays className="h-4 w-4 shrink-0 text-[color:var(--text-tertiary)]" strokeWidth={1.75} />
          </button>
        </PopoverTrigger>
        {clearable && value ? (
          <button
            type="button"
            aria-label="Clear date"
            onClick={() => onChange(null)}
            className="absolute right-9 top-1/2 -translate-y-1/2 rounded-md px-1.5 py-0.5 text-[11px] text-[color:var(--text-tertiary)] transition-colors hover:text-foreground"
          >
            Clear
          </button>
        ) : null}
      </div>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={selected}
          defaultMonth={selected ?? maxDate ?? minDate ?? new Date()}
          captionLayout="dropdown"
          startMonth={minDate ?? new Date(1990, 0, 1)}
          endMonth={maxDate ?? new Date(new Date().getFullYear() + 60, 11, 31)}
          disabled={disabled.length > 0 ? disabled : undefined}
          onSelect={(date) => {
            onChange(date ? format(date, "yyyy-MM-dd") : null);
            setOpen(false);
          }}
          autoFocus
          className="pointer-events-auto p-3"
        />
      </PopoverContent>
    </Popover>
  );
}

