import { beforeEach, describe, expect, it } from "vitest";
import { clearEmailOutbox, getEmailOutbox } from "@/server/email";
import { outboxEmailProvider } from "@/server/email/outbox";
import {
  isQuietHour,
  localParts,
  runNotifications,
  type ChatCandidate,
  type LogKey,
  type MarkingCandidate,
  type NewsCandidate,
  type NotificationStore,
} from "@/server/notifications";
import { chatNotificationEmail } from "@/server/email/templates/notification";

const STUDIO = {
  studio_id: "s1",
  studio_name: "Clarke Piano Studio",
  timezone: "Australia/Sydney",
};
const GUARDIAN = {
  recipient_user_id: "g1",
  recipient_email: "parent@example.com",
  recipient_name: "Parent",
  recipient_lang: "en",
};
// 10:00 and 07:15 and 22:00 in Sydney (AEDT, UTC+11) on 12 Nov 2026.
const MORNING = new Date("2026-11-11T23:00:00Z");
const SEVEN = new Date("2026-11-11T20:15:00Z");
const NIGHT = new Date("2026-11-12T11:00:00Z");

function chat(patch: Partial<ChatCandidate> = {}): ChatCandidate {
  return {
    ...STUDIO,
    ...GUARDIAN,
    conversation_id: "c1",
    family_id: "f1",
    family_name: "Nguyen family",
    direction: "to_family",
    oldest_unread_id: "m1",
    unread_count: 2,
    latest_author: "Ms Clarke",
    ...patch,
  };
}

function news(patch: Partial<NewsCandidate> = {}): NewsCandidate {
  return {
    ...STUDIO,
    ...GUARDIAN,
    post_id: "p1",
    title: "Concert on Saturday",
    author_name: "Ms Clarke",
    important: true,
    publish_at: new Date(SEVEN.getTime() - 3_600_000).toISOString(),
    family_id: "f1",
    ...patch,
  };
}

function fakeStore(data: {
  chat?: ChatCandidate[];
  news?: NewsCandidate[];
  marking?: MarkingCandidate[];
  sent?: number;
}) {
  const log = new Set<string>();
  const store: NotificationStore & { log: Set<string> } = {
    log,
    chatCandidates: async () =>
      (data.chat ?? []).filter(
        (r) => !log.has(`${r.recipient_user_id}|chat|${r.oldest_unread_id}`),
      ),
    newsCandidates: async () =>
      (data.news ?? []).filter((r) => !log.has(`${r.recipient_user_id}|news|${r.post_id}`)),
    markingCandidates: async () => data.marking ?? [],
    tokens: async (ids) => new Map(ids.map((id) => [id, "11111111-1111-4111-8111-111111111111"])),
    sentSince: async () => data.sent ?? 0,
    claim: async (keys: LogKey[]) =>
      keys.filter((k) => {
        const id = `${k.userId}|${k.kind}|${k.key}`;
        if (log.has(id)) return false;
        log.add(id);
        return true;
      }),
    markSent: async () => {},
    release: async (keys) => keys.forEach((k) => log.delete(`${k.userId}|${k.kind}|${k.key}`)),
  };
  return store;
}

beforeEach(() => clearEmailOutbox());

describe("studio-local time", () => {
  it("knows Sydney hours and quiet hours", () => {
    expect(localParts(MORNING, "Australia/Sydney")).toEqual({ hour: 10, date: "2026-11-12" });
    expect(isQuietHour(MORNING, "Australia/Sydney")).toBe(false);
    expect(isQuietHour(NIGHT, "Australia/Sydney")).toBe(true);
    expect(isQuietHour(SEVEN, "Australia/Sydney")).toBe(false);
  });
});

describe("notification job", () => {
  it("emails an unread chat once, without the message text", async () => {
    const store = fakeStore({ chat: [chat()] });
    const first = await runNotifications({ now: MORNING, store, provider: outboxEmailProvider });
    expect(first.chatEmails).toBe(1);
    const [mail] = getEmailOutbox();
    expect(mail?.to).toBe("parent@example.com");
    expect(mail?.subject).toBe("2 new messages from Clarke Piano Studio");
    expect(mail?.html).toContain("keystone-music-hq-email-logo.png");
    expect(mail?.headers?.["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
    const again = await runNotifications({ now: MORNING, store, provider: outboxEmailProvider });
    expect(again.chatEmails).toBe(0);
  });

  it("holds emails in quiet hours", async () => {
    const result = await runNotifications({
      now: NIGHT,
      store: fakeStore({ chat: [chat()], news: [news()] }),
      provider: outboxEmailProvider,
    });
    expect(result.chatEmails + result.newsEmails).toBe(0);
    expect(result.heldForQuietHours).toBe(2);
  });

  it("groups a teacher's unread chats into one email", async () => {
    const staff = {
      recipient_user_id: "o1",
      recipient_email: "owner@example.com",
      recipient_lang: "en",
      direction: "to_studio" as const,
    };
    const result = await runNotifications({
      now: MORNING,
      store: fakeStore({
        chat: [
          chat({
            ...staff,
            conversation_id: "c1",
            oldest_unread_id: "m1",
            family_name: "Nguyen family",
            unread_count: 1,
          }),
          chat({
            ...staff,
            conversation_id: "c2",
            oldest_unread_id: "m9",
            family_name: "Smith family",
            unread_count: 3,
          }),
        ],
      }),
      provider: outboxEmailProvider,
    });
    expect(result.chatEmails).toBe(1);
    expect(getEmailOutbox()[0]?.subject).toBe("4 unread messages from 2 families");
  });

  it("sends important news now and the rest in the 7am summary", async () => {
    const store = fakeStore({
      news: [news(), news({ post_id: "p2", important: false, title: "Holiday dates" })],
      marking: [
        {
          ...STUDIO,
          ...GUARDIAN,
          family_id: "f1",
          student_id: "st1",
          student_first_name: "Edi",
          feedback_count: 2,
        },
      ],
    });
    const result = await runNotifications({ now: SEVEN, store, provider: outboxEmailProvider });
    expect(result.newsEmails).toBe(1);
    expect(result.summaryEmails).toBe(1);
    const summary = getEmailOutbox().find((m) => m.subject.startsWith("Your daily update"));
    expect(summary?.text).toContain("News: Holiday dates");
    expect(summary?.text).toContain("2 new teacher comments");
    expect(summary?.text).not.toContain("Edi");
    // Outside 7am there is no summary.
    clearEmailOutbox();
    const later = await runNotifications({
      now: MORNING,
      store: fakeStore({ news: [news({ important: false })] }),
      provider: outboxEmailProvider,
    });
    expect(later.summaryEmails).toBe(0);
  });

  it("stops at the daily limit", async () => {
    const result = await runNotifications({
      now: MORNING,
      store: fakeStore({ chat: [chat()], sent: 70 }),
      provider: outboxEmailProvider,
    });
    expect(result.chatEmails).toBe(0);
    expect(result.heldForDailyLimit).toBe(1);
  });

  it("releases the claim when sending fails, so the next run retries", async () => {
    const store = fakeStore({ chat: [chat()] });
    const failing = {
      send: async () => {
        throw new Error("Resend down");
      },
    };
    const result = await runNotifications({ now: MORNING, store, provider: failing });
    expect(result.failed).toBe(1);
    expect(store.log.size).toBe(0);
  });
});

describe("chat email template", () => {
  it("escapes names and writes Chinese for zh-CN guardians", () => {
    const mail = chatNotificationEmail({
      appUrl: "https://keystonemusichq.com",
      lang: "zh-CN",
      to: "p@example.com",
      side: "family",
      studioName: "<b>Studio</b>",
      threads: [{ conversationId: "c1", from: "Studio", latestAuthor: "Ms C", unreadCount: 1 }],
      token: "t",
    });
    expect(mail.subject).toContain("新消息");
    expect(mail.html).not.toContain("<b>Studio</b>");
    expect(mail.html).toContain("&lt;b&gt;Studio&lt;/b&gt;");
  });
});
