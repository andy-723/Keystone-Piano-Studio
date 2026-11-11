/**
 * Notification emails (0018): unread chat, important news and the daily summary.
 *
 * Same look as the sign-in emails in supabase/templates/ (logo header, cream and gold, one
 * button). They say who wrote and how many, never the message text or a child's name: people
 * sign in to read the detail, so nothing private sits in an inbox.
 */

export type NotificationLang = "en" | "zh-CN";
export type NotificationKind = "chat" | "news" | "marking";

export type BuiltEmail = {
  subject: string;
  html: string;
  text: string;
  /** For the List-Unsubscribe header (one-click unsubscribe in Gmail and Apple Mail). */
  unsubscribeUrl: string;
};

const SANS = "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";
const SERIF = "Georgia,'Times New Roman',serif";

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function unsubscribeUrl(
  appUrl: string,
  token: string,
  kind: NotificationKind | "summary" | "all",
) {
  return `${appUrl}/api/notifications/unsubscribe?t=${encodeURIComponent(token)}&k=${kind}`;
}

type Layout = {
  appUrl: string;
  lang: NotificationLang;
  preheader: string;
  title: string;
  paragraphs: string[];
  /** Plain list shown under the paragraphs (digest lines). */
  list?: string[];
  buttonLabel: string;
  buttonUrl: string;
  to: string;
  kindLabel: string;
  unsubscribe: string;
  /** Where the person changes their switches: Settings for staff, the family portal for families. */
  settingsUrl?: string;
};

const FOOTER = {
  en: {
    tagline: "Studio OS &amp; LMS Management Platform &middot; Made in Australia",
    why: (to: string, kind: string) =>
      `You're getting this because ${kind} emails are on for ${to}.`,
    off: "Turn these emails off",
    settings: "Change email settings in Keystone",
    noReply: "Please don't reply to this email. Reply in the app instead.",
  },
  "zh-CN": {
    tagline: "音乐工作室管理与教学平台 &middot; 澳大利亚制造",
    why: (to: string, kind: string) => `您收到此邮件，是因为 ${to} 开启了${kind}邮件提醒。`,
    off: "关闭此类邮件",
    settings: "在 Keystone 中更改邮件设置",
    noReply: "请勿直接回复此邮件，请在应用中回复。",
  },
} as const;

function p(text: string, size = 16, color = "#15100D", margin = "0 0 12px") {
  return `<p style="margin:${margin};font-family:${SANS};font-size:${size}px;line-height:${size + 8}px;color:${color}">${text}</p>`;
}

/** The sign-in email frame (supabase/templates/magic_link.html) with our own body. */
export function brandedNotificationLayout(input: Layout): string {
  const f = FOOTER[input.lang];
  const list = input.list?.length
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 8px">${input.list
        .map(
          (line) =>
            `<tr><td valign="top" style="padding:4px 10px 4px 0;font-family:${SANS};font-size:16px;line-height:24px;color:#C2A259">&#9670;</td><td style="padding:4px 0;font-family:${SANS};font-size:16px;line-height:24px;color:#15100D">${escapeHtml(line)}</td></tr>`,
        )
        .join("")}</table>`
    : "";
  return `<!DOCTYPE html>
<html lang="${input.lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${escapeHtml(input.title)}</title>
</head>
<body style="margin:0;padding:0;background:#F5EBD6">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(input.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#F5EBD6" style="background:#F5EBD6">
<tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px">
<tr><td align="center" bgcolor="#FBF7EE" style="background:#FBF7EE;padding:28px 24px 20px;border-radius:10px 10px 0 0;border-bottom:3px solid #C2A259">
<img src="${escapeHtml(input.appUrl)}/email/keystone-music-hq-email-logo.png" width="238" height="60" alt="Keystone Music HQ" style="display:block;border:0;outline:none;width:238px;height:60px;font-family:${SERIF};font-size:22px;color:#15100D">
</td></tr>
<tr><td bgcolor="#FFFFFF" style="background:#FFFFFF;padding:36px 40px 32px;border-radius:0 0 10px 10px">
<h1 style="margin:0 0 16px;font-family:${SERIF};font-size:26px;line-height:34px;font-weight:600;color:#15100D">${escapeHtml(input.title)}</h1>
${input.paragraphs.map((text) => p(escapeHtml(text))).join("")}
${list}
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:28px 0 8px">
<tr><td bgcolor="#604A19" style="border-radius:6px">
<a href="${escapeHtml(input.buttonUrl)}" target="_blank" style="display:inline-block;padding:14px 32px;font-family:${SANS};font-size:16px;font-weight:600;color:#FBF7EE;text-decoration:none;border-radius:6px">${escapeHtml(input.buttonLabel)}</a>
</td></tr></table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:28px 0 0"><tr><td style="border-top:1px solid #E8DFCC;font-size:0;line-height:0">&nbsp;</td></tr></table>
${p(escapeHtml(f.noReply), 13, "#5A4F43", "20px 0 0")}
</td></tr>
<tr><td align="center" style="padding:24px 16px 0;font-family:${SANS};font-size:12px;line-height:18px;color:#5A4F43">
<strong style="color:#15100D;font-family:${SERIF};font-size:13px">Keystone Music HQ</strong><br>
${f.tagline}<br>
${escapeHtml(f.why(input.to, input.kindLabel))}<br>
<a href="${escapeHtml(input.unsubscribe)}" style="color:#604A19">${f.off}</a> &middot; <a href="${escapeHtml(input.settingsUrl ?? `${input.appUrl}/`)}" style="color:#604A19">${f.settings}</a>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

function textFooter(lang: NotificationLang, to: string, kindLabel: string, unsubscribe: string) {
  const f = FOOTER[lang];
  return `\n\n--\nKeystone Music HQ\n${f.why(to, kindLabel)}\n${f.off}: ${unsubscribe}\n${f.noReply}`;
}

const KIND_LABEL: Record<NotificationLang, Record<NotificationKind | "summary", string>> = {
  en: { chat: "chat", news: "news", marking: "feedback", summary: "news and feedback" },
  "zh-CN": { chat: "聊天", news: "通知", marking: "老师反馈", summary: "通知和老师反馈" },
};

// ---------------------------------------------------------------------------
// Chat
// ---------------------------------------------------------------------------

export type ChatThread = {
  conversationId: string;
  /** Family display name (studio side) or the studio name (family side). */
  from: string;
  /** Who wrote most recently, e.g. "Ms Clarke". */
  latestAuthor: string;
  unreadCount: number;
};

export function chatNotificationEmail(input: {
  appUrl: string;
  lang: NotificationLang;
  to: string;
  side: "family" | "studio";
  studioName: string;
  threads: ChatThread[];
  token: string;
}): BuiltEmail {
  const total = input.threads.reduce((sum, t) => sum + t.unreadCount, 0);
  const unsubscribe = unsubscribeUrl(input.appUrl, input.token, "chat");
  const single = input.threads.length === 1 ? input.threads[0] : undefined;
  const buttonUrl =
    input.side === "studio" && single
      ? `${input.appUrl}/chat/${encodeURIComponent(single.conversationId)}`
      : input.side === "studio"
        ? `${input.appUrl}/chat`
        : `${input.appUrl}/`;
  const zh = input.lang === "zh-CN";
  const plural = total === 1 ? "message" : "messages";

  let subject: string;
  let paragraphs: string[];
  let list: string[] | undefined;
  if (input.side === "family") {
    const author = single?.latestAuthor ?? input.studioName;
    subject = zh
      ? `${input.studioName} 有 ${total} 条新消息`
      : `${total === 1 ? "New message" : `${total} new messages`} from ${input.studioName}`;
    paragraphs = zh
      ? [
          `${author} 在 ${input.studioName} 的聊天中给您发送了 ${total} 条消息。`,
          "请登录 Keystone 阅读并回复。",
        ]
      : [
          `${author} sent you ${total} ${plural} in your ${input.studioName} chat.`,
          "Sign in to Keystone to read and reply.",
        ];
  } else {
    subject =
      input.threads.length === 1 && single
        ? `${total === 1 ? "New message" : `${total} new messages`} from ${single.from}`
        : `${total} unread messages from ${input.threads.length} families`;
    paragraphs = [
      single
        ? `${single.latestAuthor} (${single.from}) sent ${total} ${plural} that nobody at ${input.studioName} has read yet.`
        : `These families have messages that nobody at ${input.studioName} has read yet:`,
    ];
    list =
      input.threads.length > 1
        ? input.threads.map(
            (t) => `${t.from}: ${t.unreadCount} ${t.unreadCount === 1 ? "message" : "messages"}`,
          )
        : undefined;
  }
  const buttonLabel = zh ? "打开聊天" : "Open chat";
  const kindLabel = KIND_LABEL[input.lang].chat;
  const html = brandedNotificationLayout({
    appUrl: input.appUrl,
    lang: input.lang,
    preheader: paragraphs[0] ?? subject,
    title: subject,
    paragraphs,
    ...(list ? { list } : {}),
    buttonLabel,
    buttonUrl,
    to: input.to,
    kindLabel,
    unsubscribe,
    settingsUrl: input.side === "studio" ? `${input.appUrl}/settings` : `${input.appUrl}/`,
  });
  const text = `${paragraphs.join("\n\n")}${list ? `\n\n${list.map((l) => `- ${l}`).join("\n")}` : ""}\n\n${buttonLabel}: ${buttonUrl}${textFooter(input.lang, input.to, kindLabel, unsubscribe)}`;
  return { subject, html, text, unsubscribeUrl: unsubscribe };
}

// ---------------------------------------------------------------------------
// Important news (sent straight away)
// ---------------------------------------------------------------------------

export function importantNewsEmail(input: {
  appUrl: string;
  lang: NotificationLang;
  to: string;
  studioName: string;
  title: string;
  authorName: string;
  token: string;
}): BuiltEmail {
  const zh = input.lang === "zh-CN";
  const unsubscribe = unsubscribeUrl(input.appUrl, input.token, "news");
  const subject = zh
    ? `${input.studioName} 重要通知：${input.title}`
    : `Important from ${input.studioName}: ${input.title}`;
  const paragraphs = zh
    ? [`${input.authorName} 发布了一条重要通知：「${input.title}」。`, "请登录 Keystone 阅读全文。"]
    : [
        `${input.authorName} posted an important update: "${input.title}".`,
        "Sign in to Keystone to read it.",
      ];
  const buttonLabel = zh ? "阅读通知" : "Read the update";
  const buttonUrl = `${input.appUrl}/`;
  const kindLabel = KIND_LABEL[input.lang].news;
  const html = brandedNotificationLayout({
    appUrl: input.appUrl,
    lang: input.lang,
    preheader: paragraphs[0]!,
    title: zh ? "重要通知" : "Important update",
    paragraphs,
    buttonLabel,
    buttonUrl,
    to: input.to,
    kindLabel,
    unsubscribe,
  });
  const text = `${paragraphs.join("\n\n")}\n\n${buttonLabel}: ${buttonUrl}${textFooter(input.lang, input.to, kindLabel, unsubscribe)}`;
  return { subject, html, text, unsubscribeUrl: unsubscribe };
}

// ---------------------------------------------------------------------------
// Daily summary (7am studio time): normal news posts + shared teacher feedback
// ---------------------------------------------------------------------------

export function dailySummaryEmail(input: {
  appUrl: string;
  lang: NotificationLang;
  to: string;
  studioName: string;
  newsTitles: string[];
  feedbackCount: number;
  token: string;
}): BuiltEmail {
  const zh = input.lang === "zh-CN";
  const unsubscribe = unsubscribeUrl(input.appUrl, input.token, "summary");
  const subject = zh
    ? `${input.studioName} 今日更新`
    : `Your daily update from ${input.studioName}`;
  const list: string[] = [];
  for (const title of input.newsTitles.slice(0, 5)) {
    list.push(zh ? `新通知：${title}` : `News: ${title}`);
  }
  if (input.newsTitles.length > 5) {
    const more = input.newsTitles.length - 5;
    list.push(
      zh ? `还有 ${more} 条通知` : `and ${more} more news ${more === 1 ? "post" : "posts"}`,
    );
  }
  if (input.feedbackCount > 0) {
    list.push(
      zh
        ? `老师对课程有 ${input.feedbackCount} 条新反馈`
        : `${input.feedbackCount} new teacher ${input.feedbackCount === 1 ? "comment" : "comments"} on your family's courses`,
    );
  }
  const paragraphs = zh
    ? [`以下是 ${input.studioName} 在过去一天的新内容：`]
    : [`Here's what's new from ${input.studioName} since yesterday:`];
  const buttonLabel = zh ? "打开 Keystone" : "Open Keystone";
  const buttonUrl = `${input.appUrl}/`;
  const kindLabel = KIND_LABEL[input.lang].summary;
  const html = brandedNotificationLayout({
    appUrl: input.appUrl,
    lang: input.lang,
    preheader: list[0] ?? subject,
    title: zh ? "今日更新" : "Your daily update",
    paragraphs,
    list,
    buttonLabel,
    buttonUrl,
    to: input.to,
    kindLabel,
    unsubscribe,
  });
  const text = `${paragraphs.join("\n\n")}\n\n${list.map((l) => `- ${l}`).join("\n")}\n\n${buttonLabel}: ${buttonUrl}${textFooter(input.lang, input.to, kindLabel, unsubscribe)}`;
  return { subject, html, text, unsubscribeUrl: unsubscribe };
}
