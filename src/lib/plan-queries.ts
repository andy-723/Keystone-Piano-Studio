import { queryOptions } from "@tanstack/react-query";
import type { IntegrationScope } from "@/mocks/integrations";
import { getPlanBilling } from "@/services/plans";
export const planBillingQuery = (scope: IntegrationScope = "demo") => queryOptions({ queryKey: ["plan-billing", scope], queryFn: () => getPlanBilling(scope) });