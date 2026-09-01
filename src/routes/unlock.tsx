import { createFileRoute, redirect } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Eye, EyeOff, KeyRound, Sparkles } from "lucide-react";
import { gateStatus, setupPasscode, unlockSite } from "@/lib/gate.functions";

export const Route = createFileRoute("/unlock")({
  loader: async () => {
    const status = await gateStatus();
    if (status.unlocked) {
      throw redirect({ to: "/" });
    }
    return status;
  },
  head: () => ({
    meta: [
      { title: "Sahil's Finance Intelligence — Unlock" },
      { name: "description", content: "Enter your passcode to continue." },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Sahil's Finance Intelligence — Unlock" },
      { property: "og:description", content: "Private investment intelligence workspace." },
    ],
  }),
  component: UnlockPage,
});

const ADJECTIVES = ["amber", "quiet", "steady", "swift", "silver", "golden", "granite", "stellar"];
const NOUNS = ["compass", "shield", "beacon", "harbor", "horizon", "vault", "anchor", "summit"];

function generatePasscode(): string {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  const num = Math.floor(1000 + Math.random() * 9000);
  return `${adj}-${noun}-${num}`;
}

function UnlockPage() {
  const initialStatus = Route.useLoaderData();
  const [configured, setConfigured] = useState(initialStatus.configured);
  const unlock = useServerFn(unlockSite);
  const savePasscode = useServerFn(setupPasscode);

  const [passcode, setPasscode] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setReady(true);
    if (window.location.search) {
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, []);

  function onGenerateClick() {
    const generated = generatePasscode();
    setPasscode(generated);
    setShowPassword(true);
    setError(null);
    try {
      void navigator.clipboard.writeText(generated);
      toast.success("Generated & copied passcode to clipboard!");
    } catch {
      toast.success("Generated new passcode.");
    }
  }

  async function handleUnlock(e: React.FormEvent) {
    e.preventDefault();
    if (!passcode.trim()) {
      setError("Please enter your passcode.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await unlock({ data: { passcode: passcode.trim() } });
      if (res.ok) {
        window.location.assign("/");
        return;
      }
      const wait = res.retryAfter;
      setError(
        res.reason === "unconfigured"
          ? "No passcode is stored in the database yet. Set one up below."
          : res.reason === "throttled"
            ? `Too many attempts. Try again in ${wait > 60 ? `${Math.ceil(wait / 60)} minutes` : `${wait} seconds`}.`
            : wait > 0
              ? `Incorrect passcode. Locked for ${wait > 60 ? `${Math.ceil(wait / 60)} minutes` : `${wait} seconds`}.`
              : "Incorrect passcode.",
      );
      if (res.reason === "unconfigured") {
        setConfigured(false);
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function handleSetup(e: React.FormEvent) {
    e.preventDefault();
    if (passcode.trim().length < 4) {
      setError("Passcode must be at least 4 characters.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await savePasscode({ data: { passcode: passcode.trim() } });
      toast.success("Passcode saved to database!");
      window.location.assign("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save passcode.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="card-base w-full max-w-sm p-6 sm:p-8">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-primary/40 font-display text-sm font-semibold text-primary">
            S
          </span>
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-[color:var(--text-tertiary)]">
              Personal finance
            </p>
            <h1 className="font-display text-lg font-semibold tracking-tight text-foreground">
              Sahil&rsquo;s Finance Intelligence
            </h1>
          </div>
        </div>

        {!configured ? (
          <div className="mt-6">
            <h2 className="text-sm font-semibold text-foreground">Set up workspace passcode</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Choose or generate a passcode to protect your workspace. It will be securely hashed and stored in your database.
            </p>

            <form onSubmit={handleSetup} className="mt-5 space-y-4">
              <div className="space-y-1.5">
                <div className="relative">
                  <input
                    value={passcode}
                    onChange={(e) => {
                      setPasscode(e.target.value);
                      setError(null);
                    }}
                    type={showPassword ? "text" : "password"}
                    autoFocus
                    placeholder="Enter or generate passcode"
                    className="w-full rounded-md border border-input bg-surface-2 px-3 py-2 pr-10 text-sm font-mono text-foreground outline-none focus:ring-2 focus:ring-ring"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    title={showPassword ? "Hide" : "Show"}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <button
                type="button"
                onClick={onGenerateClick}
                className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-border-subtle bg-surface-2 px-3 py-2 text-xs font-medium text-foreground hover:bg-surface-3 transition-colors"
              >
                <Sparkles className="h-3.5 w-3.5 text-primary" />
                Generate strong passcode
              </button>

              {error ? <p className="text-xs text-destructive">{error}</p> : null}

              <button
                type="submit"
                disabled={busy || !ready || passcode.trim().length < 4}
                className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
              >
                {busy ? "Saving to database…" : "Save passcode & enter"}
              </button>
            </form>
          </div>
        ) : (
          <div className="mt-6">
            <p className="text-xs text-muted-foreground">
              This workspace holds private financial data. Enter your passcode to continue.
            </p>

            <form onSubmit={handleUnlock} className="mt-5 space-y-4">
              <div className="relative">
                <input
                  value={passcode}
                  onChange={(e) => {
                    setPasscode(e.target.value);
                    setError(null);
                  }}
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  autoFocus
                  placeholder="Enter passcode"
                  className="w-full rounded-md border border-input bg-surface-2 px-3 py-2 pr-10 text-sm font-mono text-foreground outline-none focus:ring-2 focus:ring-ring"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  title={showPassword ? "Hide" : "Show"}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>

              {error ? <p className="text-xs text-destructive">{error}</p> : null}

              <button
                type="submit"
                disabled={busy || !ready || !passcode.trim()}
                className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
              >
                {busy ? "Checking…" : "Unlock workspace"}
              </button>
            </form>

            <div className="mt-4 text-center">
              <button
                type="button"
                onClick={() => {
                  setConfigured(false);
                  setPasscode("");
                  setError(null);
                }}
                className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors"
              >
                <KeyRound className="h-3 w-3" />
                Reset or set new passcode
              </button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
