/**
 * Shared "Welcome to Keystone Music HQ" email layout for studio owners and families.
 * Every welcome email answers the same questions so people rarely need to contact support:
 * what Keystone is, what to expect, what they agreed to, the next steps, and where to get help.
 */

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export type WelcomeSection = {
  heading: string;
  /** Plain-text paragraphs, shown after the list. Links are written as `[label](url)` and rendered as links in HTML. */
  paragraphs?: string[];
  /** Plain-text list items, same link syntax. */
  items?: string[];
  numbered?: boolean;
};

export type WelcomeEmailInput = {
  appUrl: string;
  title: string;
  preheader: string;
  greeting: string;
  intro: string[];
  /** Shown between the intro and the button: a heading, then one row of store buttons per app. */
  appDownloads?: {
    heading: string;
    note?: string;
    apps: { name: string; links: { label: string; url: string }[] }[];
  };
  button: { label: string; url: string };
  buttonNote?: string;
  sections: WelcomeSection[];
  footerReason: string;
};

/** Names typed by people (studio, parent, child) must never become links in an email. */
export function plain(value: string): string {
  return value.replace(/[[\]<>]/g, "").trim();
}

function footerLink(label: string, url: string) {
  return `<a href="${escapeHtml(url)}" style="color:#5A4F43">${escapeHtml(label)}</a>`;
}

const LINK = /\[([^\]]+)\]\(([^)\s]+)\)/g;

function inlineHtml(text: string): string {
  let out = "";
  let last = 0;
  for (const match of text.matchAll(LINK)) {
    out += escapeHtml(text.slice(last, match.index));
    out += `<a href="${escapeHtml(match[2]!)}" style="color:#604A19">${escapeHtml(match[1]!)}</a>`;
    last = (match.index ?? 0) + match[0].length;
  }
  return out + escapeHtml(text.slice(last));
}

function inlineText(text: string): string {
  return text.replace(LINK, (_all, label: string, url: string) => `${label} (${url})`);
}

export function renderWelcomeEmail(input: WelcomeEmailInput) {
  const p = (text: string) => `<p style="margin:0 0 12px;line-height:1.55">${inlineHtml(text)}</p>`;
  const sectionHtml = input.sections
    .map((section) => {
      const tag = section.numbered ? "ol" : "ul";
      const list = section.items?.length
        ? `<${tag} style="margin:0 0 12px;padding-left:22px;line-height:1.55">${section.items
            .map((item) => `<li style="margin:0 0 6px">${inlineHtml(item)}</li>`)
            .join("")}</${tag}>`
        : "";
      return `<h2 style="font-size:17px;margin:24px 0 8px;color:#15100D">${escapeHtml(section.heading)}</h2>${list}${(section.paragraphs ?? []).map(p).join("")}`;
    })
    .join("");
  const downloads = input.appDownloads;
  const storeButton = (link: { label: string; url: string }) =>
    `<a href="${escapeHtml(link.url)}" style="display:inline-block;margin:0 8px 8px 0;padding:9px 14px;background:#15100D;color:#FBF7EE;text-decoration:none;border-radius:8px;font-family:Helvetica,Arial,sans-serif;font-size:13px;font-weight:600">${escapeHtml(link.label)}</a>`;
  const downloadsHtml = downloads
    ? `<div style="margin:20px 0 0;padding:16px 18px;background:#F5EBD6;border:1px solid #D9C79E;border-radius:12px"><h2 style="font-size:17px;margin:0 0 8px;color:#15100D">${escapeHtml(downloads.heading)}</h2>${downloads.note ? `<p style="margin:0 0 12px;line-height:1.55">${inlineHtml(downloads.note)}</p>` : ""}${downloads.apps
        .map(
          (app) =>
            `<p style="margin:0 0 4px;font-weight:600">${escapeHtml(app.name)}</p><div style="margin:0 0 8px">${app.links.map(storeButton).join("")}</div>`,
        )
        .join("")}</div>`
    : "";
  const logo = `${input.appUrl}/email/keystone-music-hq-email-logo.png`;
  const html = `<!doctype html><html><body style="margin:0;font-family:Georgia,'Source Serif 4',serif;color:#15100D;background:#F5EBD6;padding:24px"><span style="display:none;max-height:0;overflow:hidden">${escapeHtml(input.preheader)}</span><div style="max-width:580px;margin:0 auto;background:#FBF7EE;padding:28px;border:1px solid #D9C79E"><img src="${escapeHtml(logo)}" alt="Keystone Music HQ" width="180" style="display:block;margin:0 0 20px;border:0"/><h1 style="font-size:23px;margin:0 0 16px;color:#15100D">${escapeHtml(input.title)}</h1>${p(input.greeting)}${input.intro.map(p).join("")}${downloadsHtml}<p style="margin:24px 0"><a href="${escapeHtml(input.button.url)}" style="display:inline-block;min-height:44px;line-height:44px;padding:0 20px;background:#604A19;color:#FBF7EE;text-decoration:none;border-radius:10px;font-weight:600">${escapeHtml(input.button.label)}</a></p>${input.buttonNote ? `<p style="margin:0 0 12px;font-size:13px;color:#5A4F43">${inlineHtml(input.buttonNote)}</p>` : ""}${sectionHtml}<hr style="border:0;border-top:1px solid #D9C79E;margin:28px 0 14px"/><p style="margin:0;font-size:12px;line-height:1.5;color:#5A4F43">${inlineHtml(input.footerReason)} Keystone Music HQ · ${footerLink("Help centre", `${input.appUrl}/help`)} · ${footerLink("Terms of use", `${input.appUrl}/terms`)} · ${footerLink("Privacy", `${input.appUrl}/privacy`)}</p></div></body></html>`;

  const textSections = input.sections
    .map((section) => {
      const paras = (section.paragraphs ?? []).map(inlineText).join("\n\n");
      const items = (section.items ?? [])
        .map((item, i) => `${section.numbered ? `${i + 1}.` : "-"} ${inlineText(item)}`)
        .join("\n");
      return [section.heading.toUpperCase(), items, paras].filter(Boolean).join("\n\n");
    })
    .join("\n\n");
  const text = [
    input.title,
    input.greeting,
    ...input.intro.map(inlineText),
    downloads
      ? [
          downloads.heading.toUpperCase(),
          ...(downloads.note ? [inlineText(downloads.note)] : []),
          downloads.apps
            .map(
              (app) =>
                `- ${app.name}: ${app.links.map((link) => `${link.label} ${link.url}`).join(" · ")}`,
            )
            .join("\n"),
        ].join("\n\n")
      : "",
    `${input.button.label}: ${input.button.url}`,
    input.buttonNote ? inlineText(input.buttonNote) : "",
    textSections,
    "--",
    `${inlineText(input.footerReason)} Help centre: ${input.appUrl}/help · Terms of use: ${input.appUrl}/terms · Privacy: ${input.appUrl}/privacy`,
  ]
    .filter(Boolean)
    .join("\n\n");

  return { subject: input.title, html, text };
}
