/**
 * Finishes a Google or Microsoft sign-in that comes back to /auth/callback with ?code=….
 *
 * The browser Supabase client is created with detectSessionInUrl, so it already exchanges
 * the ?code for a session while it starts up. A second exchange then fails ("code already
 * used") even though sign-in worked. That made Microsoft and Google sign-in land on an
 * error page. So we use the session if there is one, and only exchange the code ourselves
 * when there isn't.
 */
type AuthLike = {
  getSession(): Promise<{ data: { session: unknown } }>;
  exchangeCodeForSession(code: string): Promise<{ error: unknown }>;
};

export async function finishCodeSignIn(
  auth: AuthLike,
  code: string,
): Promise<{ ok: true } | { ok: false; error: unknown }> {
  // getSession waits for the client's own start-up exchange to finish.
  const before = await auth.getSession();
  if (before.data.session) return { ok: true };
  const { error } = await auth.exchangeCodeForSession(code);
  if (!error) return { ok: true };
  const after = await auth.getSession();
  if (after.data.session) return { ok: true };
  return { ok: false, error };
}

export const CODE_SIGN_IN_FAILED =
  "Sign-in didn't finish. This can happen if the sign-in page was open for a long time, or if you started in a different browser. Go back and try again, using the same browser from start to finish.";

/**
 * What to tell someone whose emailed sign-in link didn't work, based on the Supabase
 * error code. Before 18 Nov every failure said "expired or already used", which hid
 * revoked accounts and network problems behind the same words.
 */
export function emailLinkFailureMessage(error: unknown): string {
  const code =
    error && typeof error === "object" && "code" in error
      ? String((error as { code?: unknown }).code ?? "")
      : "";
  const status =
    error && typeof error === "object" && "status" in error
      ? Number((error as { status?: unknown }).status)
      : NaN;
  if (code === "user_banned") {
    return "Access for this account has been turned off. Contact your studio, or support@keystonemusichq.com if you run the studio.";
  }
  if (
    code === "over_request_rate_limit" ||
    code === "over_email_send_rate_limit" ||
    status === 429
  ) {
    return "Too many sign-in attempts. Wait a minute, then request a new link from the sign-in page.";
  }
  if (code === "otp_expired" || code === "otp_disabled" || status === 403) {
    return "This sign-in link has expired or was already used. Only the newest link we email you works, and each link works once within an hour. Request a new link from the sign-in page.";
  }
  return `Sign-in didn't finish${code ? ` (${code})` : ""}. Check your connection and try the link again, or request a new one from the sign-in page.`;
}
