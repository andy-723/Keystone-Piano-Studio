import { createFileRoute } from "@tanstack/react-router";
import { xeroCallbackUrl, xeroConfigured } from "@/integrations/config";
import {
  liveIntegrationsCookieHeader,
  mergeLiveIntegrations,
  readLiveIntegrations,
} from "@/integrations/connection-cookie";
import { decodeOAuthState } from "@/integrations/oauth-state";
import { exchangeXeroCode, listXeroTenants } from "@/integrations/xero";

export const Route = createFileRoute("/api/integrations/xero/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const settings = new URL("/settings", request.url);
        if (!xeroConfigured()) {
          settings.searchParams.set("integrations", "xero-missing");
          return Response.redirect(settings, 302);
        }
        const error = url.searchParams.get("error");
        if (error) {
          settings.searchParams.set("integrations", "xero-denied");
          return Response.redirect(settings, 302);
        }
        try {
          const state = decodeOAuthState(url.searchParams.get("state"), "xero");
          const code = url.searchParams.get("code");
          if (!code) throw new Error("Missing Xero authorization code.");
          const tokens = await exchangeXeroCode(code, xeroCallbackUrl(request));
          const tenants = await listXeroTenants(tokens.accessToken);
          const tenant = tenants[0];
          if (!tenant) throw new Error("No Xero organisation was authorised.");
          const next = mergeLiveIntegrations(readLiveIntegrations(request), {
            xero: {
              scope: state.scope,
              tenantId: tenant.tenantId,
              organisationName: tenant.tenantName,
              accessToken: tokens.accessToken,
              refreshToken: tokens.refreshToken,
              expiresAt: tokens.expiresAt,
              lastSyncedAt: null,
            },
          });
          settings.searchParams.set("integrations", "xero-connected");
          return new Response(null, {
            status: 302,
            headers: {
              Location: settings.toString(),
              "Set-Cookie": liveIntegrationsCookieHeader(next, request),
            },
          });
        } catch (cause) {
          console.error(cause);
          settings.searchParams.set("integrations", "xero-failed");
          return Response.redirect(settings, 302);
        }
      },
    },
  },
});
