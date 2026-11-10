import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  accessLevel,
  applyStripeSubscription,
  baseCapReached,
  canRead,
  canWrite,
  dueForSuspension,
  newSubscription,
  type StudioSubscription,
} from "@/lib/subscription";
import { decideStudioAccessGate } from "@/lib/post-login";
import { ProblemError, requireStudioRole, resetMockMemberships } from "@/server/authz";
import { clearEmailOutbox, getEmailOutbox } from "@/server/email";
import { signStripePayload, verifyStripeEvent, type StripeEvent } from "@/server/stripe";
import {
  applyStudioAccessUpdate,
  endOfDaySydney,
  handleStripeEvent,
  runSubscriptionEnforcement,
} from "@/server/subscription";
import {
  getStudioAccess,
  getStudioAccessMany,
  getSubscriptionStore,
  mockSubscription,
  resetMockSubscriptions,
} from "@/server/subscription-store";

const NOW = new Date("2026-11-20T00:00:00Z");
const DAY = 86400000;

function daysFromNow(days: number) {
  return new Date(NOW.getTime() + days * DAY).toISOString();
}

describe("access levels (mirror of app_private.studio_access_level)", () => {
  const cases: Array<[Partial<StudioSubscription>, string]> = [
    [{ status: "active" }, "full"],
    [{ status: "trialing" }, "full"],
    [{ status: "past_due" }, "full"],
    [{ status: "comp" }, "full"],
    [{ status: "pilot", accessEndsAt: daysFromNow(10) }, "full"],
    [{ status: "pilot", accessEndsAt: daysFromNow(-1) }, "owner_read_only"],
    [{ status: "suspended" }, "owner_read_only"],
    [{ status: "incomplete" }, "owner_read_only"],
    [{ status: "canceled", accessEndsAt: daysFromNow(-10) }, "owner_read_only"],
    [{ status: "canceled", accessEndsAt: daysFromNow(-31) }, "none"],
  ];
  for (const [patch, expected] of cases) {
    it(`${patch.status}${patch.accessEndsAt ? ` ending ${patch.accessEndsAt.slice(0, 10)}` : ""} → ${expected}`, () => {
      expect(accessLevel({ ...newSubscription("s"), ...patch }, NOW)).toBe(expected);
    });
  }

  it("no subscription row means no access", () => {
    expect(accessLevel(null, NOW)).toBe("none");
  });

  it("read-only is for the owner only, and nobody writes", () => {
    expect(canRead("owner_read_only", "owner")).toBe(true);
    expect(canRead("owner_read_only", "admin")).toBe(false);
    expect(canRead("owner_read_only", "teacher")).toBe(false);
    expect(canRead("owner_read_only", "guardian")).toBe(false);
    expect(canWrite("owner_read_only")).toBe(false);
    expect(canWrite("full")).toBe(true);
  });

  it("Base caps at 35 students, Pro does not", () => {
    expect(baseCapReached("base", 34)).toBe(false);
    expect(baseCapReached("base", 35)).toBe(true);
    expect(baseCapReached("pro", 500)).toBe(false);
  });
});

describe("suspension timing (MSA 12.2 and 5.8)", () => {
  const base = mockSubscription("s", { status: "past_due", reminderSentAt: daysFromNow(-14) });

  it("suspends 14 days after the reminder", () => {
    expect(dueForSuspension(base, NOW)).toBe(true);
    expect(dueForSuspension({ ...base, reminderSentAt: daysFromNow(-13) }, NOW)).toBe(false);
  });

  it("never suspends without a reminder or while a dispute hold is set", () => {
    expect(dueForSuspension({ ...base, reminderSentAt: null }, NOW)).toBe(false);
    expect(dueForSuspension({ ...base, disputeHold: true }, NOW)).toBe(false);
  });
});

describe("Stripe subscription mapping", () => {
  const prices = { base: "price_base", pro: "price_pro" };
  const at = new Date("2026-11-10T00:00:00Z");

  function stripeSub(status: string, extra: Record<string, unknown> = {}) {
    return {
      id: "sub_1",
      customer: "cus_1",
      status,
      items: { data: [{ price: { id: "price_pro" }, current_period_end: 1795000000 }] },
      ...extra,
    };
  }

  it("active Pro clears any overdue state", () => {
    const next = applyStripeSubscription(
      mockSubscription("s", { status: "suspended", reminderSentAt: "2026-10-01T00:00:00Z" }),
      stripeSub("active"),
      prices,
      at,
    );
    expect(next).toMatchObject({
      status: "active",
      plan: "pro",
      reminderSentAt: null,
      suspendedAt: null,
    });
    expect(next.stripeCustomerId).toBe("cus_1");
  });

  it("Stripe past_due does not lift a Keystone suspension", () => {
    const next = applyStripeSubscription(
      mockSubscription("s", { status: "suspended" }),
      stripeSub("past_due"),
      prices,
      at,
    );
    expect(next.status).toBe("suspended");
  });

  it("canceled records when access ended", () => {
    const next = applyStripeSubscription(
      mockSubscription("s", { status: "active" }),
      stripeSub("canceled", { ended_at: 1794000000 }),
      prices,
      at,
    );
    expect(next.status).toBe("canceled");
    expect(next.accessEndsAt).toBe(new Date(1794000000 * 1000).toISOString());
  });

  it("an unpaid checkout does not take away a pilot", () => {
    const next = applyStripeSubscription(
      mockSubscription("s", { status: "pilot" }),
      stripeSub("incomplete"),
      prices,
      at,
    );
    expect(next.status).toBe("pilot");
  });
});

describe("Stripe webhook signature", () => {
  const secret = "whsec_test";
  const payload = JSON.stringify({ id: "evt_1", type: "ping", created: 1, data: { object: {} } });

  it("accepts a valid signature", () => {
    const now = 1_800_000_000;
    const header = signStripePayload(payload, secret, now);
    expect(verifyStripeEvent(payload, header, secret, now).id).toBe("evt_1");
  });

  it("rejects a tampered body, a wrong secret and an old timestamp", () => {
    const now = 1_800_000_000;
    const header = signStripePayload(payload, secret, now);
    expect(() => verifyStripeEvent(payload.replace("ping", "pong"), header, secret, now)).toThrow(
      ProblemError,
    );
    expect(() => verifyStripeEvent(payload, header, "whsec_other", now)).toThrow(ProblemError);
    expect(() => verifyStripeEvent(payload, header, secret, now + 301)).toThrow(ProblemError);
    expect(() => verifyStripeEvent(payload, null, secret, now)).toThrow(ProblemError);
  });
});

describe("webhook handling and enforcement (mock store)", () => {
  const owners = { "studio-1": { email: "owner@example.com", studioName: "Studio One" } };

  beforeEach(() => {
    vi.stubEnv("STRIPE_PRICE_BASE", "price_base");
    vi.stubEnv("STRIPE_PRICE_PRO", "price_pro");
    clearEmailOutbox();
    resetMockSubscriptions([mockSubscription("studio-1", { status: "incomplete" })], owners);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    resetMockSubscriptions();
  });

  function event(
    id: string,
    type: string,
    object: Record<string, unknown>,
    created = 1_794_000_000,
  ): StripeEvent {
    return { id, type, created, data: { object } };
  }

  it("checkout + subscription events turn a new studio active", async () => {
    await handleStripeEvent(
      event("evt_c", "checkout.session.completed", {
        mode: "subscription",
        client_reference_id: "studio-1",
        customer: "cus_1",
        subscription: "sub_1",
      }),
    );
    const result = await handleStripeEvent(
      event("evt_s", "customer.subscription.created", {
        id: "sub_1",
        customer: "cus_1",
        status: "active",
        metadata: { studio_id: "studio-1" },
        items: { data: [{ price: { id: "price_base" } }] },
      }),
    );
    expect(result).toMatchObject({ outcome: "applied", status: "active" });
    const saved = await getSubscriptionStore().get("studio-1");
    expect(saved).toMatchObject({ status: "active", plan: "base", stripeSubscriptionId: "sub_1" });
  });

  it("is idempotent and ignores connected-account events", async () => {
    const e = event("evt_dup", "invoice.payment_failed", { customer: "cus_1" });
    await getSubscriptionStore().save(
      mockSubscription("studio-1", { status: "active", stripeCustomerId: "cus_1" }),
    );
    expect((await handleStripeEvent(e)).outcome).toBe("applied");
    expect((await handleStripeEvent(e)).outcome).toBe("duplicate");
    expect((await handleStripeEvent({ ...e, id: "evt_connect", account: "acct_1" })).outcome).toBe(
      "ignored",
    );
  });

  it("a failed payment reminds the owner once, then the job suspends 14 days later", async () => {
    await getSubscriptionStore().save(
      mockSubscription("studio-1", { status: "active", stripeCustomerId: "cus_1" }),
    );
    const failedAt = 1_794_000_000;
    await handleStripeEvent(
      event("evt_f1", "invoice.payment_failed", { customer: "cus_1" }, failedAt),
    );
    await handleStripeEvent(
      event("evt_f2", "invoice.payment_failed", { customer: "cus_1" }, failedAt + 3 * 86400),
    );

    const reminders = getEmailOutbox().filter((m) =>
      m.tags?.some((t) => t.value === "subscription_payment_reminder"),
    );
    expect(reminders).toHaveLength(1);
    expect(reminders[0]?.to).toBe("owner@example.com");
    expect((await getSubscriptionStore().get("studio-1"))?.status).toBe("past_due");

    const day13 = new Date((failedAt + 13 * 86400) * 1000);
    expect((await runSubscriptionEnforcement(day13)).suspended).toEqual([]);
    const day14 = new Date((failedAt + 14 * 86400) * 1000);
    expect((await runSubscriptionEnforcement(day14)).suspended).toEqual(["studio-1"]);
    expect((await getSubscriptionStore().get("studio-1"))?.status).toBe("suspended");
    expect(
      getEmailOutbox().some((m) => m.tags?.some((t) => t.value === "subscription_suspended")),
    ).toBe(true);

    // Paying restores access
    await handleStripeEvent(
      event("evt_paid", "invoice.paid", { customer: "cus_1" }, failedAt + 15 * 86400),
    );
    expect((await getSubscriptionStore().get("studio-1"))?.status).toBe("active");
  });

  it("a dispute hold stops suspension", async () => {
    await getSubscriptionStore().save(
      mockSubscription("studio-1", {
        status: "past_due",
        reminderSentAt: "2026-10-01T00:00:00Z",
        disputeHold: true,
      }),
    );
    expect((await runSubscriptionEnforcement(NOW)).suspended).toEqual([]);
  });

  it("ignores subscription events older than the last one applied", async () => {
    await getSubscriptionStore().save(
      mockSubscription("studio-1", {
        status: "canceled",
        stripeSubscriptionId: "sub_1",
        lastStripeEventAt: new Date(1_794_000_100 * 1000).toISOString(),
      }),
    );
    const result = await handleStripeEvent(
      event(
        "evt_old",
        "customer.subscription.updated",
        { id: "sub_1", customer: "cus_1", status: "active" },
        1_794_000_000,
      ),
    );
    expect(result.outcome).toBe("ignored");
    expect((await getSubscriptionStore().get("studio-1"))?.status).toBe("canceled");
  });

  it("admin can give pilot access with an end date, but not to a paying studio", async () => {
    const saved = await applyStudioAccessUpdate("studio-1", {
      status: "pilot",
      plan: "pro",
      accessEndsOn: "2027-05-17",
    });
    expect(saved).toMatchObject({ status: "pilot", plan: "pro" });
    expect(saved.accessEndsAt).toBe("2027-05-17T13:59:59.000Z");

    await getSubscriptionStore().save(
      mockSubscription("studio-1", { status: "active", stripeSubscriptionId: "sub_1" }),
    );
    await expect(applyStudioAccessUpdate("studio-1", { status: "comp" })).rejects.toMatchObject({
      status: 409,
    });
  });

  it("end of day uses the Sydney offset for the date", () => {
    expect(endOfDaySydney("2026-11-30")).toBe("2026-11-30T12:59:59.000Z");
    expect(endOfDaySydney("2026-06-30")).toBe("2026-06-30T13:59:59.000Z");
  });
});

describe("server-side gate (service-key paths)", () => {
  beforeEach(() => {
    resetMockMemberships([
      { userId: "owner-a", studioId: "studio-1", role: "owner" },
      { userId: "teacher-a", studioId: "studio-1", role: "teacher" },
    ]);
    resetMockSubscriptions([mockSubscription("studio-1", { status: "suspended" })]);
  });

  afterEach(() => {
    resetMockMemberships();
    resetMockSubscriptions();
  });

  it("a paused studio refuses writes with 402 studio_paused", async () => {
    await expect(requireStudioRole("teacher-a", "studio-1", ["teacher"])).rejects.toMatchObject({
      status: 402,
      code: "studio_paused",
    });
    await expect(requireStudioRole("owner-a", "studio-1", ["owner"])).rejects.toMatchObject({
      status: 402,
    });
  });

  it("the owner can still read; the teacher cannot", async () => {
    await expect(
      requireStudioRole("owner-a", "studio-1", ["owner"], { access: "read" }),
    ).resolves.toBe("owner");
    await expect(
      requireStudioRole("teacher-a", "studio-1", ["teacher"], { access: "read" }),
    ).rejects.toMatchObject({ status: 402 });
  });

  it("billing paths skip the gate so an owner can pay", async () => {
    await expect(
      requireStudioRole("owner-a", "studio-1", ["owner"], { access: "skip" }),
    ).resolves.toBe("owner");
  });

  it("a studio with no row is unaffected in mock mode", async () => {
    resetMockSubscriptions();
    await expect(requireStudioRole("teacher-a", "studio-1", ["teacher"])).resolves.toBe("teacher");
  });
});

describe("sign-in access gate", () => {
  const account = {
    userId: "u",
    email: null,
    aal: "aal2",
    platformStaff: null,
    memberships: [],
    guardianFamilyIds: [],
  };

  it("platform staff and full-access studios get in", () => {
    expect(
      decideStudioAccessGate({
        ...account,
        platformStaff: { role: "platform_admin", displayName: "A" },
        studioAccess: [],
      }).kind,
    ).toBe("ok");
    expect(
      decideStudioAccessGate({
        ...account,
        studioAccess: [
          {
            studioId: "a",
            role: "teacher",
            level: "owner_read_only",
            status: "suspended",
            plan: "base",
            accessEndsAt: null,
          },
          {
            studioId: "b",
            role: "teacher",
            level: "full",
            status: "active",
            plan: "pro",
            accessEndsAt: null,
          },
        ],
      }).kind,
    ).toBe("ok");
  });

  it("owner of a paused studio gets read-only; teacher and guardian see paused", () => {
    expect(
      decideStudioAccessGate({
        ...account,
        studioAccess: [
          {
            studioId: "a",
            role: "owner",
            level: "owner_read_only",
            status: "suspended",
            plan: "base",
            accessEndsAt: null,
          },
        ],
      }),
    ).toEqual({ kind: "read_only", studioId: "a" });
    expect(
      decideStudioAccessGate({
        ...account,
        studioAccess: [
          {
            studioId: "a",
            role: "guardian",
            level: "owner_read_only",
            status: "suspended",
            plan: "base",
            accessEndsAt: null,
          },
        ],
      }),
    ).toEqual({ kind: "paused", ownerStudioId: null, ended: false });
  });

  it("owner past the export window sees the ended screen", () => {
    expect(
      decideStudioAccessGate({
        ...account,
        studioAccess: [
          {
            studioId: "a",
            role: "owner",
            level: "none",
            status: "canceled",
            plan: "base",
            accessEndsAt: null,
          },
        ],
      }),
    ).toEqual({ kind: "paused", ownerStudioId: "a", ended: true });
  });
});

describe("batched studio access (speed fix)", () => {
  it("matches getStudioAccess for every studio in one call", async () => {
    resetMockSubscriptions([
      mockSubscription("a", { status: "active" }),
      mockSubscription("b", { status: "suspended", reminderSentAt: "2026-10-01T00:00:00Z" }),
    ]);
    const ids = ["a", "b", "no-row"];
    const many = await getStudioAccessMany(ids, NOW);
    expect([...many.keys()]).toEqual(ids);
    for (const id of ids) {
      expect(many.get(id)).toEqual(await getStudioAccess(id, NOW));
    }
    resetMockSubscriptions();
  });

  it("returns an empty map for no studios", async () => {
    expect((await getSubscriptionStore().getMany([])).size).toBe(0);
  });
});
