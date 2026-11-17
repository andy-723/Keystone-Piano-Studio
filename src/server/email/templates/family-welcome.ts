function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/**
 * Sent once a family finishes the enrolment form for a real studio: a one-time sign-in
 * link to the family app, plus where to sign in after the link has expired.
 */
export function familyWelcomeEmail(input: {
  studioName: string;
  guardianName: string;
  signInUrl: string;
  loginUrl: string;
}) {
  const first = input.guardianName.trim().split(/\s+/)[0] || "there";
  const title = `${input.studioName}: you're enrolled. Sign in to the family app`;
  const html = `<!doctype html><html><body style="font-family:Georgia,serif;color:#1c1917;background:#f7f3eb;padding:24px"><div style="max-width:560px;margin:0 auto;background:#fff;padding:28px;border:1px solid #e7e5e4"><h1 style="font-size:22px;margin:0 0 16px">${escapeHtml(title)}</h1><p>Hi ${escapeHtml(first)},</p><p>Thanks for completing the enrolment form for ${escapeHtml(input.studioName)}. Your family account is ready. Use it to see lessons, invoices and messages from your teacher.</p><p><a href="${escapeHtml(input.signInUrl)}" style="display:inline-block;background:#604A19;color:#fff;padding:12px 20px;text-decoration:none;border-radius:8px">Sign in to Keystone Music HQ</a></p><p style="color:#57534e;font-size:14px">This button works once and expires in about an hour. After that, sign in any time at <a href="${escapeHtml(input.loginUrl)}">${escapeHtml(input.loginUrl)}</a> with this email address, and we'll send you a fresh link.</p></div></body></html>`;
  const text = `${title}\n\nHi ${first},\n\nThanks for completing the enrolment form for ${input.studioName}. Your family account is ready. Use it to see lessons, invoices and messages from your teacher.\n\nSign in: ${input.signInUrl}\n\nThis link works once and expires in about an hour. After that, sign in any time at ${input.loginUrl} with this email address, and we'll send you a fresh link.`;
  return { subject: title, html, text };
}
