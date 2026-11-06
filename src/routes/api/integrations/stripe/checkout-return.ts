import { createFileRoute } from "@tanstack/react-router";
import { completeCheckoutReturn } from "@/integrations/live";

export const Route = createFileRoute("/api/integrations/stripe/checkout-return")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        try {
          const sessionId = url.searchParams.get("session_id");
          if (!sessionId) throw new Error("Missing Checkout session id.");
          const invoiceId = await completeCheckoutReturn(request, sessionId);
          return Response.redirect(new URL(`/invoices/${invoiceId}?paid=1`, request.url), 302);
        } catch (cause) {
          console.error(cause);
          return Response.redirect(new URL("/?payment=failed", request.url), 302);
        }
      },
    },
  },
});
