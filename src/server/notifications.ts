/**
 * Notification emails (0018). Run every 15 minutes by /api/cron/notifications.
 *
 * 1. Chat: a message still unread after 15 minutes emails the other side once (guardians for a
 *    teacher's message; the studio owner and teachers for a family's message). No more emails for
 *    that chat until someone reads it and a new message arrives. One email per person per run,
 *    listing every waiting chat.
 * 2. Important news: emailed to the post's families when it goes live.
 * 3. Daily summary at 7am studio time: normal news posts and teacher feedback shared with the
 *    family in the last 24 hours, only when there is something new.
 *
 * Nothing is sent 9pm to 7am studio time; it waits for the next run after 7am. Sends stop at
 * NOTIFY_DAILY_LIMIT per rolling 24 hours (Resend free plan: 100 a day, shared with sign-in
 * emails); chat goes first, then important news, then summaries. Demo studios and example
 * families never get emails. Emails say who wrote and how many, never message text or a
 * child's name.
 */
import { getServerEnv, isMockOnboarding } from "./env";
import { getEmailProvider, type EmailProvider } from "./email";
import { createServiceSupabase } from "./supabase";
import {
  chatNotificationEmail,
  dailySummaryEmail,
  importantNewsEmail,
  type BuiltEmail,
  type ChatThread,
  type NotificationLang,
} from "./email/templates/notification";

export const CHAT_DELAY_MINUTES = 15;
const CHAT_MAX_AGE_DAYS = 3;
const NEWS_MAX_AGE_HOURS = 48;
export const QUIET_FROM_HOUR = 21;
export const QUIET_UNTIL_HOUR = 7;
export const SUMMARY_HOUR = 7;

type Recipient = {
  recipient_user_id: string;
  recipient_email: string;
  recipient_name: string;
  recipient_lang: string;
};

type StudioCols = { studio_id: string; studio_name: string; timezone: string };

export type ChatCandidate = StudioCols &
  Recipient & {
    conversation_id: string;
    family_id: string;
    family_name: string;
    direction: "to_family" | "to_studio";
    oldest_unread_id: string;
    unread_count: number;
    latest_author: string;
  };

export type NewsCandidate = StudioCols &
  Recipient & {
    post_id: string;
    title: string;
    author_name: string;
    important: boolean;
    publish_at: string;
    family_id: string;
  };

export type MarkingCandidate = StudioCols &
  Recipient & {
    family_id: string;
    student_id: string;
    student_first_name: string;
    feedback_count: number;
  };

export type LogKey = {
  userId: string;
  studioId: string;
  kind: "chat" | "news" | "digest";
  key: string;
};

/** Storage for the job. Service key only: the cron route has already checked CRON_SECRET. */
export interface NotificationStore {
  chatCandidates(minAgeMinutes: number, maxAgeDays: number): Promise<ChatCandidate[]>;
  newsCandidates(since: Date): Promise<NewsCandidate[]>;
  markingCandidates(since: Date): Promise<MarkingCandidate[]>;
  /** Unsubscribe tokens, creating a preference row where the person has none. */
  tokens(userIds: string[]): Promise<Map<string, string>>;
  sentSince(since: Date): Promise<number>;
  /** Inserts log rows; returns the keys that were new (others were already sent or claimed). */
  claim(keys: LogKey[]): Promise<LogKey[]>;
  markSent(keys: LogKey[], resendId: string): Promise<void>;
  release(keys: LogKey[]): Promise<void>;
}

// ---------------------------------------------------------------------------
// Time helpers (studio-local)
// ---------------------------------------------------------------------------

export function localParts(now: Date, timeZone: string): { hour: number; date: string } {
  let zone = timeZone;
  try {
    new Intl.DateTimeFormat("en-AU", { timeZone: zone });
  } catch {
    zone = "Australia/Sydney";
  }
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  return { hour: Number(get("hour")) % 24, date: `${get("year")}-${get("month")}-${get("day")}` };
}

export function isQuietHour(now: Date, timeZone: string): boolean {
  const { hour } = localParts(now, timeZone);
  return hour >= QUIET_FROM_HOUR || hour < QUIET_UNTIL_HOUR;
}

function lang(value: string): NotificationLang {
  return value === "zh-CN" ? "zh-CN" : "en";
}

function groupBy<T>(rows: T[], key: (row: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const k = key(row);
    const list = map.get(k);
    if (list) list.push(row);
    else map.set(k, [row]);
  }
  return map;
}

// ---------------------------------------------------------------------------
// The job
// ---------------------------------------------------------------------------

export type NotificationRunResult = {
  chatEmails: number;
  newsEmails: number;
  summaryEmails: number;
  failed: number;
  heldForQuietHours: number;
  heldForDailyLimit: number;
};

export async function runNotifications(options?: {
  now?: Date;
  store?: NotificationStore;
  provider?: EmailProvider;
}): Promise<NotificationRunResult> {
  const now = options?.now ?? new Date();
  const store = options?.store ?? getNotificationStore();
  const provider = options?.provider ?? getEmailProvider();
  const env = getServerEnv();
  const result: NotificationRunResult = {
    chatEmails: 0,
    newsEmails: 0,
    summaryEmails: 0,
    failed: 0,
    heldForQuietHours: 0,
    heldForDailyLimit: 0,
  };
  let budget = env.notifyDailyLimit - (await store.sentSince(new Date(now.getTime() - 86_400_000)));

  type Job = {
    userId: string;
    to: string;
    keys: LogKey[];
    build: (token: string) => BuiltEmail;
    kind: keyof Pick<NotificationRunResult, "chatEmails" | "newsEmails" | "summaryEmails">;
  };
  const jobs: Job[] = [];

  // 1. Chat
  const chats = (await store.chatCandidates(CHAT_DELAY_MINUTES, CHAT_MAX_AGE_DAYS)).filter(
    (row) => {
      if (!isQuietHour(now, row.timezone)) return true;
      result.heldForQuietHours += 1;
      return false;
    },
  );
  for (const rows of groupBy(
    chats,
    (r) => `${r.recipient_user_id}|${r.studio_id}|${r.direction}`,
  ).values()) {
    const first = rows[0]!;
    const side = first.direction === "to_family" ? "family" : "studio";
    const threads: ChatThread[] = rows.map((r) => ({
      conversationId: r.conversation_id,
      from: side === "family" ? r.studio_name : r.family_name,
      latestAuthor: r.latest_author,
      unreadCount: r.unread_count,
    }));
    jobs.push({
      userId: first.recipient_user_id,
      to: first.recipient_email,
      kind: "chatEmails",
      keys: rows.map((r) => ({
        userId: r.recipient_user_id,
        studioId: r.studio_id,
        kind: "chat",
        key: r.oldest_unread_id,
      })),
      build: (token) =>
        chatNotificationEmail({
          appUrl: env.appUrl,
          lang: lang(first.recipient_lang),
          to: first.recipient_email,
          side,
          studioName: first.studio_name,
          threads,
          token,
        }),
    });
  }

  // 2. Important news, and 3. the daily summary
  const news = await store.newsCandidates(new Date(now.getTime() - NEWS_MAX_AGE_HOURS * 3_600_000));
  const dedupedNews = [...groupBy(news, (r) => `${r.recipient_user_id}|${r.post_id}`).values()].map(
    (g) => g[0]!,
  );
  for (const row of dedupedNews.filter((r) => r.important)) {
    if (isQuietHour(now, row.timezone)) {
      result.heldForQuietHours += 1;
      continue;
    }
    jobs.push({
      userId: row.recipient_user_id,
      to: row.recipient_email,
      kind: "newsEmails",
      keys: [
        { userId: row.recipient_user_id, studioId: row.studio_id, kind: "news", key: row.post_id },
      ],
      build: (token) =>
        importantNewsEmail({
          appUrl: env.appUrl,
          lang: lang(row.recipient_lang),
          to: row.recipient_email,
          studioName: row.studio_name,
          title: row.title,
          authorName: row.author_name,
          token,
        }),
    });
  }

  const daySince = new Date(now.getTime() - 86_400_000);
  const summaryNews = dedupedNews.filter(
    (r) =>
      !r.important &&
      new Date(r.publish_at) > daySince &&
      localParts(now, r.timezone).hour === SUMMARY_HOUR,
  );
  const marking = (await store.markingCandidates(daySince)).filter(
    (r) => localParts(now, r.timezone).hour === SUMMARY_HOUR,
  );
  const summaryRecipients = new Map<
    string,
    { studio: StudioCols; who: Recipient; titles: string[]; feedback: number }
  >();
  const entry = (row: StudioCols & Recipient) => {
    const k = `${row.recipient_user_id}|${row.studio_id}`;
    let e = summaryRecipients.get(k);
    if (!e) {
      e = { studio: row, who: row, titles: [], feedback: 0 };
      summaryRecipients.set(k, e);
    }
    return e;
  };
  for (const row of summaryNews) entry(row).titles.push(row.title);
  for (const row of marking) entry(row).feedback += row.feedback_count;
  for (const e of summaryRecipients.values()) {
    if (!e.titles.length && !e.feedback) continue;
    const date = localParts(now, e.studio.timezone).date;
    jobs.push({
      userId: e.who.recipient_user_id,
      to: e.who.recipient_email,
      kind: "summaryEmails",
      keys: [
        {
          userId: e.who.recipient_user_id,
          studioId: e.studio.studio_id,
          kind: "digest",
          key: `${e.studio.studio_id}:${date}`,
        },
      ],
      build: (token) =>
        dailySummaryEmail({
          appUrl: env.appUrl,
          lang: lang(e.who.recipient_lang),
          to: e.who.recipient_email,
          studioName: e.studio.studio_name,
          newsTitles: e.titles,
          feedbackCount: e.feedback,
          token,
        }),
    });
  }

  if (!jobs.length) return result;
  const tokens = await store.tokens([...new Set(jobs.map((j) => j.userId))]);

  for (const job of jobs) {
    if (budget <= 0) {
      result.heldForDailyLimit += 1;
      continue;
    }
    const token = tokens.get(job.userId);
    if (!token) continue;
    const claimed = await store.claim(job.keys);
    if (claimed.length === 0) continue;
    const mail = job.build(token);
    try {
      const sent = await provider.send({
        to: job.to,
        from: env.emailFrom,
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
        headers: {
          "List-Unsubscribe": `<${mail.unsubscribeUrl}>`,
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        },
        tags: [{ name: "kind", value: `notify_${job.kind.replace("Emails", "")}` }],
      });
      await store.markSent(claimed, sent.id);
      result[job.kind] += 1;
      budget -= 1;
    } catch (error) {
      console.error("notification email failed", error instanceof Error ? error.message : error);
      await store.release(claimed);
      result.failed += 1;
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Unsubscribe link
// ---------------------------------------------------------------------------

export const UNSUBSCRIBE_KINDS = ["chat", "news", "marking", "summary", "all"] as const;
export type UnsubscribeKind = (typeof UNSUBSCRIBE_KINDS)[number];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function unsubscribe(token: string, kind: string): Promise<boolean> {
  if (!UUID.test(token) || !(UNSUBSCRIBE_KINDS as readonly string[]).includes(kind)) return false;
  if (isMockOnboarding()) return mockUnsubscribes.push({ token, kind }) > 0;
  const { data, error } = await createServiceSupabase().rpc("notify_unsubscribe", {
    p_token: token,
    p_kind: kind,
  });
  if (error) throw new Error(error.message);
  return data === true;
}

export const mockUnsubscribes: { token: string; kind: string }[] = [];

// ---------------------------------------------------------------------------
// Stores
// ---------------------------------------------------------------------------

let storeOverride: NotificationStore | null = null;
export function setNotificationStoreForTests(store: NotificationStore | null) {
  storeOverride = store;
}

const emptyStore: NotificationStore = {
  chatCandidates: async () => [],
  newsCandidates: async () => [],
  markingCandidates: async () => [],
  tokens: async () => new Map(),
  sentSince: async () => 0,
  claim: async (keys) => keys,
  markSent: async () => {},
  release: async () => {},
};

export function getNotificationStore(): NotificationStore {
  if (storeOverride) return storeOverride;
  if (isMockOnboarding()) return emptyStore;
  return supabaseNotificationStore();
}

function supabaseNotificationStore(): NotificationStore {
  const db = createServiceSupabase();
  const rpc = async <T>(fn: string, args: Record<string, unknown>): Promise<T[]> => {
    const { data, error } = await db.rpc(fn, args);
    if (error) throw new Error(`${fn}: ${error.message}`);
    return (data ?? []) as T[];
  };
  const toRows = (keys: LogKey[]) =>
    keys.map((k) => ({
      user_id: k.userId,
      studio_id: k.studioId,
      kind: k.kind,
      dedupe_key: k.key,
    }));
  const match = (keys: LogKey[]) =>
    keys
      .map((k) => `and(user_id.eq.${k.userId},kind.eq.${k.kind},dedupe_key.eq.${k.key})`)
      .join(",");
  return {
    chatCandidates: (minAge, maxAge) =>
      rpc<ChatCandidate>("notify_chat_candidates", {
        p_min_age: `${minAge} minutes`,
        p_max_age: `${maxAge} days`,
      }),
    newsCandidates: (since) =>
      rpc<NewsCandidate>("notify_news_candidates", { p_since: since.toISOString() }),
    markingCandidates: (since) =>
      rpc<MarkingCandidate>("notify_marking_candidates", { p_since: since.toISOString() }),
    async tokens(userIds) {
      const rows = await rpc<{ user_id: string; unsubscribe_token: string }>(
        "notify_ensure_preferences",
        {
          p_user_ids: userIds,
        },
      );
      return new Map(rows.map((r) => [r.user_id, r.unsubscribe_token]));
    },
    async sentSince(since) {
      // A claim left by a run that died mid-send would block that email forever; clear old ones.
      await db
        .from("notification_log")
        .delete()
        .eq("status", "sending")
        .lt("created_at", new Date(Date.now() - 3_600_000).toISOString());
      const { count, error } = await db
        .from("notification_log")
        .select("id", { count: "exact", head: true })
        .gte("created_at", since.toISOString());
      if (error) throw new Error(error.message);
      return count ?? 0;
    },
    async claim(keys) {
      const { data, error } = await db
        .from("notification_log")
        .upsert(toRows(keys), { onConflict: "user_id,kind,dedupe_key", ignoreDuplicates: true })
        .select("user_id, kind, dedupe_key");
      if (error) throw new Error(error.message);
      const fresh = new Set((data ?? []).map((r) => `${r.user_id}|${r.kind}|${r.dedupe_key}`));
      return keys.filter((k) => fresh.has(`${k.userId}|${k.kind}|${k.key}`));
    },
    async markSent(keys, resendId) {
      const { error } = await db
        .from("notification_log")
        .update({ status: "sent", resend_id: resendId })
        .or(match(keys));
      if (error) throw new Error(error.message);
    },
    async release(keys) {
      await db.from("notification_log").delete().eq("status", "sending").or(match(keys));
    },
  };
}
