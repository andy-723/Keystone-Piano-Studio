import { createFileRoute } from "@tanstack/react-router";
import { parseScope, xeroCallbackUrl, xeroConfigured } from "@/integrations/config";
import { encodeOAuthState } from "@/integrations/oauth-state";
import { xeroAuthorizeUrl } from "@/integrations/xero";

export const Route = createFileRoute("/api/integrations/xero/start")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!xeroConfigured()) {
          return Response.redirect(new URL("/settings?integrations=xero-sample", request.url), 302);
        }
        const url = new URL(request.url);
        const scope = parseScope(url.searchParams.get("scope"));
        const state = encodeOAuthState({ kind: "xero", scope });
        const authorize = xeroAuthorizeUrl({
          redirectUri: xeroCallbackUrl(request),
          state,
        });
        return Response.redirect(authorize, 302);
      },
    },
  },
});
