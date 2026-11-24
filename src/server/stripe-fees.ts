import { createServerFn } from "@tanstack/react-start";
import { requireStudioRole } from "./authz";
import { getServerEnv, isStripeConnectConfigured } from "./env";
import { verifyAccessToken } from "./session";
import { stripeGet } from "./stripe";
import { getConnectStore } from "./stripe-connect";
import { createServiceSupabase } from "./supabase";

/**
 * Actual Stripe fees for online family payments (0028, tax review T-06).
 *
 * The fee comes from the charge's balance transaction on the studio's own Stripe account
 * (direct charges), never from a rate card. Saved once per payment in payment_stripe_fee.
 * A payment whose money hasn't settled yet (e.g. a direct debit still processing) has no
 * balance transaction: it stays "no fee reported yet" and is tried again next time.
 */

export type StripeFeeRow = {
  paymentId: string;
  grossCents: number;
  feeCents: number;
  netCents: number;
};

type BalanceTransaction = { id: string; amount: number; fee: number; net: number };
type PaymentIntentWithCharge = {
  id: string;
  latest_charge?: { balance_transaction?: BalanceTransaction | string | null } | string | null;
};

/** How many missing fees one Tax Lite visit asks Stripe for. */
export const FEE_REFRESH_LIMIT = 25;

export type FeeFetcher = (
  stripeAccountId: string,
  paymentIntentId: string,
) => Promise<BalanceTransaction | null>;

const stripeFeeFetcher: FeeFetcher = async (stripeAccountId, paymentIntentId) => {
  const intent = await stripeGet<PaymentIntentWithCharge>(
    getServerEnv().stripeSecretKey,
    `payment_intents/${encodeURIComponent(paymentIntentId)}?expand[]=latest_charge.balance_transaction`,
    { stripeAccount: stripeAccountId },
  );
  const charge = intent.latest_charge;
  if (!charge || typeof charge === "string") return null;
  const tx = charge.balance_transaction;
  if (!tx || typeof tx === "string") return null;
  return tx;
};

let fetcherOverride: FeeFetcher | null = null;
export function setFeeFetcherForTests(fetcher: FeeFetcher | null) {
  fetcherOverride = fetcher;
}

/** Turns a Stripe balance transaction into a fee row. Negative or odd values are refused. */
export function feeRowFrom(paymentId: string, tx: BalanceTransaction): StripeFeeRow | null {
  if (![tx.amount, tx.fee, tx.net].every((n) => Number.isInteger(n))) return null;
  if (tx.amount < 0 || tx.fee < 0) return null;
  return { paymentId, grossCents: tx.amount, feeCents: tx.fee, netCents: tx.net };
}

/**
 * Asks Stripe for the fee on each online payment of this studio that has none saved yet, and
 * saves what Stripe reports. Returns how many were saved. Errors on one payment don't stop the rest.
 */
export async function fillMissingStripeFees(
  studioId: string,
  limit = FEE_REFRESH_LIMIT,
): Promise<{ saved: number; stillMissing: number }> {
  if (!isStripeConnectConfigured() && !fetcherOverride) return { saved: 0, stillMissing: 0 };
  const supabase = createServiceSupabase();
  const { data: payments, error } = await supabase
    .from("payment")
    .select("id, stripe_payment_intent_id, payment_stripe_fee(payment_id)")
    .eq("studio_id", studioId)
    .not("stripe_payment_intent_id", "is", null)
    .gt("amount_cents", 0);
  if (error) {
    console.error("[stripe-fees] payment lookup failed", error.message);
    return { saved: 0, stillMissing: 0 };
  }
  type Row = { id: string; stripe_payment_intent_id: string; payment_stripe_fee: unknown };
  const missing = ((payments ?? []) as Row[]).filter((row) => {
    const fee = row.payment_stripe_fee;
    return !fee || (Array.isArray(fee) && fee.length === 0);
  });
  if (!missing.length) return { saved: 0, stillMissing: 0 };
  const account = await getConnectStore().get(studioId);
  if (!account) return { saved: 0, stillMissing: missing.length };

  const fetcher = fetcherOverride ?? stripeFeeFetcher;
  let saved = 0;
  for (const row of missing.slice(0, limit)) {
    try {
      const tx = await fetcher(account.stripeAccountId, row.stripe_payment_intent_id);
      const fee = tx ? feeRowFrom(row.id, tx) : null;
      if (!fee || !tx) continue;
      const { error: insertError } = await supabase.from("payment_stripe_fee").insert({
        payment_id: fee.paymentId,
        studio_id: studioId,
        gross_cents: fee.grossCents,
        fee_cents: fee.feeCents,
        net_cents: fee.netCents,
        balance_transaction_id: tx.id.slice(0, 120),
      });
      if (insertError && insertError.code !== "23505") {
        console.error("[stripe-fees] fee save failed", insertError.message);
        continue;
      }
      saved += 1;
    } catch (err) {
      console.error("[stripe-fees] Stripe fee lookup failed", (err as Error).message);
    }
  }
  return { saved, stillMissing: missing.length - saved };
}

/** Owner/admin: fill missing fees for their studio (Tax Lite calls this when it opens). */
export async function refreshStripeFees(input: { accessToken: string; studioId: string }) {
  const session = await verifyAccessToken(input.accessToken);
  await requireStudioRole(session.userId, input.studioId, ["owner", "admin"], {
    aal: session.aal,
    access: "read",
  });
  return fillMissingStripeFees(input.studioId);
}

export const refreshStripeFeesFn = createServerFn({ method: "POST" })
  .validator((data: { accessToken: string; studioId: string }) => data)
  .handler(({ data }) => refreshStripeFees(data));
