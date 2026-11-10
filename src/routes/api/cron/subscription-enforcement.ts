import { createFileRoute } from "@tanstack/react-router";
import { getServerEnv } from "@/server/env";
import { runSubscriptionEnforcement } from "@/server/subscription";

/** Daily: suspend studios unpaid 14 days after the reminder (MSA 12.2) and email the owner. */
export const Route = createFileRoute("/api/cron/subscription-enforcement")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const env = getServerEnv();
        const auth = request.headers.get("authorization") ?? "";
        if (!env.cronSecret || auth !== `Bearer ${env.cronSecret}`) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }
        const result = await runSubscriptionEnforcement();
        return Response.json({ ok: true, ...result });
      },
    },
  },
});
