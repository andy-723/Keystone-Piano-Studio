/**
 * Browser side of "Trust this device for 30 days". The tick box on the sign-in, email-link and
 * code screens records the choice here; once sign-in finishes (code entered for staff),
 * `applyTrustChoice` asks the server to trust this browser. The server keeps the record and an
 * httpOnly cookie (src/server/trusted-device.ts); the browser only mirrors the end date so the
 * session timer knows which limits apply.
 */
import { setSessionTrustedUntil } from "./session-timeout";

const TRUST_REQUEST_KEY = "kmhq.trust.requested";

export function setTrustRequested(value: boolean) {
  if (typeof localStorage === "undefined") return;
  try {
    if (value) localStorage.setItem(TRUST_REQUEST_KEY, "1");
    else localStorage.removeItem(TRUST_REQUEST_KEY);
  } catch {
    // ignore
  }
}

export function isTrustRequested(): boolean {
  if (typeof localStorage === "undefined") return false;
  try {
    return localStorage.getItem(TRUST_REQUEST_KEY) === "1";
  } catch {
    return false;
  }
}

/** Trust this browser now (Settings button, or after sign-in when the box was ticked). */
export async function trustThisDevice(accessToken: string): Promise<string> {
  const { trustThisDeviceFn } = await import("@/server/trusted-device");
  const result = await trustThisDeviceFn({ data: { accessToken } });
  setSessionTrustedUntil(result.expiresAt);
  return result.expiresAt;
}

/** After sign-in finishes: trust this browser if the person ticked the box. Never blocks sign-in. */
export async function applyTrustChoice(accessToken: string) {
  // Not ticked: nothing to do. The page-load check asks the server about this browser anyway.
  if (!isTrustRequested()) return;
  setTrustRequested(false);
  try {
    await trustThisDevice(accessToken);
  } catch (err) {
    console.error("[trusted-device] could not trust this device", err);
  }
}

/** Ask the server whether this browser is still trusted (page load). Keeps the marker on errors. */
export async function refreshDeviceTrust(accessToken: string) {
  try {
    const { checkThisDeviceFn } = await import("@/server/trusted-device");
    const state = await checkThisDeviceFn({ data: { accessToken } });
    setSessionTrustedUntil(state.trusted ? state.expiresAt : null);
    return state;
  } catch (err) {
    console.error("[trusted-device] check failed", err);
    return null;
  }
}

/** Sign out on this browser: the server forgets it (best effort, never blocks sign-out). */
export async function forgetThisDevice(accessToken: string | null | undefined) {
  setSessionTrustedUntil(null);
  if (!accessToken) return;
  try {
    const { forgetThisDeviceFn } = await import("@/server/trusted-device");
    await forgetThisDeviceFn({ data: { accessToken } });
  } catch (err) {
    console.error("[trusted-device] forget failed", err);
  }
}
