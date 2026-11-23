import {
  integrationState,
  type IntegrationScope,
  type IntegrationState,
  type StripeStatus,
} from "@/mocks/integrations";
import { invoices, studio } from "@/mocks/data";
import { setupSession } from "@/mocks/setup";
import { PROTOTYPE_TODAY, melbourneIso } from "@/lib/calendar";
import { proFeaturesEnabled } from "./plans";
import { respond } from "./_delay";
import { isLiveStudio, liveStudioId } from "@/lib/studio-workspace";

/**
 * Real studios (not the demo) use Stripe Connect through the server (src/server/stripe-connect.ts):
 * linking opens Stripe-hosted onboarding, and status comes from the studio's own Stripe account.
 * The demo studio and tests keep the simulated flow below. Xero is not connected for real studios
 * yet, so its button says so instead of pretending.
 */
const isLive = (scope: IntegrationScope) => scope === "demo" && isLiveStudio();

async function liveRequest() {
  const studioId = liveStudioId();
  if (!studioId) throw new Error("Studio not loaded. Reload and try again.");
  const { getAuthClient } = await import("@/lib/auth-client");
  const session = (await getAuthClient()?.auth.getSession())?.data.session;
  if (!session?.access_token) throw new Error("Sign in again to manage payments.");
  return { accessToken: session.access_token, studioId };
}

async function liveIntegrations() {
  const { getStripeConnectStatusFn } = await import("@/server/stripe-connect");
  const request = await liveRequest();
  const status = await getStripeConnectStatusFn({ data: request });
  return {
    stripe: {
      status: status.status,
      businessName: status.businessName,
      bankLast4: null,
      live: true,
      configured: status.configured,
    },
    xero: await liveXero(request),
  };
}

type LiveXero = IntegrationState["xero"];
async function liveXero(request: { accessToken: string; studioId: string }): Promise<LiveXero> {
  try {
    const { getXeroStatusFn } = await import("@/server/xero");
    const x = await getXeroStatusFn({ data: request });
    return {
      status: x.status === "connected" ? "connected" : "not_connected",
      organisationName: x.organisationName,
      lastSyncedAt: x.lastSyncedAt,
      live: {
        configured: x.configured,
        needsReconnect: x.status === "needs_reconnect",
        canConnect: x.canConnect,
        lastError: x.lastError,
        salesAccountCode: x.settings.salesAccountCode,
        paymentAccountCode: x.settings.paymentAccountCode,
        ...(x.accounts ? { accounts: x.accounts } : {}),
      },
    };
  } catch {
    // Teachers can't see Xero settings; show it as not connected rather than failing the page.
    return { status: "not_connected", organisationName: null, lastSyncedAt: null };
  }
}

/** Real studios: just the Xero connection (Pro CFO health and queue). */
export async function getLiveXeroStatus(): Promise<LiveXero> {
  return liveXero(await liveRequest());
}

/** Real studios: Xero's sign-in page for the studio owner (Pro). */
export async function startLiveXeroConnect(): Promise<string> {
  const { startXeroConnectFn } = await import("@/server/xero");
  const { url } = await startXeroConnectFn({ data: await liveRequest() });
  return url;
}

export async function saveLiveXeroAccounts(input: {
  salesAccountCode?: string;
  paymentAccountCode?: string;
}) {
  const { saveXeroSettingsFn } = await import("@/server/xero");
  await saveXeroSettingsFn({ data: { ...(await liveRequest()), ...input } });
}

export async function syncLiveXeroNow() {
  const { syncXeroNowFn } = await import("@/server/xero");
  return syncXeroNowFn({ data: await liveRequest() });
}

/** Real studios: Stripe-hosted onboarding URL for the studio's own account. */
export async function startLiveStripeOnboarding(): Promise<string> {
  const { startStripeOnboardingFn } = await import("@/server/stripe-connect");
  const { url } = await startStripeOnboardingFn({ data: await liveRequest() });
  return url;
}

export const getIntegrations = (scope: IntegrationScope = "demo") =>
  isLive(scope) ? liveIntegrations() : respond(integrationState[scope]);
export async function getStripeStatus(scope: IntegrationScope = "demo"): Promise<StripeStatus> {
  if (isLive(scope)) {
    // Any failure shows bank details instead of a pay button: never a broken payment.
    try {
      const { getFamilyOnlinePaymentsFn } = await import("@/server/stripe-connect");
      const { online } = await getFamilyOnlinePaymentsFn({ data: await liveRequest() });
      return online ? "connected" : "not_connected";
    } catch {
      return "not_connected";
    }
  }
  return respond(integrationState[scope].stripe.status);
}
export async function connectStripe(
  input: { stage?: "start" | "complete"; businessName?: string } = {},
  scope: IntegrationScope = "demo",
) {
  if (isLive(scope)) throw new Error("Use startLiveStripeOnboarding for real studios.");
  const stripe = integrationState[scope].stripe;
  if (stripe.status === "connected") return respond(stripe);
  if (input.stage === "start") stripe.status = "setting_up";
  else {
    stripe.status = "connected";
    stripe.businessName =
      input.businessName?.trim() ||
      (scope === "demo" ? studio.name : setupSession.studio.name) ||
      "Your music studio";
    // bankLast4 removed — Stripe Connect does not expose a fake last4 in this mock.
    stripe.bankLast4 = null;
  }
  return respond(stripe);
}
export async function disconnectStripe(scope: IntegrationScope = "demo") {
  if (isLive(scope)) {
    const { disconnectStripeConnectFn } = await import("@/server/stripe-connect");
    await disconnectStripeConnectFn({ data: await liveRequest() });
    return liveIntegrations().then((state) => state.stripe);
  }
  integrationState[scope].stripe = { status: "not_connected", businessName: null, bankLast4: null };
  return respond(integrationState[scope].stripe);
}
export async function connectXero(scope: IntegrationScope = "demo") {
  if (!proFeaturesEnabled(scope)) throw new Error("Available on Pro. Pro is A$49 a month.");
  if (isLive(scope)) throw new Error("Use startLiveXeroConnect for real studios.");
  const xero = integrationState[scope].xero;
  xero.status = "connected";
  xero.organisationName =
    (scope === "demo" ? studio.name : setupSession.studio.name) || "Your music studio";
  return respond(xero);
}
export async function disconnectXero(scope: IntegrationScope = "demo") {
  if (isLive(scope)) {
    const { disconnectXeroFn } = await import("@/server/xero");
    await disconnectXeroFn({ data: await liveRequest() });
    return liveIntegrations().then((state) => state.xero);
  }
  integrationState[scope].xero = {
    status: "not_connected",
    organisationName: null,
    lastSyncedAt: null,
  };
  return respond(integrationState[scope].xero);
}
export async function pushInvoiceToXero(invoiceId: string): Promise<{ synced: boolean; syncedAt?: string }> {
  const xero = integrationState.demo.xero;
  if (isLiveStudio()) return respond({ synced: false });
  if (!proFeaturesEnabled() || xero.status !== "connected") return respond({ synced: false });
  const invoice = invoices.find((entry) => entry.id === invoiceId);
  if (!invoice) throw new Error("Invoice not found");
  if (invoice.status === "draft" || invoice.status === "void") return respond({ synced: false });
  const timestamp = melbourneIso(PROTOTYPE_TODAY, "10:28");
  invoice.xeroSyncedAt ??= timestamp;
  xero.lastSyncedAt = timestamp;
  return respond({ synced: true, syncedAt: timestamp });
}
