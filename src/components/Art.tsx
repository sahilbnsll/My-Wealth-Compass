/**
 * Hand-drawn line illustrations for empty states. Deliberately not
 * icon-library glyphs — each one is specific to the section it sits in.
 */

const base = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.25,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export function SeedlingArt() {
  return (
    <svg viewBox="0 0 96 72" className="h-16 w-24" aria-hidden>
      <g {...base}>
        <path d="M20 62h56" />
        <path d="M48 62V34" />
        <path d="M48 42c-9 0-15-5-16-14 9-1 15 4 16 14Z" opacity="0.8" />
        <path d="M48 38c8-2 13-8 12-17-9 1-13 7-12 17Z" opacity="0.55" />
        <path d="M34 62c2-6 7-9 14-9s12 3 14 9" opacity="0.4" />
      </g>
    </svg>
  );
}

export function UnlitTargetArt() {
  return (
    <svg viewBox="0 0 96 72" className="h-16 w-24" aria-hidden>
      <g {...base}>
        <circle cx="48" cy="36" r="22" />
        <circle cx="48" cy="36" r="13" opacity="0.6" />
        <circle cx="48" cy="36" r="4" opacity="0.35" />
        <path d="M70 14 58 26" opacity="0.5" />
        <path d="M64 14h6v6" opacity="0.5" />
      </g>
    </svg>
  );
}

export function EmptyLedgerArt() {
  return (
    <svg viewBox="0 0 96 72" className="h-16 w-24" aria-hidden>
      <g {...base}>
        <rect x="22" y="14" width="52" height="44" rx="4" />
        <path d="M22 26h52" />
        <path d="M32 36h18M32 44h26" opacity="0.5" />
        <path d="M58 36h6" opacity="0.3" />
      </g>
    </svg>
  );
}

export function FlatlineArt() {
  return (
    <svg viewBox="0 0 96 72" className="h-16 w-24" aria-hidden>
      <g {...base}>
        <path d="M16 56h64" opacity="0.4" />
        <path d="M16 40h20l6-8 6 16 6-10h30" />
        <circle cx="16" cy="18" r="1.5" opacity="0.4" />
      </g>
    </svg>
  );
}
