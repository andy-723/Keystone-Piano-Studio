/** Emails to a studio owner about Keystone's own subscription (MSA 5.3 and 12.2). */

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function formatDate(date: Date): string {
  return date.toLocaleDateString("en-AU", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Australia/Sydney",
  });
}

function layout(title: string, paragraphs: string[], buttonLabel: string, url: string) {
  const body = paragraphs.map((p) => `<p>${escapeHtml(p)}</p>`).join("");
  return `<!doctype html><html><body style="font-family:Georgia,'Source Serif 4',serif;color:#15100D;background:#F5EBD6;padding:24px"><div style="max-width:560px;margin:0 auto;background:#FBF7EE;padding:28px;border:1px solid #D9C79E"><h1 style="font-size:22px;margin:0 0 16px;color:#15100D">${escapeHtml(title)}</h1>${body}<p style="margin:24px 0"><a href="${escapeHtml(url)}" style="display:inline-block;min-height:44px;line-height:44px;padding:0 18px;background:#604A19;color:#FBF7EE;text-decoration:none;border-radius:10px;font-weight:600">${escapeHtml(buttonLabel)}</a></p><p style="font-size:13px;color:#5A4F43">If the button does not work, open: ${escapeHtml(url)}</p></div></body></html>`;
}

export function paymentReminderEmail(input: {
  studioName: string;
  suspendOn: Date;
  billingUrl: string;
  supportEmail: string;
}) {
  const subject = `Payment didn't go through — ${input.studioName} on Keystone Music HQ`;
  const paragraphs = [
    `We couldn't take this month's Keystone Music HQ payment for ${input.studioName}. Stripe will try again automatically, and nothing changes for your teachers or families in the meantime.`,
    `If the payment is still unpaid on ${formatDate(input.suspendOn)}, we may pause the studio. While it is paused you can still sign in, read and export your studio data, and paying restores access straight away.`,
    `If you think this charge is wrong, reply to ${input.supportEmail} and we won't pause the studio for the amount in dispute while we sort it out.`,
  ];
  return {
    subject,
    html: layout(subject, paragraphs, "Update payment details", input.billingUrl),
    text: `${paragraphs.join("\n\n")}\n\nUpdate payment details: ${input.billingUrl}`,
  };
}

export function suspensionNoticeEmail(input: {
  studioName: string;
  billingUrl: string;
  supportEmail: string;
}) {
  const subject = `${input.studioName} is paused on Keystone Music HQ`;
  const paragraphs = [
    `Your Keystone Music HQ subscription for ${input.studioName} has been unpaid for 14 days since our reminder, so we've paused the studio.`,
    `Teachers and families can't use the app while it is paused. You can still sign in as the owner to read and export all of your studio data.`,
    `Paying the overdue amount restores access for everyone straight away. If you have questions or think this is a mistake, contact ${input.supportEmail}.`,
  ];
  return {
    subject,
    html: layout(subject, paragraphs, "Pay and restore access", input.billingUrl),
    text: `${paragraphs.join("\n\n")}\n\nPay and restore access: ${input.billingUrl}`,
  };
}
