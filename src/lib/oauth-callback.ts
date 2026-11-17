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
