import { createServerFn } from "@tanstack/react-start";
import { forbidden, ProblemError, requireStudioRole } from "./authz";
import { getServerEnv, isMockOnboarding, isStripeConnectConfigured } from "./env";
import { verifyAccessToken } from "./session";
import { stripeGet, stripePost, type StripeEvent } from "./stripe";
import { createServiceSupabase } from "./supabase";

/**
 * Stripe Connect for family payments (0021).
 *
 * Each studio links its OWN Stripe account: Stripe-hosted onboarding through Account Links (no
 * OAuth client id needed), full Stripe Dashboard, Stripe collects requirements and bills the
 * studio its own fees. Families pay with Stripe Checkout as a DIRECT charge on the studio's
 * account (Stripe-Account header), so the studio is the merchant of record and Keystone takes no
 * application fee and never holds the money. The Connect webhook records the payment against the
 * invoice. Keystone's own subscription billing is separate (src/server/subscription.ts).
 */

export type ConnectAccountRow = {
  studioId: string;
  stripeAccountId: string;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  businessName: string | null;
  livemode: boolean;
  disconnectedAt: string | null;
  /** The studio removed Keystone in Stripe; this account can't be used again. */
  deauthorizedAt?: string | null;
  /** Accounts used before a re-link; late events from them still belong to this studio. */
  previousAccountIds?: string[];
};

export type ConnectStatus = {
  /** Server has STRIPE_SECRET_KEY and STRIPE_CONNECT_WEBHOOK_SECRET. */
  configured: boolean;
  status: "not_connected" | "setting_up" | "connected";
  businessName: string | null;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  livemode: boolean;
};

export type StripeAccountObject = {
  id: string;
  charges_enabled?: boolean;
  payouts_enabled?: boolean;
  details_submitted?: boolean;
  livemode?: boolean;
  business_profile?: { name?: string | null } | null;
  settings?: { dashboard?: { display_name?: string | null } } | null;
  metadata?: Record<string, string>;
};

// ---------------------------------------------------------------------------
// Storage. Service key only: every caller has already checked who is asking.
// ---------------------------------------------------------------------------
export interface ConnectStore {
  get(studioId: string): Promise<ConnectAccountRow | null>;
  findByAccount(stripeAccountId: string): Promise<ConnectAccountRow | null>;
  save(row: ConnectAccountRow, createdBy?: string): Promise<void>;
  recordEvent(
    id: string,
    type: string,
    account: string | null,
    studioId: string | null,
  ): Promise<boolean>;
  /** Undo recordEvent when handling failed, so Stripe's retry is processed. */
  forgetEvent(id: string): Promise<void>;
  /** BECS direct debits accepted by Stripe but not settled yet. */
  markPending(input: {
    checkoutSessionId: string;
    studioId: string;
    invoiceId: string;
    amountCents: number;
  }): Promise<void>;
  clearPending(checkoutSessionId: string): Promise<void>;
  hasPending(invoiceId: string): Promise<boolean>;
}

const mockRows = new Map<string, ConnectAccountRow>();
const mockEvents = new Set<string>();
const mockPending = new Map<string, string>();

export function resetMockConnect(rows: ConnectAccountRow[] = []) {
  mockRows.clear();
  mockEvents.clear();
  mockPending.clear();
  for (const row of rows) mockRows.set(row.studioId, { ...row });
}

const mockStore: ConnectStore = {
  async get(studioId) {
    const row = mockRows.get(studioId);
    return row ? { ...row } : null;
  },
  async findByAccount(id) {
    for (const row of mockRows.values()) {
      if (row.stripeAccountId === id || row.previousAccountIds?.includes(id)) return { ...row };
    }
    return null;
  },
  async save(row) {
    mockRows.set(row.studioId, { ...row });
  },
  async recordEvent(id) {
    if (mockEvents.has(id)) return false;
    mockEvents.add(id);
    return true;
  },
  async forgetEvent(id) {
    mockEvents.delete(id);
  },
  async markPending(input) {
    mockPending.set(input.checkoutSessionId, input.invoiceId);
  },
  async clearPending(id) {
    mockPending.delete(id);
  },
  async hasPending(invoiceId) {
    return [...mockPending.values()].includes(invoiceId);
  },
};

type DbRow = {
  studio_id: string;
  stripe_account_id: string;
  charges_enabled: boolean;
  payouts_enabled: boolean;
  details_submitted: boolean;
  business_name: string | null;
  livemode: boolean;
  disconnected_at: string | null;
  deauthorized_at: string | null;
  previous_stripe_account_ids: string[] | null;
};
const COLUMNS =
  "studio_id, stripe_account_id, charges_enabled, payouts_enabled, details_submitted, business_name, livemode, disconnected_at, deauthorized_at, previous_stripe_account_ids";
const fromDb = (row: DbRow): ConnectAccountRow => ({
  studioId: row.studio_id,
  stripeAccountId: row.stripe_account_id,
  chargesEnabled: row.charges_enabled,
  payoutsEnabled: row.payouts_enabled,
  detailsSubmitted: row.details_submitted,
  businessName: row.business_name,
  livemode: row.livemode,
  disconnectedAt: row.disconnected_at,
  deauthorizedAt: row.deauthorized_at,
  previousAccountIds: row.previous_stripe_account_ids ?? [],
});

const supabaseStore: ConnectStore = {
  async get(studioId) {
    const { data, error } = await createServiceSupabase()
      .from("stripe_connect_account")
      .select(COLUMNS)
      .eq("studio_id", studioId)
      .maybeSingle();
    if (error) throw new ProblemError(500, "Stripe link lookup failed", error.message);
    return data ? fromDb(data as DbRow) : null;
  },
  async findByAccount(id) {
    const { data, error } = await createServiceSupabase()
      .from("stripe_connect_account")
      .select(COLUMNS)
      // id comes from a verified Stripe event; still only allow Stripe's account id shape here.
      .or(
        /^acct_[A-Za-z0-9]+$/.test(id)
          ? `stripe_account_id.eq.${id},previous_stripe_account_ids.cs.{${id}}`
          : "stripe_account_id.eq.__none__",
      )
      .maybeSingle();
    if (error) throw new ProblemError(500, "Stripe link lookup failed", error.message);
    return data ? fromDb(data as DbRow) : null;
  },
  async save(row, createdBy) {
    const { error } = await createServiceSupabase()
      .from("stripe_connect_account")
      .upsert(
        {
          studio_id: row.studioId,
          stripe_account_id: row.stripeAccountId,
          charges_enabled: row.chargesEnabled,
          payouts_enabled: row.payoutsEnabled,
          details_submitted: row.detailsSubmitted,
          business_name: row.businessName,
          livemode: row.livemode,
          disconnected_at: row.disconnectedAt,
          deauthorized_at: row.deauthorizedAt ?? null,
          previous_stripe_account_ids: row.previousAccountIds ?? [],
          ...(createdBy ? { created_by: createdBy } : {}),
        },
        { onConflict: "studio_id" },
      );
    if (error) throw new ProblemError(500, "Stripe link save failed", error.message);
  },
  async recordEvent(id, type, account, studioId) {
    const { error } = await createServiceSupabase()
      .from("connect_webhook_event")
      .insert({ id, type, stripe_account_id: account, studio_id: studioId });
    if (!error) return true;
    if (error.code === "23505") return false;
    throw new ProblemError(500, "Webhook log failed", error.message);
  },
  async forgetEvent(id) {
    await createServiceSupabase().from("connect_webhook_event").delete().eq("id", id);
  },
  async markPending(input) {
    const { error } = await createServiceSupabase().from("connect_pending_payment").upsert(
      {
        checkout_session_id: input.checkoutSessionId,
        studio_id: input.studioId,
        invoice_id: input.invoiceId,
        amount_cents: input.amountCents,
      },
      { onConflict: "checkout_session_id" },
    );
    if (error) throw new ProblemError(500, "Pending payment save failed", error.message);
  },
  async clearPending(id) {
    const { error } = await createServiceSupabase()
      .from("connect_pending_payment")
      .delete()
      .eq("checkout_session_id", id);
    if (error) throw new ProblemError(500, "Pending payment clear failed", error.message);
  },
  async hasPending(invoiceId) {
    const { data, error } = await createServiceSupabase()
      .from("connect_pending_payment")
      .select("checkout_session_id")
      .eq("invoice_id", invoiceId)
      .limit(1);
    if (error) throw new ProblemError(500, "Pending payment lookup failed", error.message);
    return Boolean(data?.length);
  },
};

export function getConnectStore(): ConnectStore {
  return isMockOnboarding() ? mockStore : supabaseStore;
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------
export function rowFromAccount(
  studioId: string,
  account: StripeAccountObject,
  previous: ConnectAccountRow | null,
): ConnectAccountRow {
  return {
    studioId,
    stripeAccountId: account.id,
    chargesEnabled: Boolean(account.charges_enabled),
    payoutsEnabled: Boolean(account.payouts_enabled),
    detailsSubmitted: Boolean(account.details_submitted),
    businessName:
      account.business_profile?.name ||
      account.settings?.dashboard?.display_name ||
      previous?.businessName ||
      null,
    livemode: Boolean(account.livemode),
    disconnectedAt: previous?.disconnectedAt ?? null,
    deauthorizedAt: previous?.deauthorizedAt ?? null,
    previousAccountIds: previous?.previousAccountIds ?? [],
  };
}

export function statusFromRow(row: ConnectAccountRow | null, configured: boolean): ConnectStatus {
  const linked = row && !row.disconnectedAt ? row : null;
  return {
    configured,
    status: !linked ? "not_connected" : linked.chargesEnabled ? "connected" : "setting_up",
    businessName: linked?.businessName ?? null,
    chargesEnabled: Boolean(linked?.chargesEnabled),
    payoutsEnabled: Boolean(linked?.payoutsEnabled),
    livemode: Boolean(linked?.livemode),
  };
}

/** Amount still owing on an invoice. Reversals are negative payments. */
export function balanceCents(totalCents: number, payments: Array<{ amount_cents: number }>) {
  const paid = payments.reduce((sum, p) => sum + p.amount_cents, 0);
  return Math.max(0, totalCents - Math.max(0, Math.min(totalCents, paid)));
}

/** Only real dates and safe text go into a Stripe description. */
function cleanText(value: unknown, max = 120) {
  return String(value ?? "")
    .replace(/[\r\n<>]/g, " ")
    .trim()
    .slice(0, max);
}

function requireConfigured() {
  if (!isStripeConnectConfigured()) {
    throw new ProblemError(
      503,
      "Online payments are not set up yet",
      "Keystone's Stripe Connect keys are not configured on the server.",
    );
  }
}

// ---------------------------------------------------------------------------
// Studio side: status, link (Account Links onboarding), unlink
// ---------------------------------------------------------------------------
type StudioRequest = { accessToken: string; studioId: string };

async function refreshFromStripe(row: ConnectAccountRow): Promise<ConnectAccountRow> {
  const account = await stripeGet<StripeAccountObject>(
    getServerEnv().stripeSecretKey,
    `accounts/${encodeURIComponent(row.stripeAccountId)}`,
  );
  const next = rowFromAccount(row.studioId, account, row);
  await getConnectStore().save(next);
  return next;
}

export async function getStripeConnectStatus(input: StudioRequest): Promise<ConnectStatus> {
  const session = await verifyAccessToken(input.accessToken);
  await requireStudioRole(session.userId, input.studioId, ["owner", "admin", "teacher"], {
    aal: session.aal,
    access: "read",
  });
  const configured = isStripeConnectConfigured();
  let row = await getConnectStore().get(input.studioId);
  // Back from Stripe onboarding, or still in review: ask Stripe rather than wait for the webhook.
  if (configured && row && !row.disconnectedAt && !row.chargesEnabled) {
    row = await refreshFromStripe(row).catch(() => row);
  }
  return statusFromRow(row, configured);
}

export async function startStripeOnboarding(input: StudioRequest): Promise<{ url: string }> {
  requireConfigured();
  const session = await verifyAccessToken(input.accessToken);
  await requireStudioRole(session.userId, input.studioId, ["owner"], { aal: session.aal });
  const env = getServerEnv();
  const store = getConnectStore();
  let row = await store.get(input.studioId);

  // No account yet, or the studio removed Keystone in Stripe (that account no longer accepts
  // Keystone's requests): create a fresh account.
  if (!row || row.deauthorizedAt) {
    const previousAccount = row?.stripeAccountId ?? "first";
    const { data: studio } = await createServiceSupabase()
      .from("studio")
      .select("name")
      .eq("id", input.studioId)
      .maybeSingle();
    // Full Stripe Dashboard, Stripe collects requirements and bills the studio its own fees,
    // Stripe carries negative-balance risk: Keystone pays no Connect fees for these accounts.
    const account = await stripePost<StripeAccountObject>(
      env.stripeSecretKey,
      "accounts",
      {
        country: "AU",
        email: session.email ?? undefined,
        "controller[stripe_dashboard][type]": "full",
        "controller[fees][payer]": "account",
        "controller[losses][payments]": "stripe",
        "controller[requirement_collection]": "stripe",
        "business_profile[name]": cleanText(studio?.name, 80) || undefined,
        "business_profile[mcc]": "8299",
        "metadata[studio_id]": input.studioId,
      },
      `connect-account-${input.studioId}-${previousAccount}`,
    );
    row = {
      ...rowFromAccount(input.studioId, account, null),
      previousAccountIds: row ? [...(row.previousAccountIds ?? []), row.stripeAccountId] : [],
    };
    await store.save(row, session.userId);
  } else if (row.disconnectedAt) {
    row = { ...row, disconnectedAt: null };
    await store.save(row);
  }

  const link = await stripePost<{ url: string }>(env.stripeSecretKey, "account_links", {
    account: row.stripeAccountId,
    type: "account_onboarding",
    refresh_url: `${env.appUrl}/settings?stripe=refresh`,
    return_url: `${env.appUrl}/settings?stripe=return`,
  });
  return { url: link.url };
}

/**
 * Unlink stops Keystone taking online payments for this studio. The studio's Stripe account and
 * its money stay with the studio; Keystone cannot close it.
 */
export async function disconnectStripeConnect(input: StudioRequest): Promise<ConnectStatus> {
  const session = await verifyAccessToken(input.accessToken);
  await requireStudioRole(session.userId, input.studioId, ["owner"], { aal: session.aal });
  const store = getConnectStore();
  const row = await store.get(input.studioId);
  if (row && !row.disconnectedAt) {
    await store.save({ ...row, disconnectedAt: new Date().toISOString() });
  }
  return statusFromRow(await store.get(input.studioId), isStripeConnectConfigured());
}

// ---------------------------------------------------------------------------
// Family side: can this studio take online payments, and pay one invoice
// ---------------------------------------------------------------------------
async function guardianRowsFor(userId: string) {
  const { data, error } = await createServiceSupabase()
    .from("guardian")
    .select("id, family_id, studio_id, email")
    .eq("user_id", userId);
  if (error) throw new ProblemError(500, "Family lookup failed", error.message);
  return (data ?? []) as Array<{ id: string; family_id: string; studio_id: string; email: string }>;
}

export async function getFamilyOnlinePayments(input: StudioRequest): Promise<{ online: boolean }> {
  const session = await verifyAccessToken(input.accessToken);
  const guardians = await guardianRowsFor(session.userId);
  if (!guardians.some((g) => g.studio_id === input.studioId)) {
    await requireStudioRole(session.userId, input.studioId, ["owner", "admin", "teacher"], {
      aal: session.aal,
      access: "read",
    });
  }
  if (!isStripeConnectConfigured()) return { online: false };
  const row = await getConnectStore().get(input.studioId);
  return { online: Boolean(row && !row.disconnectedAt && row.chargesEnabled) };
}

export async function createInvoiceCheckout(input: {
  accessToken: string;
  invoiceId: string;
}): Promise<{ url: string }> {
  requireConfigured();
  const session = await verifyAccessToken(input.accessToken);
  const supabase = createServiceSupabase();
  const { data: invoice, error } = await supabase
    .from("invoice")
    .select("id, studio_id, family_id, number, status, total_cents")
    .eq("id", input.invoiceId)
    .maybeSingle();
  if (error) throw new ProblemError(500, "Invoice lookup failed", error.message);
  const guardian = (await guardianRowsFor(session.userId)).find(
    (g) => invoice && g.family_id === invoice.family_id,
  );
  if (!invoice || !guardian) throw forbidden("That invoice isn't for your family.");
  if (!["sent", "partially_paid"].includes(invoice.status as string)) {
    throw new ProblemError(409, "Nothing to pay", "This invoice has no amount owing.");
  }
  const row = await getConnectStore().get(invoice.studio_id as string);
  if (!row || row.disconnectedAt || !row.chargesEnabled) {
    throw new ProblemError(409, "Online payments are off", "Your studio will send bank details.");
  }

  if (await getConnectStore().hasPending(invoice.id as string)) {
    throw new ProblemError(
      409,
      "Payment already on its way",
      "A direct debit for this invoice is still processing. It usually takes a few business days.",
    );
  }

  const { data: payments, error: payError } = await supabase
    .from("payment")
    .select("amount_cents")
    .eq("invoice_id", invoice.id);
  if (payError) throw new ProblemError(500, "Payment lookup failed", payError.message);
  const owing = balanceCents(invoice.total_cents as number, payments ?? []);
  if (owing < 50)
    throw new ProblemError(409, "Nothing to pay", "This invoice has no amount owing.");

  const { data: studio } = await supabase
    .from("studio")
    .select("name")
    .eq("id", invoice.studio_id)
    .maybeSingle();
  const env = getServerEnv();
  const label = `Invoice ${cleanText(invoice.number ?? "", 40)}`.trim();
  const meta = {
    invoice_id: invoice.id as string,
    studio_id: invoice.studio_id as string,
    family_id: invoice.family_id as string,
  };
  // Direct charge on the studio's own account. Payment methods follow the studio's Stripe
  // Dashboard settings (card, and BECS direct debit if they turn it on). No application fee.
  const checkout = await stripePost<{ url: string }>(
    env.stripeSecretKey,
    "checkout/sessions",
    {
      mode: "payment",
      "line_items[0][quantity]": 1,
      "line_items[0][price_data][currency]": "aud",
      "line_items[0][price_data][unit_amount]": owing,
      "line_items[0][price_data][product_data][name]": `${label} · ${cleanText(studio?.name, 80) || "Music lessons"}`,
      customer_email: guardian.email || undefined,
      client_reference_id: invoice.id as string,
      "metadata[invoice_id]": meta.invoice_id,
      "metadata[studio_id]": meta.studio_id,
      "metadata[family_id]": meta.family_id,
      "payment_intent_data[metadata][invoice_id]": meta.invoice_id,
      "payment_intent_data[metadata][studio_id]": meta.studio_id,
      "payment_intent_data[description]": label,
      success_url: `${env.appUrl}/?view=invoices&invoice=${encodeURIComponent(meta.invoice_id)}&payment=done`,
      cancel_url: `${env.appUrl}/?view=invoices&invoice=${encodeURIComponent(meta.invoice_id)}&payment=cancelled`,
    },
    undefined,
    { stripeAccount: row.stripeAccountId },
  );
  return { url: checkout.url };
}

// ---------------------------------------------------------------------------
// Connect webhook
// ---------------------------------------------------------------------------
export type PaymentRecorder = (input: {
  studioId: string;
  invoiceId: string;
  amountCents: number;
  paymentIntentId: string;
  method: "stripe_card" | "stripe_becs";
  receivedOn: string;
}) => Promise<"recorded" | "duplicate" | "invoice_missing">;

/** Sydney calendar date for a unix timestamp (studios are in Australia). */
export function sydneyDate(unixSeconds: number): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Sydney" }).format(
    new Date(unixSeconds * 1000),
  );
}

const supabaseRecorder: PaymentRecorder = async (input) => {
  const supabase = createServiceSupabase();
  const { data: invoice } = await supabase
    .from("invoice")
    .select("id, studio_id, family_id, total_cents, status")
    .eq("id", input.invoiceId)
    .eq("studio_id", input.studioId)
    .maybeSingle();
  if (!invoice) return "invoice_missing";
  const { data: inserted, error } = await supabase
    .from("payment")
    .insert({
      studio_id: input.studioId,
      invoice_id: input.invoiceId,
      family_id: invoice.family_id,
      amount_cents: input.amountCents,
      method: input.method,
      received_on: input.receivedOn,
      reference: "Paid online with Stripe",
      stripe_payment_intent_id: input.paymentIntentId,
    })
    .select("id")
    .single();
  if (error?.code === "23505") return "duplicate";
  if (error) throw new ProblemError(500, "Payment save failed", error.message);

  const { data: payments } = await supabase
    .from("payment")
    .select("amount_cents")
    .eq("invoice_id", input.invoiceId);
  const owing = balanceCents(invoice.total_cents as number, payments ?? []);
  if (invoice.status === "sent" || invoice.status === "partially_paid") {
    await supabase
      .from("invoice")
      .update({ status: owing === 0 ? "paid" : "partially_paid" })
      .eq("id", input.invoiceId);
  }
  await supabase.from("invoice_event").insert({
    studio_id: input.studioId,
    invoice_id: input.invoiceId,
    kind: "payment_recorded",
    actor: "stripe",
    data: {
      paymentId: inserted?.id,
      amountCents: input.amountCents,
      method: input.method,
      online: true,
    },
  });
  // Save Stripe's actual fee for Tax Lite now if Stripe has it (0028). Never blocks the payment:
  // anything missing is fetched again when the owner opens Tax Lite.
  await import("./stripe-fees")
    .then((fees) => fees.fillMissingStripeFees(input.studioId, 3))
    .catch((err: Error) => console.error("[stripe-connect] fee lookup skipped", err.message));
  return "recorded";
};

let recorderOverride: PaymentRecorder | null = null;
export function setPaymentRecorderForTests(recorder: PaymentRecorder | null) {
  recorderOverride = recorder;
}

export type ConnectEventResult = { handled: boolean; note?: string };

type CheckoutSession = {
  id: string;
  payment_status?: string;
  amount_total?: number;
  currency?: string;
  payment_intent?: string | null;
  metadata?: Record<string, string>;
};

export async function handleConnectEvent(event: StripeEvent): Promise<ConnectEventResult> {
  const store = getConnectStore();
  const account = event.account ?? null;
  if (!account) return { handled: false, note: "not a Connect event" };
  const link = await store.findByAccount(account);
  if (!(await store.recordEvent(event.id, event.type, account, link?.studioId ?? null))) {
    return { handled: false, note: "duplicate" };
  }
  if (!link) return { handled: false, note: "unknown account" };
  try {
    return await applyConnectEvent(event, account, link);
  } catch (error) {
    await store.forgetEvent(event.id).catch(() => undefined);
    throw error;
  }
}

async function applyConnectEvent(
  event: StripeEvent,
  account: string,
  link: ConnectAccountRow,
): Promise<ConnectEventResult> {
  const store = getConnectStore();
  // An account the studio has since replaced: only its late payment events still count.
  if (account !== link.stripeAccountId && event.type.startsWith("account.")) {
    return { handled: false, note: "replaced account" };
  }
  switch (event.type) {
    case "account.updated": {
      const object = event.data.object as unknown as StripeAccountObject;
      await store.save(rowFromAccount(link.studioId, { ...object, id: account }, link));
      return { handled: true };
    }
    case "account.application.deauthorized": {
      await store.save({
        ...link,
        chargesEnabled: false,
        disconnectedAt: new Date().toISOString(),
        deauthorizedAt: new Date().toISOString(),
      });
      return { handled: true };
    }
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded": {
      const session = event.data.object as unknown as CheckoutSession;
      const invoiceId = session.metadata?.["invoice_id"];
      // Only trust a studio id that matches the account the event came from.
      if (!invoiceId || session.metadata?.["studio_id"] !== link.studioId) {
        return { handled: false, note: "not a Keystone invoice" };
      }
      if (session.payment_status !== "paid") {
        // BECS direct debit: accepted, settles in a few business days. Hold the invoice so the
        // family can't start a second payment meanwhile.
        if (event.type === "checkout.session.completed") {
          await store.markPending({
            checkoutSessionId: session.id,
            studioId: link.studioId,
            invoiceId,
            amountCents: session.amount_total ?? 0,
          });
          return { handled: true, note: "pending" };
        }
        return { handled: false, note: "not paid yet" };
      }
      if (
        (session.currency ?? "aud") !== "aud" ||
        !session.amount_total ||
        !session.payment_intent
      ) {
        return { handled: false, note: "missing amount" };
      }
      const record = recorderOverride ?? supabaseRecorder;
      const result = await record({
        studioId: link.studioId,
        invoiceId,
        amountCents: session.amount_total,
        paymentIntentId: session.payment_intent,
        // Card payments are paid when Checkout completes; BECS direct debit settles days later
        // and arrives as async_payment_succeeded.
        method:
          event.type === "checkout.session.async_payment_succeeded" ? "stripe_becs" : "stripe_card",
        receivedOn: sydneyDate(event.created),
      });
      await store.clearPending(session.id);
      return { handled: result === "recorded", note: result };
    }
    case "checkout.session.async_payment_failed": {
      // The direct debit bounced: nothing was paid, so the family can pay again.
      const session = event.data.object as unknown as CheckoutSession;
      if (session.metadata?.["studio_id"] !== link.studioId) {
        return { handled: false, note: "not a Keystone invoice" };
      }
      await store.clearPending(session.id);
      return { handled: true, note: "debit failed" };
    }
    default:
      return { handled: false, note: "ignored" };
  }
}

// ---------------------------------------------------------------------------
// Server functions
// ---------------------------------------------------------------------------
export const getStripeConnectStatusFn = createServerFn({ method: "POST" })
  .validator((data: StudioRequest) => data)
  .handler(({ data }) => getStripeConnectStatus(data));

export const startStripeOnboardingFn = createServerFn({ method: "POST" })
  .validator((data: StudioRequest) => data)
  .handler(({ data }) => startStripeOnboarding(data));

export const disconnectStripeConnectFn = createServerFn({ method: "POST" })
  .validator((data: StudioRequest) => data)
  .handler(({ data }) => disconnectStripeConnect(data));

export const getFamilyOnlinePaymentsFn = createServerFn({ method: "POST" })
  .validator((data: StudioRequest) => data)
  .handler(({ data }) => getFamilyOnlinePayments(data));

export const createInvoiceCheckoutFn = createServerFn({ method: "POST" })
  .validator((data: { accessToken: string; invoiceId: string }) => data)
  .handler(({ data }) => createInvoiceCheckout(data));
