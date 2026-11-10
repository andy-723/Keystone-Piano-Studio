import type { SupportRecord } from "../../support";
import { findCategory } from "@/lib/help/support-request";
import { findArticle } from "@/lib/help/articles";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

const ROLE_LABEL: Record<SupportRecord["role"], string> = {
  platform_staff: "Keystone staff",
  owner: "Studio owner",
  admin: "Studio admin",
  teacher: "Teacher",
  guardian: "Parent or guardian",
  public: "Not signed in",
  demo: "Demo mode",
};

function frame(title: string, inner: string) {
  return `<!doctype html><html><body style="font-family:Georgia,'Source Serif 4',serif;color:#15100D;background:#F5EBD6;padding:24px"><div style="max-width:600px;margin:0 auto;background:#FBF7EE;padding:28px;border:1px solid #D9C79E"><h1 style="font-size:20px;margin:0 0 16px;color:#15100D">${escapeHtml(title)}</h1>${inner}</div></body></html>`;
}

/** Email to Keystone support. Reply-To is the requester, so replying answers them. */
export function supportTeamEmail(record: SupportRecord, appUrl: string) {
  const category = findCategory(record.audience, record.category);
  const categoryLabel = category?.label.en ?? record.category;
  const side = record.audience === "family" ? "Family" : "Studio";
  const subject = `${record.urgent ? "URGENT " : ""}[${record.reference}] ${side} · ${categoryLabel}: ${record.subject}`;
  const suggested = record.suggestedArticleIds
    .map((id) => findArticle(id)?.title.en ?? id)
    .join("; ");
  const rows: Array<[string, string]> = [
    ["Reference", record.reference],
    [
      "From",
      record.requesterName
        ? `${record.requesterName} <${record.requesterEmail}>`
        : record.requesterEmail,
    ],
    ["Role", ROLE_LABEL[record.role]],
    [
      "Studio",
      record.studioName ? `${record.studioName} (${record.studioId})` : (record.studioId ?? "—"),
    ],
    ["Category", `${categoryLabel}${record.urgent ? " (urgent)" : ""}`],
    ["Language", record.lang === "zh-CN" ? "Chinese" : "English"],
    ["Page", record.pagePath ? `${appUrl}${record.pagePath}` : "—"],
    ["FAQs shown before sending", suggested || "none"],
  ];
  const table = rows
    .map(
      ([key, value]) =>
        `<tr><td style="padding:4px 12px 4px 0;color:#5A4F43;vertical-align:top;white-space:nowrap">${escapeHtml(key)}</td><td style="padding:4px 0">${escapeHtml(value)}</td></tr>`,
    )
    .join("");
  const html = frame(
    record.subject,
    `<table style="font-size:14px;border-collapse:collapse;margin-bottom:16px">${table}</table><div style="white-space:pre-wrap;font-size:15px;line-height:1.5;border-top:1px solid #D9C79E;padding-top:16px">${escapeHtml(record.message)}</div><p style="font-size:12px;color:#5A4F43;margin-top:24px">Reply to this email to answer the requester. Close it in the Keystone admin console, Support tab.</p>`,
  );
  const text = `${rows.map(([key, value]) => `${key}: ${value}`).join("\n")}\n\n${record.message}\n\nReply to this email to answer the requester.`;
  return { subject, html, text };
}

/** Acknowledgement to the person who asked, in their language. */
export function supportAckEmail(record: SupportRecord) {
  if (record.lang === "zh-CN") {
    const subject = `我们已收到您的请求 ${record.reference}`;
    const body = `感谢您联系 Keystone Music HQ。我们已收到您关于「${record.subject}」的请求，编号 ${record.reference}。我们一般会在一个工作日内回复。如需补充信息，直接回复此邮件即可。\n\n关于课程、学费或孩子进度的问题，请在应用的「聊天」中联系您的老师。`;
    return {
      subject,
      text: body,
      html: frame(
        subject,
        `<p style="white-space:pre-wrap;line-height:1.6">${escapeHtml(body)}</p>`,
      ),
    };
  }
  const subject = `We got your request ${record.reference}`;
  const body = `Thanks for contacting Keystone Music HQ. We've received your request "${record.subject}" (reference ${record.reference}). We aim to reply within one business day${record.urgent ? ", and we look at security concerns first" : ""}. To add anything, just reply to this email.\n\nPlease don't send passwords, authenticator codes or students' personal details by email.`;
  return {
    subject,
    text: body,
    html: frame(subject, `<p style="white-space:pre-wrap;line-height:1.6">${escapeHtml(body)}</p>`),
  };
}
