import { integrationState, type IntegrationScope, type StripeStatus } from "@/mocks/integrations";
import { invoices, studio } from "@/mocks/data";
import { setupSession } from "@/mocks/setup";
import { PROTOTYPE_TODAY, melbourneIso } from "@/lib/calendar";
import { proFeaturesEnabled } from "./plans";
import { respond } from "./_delay";

export const getIntegrations = (scope: IntegrationScope = "demo") => respond(integrationState[scope]);
export const getStripeStatus = (scope: IntegrationScope = "demo"): Promise<StripeStatus> => respond(integrationState[scope].stripe.status);
export async function connectStripe(input: { stage?: "start" | "complete"; businessName?: string } = {}, scope: IntegrationScope = "demo") {
  const stripe = integrationState[scope].stripe;
  if (stripe.status === "connected") return respond(stripe);
  if (input.stage === "start") stripe.status = "setting_up";
  else {
    stripe.status = "connected";
    stripe.businessName = input.businessName?.trim() || (scope === "demo" ? studio.name : setupSession.studio.name) || "Your piano studio";
    stripe.bankLast4 = "1234";
  }
  return respond(stripe);
}
export async function disconnectStripe(scope: IntegrationScope = "demo") {
  integrationState[scope].stripe = { status: "not_connected", businessName: null, bankLast4: null };
  return respond(integrationState[scope].stripe);
}
export async function connectXero(scope: IntegrationScope = "demo") {
  if (!proFeaturesEnabled(scope)) throw new Error("Available on Pro. Pro is A$49 a month + GST.");
  const xero = integrationState[scope].xero;
  xero.status = "connected";
  xero.organisationName = (scope === "demo" ? studio.name : setupSession.studio.name) || "Your piano studio";
  return respond(xero);
}
export async function disconnectXero(scope: IntegrationScope = "demo") {
  integrationState[scope].xero = { status: "not_connected", organisationName: null, lastSyncedAt: null };
  return respond(integrationState[scope].xero);
}
export async function pushInvoiceToXero(invoiceId: string) {
  const xero = integrationState.demo.xero;
  if (!proFeaturesEnabled() || xero.status !== "connected") return respond({ synced: false });
  const invoice = invoices.find((entry) => entry.id === invoiceId);
  if (!invoice) throw new Error("Invoice not found");
  if (invoice.status === "draft" || invoice.status === "void") return respond({ synced: false });
  const timestamp = melbourneIso(PROTOTYPE_TODAY, "10:28");
  invoice.xeroSyncedAt ??= timestamp;
  xero.lastSyncedAt = timestamp;
  return respond({ synced: true, syncedAt: timestamp });
}