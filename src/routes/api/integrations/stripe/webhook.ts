import { createFileRoute } from "@tanstack/react-router";
import Stripe from "stripe";
import { stripeConfigured, stripeSecretKey, stripeWebhookSecret } from "@/integrations/config";
import { recordInvoicePayment } from "@/services/billing";

export const Route = createFileRoute("/api/integrations/stripe/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!stripeConfigured()) return new Response("Stripe is not configured", { status: 503 });
        const secret = stripeWebhookSecret();
        if (!secret) return new Response("STRIPE_WEBHOOK_SECRET is not configured", { status: 503 });
        const stripe = new Stripe(stripeSecretKey(), { apiVersion: "2026-10-28.endive" });
        const signature = request.headers.get("stripe-signature");
        if (!signature) return new Response("Missing Stripe-Signature", { status: 400 });
        const payload = await request.text();
        let event: Stripe.Event;
        try {
          event = stripe.webhooks.constructEvent(payload, signature, secret);
        } catch (cause) {
          console.error(cause);
          return new Response("Invalid signature", { status: 400 });
        }
        if (event.type === "checkout.session.completed") {
          const session = event.data.object as Stripe.Checkout.Session;
          const invoiceId = session.metadata?.["invoiceId"];
          if (invoiceId && session.payment_status === "paid") {
            try {
              await recordInvoicePayment(invoiceId, "card");
            } catch (cause) {
              console.error(cause);
            }
          }
        }
        return Response.json({ received: true });
      },
    },
  },
});
