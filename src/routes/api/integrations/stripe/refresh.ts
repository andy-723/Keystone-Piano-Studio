import { createFileRoute } from "@tanstack/react-router";
import { parseScope, stripeConfigured } from "@/integrations/config";

export const Route = createFileRoute("/api/integrations/stripe/refresh")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const scope = parseScope(url.searchParams.get("scope"));
        if (!stripeConfigured()) {
          return Response.redirect(new URL("/settings?integrations=stripe-sample", request.url), 302);
        }
        return Response.redirect(new URL(`/api/integrations/stripe/start?scope=${scope}`, request.url), 302);
      },
    },
  },
});
