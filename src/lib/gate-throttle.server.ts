/**
 * Brute-force throttle for the passcode gate.
 *
 * The worker runtime is stateless, so attempt state is persisted in
 * `app_settings` rather than memory. This is an ad-hoc limiter scoped to the
 * single-user gate — it is not a general-purpose rate limiter.
 */
const KEY = "gate_attempts";

/** Lockout ladder, in seconds, indexed by consecutive failures beyond the free allowance. */
const FREE_ATTEMPTS = 5;
const LADDER_SECONDS = [30, 60, 300, 900, 1800, 3600];

export type ThrottleState = { failures: number; lockedUntil: string | null };

type Stored = { failures?: number; locked_until?: string | null };

async function db() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

async function read(): Promise<ThrottleState> {
  const supabase = await db();
  const { data } = await supabase.from("app_settings").select("value").eq("key", KEY).maybeSingle();
  const v = (data?.value ?? {}) as Stored;
  return { failures: Number(v.failures ?? 0), lockedUntil: v.locked_until ?? null };
}

async function write(state: ThrottleState): Promise<void> {
  const supabase = await db();
  await supabase
    .from("app_settings")
    .upsert({ key: KEY, value: { failures: state.failures, locked_until: state.lockedUntil } }, { onConflict: "key" });
}

export function lockoutSeconds(failures: number): number {
  if (failures <= FREE_ATTEMPTS) return 0;
  const idx = Math.min(failures - FREE_ATTEMPTS - 1, LADDER_SECONDS.length - 1);
  return LADDER_SECONDS[idx] ?? 0;
}

/** Seconds the caller must wait, or 0 when an attempt is allowed. */
export async function retryAfterSeconds(now = new Date()): Promise<number> {
  try {
    const { lockedUntil } = await read();
    if (!lockedUntil) return 0;
    const remaining = Math.ceil((new Date(lockedUntil).getTime() - now.getTime()) / 1000);
    return remaining > 0 ? remaining : 0;
  } catch {
    // Never let a storage hiccup lock the owner out of their own terminal.
    return 0;
  }
}

export async function recordFailure(now = new Date()): Promise<number> {
  try {
    const state = await read();
    const failures = state.failures + 1;
    const wait = lockoutSeconds(failures);
    const lockedUntil = wait > 0 ? new Date(now.getTime() + wait * 1000).toISOString() : null;
    await write({ failures, lockedUntil });
    return wait;
  } catch {
    return 0;
  }
}

export async function clearFailures(): Promise<void> {
  try {
    await write({ failures: 0, lockedUntil: null });
  } catch {
    /* non-fatal */
  }
}
