/**
 * Re-ask for the authenticator code before a sensitive action (Andrew, 24 Nov 2026): linking or
 * unlinking Stripe or Xero, revoking someone's access, removing staff, resetting MFA and data
 * exports. Applies on trusted devices too. The server checks the same 10-minute window from the
 * JWT (`requireRecentMfa` in src/server/authz.ts); this is the friendly prompt in front of it.
 *
 * `ensureRecentMfa()` resolves at once if the code was entered in the last 10 minutes, otherwise
 * opens <StepUpDialog/> and resolves after the person enters a matching code (or rejects if they
 * cancel). Callers then read a fresh access token.
 */
import { getAuthClient, isLiveAuthConfigured } from "./auth-client";
import { lastMfaAt, stepUpNeeded } from "./trusted-device";

export const STEP_UP_CANCELLED = "Cancelled. Enter your authenticator code to continue.";

type Pending = { resolve: () => void; reject: (err: Error) => void };
let pending: Pending | null = null;
const listeners = new Set<(open: boolean) => void>();

export function subscribeStepUp(listener: (open: boolean) => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function notify() {
  for (const listener of listeners) listener(pending != null);
}

export function isStepUpOpen() {
  return pending != null;
}

/** When the code was last entered in this browser session, from the access token's amr. */
export function mfaAtFromToken(accessToken: string | null | undefined): number | null {
  if (!accessToken) return null;
  try {
    const part = accessToken.split(".")[1] ?? "";
    const json = atob(part.replace(/-/g, "+").replace(/_/g, "/"));
    const payload = JSON.parse(json) as { amr?: Array<{ method?: string; timestamp?: number }> };
    return lastMfaAt(payload.amr);
  } catch {
    return null;
  }
}

/** Resolves when the code is fresh enough for a sensitive action. Demo / mock: no prompt. */
export async function ensureRecentMfa(now = Date.now()): Promise<void> {
  if (!isLiveAuthConfigured()) return;
  const client = getAuthClient();
  if (!client) return;
  const { data } = await client.auth.getSession();
  if (!stepUpNeeded(mfaAtFromToken(data.session?.access_token), now)) return;
  // No listener means no dialog on this screen; let the server's check explain instead.
  if (listeners.size === 0) return;
  if (pending) pending.reject(new Error(STEP_UP_CANCELLED));
  await new Promise<void>((resolve, reject) => {
    pending = { resolve, reject };
    notify();
  });
}

/** Called by the dialog with the code the person typed. Throws a friendly message on a mismatch. */
export async function submitStepUpCode(code: string) {
  if (!/^\d{6}$/.test(code)) throw new Error("Enter the six-digit code from your authenticator.");
  const auth = getAuthClient()?.auth;
  if (!auth) throw new Error("Sign-in is unavailable. Please reload and try again.");
  const factors = await auth.mfa.listFactors();
  const factor = factors.data?.totp.find(
    (entry: { status: string }) => entry.status === "verified",
  );
  if (!factor) throw new Error("Set up two-step sign-in first.");
  const result = await auth.mfa.challengeAndVerify({ factorId: factor.id, code });
  if (result.error) {
    throw new Error("That code didn't match. Codes change every 30 seconds.");
  }
  const done = pending;
  pending = null;
  notify();
  done?.resolve();
}

export function cancelStepUp() {
  const done = pending;
  pending = null;
  notify();
  done?.reject(new Error(STEP_UP_CANCELLED));
}

/** Test helper. */
export function resetStepUpForTests() {
  pending = null;
  listeners.clear();
}

/** Ask for the code if needed, then return the (new) access token for the sensitive call. */
export async function sensitiveAccessToken(): Promise<string> {
  await ensureRecentMfa();
  const { data } = (await getAuthClient()?.auth.getSession()) ?? { data: { session: null } };
  const token = data.session?.access_token;
  if (!token) throw new Error("Session expired. Sign in again.");
  return token;
}
