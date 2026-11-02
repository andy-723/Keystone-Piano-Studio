import { queryOptions } from "@tanstack/react-query";
import { getIntegrations, getStripeStatus } from "@/services/integrations";
import type { IntegrationScope } from "@/mocks/integrations";
export const integrationsQuery = (scope: IntegrationScope = "demo") => queryOptions({ queryKey: ["integrations", scope], queryFn: () => getIntegrations(scope) });
export const stripeStatusQuery = queryOptions({ queryKey: ["integrations", "demo", "stripe-status"], queryFn: () => getStripeStatus() });