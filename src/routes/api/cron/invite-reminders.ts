import { createFileRoute } from "@tanstack/react-router";
import { isCronAuthorized } from "@/server/cron-auth";
import { runInviteReminders } from "@/services/invitations";

export const Route = createFileRoute("/api/cron/invite-reminders")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isCronAuthorized(request)) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }
        const result = await runInviteReminders();
        return Response.json({ ok: true, ...result });
      },
    },
  },
});
