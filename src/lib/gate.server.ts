import { useSession } from "@tanstack/react-start/server";
import { redirect } from "@tanstack/react-router";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export type GateSession = { unlocked?: boolean };

const SETTINGS_KEY = "site_passcode";

export type StoredPasscode = {
  hash: string;
  salt: string;
  updated_at: string;
};

async function db() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

function sessionConfig() {
  const password =
    process.env["SESSION_SECRET"] ||
    "sahil-finance-intelligence-session-secret-at-least-32-characters";
  return {
    password,
    name: "iii-gate",
    maxAge: 60 * 60 * 24 * 14,
    cookie: {
      httpOnly: true,
      secure: true,
      sameSite: "none" as const,
      partitioned: true,
      path: "/",
    },
  };
}

export async function getGateSession() {
  return useSession<GateSession>(sessionConfig());
}

/** Hash passcode with salt using SHA-256. */
export function hashPasscode(passcode: string, salt: string): string {
  return createHash("sha256").update(`${salt}:${passcode}:sahil-gate`).digest("hex");
}

/** Retrieve the stored hashed passcode from the database (app_settings table). */
export async function getDbPasscode(): Promise<StoredPasscode | null> {
  try {
    const supabase = await db();
    const { data, error } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", SETTINGS_KEY)
      .maybeSingle();

    if (error || !data?.value) return null;
    const val = data.value as unknown as StoredPasscode;
    if (val && typeof val.hash === "string" && typeof val.salt === "string") {
      return val;
    }
    return null;
  } catch (err) {
    console.error("Failed to read passcode from database:", err);
    return null;
  }
}

/** Save or update a new passcode securely into the database. */
export async function saveDbPasscode(passcode: string): Promise<void> {
  const clean = passcode.trim();
  if (clean.length < 4) {
    throw new Error("Passcode must be at least 4 characters.");
  }
  const salt = randomBytes(16).toString("hex");
  const hash = hashPasscode(clean, salt);
  const payload: StoredPasscode = {
    hash,
    salt,
    updated_at: new Date().toISOString(),
  };

  const supabase = await db();
  const { error } = await supabase
    .from("app_settings")
    .upsert({ key: SETTINGS_KEY, value: payload as any });

  if (error) throw new Error(error.message);
}

/** Check if either a database passcode or environment passcode is configured. */
export async function isPasscodeConfigured(): Promise<boolean> {
  const dbPasscode = await getDbPasscode();
  if (dbPasscode) return true;
  return Boolean(process.env["SITE_PASSCODE"]);
}

/** Constant-time string hash comparison. */
export function passwordMatches(input: string, expected: string): boolean {
  const a = createHash("sha256").update(input, "utf8").digest();
  const b = createHash("sha256").update(expected, "utf8").digest();
  return timingSafeEqual(a, b);
}

/** Verify user input against DB passcode or environment fallback. */
export async function verifyPasscode(input: string): Promise<boolean> {
  if (!input) return false;
  const dbPasscode = await getDbPasscode();
  if (dbPasscode) {
    const computed = hashPasscode(input.trim(), dbPasscode.salt);
    const a = Buffer.from(computed, "hex");
    const b = Buffer.from(dbPasscode.hash, "hex");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  }

  const expected = process.env["SITE_PASSCODE"];
  if (expected) {
    return passwordMatches(input.trim(), expected);
  }

  return false;
}

/** Throws a redirect to /unlock before any protected work runs. */
export async function requireUnlocked() {
  const session = await getGateSession();
  if (!session.data.unlocked) {
    throw redirect({ to: "/unlock" });
  }
  return session;
}
