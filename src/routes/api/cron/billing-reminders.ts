import { createFileRoute } from "@tanstack/react-router";
import { isCronAuthorized } from "@/server/cron-auth";
import { runBillingSchedule } from "@/services/billing-reminders";

export const Route = createFileRoute("/api/cron/billing-reminders")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isCronAuthorized(request)) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }
        const result = await runBillingSchedule("demo");
        return Response.json({ ok: true, ...result });
      },
    },
  },
});
