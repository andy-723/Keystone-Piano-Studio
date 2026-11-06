import Stripe from "stripe";
import { stripeConnectClientId, stripeSecretKey } from "./config";

let client: Stripe | null = null;

export function getStripe(): Stripe {
  if (!client) client = new Stripe(stripeSecretKey(), { apiVersion: "2026-10-28.endive" });
  return client;
}

export function stripeAuthorizeUrl(input: { redirectUri: string; state: string }): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: stripeConnectClientId(),
    scope: "read_write",
    redirect_uri: input.redirectUri,
    state: input.state,
  });
  return `https://connect.stripe.com/oauth/authorize?${params}`;
}

export async function exchangeStripeOAuthCode(code: string) {
  const stripe = getStripe();
  const response = await stripe.oauth.token({
    grant_type: "authorization_code",
    code,
  });
  if (!response.stripe_user_id) throw new Error("Stripe did not return a connected account id.");
  return {
    accountId: response.stripe_user_id,
    accessToken: response.access_token ?? null,
    livemode: Boolean(response.livemode),
  };
}

export async function fetchStripeAccountSummary(accountId: string) {
  const stripe = getStripe();
  const account = await stripe.accounts.retrieve(accountId);
  const external = account.external_accounts?.data?.find((item) => item.object === "bank_account");
  const bankLast4 = external && "last4" in external ? String(external.last4) : null;
  const businessName =
    account.business_profile?.name ||
    account.settings?.dashboard?.display_name ||
    account.email ||
    "Stripe account";
  return { businessName, bankLast4, chargesEnabled: Boolean(account.charges_enabled) };
}

export async function deauthorizeStripeAccount(accountId: string) {
  const stripe = getStripe();
  try {
    await stripe.oauth.deauthorize({
      client_id: stripeConnectClientId(),
      stripe_user_id: accountId,
    });
  } catch {
    // Account may already be disconnected in Stripe; local disconnect still proceeds.
  }
}

export async function createConnectedCheckoutSession(input: {
  accountId: string;
  amountCents: number;
  currency?: string;
  invoiceId: string;
  invoiceNumber: string;
  customerEmail?: string;
  successUrl: string;
  cancelUrl: string;
}) {
  const stripe = getStripe();
  return stripe.checkout.sessions.create(
    {
      mode: "payment",
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
      ...(input.customerEmail ? { customer_email: input.customerEmail } : {}),
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: input.currency ?? "aud",
            unit_amount: input.amountCents,
            product_data: {
              name: `Invoice ${input.invoiceNumber}`,
              description: "KeyStone Piano Studios lesson fees",
            },
          },
        },
      ],
      metadata: { invoiceId: input.invoiceId, invoiceNumber: input.invoiceNumber },
      payment_intent_data: {
        metadata: { invoiceId: input.invoiceId, invoiceNumber: input.invoiceNumber },
      },
    },
    { stripeAccount: input.accountId },
  );
}

export async function retrieveCheckoutSession(sessionId: string, accountId: string) {
  const stripe = getStripe();
  return stripe.checkout.sessions.retrieve(sessionId, undefined, { stripeAccount: accountId });
}
