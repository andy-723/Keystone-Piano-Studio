import { createFileRoute } from "@tanstack/react-router";
import { getServerEnv } from "@/server/env";
import { runInviteReminders } from "@/services/invitations";

export const Route = createFileRoute("/api/cron/invite-reminders")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const env = getServerEnv();
        const auth = request.headers.get("authorization") ?? "";
        if (!env.cronSecret || auth !== `Bearer ${env.cronSecret}`) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }
        const result = await runInviteReminders();
        return Response.json({ ok: true, ...result });
      },
    },
  },
});
