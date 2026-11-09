function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function ownerWelcomeEmail(input: {
  ownerName: string;
  studioName: string;
  signInUrl: string;
}) {
  const title = `Welcome to Keystone Music HQ — ${input.studioName}`;
  const html = `<!doctype html><html><body style="font-family:Georgia,'Source Serif 4',serif;color:#15100D;background:#F5EBD6;padding:24px"><div style="max-width:560px;margin:0 auto;background:#FBF7EE;padding:28px;border:1px solid #D9C79E"><h1 style="font-size:22px;margin:0 0 16px;color:#15100D">${escapeHtml(title)}</h1><p>Hi ${escapeHtml(input.ownerName)},</p><p>Your studio <strong>${escapeHtml(input.studioName)}</strong> is ready on Keystone Music HQ. Sign in with this email address, set up your authenticator app, then finish new-studio setup.</p><p style="margin:24px 0"><a href="${escapeHtml(input.signInUrl)}" style="display:inline-block;min-height:44px;line-height:44px;padding:0 18px;background:#604A19;color:#FBF7EE;text-decoration:none;border-radius:10px;font-weight:600">Sign in to Keystone</a></p><p style="font-size:13px;color:#5A4F43">If the button does not work, open: ${escapeHtml(input.signInUrl)}</p></div></body></html>`;
  const text = `Hi ${input.ownerName},\n\nYour studio ${input.studioName} is ready on Keystone Music HQ. Sign in at ${input.signInUrl}, set up your authenticator app, then finish new-studio setup.`;
  return { subject: title, html, text };
}
