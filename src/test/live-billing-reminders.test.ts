import { describe, expect, it, vi } from "vitest";
import {
  runLiveBillingReminders,
  studioLocalDate,
  type LiveBillingReminderStore,
  type LiveReminderCandidate,
} from "@/server/billing-reminders";
import type { EmailProvider } from "@/server/email";

function baseCandidate(
  overrides: Partial<LiveReminderCandidate> = {},
): LiveReminderCandidate {
  return {
    studio_id: "studio-1",
    studio_name: "Pilot Piano",
    studio_timezone: "Australia/Sydney",
    reply_to_email: "hello@pilot.example",
    family_id: "fam-1",
    family_name: "Chen family",
    is_example: false,
    invoice_id: "inv-1",
    invoice_number: "INV-12",
    due_date: "2026-11-01",
    balance_cents: 21000,
    status: "sent",
    bill_to_guardian_id: "g-1",
    guardian_email: "parent@example.com",
    pre_due_reminder_days: 3,
    existing_kinds: [],
    ...overrides,
  };
}

describe("live billing reminders (S5)", () => {
  it("formats the studio-local calendar date", () => {
    // 13 Nov 2026 20:00 UTC → 14 Nov in Sydney (AEDT, UTC+11)
    expect(studioLocalDate(new Date("2026-11-13T20:00:00Z"), "Australia/Sydney")).toBe(
      "2026-11-14",
    );
  });

  it("sends an overdue reminder once and skips demo/example rows", async () => {
    const claimed: string[] = [];
    const store: LiveBillingReminderStore = {
      async candidates() {
        return [
          baseCandidate(),
          baseCandidate({
            invoice_id: "inv-example",
            is_example: true,
            guardian_email: "sam.example@example.com",
          }),
        ];
      },
      async claimEvent(_studioId, invoiceId, kind) {
        claimed.push(`${kind}:${invoiceId}`);
        return true;
      },
    };
    const send = vi.fn(async () => ({ id: "mail-1" }));
    const mail: EmailProvider = { send };

    const first = await runLiveBillingReminders({
      store,
      mail,
      now: new Date("2026-11-13T01:00:00Z"),
      emailFrom: "Keystone Music HQ <invites@mail.keystonemusichq.com>",
    });
    expect(first.actions).toEqual(["overdue_reminder:inv-1"]);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]?.[0].to).toBe("parent@example.com");
    expect(send.mock.calls[0]?.[0].from).toContain("Pilot Piano");
    expect(send.mock.calls[0]?.[0].replyTo).toBe("hello@pilot.example");
    expect(claimed).toEqual(["reminder_overdue:inv-1"]);

    // Second run: event already present → no duplicate send.
    const storeAgain: LiveBillingReminderStore = {
      async candidates() {
        return [baseCandidate({ existing_kinds: ["reminder_overdue"] })];
      },
      async claimEvent() {
        throw new Error("should not claim again");
      },
    };
    const second = await runLiveBillingReminders({
      store: storeAgain,
      mail,
      now: new Date("2026-11-13T01:00:00Z"),
      emailFrom: "Keystone Music HQ <invites@mail.keystonemusichq.com>",
    });
    expect(second.actions).toEqual([]);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("sends a pre-due reminder on the configured lead day", async () => {
    const send = vi.fn(async () => ({ id: "mail-2" }));
    const store: LiveBillingReminderStore = {
      async candidates() {
        return [
          baseCandidate({
            invoice_id: "inv-pre",
            due_date: "2026-11-16",
            existing_kinds: [],
          }),
        ];
      },
      async claimEvent() {
        return true;
      },
    };
    // Sydney 13 Nov → pre-due when due is 16 Nov and lead days = 3
    const result = await runLiveBillingReminders({
      store,
      mail: { send },
      now: new Date("2026-11-12T20:00:00Z"),
      emailFrom: "Keystone <invites@mail.keystonemusichq.com>",
    });
    expect(result.actions).toEqual(["pre_due:inv-pre"]);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]?.[0].subject).toMatch(/due soon/i);
  });
});
