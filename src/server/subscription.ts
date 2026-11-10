import { createServerFn } from "@tanstack/react-start";
import { getServerEnv, isMockOnboarding } from "./env";
import { requirePlatformAdmin, requireStudioRole } from "./authz";
import { verifyAccessToken } from "./session";
import { writePlatformAudit } from "./account";
import { ProblemError } from "./problem";
import { getEmailProvider } from "./email";
import { paymentReminderEmail, suspensionNoticeEmail } from "./email/templates/subscription";
import { getSubscriptionStore } from "./subscription-store";
import { stripePost, type StripeEvent } from "./stripe";
import {
  applyInvoicePaid,
  applyPaymentFailed,
  applyStripeSubscription,
  dueForSuspension,
  isStaleEvent,
  newSubscription,
  suspensionDate,
  type StripeSubscriptionObject,
  type StudioSubscription,
  type SubscriptionPlan,
  type SubscriptionStatus,
} from "@/lib/subscription";

function billingUrl() {
  return `${getServerEnv().appUrl}/settings?billing=1`;
}

async function emailOwner(
  studioId: string,
  build: (studioName: string) => { subject: string; html: string; text: string },
  kind: string,
) {
  const owner = await getSubscriptionStore().ownerContact(studioId);
  if (!owner) return false;
  const env = getServerEnv();
  const mail = build(owner.studioName);
  await getEmailProvider().send({
    to: owner.email,
    from: env.emailFrom,
    subject: mail.subject,
    html: mail.html,
    text: mail.text,
    tags: [{ name: "kind", value: kind }],
  });
  return true;
}

function stripeId(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "id" in value) {
    const id = (value as { id?: unknown }).id;
    return typeof id === "string" ? id : null;
  }
  return null;
}

/** The fields we read from checkout sessions and invoices. */
type StripeObject = {
  mode?: string;
  metadata?: Record<string, string> | null;
  client_reference_id?: string | null;
  customer?: unknown;
  subscription?: unknown;
  parent?: { subscription_details?: { subscription?: unknown } } | null;
};

/** Subscription id on an Invoice object (old API: invoice.subscription; new: parent.subscription_details). */
function invoiceSubscriptionId(invoice: StripeObject): string | null {
  const direct = stripeId(invoice.subscription);
  if (direct) return direct;
  return stripeId(invoice.parent?.subscription_details?.subscription);
}

export type StripeEventResult =
  | { outcome: "applied"; studioId: string; status: SubscriptionStatus }
  | { outcome: "duplicate" | "ignored"; reason: string };

/**
 * Applies one verified Stripe event from the platform billing webhook.
 * Studio resolution: metadata.studio_id / client_reference_id (set by our checkout), then the
 * stored Stripe subscription id, then the customer id.
 */
export async function handleStripeEvent(event: StripeEvent): Promise<StripeEventResult> {
  if (event.account) {
    return { outcome: "ignored", reason: "Connected-account event on the billing endpoint" };
  }
  const store = getSubscriptionStore();
  const env = getServerEnv();
  const prices = { base: env.stripePriceBase, pro: env.stripePricePro };
  const eventAt = new Date(event.created * 1000);
  const object = event.data.object as StripeObject;

  async function resolve(input: {
    studioId?: string | null | undefined;
    customerId?: string | null | undefined;
    subscriptionId?: string | null | undefined;
  }): Promise<StudioSubscription | null> {
    if (input.studioId) {
      return (await store.get(input.studioId)) ?? newSubscription(input.studioId);
    }
    return store.findByStripe({
      customerId: input.customerId,
      subscriptionId: input.subscriptionId,
    });
  }

  let current: StudioSubscription | null = null;
  let next: StudioSubscription | null = null;
  let sendReminder = false;

  switch (event.type) {
    case "checkout.session.completed": {
      if (object.mode !== "subscription")
        return { outcome: "ignored", reason: "Not a subscription checkout" };
      const metadata = object.metadata ?? {};
      const studioId = object.client_reference_id ?? metadata["studio_id"] ?? null;
      if (!studioId) return { outcome: "ignored", reason: "Checkout has no studio reference" };
      current = await resolve({ studioId });
      if (!current) return { outcome: "ignored", reason: "Unknown studio" };
      next = {
        ...current,
        stripeCustomerId: stripeId(object.customer) ?? current.stripeCustomerId,
        stripeSubscriptionId: stripeId(object.subscription) ?? current.stripeSubscriptionId,
      };
      break;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
    case "customer.subscription.paused":
    case "customer.subscription.resumed": {
      const sub = object as unknown as StripeSubscriptionObject;
      current = await resolve({
        studioId: sub.metadata?.["studio_id"] ?? null,
        customerId: stripeId(sub.customer),
        subscriptionId: sub.id,
      });
      if (!current) return { outcome: "ignored", reason: "No studio for this subscription" };
      if (isStaleEvent(current, eventAt))
        return { outcome: "ignored", reason: "Older than last applied event" };
      next = applyStripeSubscription(current, sub, prices, eventAt);
      break;
    }
    case "invoice.paid":
    case "invoice.payment_succeeded": {
      current = await resolve({
        customerId: stripeId(object.customer),
        subscriptionId: invoiceSubscriptionId(object),
      });
      if (!current) return { outcome: "ignored", reason: "No studio for this invoice" };
      next = applyInvoicePaid(current, eventAt);
      break;
    }
    case "invoice.payment_failed": {
      current = await resolve({
        customerId: stripeId(object.customer),
        subscriptionId: invoiceSubscriptionId(object),
      });
      if (!current) return { outcome: "ignored", reason: "No studio for this invoice" };
      const failed = applyPaymentFailed(current, eventAt);
      next = failed.next;
      sendReminder = failed.sendReminder;
      break;
    }
    default:
      return { outcome: "ignored", reason: `Unhandled event type ${event.type}` };
  }

  const fresh = await store.recordEvent(event.id, event.type, next.studioId);
  if (!fresh) return { outcome: "duplicate", reason: "Event already processed" };
  await store.save(next);

  if (sendReminder) {
    const suspendOn = suspensionDate(next) ?? new Date(eventAt.getTime() + 14 * 86400000);
    await emailOwner(
      next.studioId,
      (studioName) =>
        paymentReminderEmail({
          studioName,
          suspendOn,
          billingUrl: billingUrl(),
          supportEmail: env.supportEmail,
        }),
      "subscription_payment_reminder",
    );
  }
  return { outcome: "applied", studioId: next.studioId, status: next.status };
}

/**
 * Daily job (MSA 12.2): suspends past-due studios 14 days after the first reminder, unless a
 * dispute hold is set (MSA 5.8), and emails the owner a notice that explains how to restore access.
 */
export async function runSubscriptionEnforcement(now: Date = new Date()) {
  const store = getSubscriptionStore();
  const env = getServerEnv();
  const pastDue = await store.listByStatus("past_due");
  const suspended: string[] = [];
  for (const sub of pastDue) {
    if (!dueForSuspension(sub, now)) continue;
    await store.save({ ...sub, status: "suspended", suspendedAt: now.toISOString() });
    suspended.push(sub.studioId);
    await emailOwner(
      sub.studioId,
      (studioName) =>
        suspensionNoticeEmail({
          studioName,
          billingUrl: billingUrl(),
          supportEmail: env.supportEmail,
        }),
      "subscription_suspended",
    );
  }
  return { checked: pastDue.length, suspended };
}

// ---------------------------------------------------------------------------
// Owner billing: start a subscription or open Stripe's customer portal
// ---------------------------------------------------------------------------

/** Owner-only. Returns a Stripe URL to pay: the portal if a customer exists, otherwise Checkout. */
export async function createBillingSession(input: {
  userId: string;
  aal: string | null;
  studioId: string;
  plan?: SubscriptionPlan | undefined;
}): Promise<{ url: string }> {
  // access "skip": paying must work while the studio is paused.
  await requireStudioRole(input.userId, input.studioId, ["owner"], {
    aal: input.aal,
    access: "skip",
  });
  const env = getServerEnv();
  const sub = (await getSubscriptionStore().get(input.studioId)) ?? newSubscription(input.studioId);
  const returnUrl = billingUrl();

  if (sub.stripeCustomerId && sub.status !== "canceled" && sub.status !== "incomplete") {
    const portal = await stripePost<{ url: string }>(
      env.stripeSecretKey,
      "billing_portal/sessions",
      {
        customer: sub.stripeCustomerId,
        return_url: returnUrl,
      },
    );
    return { url: portal.url };
  }

  const plan = input.plan ?? sub.plan;
  const price = plan === "pro" ? env.stripePricePro : env.stripePriceBase;
  if (!price)
    throw new ProblemError(
      503,
      "Billing is not set up yet",
      `STRIPE_PRICE_${plan.toUpperCase()} is missing.`,
    );
  const owner = await getSubscriptionStore().ownerContact(input.studioId);
  const checkout = await stripePost<{ url: string }>(env.stripeSecretKey, "checkout/sessions", {
    mode: "subscription",
    "line_items[0][price]": price,
    "line_items[0][quantity]": 1,
    client_reference_id: input.studioId,
    "metadata[studio_id]": input.studioId,
    "subscription_data[metadata][studio_id]": input.studioId,
    customer: sub.stripeCustomerId ?? undefined,
    customer_email: sub.stripeCustomerId ? undefined : owner?.email,
    success_url: `${returnUrl}&checkout=done`,
    cancel_url: returnUrl,
  });
  return { url: checkout.url };
}

export const createBillingSessionFn = createServerFn({ method: "POST" })
  .validator((data: { accessToken: string; studioId: string; plan?: SubscriptionPlan }) => data)
  .handler(async ({ data }) => {
    if (isMockOnboarding()) throw new ProblemError(400, "Mock mode", "Billing needs live mode.");
    const session = await verifyAccessToken(data.accessToken);
    if (data.plan && data.plan !== "base" && data.plan !== "pro") {
      throw new ProblemError(400, "Invalid plan");
    }
    return createBillingSession({
      userId: session.userId,
      aal: session.aal,
      studioId: data.studioId,
      plan: data.plan,
    });
  });

// ---------------------------------------------------------------------------
// Platform admin: pilot, complimentary access, plan and dispute hold
// ---------------------------------------------------------------------------

export type StudioAccessUpdate = {
  status?: "pilot" | "comp";
  plan?: SubscriptionPlan;
  /** yyyy-mm-dd, inclusive last day of free access (Australia/Sydney end of day). Empty = no end. */
  accessEndsOn?: string | null;
  disputeHold?: boolean;
  note?: string | null;
};

export function endOfDaySydney(date: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date))
    throw new ProblemError(400, "Invalid date", "Use yyyy-mm-dd.");
  // 23:59:59 in Sydney on that date, using the offset in force that day (AEST +10 or AEDT +11).
  const probe = new Date(`${date}T12:00:00Z`);
  const zone = new Intl.DateTimeFormat("en-US", {
    timeZone: "Australia/Sydney",
    timeZoneName: "longOffset",
  })
    .formatToParts(probe)
    .find((part) => part.type === "timeZoneName")?.value;
  const offset = zone?.replace("GMT", "") || "+10:00";
  return new Date(`${date}T23:59:59${offset}`).toISOString();
}

export async function applyStudioAccessUpdate(
  studioId: string,
  update: StudioAccessUpdate,
): Promise<StudioSubscription> {
  const store = getSubscriptionStore();
  const current = (await store.get(studioId)) ?? newSubscription(studioId);
  let next: StudioSubscription = { ...current };
  if (update.status) {
    if (
      current.stripeSubscriptionId &&
      ["active", "trialing", "past_due"].includes(current.status)
    ) {
      throw new ProblemError(
        409,
        "Studio is paying",
        "Cancel the Stripe subscription before giving pilot or complimentary access.",
      );
    }
    next = {
      ...next,
      status: update.status,
      pastDueSince: null,
      reminderSentAt: null,
      suspendedAt: null,
    };
  }
  if (update.plan) next.plan = update.plan;
  if (update.accessEndsOn !== undefined) {
    next.accessEndsAt = update.accessEndsOn ? endOfDaySydney(update.accessEndsOn) : null;
  }
  if (update.disputeHold !== undefined) next.disputeHold = update.disputeHold;
  if (update.note !== undefined) next.note = update.note?.trim() || null;
  await store.save(next);
  return next;
}

export const setStudioAccessFn = createServerFn({ method: "POST" })
  .validator(
    (data: { accessToken: string; studioId: string; update: StudioAccessUpdate; ip?: string }) =>
      data,
  )
  .handler(async ({ data }) => {
    if (isMockOnboarding())
      throw new ProblemError(400, "Mock mode", "Admin console needs live mode.");
    const session = await verifyAccessToken(data.accessToken);
    // requirePlatformAdmin guards the service-key write below.
    await requirePlatformAdmin(session.userId, { aal: session.aal });
    const { update } = data;
    if (update.status && update.status !== "pilot" && update.status !== "comp") {
      throw new ProblemError(
        400,
        "Invalid status",
        "Only pilot or complimentary access can be set here.",
      );
    }
    if (update.plan && update.plan !== "base" && update.plan !== "pro") {
      throw new ProblemError(400, "Invalid plan");
    }
    const saved = await applyStudioAccessUpdate(data.studioId, update);
    await writePlatformAudit({
      actorUserId: session.userId,
      event: "studio_access_changed",
      targetStudioId: data.studioId,
      detail: {
        status: saved.status,
        plan: saved.plan,
        access_ends_at: saved.accessEndsAt,
        dispute_hold: saved.disputeHold,
      },
      ...(data.ip ? { ip: data.ip } : {}),
    });
    return {
      status: saved.status,
      plan: saved.plan,
      accessEndsAt: saved.accessEndsAt,
      disputeHold: saved.disputeHold,
    };
  });
