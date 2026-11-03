import { studio } from "@/mocks/data";
import { newStudioSubscription, opusInvoices } from "@/mocks/plans";
import type { StudioPlan } from "@/mocks/types";
import type { IntegrationScope } from "@/mocks/integrations";
import { normalisePlan } from "@/lib/plans";
import { respond } from "./_delay";

export function readStudioPlan(scope: IntegrationScope = "demo") {
  return normalisePlan(scope === "demo" ? studio.plan : newStudioSubscription.plan);
}
export function proFeaturesEnabled(scope: IntegrationScope = "demo") { return readStudioPlan(scope) !== "base"; }
export async function getPlanBilling(scope: IntegrationScope = "demo") {
  const plan = readStudioPlan(scope);
  return respond({ plan, renewal: scope === "demo" ? "1 Dec 2026" : null, card: scope === "demo" ? "Visa ending 4242" : null, invoices: scope === "demo" ? opusInvoices : [] });
}
export async function setStudioPlan(plan: StudioPlan, scope: IntegrationScope = "demo") {
  if (!["base", "pro", "academy"].includes(plan)) throw new Error("Choose a valid plan.");
  if (scope === "demo") studio.plan = plan; else newStudioSubscription.plan = plan;
  return getPlanBilling(scope);
}