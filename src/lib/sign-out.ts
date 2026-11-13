import { getAuthClient } from "@/lib/auth-client";
import { clearVerifiedAccess } from "@/lib/live-auth-cache";
import { signedOutRedirect } from "@/lib/auth-paths";
import {
  clearSessionTimeoutState,
  markSessionLoginRequired,
} from "@/lib/session-timeout";

export type SignOutOptions = {
  /** Where to send the browser after clearing local auth. Defaults to staying put when omitted. */
  redirectTo?: string;
  /**
   * When true (timeout / manual sign-out), mock/prototype mode must go through
   * /login or /demo again instead of silently reopening the app.
   */
  requireLoginAgain?: boolean;
};

/**
 * Clear Keystone Music HQ local session state and the Supabase browser session.
 * Used by Sign out buttons and the idle/absolute session timeout.
 */
export async function signOutLocal(options: SignOutOptions = {}) {
  const requireLoginAgain = options.requireLoginAgain !== false;
  clearSessionTimeoutState();
  clearVerifiedAccess();
  if (requireLoginAgain) markSessionLoginRequired();
  const client = getAuthClient();
  try {
    await client?.auth.signOut({ scope: "local" });
  } catch {
    // Storage may already be cleared; still redirect.
  }
  if (options.redirectTo !== undefined) {
    window.location.replace(options.redirectTo);
  }
}

/** Sign out because the idle or absolute session timer fired. */
export async function signOutForSessionTimeout(pathname: string, search = "") {
  const base = signedOutRedirect(pathname, search);
  const redirectTo = base.includes("?")
    ? `${base}&reason=session_timeout`
    : `${base}?reason=session_timeout`;
  await signOutLocal({ redirectTo, requireLoginAgain: true });
}
