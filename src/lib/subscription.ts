/**
 * Studio subscription rules (pure, no I/O). Mirrors app_private.studio_access_level in
 * supabase/migrations/0006_studio_subscription.sql — change both together.
 *
 * One flat subscription per studio (Base or Pro). Everyone in the studio inherits its access.
 * MSA v3.2: 5.3 failed payments keep access while we retry and remind; 12.2 suspension only after
 * 14 days unpaid following a reminder, owner keeps read-only export; 12.5 export for 30 days
 * after the end; 5.8 a good-faith dispute stops suspension; 3.5 Pilot Access is free until its end date.
 */

export type SubscriptionPlan = "base" | "pro";
export type SubscriptionStatus =
  "incomplete" | "pilot" | "comp" | "trialing" | "active" | "past_due" | "suspended" | "canceled";
export type AccessLevel = "full" | "owner_read_only" | "none";
export type StudioRoleName = "owner" | "admin" | "teacher" | "guardian";

export const SUSPEND_AFTER_REMINDER_DAYS = 14;
export const EXPORT_WINDOW_DAYS = 30;
export const BASE_STUDENT_CAP = 35;

const DAY_MS = 24 * 60 * 60 * 1000;

export type StudioSubscription = {
  studioId: string;
  plan: SubscriptionPlan;
  status: SubscriptionStatus;
  accessEndsAt: string | null;
  pastDueSince: string | null;
  reminderSentAt: string | null;
  suspendedAt: string | null;
  disputeHold: boolean;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  stripePriceId: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  lastStripeEventAt: string | null;
  note: string | null;
};

export const SUBSCRIPTION_STATUSES: readonly SubscriptionStatus[] = [
  "incomplete",
  "pilot",
  "comp",
  "trialing",
  "active",
  "past_due",
  "suspended",
  "canceled",
];

export function newSubscription(studioId: string): StudioSubscription {
  return {
    studioId,
    plan: "base",
    status: "incomplete",
    accessEndsAt: null,
    pastDueSince: null,
    reminderSentAt: null,
    suspendedAt: null,
    disputeHold: false,
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    stripePriceId: null,
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
    lastStripeEventAt: null,
    note: null,
  };
}

function ms(value: string | null): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

export function accessLevel(
  sub: Pick<StudioSubscription, "status" | "accessEndsAt"> | null | undefined,
  now: Date = new Date(),
): AccessLevel {
  if (!sub) return "none";
  const ends = ms(sub.accessEndsAt);
  switch (sub.status) {
    case "trialing":
    case "active":
    case "past_due":
      return "full";
    case "pilot":
    case "comp":
      return ends === null || ends > now.getTime() ? "full" : "owner_read_only";
    case "canceled":
      if (ends !== null && ends + EXPORT_WINDOW_DAYS * DAY_MS <= now.getTime()) return "none";
      return "owner_read_only";
    default:
      return "owner_read_only";
  }
}

export function canRead(level: AccessLevel, role: StudioRoleName): boolean {
  if (level === "full") return true;
  return level === "owner_read_only" && role === "owner";
}

export function canWrite(level: AccessLevel): boolean {
  return level === "full";
}

/** True once a past-due studio has gone 14 days after its first reminder without paying. */
export function dueForSuspension(sub: StudioSubscription, now: Date = new Date()): boolean {
  if (sub.status !== "past_due" || sub.disputeHold) return false;
  const reminded = ms(sub.reminderSentAt);
  if (reminded === null) return false;
  return now.getTime() - reminded >= SUSPEND_AFTER_REMINDER_DAYS * DAY_MS;
}

export function suspensionDate(sub: StudioSubscription): Date | null {
  const reminded = ms(sub.reminderSentAt);
  if (reminded === null) return null;
  return new Date(reminded + SUSPEND_AFTER_REMINDER_DAYS * DAY_MS);
}

export function exportUntil(sub: StudioSubscription): Date | null {
  if (sub.status !== "canceled") return null;
  const ends = ms(sub.accessEndsAt);
  return ends === null ? null : new Date(ends + EXPORT_WINDOW_DAYS * DAY_MS);
}

export function baseCapReached(plan: SubscriptionPlan, studentCount: number): boolean {
  return plan === "base" && studentCount >= BASE_STUDENT_CAP;
}

// ---------------------------------------------------------------------------
// Stripe → subscription mapping
// ---------------------------------------------------------------------------

export type StripePrices = { base: string; pro: string };

/** The parts of a Stripe Subscription object we read. Handles old and new API shapes. */
export type StripeSubscriptionObject = {
  id: string;
  customer: string | { id: string };
  status: string;
  cancel_at_period_end?: boolean;
  ended_at?: number | null;
  canceled_at?: number | null;
  current_period_end?: number | null;
  metadata?: Record<string, string> | null;
  items?: {
    data?: Array<{ price?: { id?: string } | null; current_period_end?: number | null }>;
  } | null;
};

function iso(seconds: number | null | undefined): string | null {
  return typeof seconds === "number" ? new Date(seconds * 1000).toISOString() : null;
}

export function customerId(customer: StripeSubscriptionObject["customer"]): string {
  return typeof customer === "string" ? customer : customer.id;
}

export function planForPrice(
  priceId: string | null | undefined,
  prices: StripePrices,
): SubscriptionPlan | null {
  if (!priceId) return null;
  if (prices.base && priceId === prices.base) return "base";
  if (prices.pro && priceId === prices.pro) return "pro";
  return null;
}

/**
 * Applies a Stripe subscription snapshot to the studio's row. Returns the new row.
 * Keystone, not Stripe, decides suspension: Stripe "past_due"/"unpaid" stay past_due here until
 * the 14-day job runs (configure Stripe to leave the subscription past due after retries).
 */
export function applyStripeSubscription(
  current: StudioSubscription,
  stripeSub: StripeSubscriptionObject,
  prices: StripePrices,
  eventAt: Date,
): StudioSubscription {
  const item = stripeSub.items?.data?.[0];
  const priceId = item?.price?.id ?? null;
  const next: StudioSubscription = {
    ...current,
    stripeCustomerId: customerId(stripeSub.customer),
    stripeSubscriptionId: stripeSub.id,
    stripePriceId: priceId ?? current.stripePriceId,
    plan: planForPrice(priceId, prices) ?? current.plan,
    currentPeriodEnd:
      iso(item?.current_period_end ?? stripeSub.current_period_end) ?? current.currentPeriodEnd,
    cancelAtPeriodEnd: Boolean(stripeSub.cancel_at_period_end),
    lastStripeEventAt: eventAt.toISOString(),
  };

  switch (stripeSub.status) {
    case "active":
    case "trialing":
      return {
        ...next,
        status: stripeSub.status,
        accessEndsAt: null,
        pastDueSince: null,
        reminderSentAt: null,
        suspendedAt: null,
      };
    case "past_due":
    case "unpaid":
      return {
        ...next,
        status: current.status === "suspended" ? "suspended" : "past_due",
        pastDueSince: current.pastDueSince ?? eventAt.toISOString(),
      };
    case "canceled":
    case "incomplete_expired":
      return {
        ...next,
        status: "canceled",
        accessEndsAt:
          iso(stripeSub.ended_at ?? stripeSub.canceled_at) ??
          current.accessEndsAt ??
          eventAt.toISOString(),
      };
    case "incomplete":
    case "paused":
      // Checkout started but not paid, or a trial ended with no card. A pilot/comp studio keeps
      // its free access until the subscription actually starts.
      if (current.status === "pilot" || current.status === "comp") return next;
      return { ...next, status: "incomplete" };
    default:
      return next;
  }
}

/** A paid invoice clears any past-due or suspended state. */
export function applyInvoicePaid(current: StudioSubscription, eventAt: Date): StudioSubscription {
  if (current.status !== "past_due" && current.status !== "suspended") {
    return { ...current, lastStripeEventAt: maxIso(current.lastStripeEventAt, eventAt) };
  }
  return {
    ...current,
    status: "active",
    pastDueSince: null,
    reminderSentAt: null,
    suspendedAt: null,
    lastStripeEventAt: maxIso(current.lastStripeEventAt, eventAt),
  };
}

/** A failed payment: mark past due (if not already suspended). The caller sends the reminder. */
export function applyPaymentFailed(
  current: StudioSubscription,
  eventAt: Date,
): { next: StudioSubscription; sendReminder: boolean } {
  const sendReminder = !current.reminderSentAt;
  const status: SubscriptionStatus =
    current.status === "suspended" || current.status === "canceled" ? current.status : "past_due";
  return {
    next: {
      ...current,
      status,
      pastDueSince: current.pastDueSince ?? eventAt.toISOString(),
      reminderSentAt: current.reminderSentAt ?? eventAt.toISOString(),
    },
    sendReminder,
  };
}

function maxIso(existing: string | null, eventAt: Date): string {
  const prior = ms(existing);
  return prior !== null && prior > eventAt.getTime() ? (existing as string) : eventAt.toISOString();
}

/** True when this event is older than the last one applied (Stripe can deliver out of order). */
export function isStaleEvent(current: StudioSubscription, eventAt: Date): boolean {
  const last = ms(current.lastStripeEventAt);
  return last !== null && eventAt.getTime() < last;
}

export function statusLabel(status: SubscriptionStatus): string {
  switch (status) {
    case "incomplete":
      return "No plan yet";
    case "pilot":
      return "Pilot (free)";
    case "comp":
      return "Complimentary";
    case "trialing":
      return "Trial";
    case "active":
      return "Active";
    case "past_due":
      return "Payment overdue";
    case "suspended":
      return "Suspended";
    case "canceled":
      return "Cancelled";
  }
}
