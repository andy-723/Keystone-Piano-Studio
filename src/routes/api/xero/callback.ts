import { createFileRoute } from "@tanstack/react-router";
import { getServerEnv } from "@/server/env";
import { finishXeroConnect } from "@/server/xero";

/**
 * Xero sends the studio owner back here after they allow Keystone (OAuth 2.0 code flow).
 * The signed state says which studio and owner started it (checked for owner + MFA + Pro then).
 * Register this exact URL as the redirect URI in the Xero developer portal.
 */
export const Route = createFileRoute("/api/xero/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const appUrl = getServerEnv().appUrl;
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        if (!code || !state) {
          // Cancelled in Xero, or Xero returned an error.
          return Response.redirect(`${appUrl}/settings?xero=cancelled`, 302);
        }
        try {
          return Response.redirect(await finishXeroConnect(code, state), 302);
        } catch {
          return Response.redirect(`${appUrl}/settings?xero=failed`, 302);
        }
      },
    },
  },
});
