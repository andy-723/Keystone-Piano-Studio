import { integrationState, publicIntegrations, type IntegrationScope, type StripeStatus } from "@/mocks/integrations";
import { invoices, studio } from "@/mocks/data";
import { setupSession } from "@/mocks/setup";
import { PROTOTYPE_TODAY, melbourneIso } from "@/lib/calendar";
import { proFeaturesEnabled } from "./plans";
import { respond } from "./_delay";

/** Sample-mode integrations (browser/session fixtures). Live Stripe/Xero use server routes + createServerFn. */

export const getIntegrations = async (scope: IntegrationScope = "demo") =>
  respond({
    ...publicIntegrations(integrationState[scope]),
    providers: { stripe: "sample" as const, xero: "sample" as const },
  });

export const getStripeStatus = (scope: IntegrationScope = "demo"): Promise<StripeStatus> =>
  respond(integrationState[scope].stripe.status);

export async function connectStripe(
  input: { stage?: "start" | "complete"; businessName?: string } = {},
  scope: IntegrationScope = "demo",
) {
  const stripe = integrationState[scope].stripe;
  if (stripe.status === "connected") return respond(publicIntegrations(integrationState[scope]).stripe);
  if (input.stage === "start") stripe.status = "setting_up";
  else {
    stripe.status = "connected";
    stripe.businessName =
      input.businessName?.trim() || (scope === "demo" ? studio.name : setupSession.studio.name) || "Your piano studio";
    stripe.bankLast4 = "1234";
    stripe.accountId = null;
    stripe.accessToken = null;
    stripe.livemode = false;
  }
  return respond(publicIntegrations(integrationState[scope]).stripe);
}

export async function disconnectStripe(scope: IntegrationScope = "demo") {
  integrationState[scope].stripe = {
    status: "not_connected",
    businessName: null,
    bankLast4: null,
    accountId: null,
    accessToken: null,
    livemode: false,
  };
  return respond(publicIntegrations(integrationState[scope]).stripe);
}

export async function connectXero(scope: IntegrationScope = "demo") {
  if (!proFeaturesEnabled(scope)) throw new Error("Available on Pro. Pro is A$49 a month + GST.");
  const xero = integrationState[scope].xero;
  xero.status = "connected";
  xero.organisationName = (scope === "demo" ? studio.name : setupSession.studio.name) || "Your piano studio";
  xero.tenantId = null;
  xero.accessToken = null;
  xero.refreshToken = null;
  xero.expiresAt = null;
  return respond(publicIntegrations(integrationState[scope]).xero);
}

export async function disconnectXero(scope: IntegrationScope = "demo") {
  integrationState[scope].xero = {
    status: "not_connected",
    organisationName: null,
    lastSyncedAt: null,
    tenantId: null,
    accessToken: null,
    refreshToken: null,
    expiresAt: null,
  };
  return respond(publicIntegrations(integrationState[scope]).xero);
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
