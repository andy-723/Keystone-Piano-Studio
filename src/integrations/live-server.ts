import { invoices, families } from "@/mocks/data";
import { recordInvoicePayment } from "@/services/billing";
import { proFeaturesEnabled } from "@/services/plans";
import { parseScope, providerModes, stripeConfigured, xeroConfigured } from "./config";
import {
  liveIntegrationsCookieHeader,
  mergeLiveIntegrations,
  readLiveIntegrations,
  type LiveIntegrationsCookie,
} from "./connection-cookie";
import { createConnectedCheckoutSession, deauthorizeStripeAccount, retrieveCheckoutSession } from "./stripe";
import { createXeroSalesInvoice, refreshXeroTokens, upsertXeroContact } from "./xero";
import { setResponseHeader } from "@tanstack/react-start/server";

function publicFromLive(cookie: LiveIntegrationsCookie, scope: "demo" | "new-studio") {
  const stripe =
    cookie.stripe?.scope === scope
      ? {
          status: "connected" as const,
          businessName: cookie.stripe.businessName,
          bankLast4: cookie.stripe.bankLast4,
        }
      : { status: "not_connected" as const, businessName: null, bankLast4: null };
  const xero =
    cookie.xero?.scope === scope
      ? {
          status: "connected" as const,
          organisationName: cookie.xero.organisationName,
          lastSyncedAt: cookie.xero.lastSyncedAt,
        }
      : { status: "not_connected" as const, organisationName: null, lastSyncedAt: null };
  return { stripe, xero, providers: providerModes() };
}

function writeCookie(request: Request, payload: LiveIntegrationsCookie) {
  setResponseHeader("Set-Cookie", liveIntegrationsCookieHeader(payload, request));
}

export function readPublicIntegrations(request: Request, scopeRaw?: string) {
  const scope = parseScope(scopeRaw);
  const modes = providerModes();
  if (modes.stripe === "sample" && modes.xero === "sample") {
    return {
      stripe: { status: "not_connected" as const, businessName: null, bankLast4: null },
      xero: { status: "not_connected" as const, organisationName: null, lastSyncedAt: null },
      providers: modes,
      liveConfigured: false as const,
    };
  }
  return { ...publicFromLive(readLiveIntegrations(request), scope), liveConfigured: true as const };
}

export async function disconnectStripeLive(request: Request, scopeRaw?: string) {
  const scope = parseScope(scopeRaw);
  const current = readLiveIntegrations(request);
  if (current.stripe?.accountId) await deauthorizeStripeAccount(current.stripe.accountId);
  const next = mergeLiveIntegrations(current, { stripe: null });
  writeCookie(request, next);
  return publicFromLive(next, scope);
}

export async function disconnectXeroLive(request: Request, scopeRaw?: string) {
  const scope = parseScope(scopeRaw);
  const next = mergeLiveIntegrations(readLiveIntegrations(request), { xero: null });
  writeCookie(request, next);
  return publicFromLive(next, scope);
}

export async function createParentCheckoutLive(
  request: Request,
  input: { invoiceId: string; cancelPath?: string },
) {
  if (!stripeConfigured()) throw new Error("Stripe is not configured.");
  const live = readLiveIntegrations(request).stripe;
  if (!live?.accountId) throw new Error("Connect Stripe before taking card payments.");
  const invoice = invoices.find((entry) => entry.id === input.invoiceId);
  if (!invoice || !["sent", "overdue", "partially_paid"].includes(invoice.status)) {
    throw new Error("Unpaid family invoice not found");
  }
  const amount = invoice.balanceCents ?? invoice.totalCents;
  if (!amount || amount <= 0) throw new Error("Nothing left to pay.");
  const origin = new URL(request.url).origin;
  const successUrl = `${origin}/api/integrations/stripe/checkout-return?session_id={CHECKOUT_SESSION_ID}`;
  const cancelUrl = `${origin}${input.cancelPath || "/"}`;
  const family = families.find((entry) => entry.id === invoice.familyId);
  const customerEmail = family?.guardians[0]?.email;
  const session = await createConnectedCheckoutSession({
    accountId: live.accountId,
    amountCents: amount,
    invoiceId: invoice.id,
    invoiceNumber: invoice.number,
    ...(customerEmail ? { customerEmail } : {}),
    successUrl,
    cancelUrl,
  });
  if (!session.url) throw new Error("Stripe did not return a checkout URL.");
  return { url: session.url };
}

export async function syncInvoiceToXeroLive(request: Request, invoiceId: string) {
  if (!xeroConfigured()) return { synced: false as const };
  if (!proFeaturesEnabled()) return { synced: false as const };
  let cookie = readLiveIntegrations(request);
  let xero = cookie.xero;
  if (!xero) return { synced: false as const };
  const invoice = invoices.find((entry) => entry.id === invoiceId);
  if (!invoice || invoice.status === "draft" || invoice.status === "void") return { synced: false as const };

  if (xero.expiresAt <= Date.now()) {
    const refreshed = await refreshXeroTokens(xero.refreshToken);
    xero = { ...xero, ...refreshed };
    cookie = mergeLiveIntegrations(cookie, { xero });
  }

  const family = families.find((entry) => entry.id === invoice.familyId);
  const email = family?.guardians[0]?.email;
  const contactId = await upsertXeroContact({
    accessToken: xero.accessToken,
    tenantId: xero.tenantId,
    name: family?.displayName || invoice.familyId,
    ...(email ? { email } : {}),
  });
  await createXeroSalesInvoice({
    accessToken: xero.accessToken,
    tenantId: xero.tenantId,
    contactId,
    reference: invoice.number,
    issueDate: invoice.issueDate,
    dueDate: invoice.dueDate,
    lineItems: invoice.lines.map((line) => ({
      description: line.description,
      qty: line.qty,
      unitAmount: line.unitCents / 100,
    })),
  });
  const timestamp = new Date().toISOString();
  invoice.xeroSyncedAt ??= timestamp;
  xero = { ...xero, lastSyncedAt: timestamp };
  cookie = mergeLiveIntegrations(cookie, { xero });
  writeCookie(request, cookie);
  return { synced: true as const, syncedAt: timestamp };
}

export async function completeCheckoutReturn(request: Request, sessionId: string) {
  const live = readLiveIntegrations(request).stripe;
  if (!live?.accountId) throw new Error("Stripe is not connected.");
  const session = await retrieveCheckoutSession(sessionId, live.accountId);
  if (session.payment_status !== "paid") throw new Error("Payment is not complete yet.");
  const invoiceId = session.metadata?.["invoiceId"];
  if (!invoiceId) throw new Error("Checkout session is missing the invoice id.");
  await recordInvoicePayment(invoiceId, "card");
  return invoiceId;
}
