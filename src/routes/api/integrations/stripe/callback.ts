import { createFileRoute } from "@tanstack/react-router";
import { stripeConfigured } from "@/integrations/config";
import {
  liveIntegrationsCookieHeader,
  mergeLiveIntegrations,
  readLiveIntegrations,
} from "@/integrations/connection-cookie";
import { decodeOAuthState } from "@/integrations/oauth-state";
import { exchangeStripeOAuthCode, fetchStripeAccountSummary } from "@/integrations/stripe";

export const Route = createFileRoute("/api/integrations/stripe/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const settings = new URL("/settings", request.url);
        if (!stripeConfigured()) {
          settings.searchParams.set("integrations", "stripe-missing");
          return Response.redirect(settings, 302);
        }
        const error = url.searchParams.get("error");
        if (error) {
          settings.searchParams.set("integrations", "stripe-denied");
          return Response.redirect(settings, 302);
        }
        try {
          const state = decodeOAuthState(url.searchParams.get("state"), "stripe");
          const code = url.searchParams.get("code");
          if (!code) throw new Error("Missing Stripe authorization code.");
          const token = await exchangeStripeOAuthCode(code);
          const summary = await fetchStripeAccountSummary(token.accountId);
          const next = mergeLiveIntegrations(readLiveIntegrations(request), {
            stripe: {
              scope: state.scope,
              accountId: token.accountId,
              businessName: summary.businessName,
              bankLast4: summary.bankLast4,
              livemode: token.livemode,
            },
          });
          settings.searchParams.set("integrations", "stripe-connected");
          return new Response(null, {
            status: 302,
            headers: {
              Location: settings.toString(),
              "Set-Cookie": liveIntegrationsCookieHeader(next, request),
            },
          });
        } catch (cause) {
          console.error(cause);
          settings.searchParams.set("integrations", "stripe-failed");
          return Response.redirect(settings, 302);
        }
      },
    },
  },
});
