import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";
import { runMacroRefresh } from "@/lib/data.functions";

/**
 * Scheduled maintenance endpoint.
 *
 * The daily snapshot itself is captured inside the database by the
 * `daily-portfolio-snapshot` pg_cron job, so history keeps growing even if
 * nothing calls this route. Hitting this endpoint additionally refreshes the
 * macro feeds and records when the job last ran.
 *
 * Callers must present the cron bearer secret.
 */
async function handle(request: Request): Promise<Response> {
  const denied = await authenticateCronRequest(request);
  if (denied) return denied;

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const started = new Date().toISOString();
  const result: Record<string, unknown> = { startedAt: started };

  try {
    const { data, error } = await supabaseAdmin.rpc("capture_portfolio_snapshot");
    if (error) throw new Error(error.message);
    result["snapshot"] = data;
  } catch (e) {
    result["snapshotError"] = e instanceof Error ? e.message : String(e);
  }

  try {
    result["macro"] = await runMacroRefresh();
  } catch (e) {
    result["macroError"] = e instanceof Error ? e.message : String(e);
  }

  const ok = !result["snapshotError"];
  await supabaseAdmin.from("app_settings").upsert(
    {
      key: "snapshot_schedule",
      value: {
        schedule: "30 18 * * *",
        active: true,
        lastRunAt: new Date().toISOString(),
        lastStatus: ok ? "success" : String(result["snapshotError"]),
      },
    },
    { onConflict: "key" },
  );

  return new Response(JSON.stringify(result), {
    status: ok ? 200 : 500,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

export const Route = createFileRoute("/api/public/cron/snapshot")({
  server: {
    handlers: {
      GET: ({ request }) => handle(request),
      POST: ({ request }) => handle(request),
    },
  },
});
