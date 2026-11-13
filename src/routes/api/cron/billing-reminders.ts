import { createFileRoute } from "@tanstack/react-router";
import { getServerEnv, isMockOnboarding } from "@/server/env";
import { runLiveBillingReminders } from "@/server/billing-reminders";
import { runBillingSchedule } from "@/services/billing-reminders";

/**
 * Daily: overdue / pre-due reminders for family invoices.
 * Live studios use the service-role job; demo fixtures still run the mock schedule.
 */
export const Route = createFileRoute("/api/cron/billing-reminders")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const env = getServerEnv();
        const auth = request.headers.get("authorization") ?? "";
        if (!env.cronSecret || auth !== `Bearer ${env.cronSecret}`) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }
        if (isMockOnboarding()) {
          const demo = await runBillingSchedule("demo");
          return Response.json({ ok: true, mode: "demo", ...demo });
        }
        const live = await runLiveBillingReminders();
        return Response.json({ ok: true, mode: "live", ...live });
      },
    },
  },
});
