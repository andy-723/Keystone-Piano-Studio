import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  balanceCents,
  getConnectStore,
  handleConnectEvent,
  resetMockConnect,
  rowFromAccount,
  setPaymentRecorderForTests,
  statusFromRow,
  sydneyDate,
  type ConnectAccountRow,
  type PaymentRecorder,
} from "@/server/stripe-connect";
import { isStripeConnectConfigured } from "@/server/env";
import type { StripeEvent } from "@/server/stripe";

const STUDIO = "11111111-1111-4111-8111-111111111111";
const ACCOUNT = "acct_studio123";

function linked(patch: Partial<ConnectAccountRow> = {}): ConnectAccountRow {
  return {
    studioId: STUDIO,
    stripeAccountId: ACCOUNT,
    chargesEnabled: true,
    payoutsEnabled: true,
    detailsSubmitted: true,
    businessName: "Clarke Piano",
    livemode: false,
    disconnectedAt: null,
    ...patch,
  };
}

let n = 0;
function event(
  type: string,
  object: Record<string, unknown>,
  account: string | null = ACCOUNT,
): StripeEvent {
  n += 1;
  return {
    id: `evt_${n}`,
    type,
    created: 1_795_000_000,
    ...(account ? { account } : {}),
    data: { object },
  };
}

describe("Stripe Connect helpers", () => {
  it("maps a Stripe account to a link row and status", () => {
    const row = rowFromAccount(
      STUDIO,
      { id: ACCOUNT, charges_enabled: false, details_submitted: true },
      null,
    );
    expect(row.chargesEnabled).toBe(false);
    expect(statusFromRow(row, true).status).toBe("setting_up");
    expect(statusFromRow({ ...row, chargesEnabled: true }, true).status).toBe("connected");
    expect(
      statusFromRow({ ...row, chargesEnabled: true, disconnectedAt: "2026-11-19T00:00:00Z" }, true)
        .status,
    ).toBe("not_connected");
    expect(statusFromRow(null, false)).toMatchObject({
      status: "not_connected",
      configured: false,
    });
  });

  it("works out what is still owing, counting reversals", () => {
    expect(balanceCents(10000, [])).toBe(10000);
    expect(balanceCents(10000, [{ amount_cents: 4000 }])).toBe(6000);
    expect(balanceCents(10000, [{ amount_cents: 4000 }, { amount_cents: -4000 }])).toBe(10000);
    expect(balanceCents(10000, [{ amount_cents: 12000 }])).toBe(0);
  });

  it("uses the Sydney calendar date", () => {
    // 2026-11-19 14:30 UTC is 20 Nov in Sydney (AEDT, UTC+11).
    expect(sydneyDate(Date.UTC(2026, 10, 19, 14, 30) / 1000)).toBe("2026-11-20");
  });

  it("is not configured without the Connect webhook secret", () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_x");
    vi.stubEnv("STRIPE_CONNECT_WEBHOOK_SECRET", "");
    expect(isStripeConnectConfigured()).toBe(false);
    vi.stubEnv("STRIPE_CONNECT_WEBHOOK_SECRET", "whsec_x");
    expect(isStripeConnectConfigured()).toBe(true);
    vi.unstubAllEnvs();
  });
});

describe("Connect webhook", () => {
  const recorded: Parameters<PaymentRecorder>[0][] = [];
  beforeEach(() => {
    recorded.length = 0;
    resetMockConnect([linked({ chargesEnabled: false })]);
    setPaymentRecorderForTests(async (input) => {
      if (recorded.some((r) => r.paymentIntentId === input.paymentIntentId)) return "duplicate";
      recorded.push(input);
      return "recorded";
    });
  });
  afterEach(() => setPaymentRecorderForTests(null));

  it("ignores events that are not from a connected account", async () => {
    expect(await handleConnectEvent(event("account.updated", {}, null))).toMatchObject({
      handled: false,
    });
  });

  it("updates the link when Stripe finishes checking the account", async () => {
    const result = await handleConnectEvent(
      event("account.updated", {
        id: ACCOUNT,
        charges_enabled: true,
        payouts_enabled: true,
        details_submitted: true,
      }),
    );
    expect(result.handled).toBe(true);
    expect((await getConnectStore().get(STUDIO))?.chargesEnabled).toBe(true);
  });

  it("handles each event once", async () => {
    const e = event("account.updated", { id: ACCOUNT, charges_enabled: true });
    await handleConnectEvent(e);
    expect(await handleConnectEvent(e)).toMatchObject({ handled: false, note: "duplicate" });
  });

  it("records a paid card checkout against the invoice", async () => {
    const result = await handleConnectEvent(
      event("checkout.session.completed", {
        id: "cs_1",
        payment_status: "paid",
        amount_total: 24000,
        currency: "aud",
        payment_intent: "pi_1",
        metadata: { invoice_id: "inv-1", studio_id: STUDIO },
      }),
    );
    expect(result).toEqual({ handled: true, note: "recorded" });
    expect(recorded[0]).toMatchObject({
      studioId: STUDIO,
      invoiceId: "inv-1",
      amountCents: 24000,
      method: "stripe_card",
      paymentIntentId: "pi_1",
    });
  });

  it("waits for BECS direct debit to settle, then records it", async () => {
    const pending = await handleConnectEvent(
      event("checkout.session.completed", {
        id: "cs_2",
        payment_status: "unpaid",
        amount_total: 5000,
        payment_intent: "pi_2",
        metadata: { invoice_id: "inv-2", studio_id: STUDIO },
      }),
    );
    expect(pending).toEqual({ handled: true, note: "pending" });
    expect(recorded).toHaveLength(0);
    const settled = await handleConnectEvent(
      event("checkout.session.async_payment_succeeded", {
        id: "cs_2",
        payment_status: "paid",
        amount_total: 5000,
        payment_intent: "pi_2",
        metadata: { invoice_id: "inv-2", studio_id: STUDIO },
      }),
    );
    expect(settled.handled).toBe(true);
    expect(recorded[0]?.method).toBe("stripe_becs");
  });

  it("refuses a checkout whose studio does not match the sending account", async () => {
    const result = await handleConnectEvent(
      event("checkout.session.completed", {
        id: "cs_3",
        payment_status: "paid",
        amount_total: 100,
        payment_intent: "pi_3",
        metadata: { invoice_id: "inv-3", studio_id: "22222222-2222-4222-8222-222222222222" },
      }),
    );
    expect(result.handled).toBe(false);
    expect(recorded).toHaveLength(0);
  });

  it("unlinks when the studio removes Keystone in Stripe", async () => {
    await handleConnectEvent(event("account.application.deauthorized", {}));
    const row = await getConnectStore().get(STUDIO);
    expect(row?.disconnectedAt).toBeTruthy();
    expect(statusFromRow(row, true).status).toBe("not_connected");
  });
});

describe("Connect webhook retries", () => {
  it("processes Stripe's retry when recording the payment failed", async () => {
    resetMockConnect([linked()]);
    let calls = 0;
    setPaymentRecorderForTests(async () => {
      calls += 1;
      if (calls === 1) throw new Error("database down");
      return "recorded";
    });
    const e = event("checkout.session.completed", {
      id: "cs_r",
      payment_status: "paid",
      amount_total: 1000,
      payment_intent: "pi_r",
      metadata: { invoice_id: "inv-r", studio_id: STUDIO },
    });
    await expect(handleConnectEvent(e)).rejects.toThrow("database down");
    expect(await handleConnectEvent(e)).toEqual({ handled: true, note: "recorded" });
    setPaymentRecorderForTests(null);
  });
});

describe("BECS direct debit hold", () => {
  beforeEach(() => {
    resetMockConnect([linked()]);
    setPaymentRecorderForTests(async () => "recorded");
  });
  afterEach(() => setPaymentRecorderForTests(null));
  const session = (payment_status: string) => ({
    id: "cs_becs",
    payment_status,
    amount_total: 5000,
    payment_intent: "pi_becs",
    metadata: { invoice_id: "inv-becs", studio_id: STUDIO },
  });

  it("holds the invoice while the debit is processing, then clears it when it settles", async () => {
    expect(
      await handleConnectEvent(event("checkout.session.completed", session("unpaid"))),
    ).toEqual({
      handled: true,
      note: "pending",
    });
    expect(await getConnectStore().hasPending("inv-becs")).toBe(true);
    await handleConnectEvent(event("checkout.session.async_payment_succeeded", session("paid")));
    expect(await getConnectStore().hasPending("inv-becs")).toBe(false);
  });

  it("clears the hold when the debit fails, so the family can pay again", async () => {
    await handleConnectEvent(event("checkout.session.completed", session("unpaid")));
    await handleConnectEvent(event("checkout.session.async_payment_failed", session("unpaid")));
    expect(await getConnectStore().hasPending("inv-becs")).toBe(false);
  });

  it("marks a deauthorized account so the next link creates a fresh one", async () => {
    await handleConnectEvent(event("account.application.deauthorized", {}));
    expect((await getConnectStore().get(STUDIO))?.deauthorizedAt).toBeTruthy();
  });
});

describe("Events from an account the studio replaced", () => {
  it("still records a late BECS debit from the old account and clears its hold", async () => {
    resetMockConnect([linked({ stripeAccountId: "acct_new", previousAccountIds: [ACCOUNT] })]);
    const recorded: string[] = [];
    setPaymentRecorderForTests(async (input) => {
      recorded.push(input.studioId);
      return "recorded";
    });
    const session = {
      id: "cs_old",
      payment_status: "unpaid",
      amount_total: 5000,
      payment_intent: "pi_old",
      metadata: { invoice_id: "inv-old", studio_id: STUDIO },
    };
    await handleConnectEvent(event("checkout.session.completed", session, ACCOUNT));
    await handleConnectEvent(
      event(
        "checkout.session.async_payment_succeeded",
        { ...session, payment_status: "paid" },
        ACCOUNT,
      ),
    );
    expect(recorded).toEqual([STUDIO]);
    expect(await getConnectStore().hasPending("inv-old")).toBe(false);
    setPaymentRecorderForTests(null);
  });

  it("ignores account updates from the old account", async () => {
    resetMockConnect([linked({ stripeAccountId: "acct_new", previousAccountIds: [ACCOUNT] })]);
    const result = await handleConnectEvent(
      event("account.updated", { charges_enabled: false }, ACCOUNT),
    );
    expect(result.note).toBe("replaced account");
    expect((await getConnectStore().get(STUDIO))?.chargesEnabled).toBe(true);
  });
});
