import { createServiceSupabase } from "./supabase";
import { isMockOnboarding } from "./env";
import { ProblemError } from "./problem";
import {
  accessLevel,
  newSubscription,
  type AccessLevel,
  type StudioSubscription,
} from "@/lib/subscription";

/**
 * Storage for public.studio_subscription (0006). Service-key access only: every caller must
 * already have verified who is asking (requireStudioRole, requirePlatformAdmin, a verified
 * Stripe signature or the cron secret).
 */
export interface SubscriptionStore {
  get(studioId: string): Promise<StudioSubscription | null>;
  findByStripe(ids: {
    customerId?: string | null | undefined;
    subscriptionId?: string | null | undefined;
  }): Promise<StudioSubscription | null>;
  save(sub: StudioSubscription): Promise<void>;
  /** Records a webhook event id. Returns false if it was already processed. */
  recordEvent(id: string, type: string, studioId: string | null): Promise<boolean>;
  listByStatus(status: StudioSubscription["status"]): Promise<StudioSubscription[]>;
  ownerContact(studioId: string): Promise<{ email: string; studioName: string } | null>;
}

// ---------------------------------------------------------------------------
// Mock store (mock mode and unit tests). Studios without a row have full access in mock mode
// so the demo app and existing tests are unaffected.
// ---------------------------------------------------------------------------
const mockSubscriptions = new Map<string, StudioSubscription>();
const mockEvents = new Set<string>();
const mockOwners = new Map<string, { email: string; studioName: string }>();

export function resetMockSubscriptions(
  rows: StudioSubscription[] = [],
  owners: Record<string, { email: string; studioName: string }> = {},
) {
  mockSubscriptions.clear();
  mockEvents.clear();
  mockOwners.clear();
  for (const row of rows) mockSubscriptions.set(row.studioId, { ...row });
  for (const [studioId, owner] of Object.entries(owners)) mockOwners.set(studioId, owner);
}

export function mockSubscription(
  studioId: string,
  patch: Partial<StudioSubscription> = {},
): StudioSubscription {
  return { ...newSubscription(studioId), ...patch, studioId };
}

const mockStore: SubscriptionStore = {
  async get(studioId) {
    const row = mockSubscriptions.get(studioId);
    return row ? { ...row } : null;
  },
  async findByStripe({ customerId, subscriptionId }) {
    for (const row of mockSubscriptions.values()) {
      if (subscriptionId && row.stripeSubscriptionId === subscriptionId) return { ...row };
    }
    for (const row of mockSubscriptions.values()) {
      if (customerId && row.stripeCustomerId === customerId) return { ...row };
    }
    return null;
  },
  async save(sub) {
    mockSubscriptions.set(sub.studioId, { ...sub });
  },
  async recordEvent(id) {
    if (mockEvents.has(id)) return false;
    mockEvents.add(id);
    return true;
  },
  async listByStatus(status) {
    return [...mockSubscriptions.values()]
      .filter((row) => row.status === status)
      .map((r) => ({ ...r }));
  },
  async ownerContact(studioId) {
    return mockOwners.get(studioId) ?? null;
  },
};

// ---------------------------------------------------------------------------
// Supabase store
// ---------------------------------------------------------------------------
type Row = {
  studio_id: string;
  plan: StudioSubscription["plan"];
  status: StudioSubscription["status"];
  access_ends_at: string | null;
  past_due_since: string | null;
  reminder_sent_at: string | null;
  suspended_at: string | null;
  dispute_hold: boolean;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  stripe_price_id: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  last_stripe_event_at: string | null;
  note: string | null;
};

const COLUMNS =
  "studio_id, plan, status, access_ends_at, past_due_since, reminder_sent_at, suspended_at, dispute_hold, stripe_customer_id, stripe_subscription_id, stripe_price_id, current_period_end, cancel_at_period_end, last_stripe_event_at, note";

function fromRow(row: Row): StudioSubscription {
  return {
    studioId: row.studio_id,
    plan: row.plan,
    status: row.status,
    accessEndsAt: row.access_ends_at,
    pastDueSince: row.past_due_since,
    reminderSentAt: row.reminder_sent_at,
    suspendedAt: row.suspended_at,
    disputeHold: row.dispute_hold,
    stripeCustomerId: row.stripe_customer_id,
    stripeSubscriptionId: row.stripe_subscription_id,
    stripePriceId: row.stripe_price_id,
    currentPeriodEnd: row.current_period_end,
    cancelAtPeriodEnd: row.cancel_at_period_end,
    lastStripeEventAt: row.last_stripe_event_at,
    note: row.note,
  };
}

function toRow(sub: StudioSubscription): Row {
  return {
    studio_id: sub.studioId,
    plan: sub.plan,
    status: sub.status,
    access_ends_at: sub.accessEndsAt,
    past_due_since: sub.pastDueSince,
    reminder_sent_at: sub.reminderSentAt,
    suspended_at: sub.suspendedAt,
    dispute_hold: sub.disputeHold,
    stripe_customer_id: sub.stripeCustomerId,
    stripe_subscription_id: sub.stripeSubscriptionId,
    stripe_price_id: sub.stripePriceId,
    current_period_end: sub.currentPeriodEnd,
    cancel_at_period_end: sub.cancelAtPeriodEnd,
    last_stripe_event_at: sub.lastStripeEventAt,
    note: sub.note,
  };
}

const supabaseStore: SubscriptionStore = {
  async get(studioId) {
    const { data, error } = await createServiceSupabase()
      .from("studio_subscription")
      .select(COLUMNS)
      .eq("studio_id", studioId)
      .maybeSingle();
    if (error) throw new ProblemError(500, "Subscription lookup failed", error.message);
    return data ? fromRow(data as Row) : null;
  },
  async findByStripe({ customerId, subscriptionId }) {
    const supabase = createServiceSupabase();
    if (subscriptionId) {
      const { data, error } = await supabase
        .from("studio_subscription")
        .select(COLUMNS)
        .eq("stripe_subscription_id", subscriptionId)
        .maybeSingle();
      if (error) throw new ProblemError(500, "Subscription lookup failed", error.message);
      if (data) return fromRow(data as Row);
    }
    if (customerId) {
      const { data, error } = await supabase
        .from("studio_subscription")
        .select(COLUMNS)
        .eq("stripe_customer_id", customerId)
        .maybeSingle();
      if (error) throw new ProblemError(500, "Subscription lookup failed", error.message);
      if (data) return fromRow(data as Row);
    }
    return null;
  },
  async save(sub) {
    const { error } = await createServiceSupabase()
      .from("studio_subscription")
      .upsert(toRow(sub), { onConflict: "studio_id" });
    if (error) throw new ProblemError(500, "Subscription save failed", error.message);
  },
  async recordEvent(id, type, studioId) {
    const { error } = await createServiceSupabase()
      .from("billing_webhook_event")
      .insert({ id, type, studio_id: studioId });
    if (!error) return true;
    if (error.code === "23505") return false;
    throw new ProblemError(500, "Webhook event record failed", error.message);
  },
  async listByStatus(status) {
    const { data, error } = await createServiceSupabase()
      .from("studio_subscription")
      .select(COLUMNS)
      .eq("status", status);
    if (error) throw new ProblemError(500, "Subscription list failed", error.message);
    return (data ?? []).map((row) => fromRow(row as Row));
  },
  async ownerContact(studioId) {
    const supabase = createServiceSupabase();
    const { data: studio } = await supabase
      .from("studio")
      .select("name, owner_user_id")
      .eq("id", studioId)
      .maybeSingle();
    if (!studio?.owner_user_id) return null;
    const { data: user } = await supabase.auth.admin.getUserById(studio.owner_user_id as string);
    const email = user.user?.email;
    return email ? { email, studioName: studio.name as string } : null;
  },
};

export function getSubscriptionStore(): SubscriptionStore {
  return isMockOnboarding() ? mockStore : supabaseStore;
}

/** Access level for a studio right now. Mock mode: a studio with no row has full access. */
export async function getStudioAccess(
  studioId: string,
  now: Date = new Date(),
): Promise<{ level: AccessLevel; subscription: StudioSubscription | null }> {
  const subscription = await getSubscriptionStore().get(studioId);
  if (!subscription && isMockOnboarding()) return { level: "full", subscription: null };
  return { level: accessLevel(subscription, now), subscription };
}
