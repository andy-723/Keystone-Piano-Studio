import { createFileRoute } from "@tanstack/react-router";
import { DEFAULT_BODY_LIMIT_BYTES } from "@/server/body-limit";
import { getServerEnv } from "@/server/env";
import { ProblemError } from "@/server/problem";
import { verifyStripeEvent } from "@/server/stripe";
import { handleConnectEvent } from "@/server/stripe-connect";

/**
 * Stripe Connect webhook: events from studios' own Stripe accounts (family payments).
 * Register in Stripe as a "Connected accounts" endpoint, separate from the billing webhook.
 * Events: account.updated, account.application.deauthorized, checkout.session.completed,
 * checkout.session.async_payment_succeeded. See docs/security/stripe-connect.md.
 */
export const Route = createFileRoute("/api/stripe/connect-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const env = getServerEnv();
        const length = Number(request.headers.get("content-length") ?? "0");
        if (length > DEFAULT_BODY_LIMIT_BYTES) {
          return Response.json({ error: "Payload too large" }, { status: 413 });
        }
        const payload = await request.text();
        if (payload.length > DEFAULT_BODY_LIMIT_BYTES) {
          return Response.json({ error: "Payload too large" }, { status: 413 });
        }
        try {
          const event = verifyStripeEvent(
            payload,
            request.headers.get("stripe-signature"),
            env.stripeConnectWebhookSecret,
          );
          const result = await handleConnectEvent(event);
          return Response.json({ received: true, ...result });
        } catch (error) {
          if (error instanceof ProblemError) return error.toResponse();
          return Response.json({ error: "Webhook handling failed" }, { status: 500 });
        }
      },
    },
  },
});
