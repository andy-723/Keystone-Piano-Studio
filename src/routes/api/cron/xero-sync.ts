import { createFileRoute } from "@tanstack/react-router";
import { isCronAuthorized } from "@/server/cron-auth";
import { runXeroSync } from "@/server/xero";

/**
 * Every 15 minutes: push sent invoices and recorded payments of connected Pro studios to Xero
 * (0022). Called by Supabase pg_cron + pg_net. See docs/security/xero.md.
 */
async function handle(request: Request) {
  if (!isCronAuthorized(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const result = await runXeroSync();
  return Response.json({ ok: true, ...result });
}

export const Route = createFileRoute("/api/cron/xero-sync")({
  server: {
    handlers: {
      GET: async ({ request }) => handle(request),
    },
  },
});
