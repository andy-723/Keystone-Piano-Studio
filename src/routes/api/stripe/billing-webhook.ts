import { createFileRoute } from "@tanstack/react-router";
import { DEFAULT_BODY_LIMIT_BYTES } from "@/server/body-limit";
import { getServerEnv } from "@/server/env";
import { ProblemError } from "@/server/problem";
import { verifyStripeEvent } from "@/server/stripe";
import { handleStripeEvent } from "@/server/subscription";

/**
 * Keystone's own subscription billing webhook (Synoratech → studios).
 * Register in Stripe as a "Your account" endpoint, NOT a Connect endpoint.
 * See docs/security/subscription-access.md for the event list.
 */
export const Route = createFileRoute("/api/stripe/billing-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const env = getServerEnv();
        const length = Number(request.headers.get("content-length") ?? "0");
        if (length > DEFAULT_BODY_LIMIT_BYTES) {
          return Response.json({ error: "Payload too large" }, { status: 413 });
        }
        // Raw text, not parsed JSON: the signature is over the exact bytes.
        const payload = await request.text();
        if (payload.length > DEFAULT_BODY_LIMIT_BYTES) {
          return Response.json({ error: "Payload too large" }, { status: 413 });
        }
        try {
          const event = verifyStripeEvent(
            payload,
            request.headers.get("stripe-signature"),
            env.stripeBillingWebhookSecret,
          );
          const result = await handleStripeEvent(event);
          return Response.json({ received: true, ...result });
        } catch (error) {
          if (error instanceof ProblemError) return error.toResponse();
          // 500 makes Stripe retry later.
          return Response.json({ error: "Webhook handling failed" }, { status: 500 });
        }
      },
    },
  },
});
