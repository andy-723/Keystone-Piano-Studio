import { studio } from "@/mocks/data";
import { newStudioSubscription, opusInvoices } from "@/mocks/plans";
import type { StudioPlan } from "@/mocks/types";
import type { IntegrationScope } from "@/mocks/integrations";
import { normalisePlan } from "@/lib/plans";
import { respond } from "./_delay";
import { isLiveStudio } from "@/lib/studio-workspace";

export function readStudioPlan(scope: IntegrationScope = "demo") {
  return normalisePlan(scope === "demo" ? studio.plan : newStudioSubscription.plan);
}
export function proFeaturesEnabled(scope: IntegrationScope = "demo") { return readStudioPlan(scope) !== "base"; }

export type PlanFeature = "billing_automation";

/** Feature gates beyond the coarse Base/Pro split. */
export function hasFeature(feature: PlanFeature, scope: IntegrationScope = "demo"): boolean {
  if (feature === "billing_automation") return proFeaturesEnabled(scope);
  return false;
}
export async function getPlanBilling(scope: IntegrationScope = "demo") {
  const plan = readStudioPlan(scope);
  // A real studio's plan comes from its Keystone subscription; no sample card or invoices.
  const sample = scope === "demo" && !isLiveStudio();
  return respond({ plan, renewal: sample ? "1 Dec 2026" : null, card: sample ? "Visa ending 4242" : null, invoices: sample ? opusInvoices : [] });
}
export async function setStudioPlan(plan: StudioPlan, scope: IntegrationScope = "demo") {
  if (!["base", "pro", "academy"].includes(plan)) throw new Error("Choose a valid plan.");
  if (scope === "demo" && isLiveStudio()) throw new Error("Your plan is set by your Keystone subscription. Contact Keystone support to change it.");
  if (scope === "demo") studio.plan = plan; else newStudioSubscription.plan = plan;
  return getPlanBilling(scope);
}