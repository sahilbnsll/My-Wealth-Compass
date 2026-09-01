import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import {
  getGateSession,
  isPasscodeConfigured,
  saveDbPasscode,
  verifyPasscode,
} from "./gate.server";

/**
 * Same-origin check for state-changing gate calls. Server functions are
 * same-origin RPCs, so a cross-site Origin means a forged request.
 */
function assertSameOrigin(): void {
  const origin = getRequestHeader("origin");
  if (!origin) return; // same-origin navigations may omit Origin entirely
  const host = getRequestHeader("host");
  if (!host) return;
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    throw new Error("Rejected: malformed origin.");
  }
  if (originHost !== host) throw new Error("Rejected: cross-origin request.");
}

export const unlockSite = createServerFn({ method: "POST" })
  .inputValidator((data: { passcode: string }) => ({ passcode: String(data?.passcode ?? "") }))
  .handler(async ({ data }) => {
    assertSameOrigin();
    const configured = await isPasscodeConfigured();
    if (!configured) {
      return { ok: false as const, reason: "unconfigured" as const, retryAfter: 0 };
    }

    const { clearFailures, recordFailure, retryAfterSeconds } = await import("./gate-throttle.server");

    const wait = await retryAfterSeconds();
    if (wait > 0) return { ok: false as const, reason: "throttled" as const, retryAfter: wait };

    const valid = await verifyPasscode(data.passcode);
    if (!valid) {
      const penalty = await recordFailure();
      return { ok: false as const, reason: "invalid" as const, retryAfter: penalty };
    }

    await clearFailures();
    const session = await getGateSession();
    await session.update({ unlocked: true });
    return { ok: true as const, reason: null, retryAfter: 0 };
  });

/** Save a new workspace passcode to the database and automatically unlock session. */
export const setupPasscode = createServerFn({ method: "POST" })
  .inputValidator((data: { passcode: string }) => ({ passcode: String(data?.passcode ?? "") }))
  .handler(async ({ data }) => {
    assertSameOrigin();
    const clean = data.passcode.trim();
    if (clean.length < 4) {
      throw new Error("Passcode must be at least 4 characters long.");
    }
    await saveDbPasscode(clean);
    const session = await getGateSession();
    await session.update({ unlocked: true });
    return { ok: true as const };
  });

export const lockSite = createServerFn({ method: "POST" }).handler(async () => {
  assertSameOrigin();
  const session = await getGateSession();
  await session.clear();
  return { ok: true as const };
});

export const gateStatus = createServerFn({ method: "GET" }).handler(async () => {
  const session = await getGateSession();
  const configured = await isPasscodeConfigured();
  return {
    unlocked: Boolean(session.data.unlocked),
    configured,
  };
});

/** Loader guard for pages that render no data of their own but must stay private. */
export const requireSession = createServerFn({ method: "GET" }).handler(async () => {
  const { requireUnlocked } = await import("./gate.server");
  await requireUnlocked();
  return { ok: true as const };
});
