import { queryOptions } from "@tanstack/react-query";
import { getIntegrations, getStripeStatus } from "@/services/integrations";
import type { IntegrationScope } from "@/mocks/integrations";
import { getLiveIntegrationsFn } from "@/integrations/live";

export const integrationsQuery = (scope: IntegrationScope = "demo") =>
  queryOptions({
    queryKey: ["integrations", scope],
    queryFn: async () => {
      const sample = await getIntegrations(scope);
      try {
        const live = await getLiveIntegrationsFn({ data: { scope } });
        return {
          stripe: live.providers.stripe === "live" ? live.stripe : sample.stripe,
          xero: live.providers.xero === "live" ? live.xero : sample.xero,
          providers: live.providers,
          liveConfigured: live.liveConfigured,
        };
      } catch {
        return { ...sample, liveConfigured: false };
      }
    },
  });

export const stripeStatusQuery = queryOptions({
  queryKey: ["integrations", "demo", "stripe-status"],
  queryFn: async () => {
    try {
      const live = await getLiveIntegrationsFn({ data: { scope: "demo" } });
      if (live.providers.stripe === "live") return live.stripe.status;
    } catch {
      /* sample fallback */
    }
    return getStripeStatus();
  },
});
