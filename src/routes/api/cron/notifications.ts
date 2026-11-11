import { createFileRoute } from "@tanstack/react-router";
import { getServerEnv } from "@/server/env";
import { runNotifications } from "@/server/notifications";

/**
 * Every 15 minutes: unread chat, important news and the 7am daily summary by email (0018).
 * Called by Supabase pg_cron + pg_net (Vercel's free plan only runs crons once a day).
 * See docs/security/notifications.md.
 */
async function handle(request: Request) {
  const env = getServerEnv();
  const auth = request.headers.get("authorization") ?? "";
  if (!env.cronSecret || auth !== `Bearer ${env.cronSecret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const result = await runNotifications();
  return Response.json({ ok: true, ...result });
}

export const Route = createFileRoute("/api/cron/notifications")({
  server: {
    handlers: {
      GET: async ({ request }) => handle(request),
    },
  },
});
