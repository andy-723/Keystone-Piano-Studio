import { createFileRoute } from "@tanstack/react-router";
import { parseScope, stripeCallbackUrl, stripeConfigured } from "@/integrations/config";
import { encodeOAuthState } from "@/integrations/oauth-state";
import { stripeAuthorizeUrl } from "@/integrations/stripe";

export const Route = createFileRoute("/api/integrations/stripe/start")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!stripeConfigured()) {
          return Response.redirect(new URL("/settings?integrations=stripe-sample", request.url), 302);
        }
        const url = new URL(request.url);
        const scope = parseScope(url.searchParams.get("scope"));
        const state = encodeOAuthState({ kind: "stripe", scope });
        const authorize = stripeAuthorizeUrl({
          redirectUri: stripeCallbackUrl(request),
          state,
        });
        return Response.redirect(authorize, 302);
      },
    },
  },
});
