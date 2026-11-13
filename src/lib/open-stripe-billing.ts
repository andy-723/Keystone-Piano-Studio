import { getAuthClient } from "@/lib/auth-client";
import { createBillingSessionFn } from "@/server/subscription";
import type { SubscriptionPlan } from "@/lib/subscription";

/**
 * Opens Stripe Checkout or the Customer Portal for the signed-in owner.
 * Requires live auth + STRIPE_* billing env (see getStripeBillingStatusFn).
 */
export async function openStripeBillingSession(
  studioId: string,
  plan?: SubscriptionPlan,
): Promise<void> {
  const client = getAuthClient();
  const { data } = (await client?.auth.getSession()) ?? { data: { session: null } };
  const token = data.session?.access_token;
  if (!token) {
    window.location.replace("/login");
    return;
  }
  const result = await createBillingSessionFn({
    data: { accessToken: token, studioId, ...(plan ? { plan } : {}) },
  });
  window.location.assign(result.url);
}
