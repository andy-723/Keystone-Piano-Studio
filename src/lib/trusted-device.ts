/**
 * "Trust this device for 30 days" rules (Andrew, 24 Nov 2026). Pure, shared by the browser and
 * the server (src/server/trusted-device.ts).
 *
 * - Not trusted (default, shared computers): 30 minutes idle, 8 hours at most (session-timeout.ts).
 * - Trusted: the browser stays signed in for up to 30 days from when it was trusted, and is
 *   signed out after 7 days without use.
 * - Sensitive actions still ask for the authenticator code if it wasn't entered in the last
 *   10 minutes, trusted or not.
 */

export const TRUST_DAYS = 30;
export const TRUSTED_DEVICE_MS = TRUST_DAYS * 24 * 60 * 60 * 1000;
export const TRUSTED_IDLE_MS = 7 * 24 * 60 * 60 * 1000;
export const STEP_UP_WINDOW_MS = 10 * 60 * 1000;

/** httpOnly cookie that carries the random device token. */
export const TRUSTED_DEVICE_COOKIE = "kmhq_trusted_device";

export type TrustedDeviceRow = {
  id: string;
  user_id: string;
  label: string;
  created_at: string;
  last_seen_at: string;
  expires_at: string;
  revoked_at: string | null;
};

export type TrustState =
  | { trusted: true; expiresAt: string }
  | { trusted: false; reason: "none" | "other_user" | "revoked" | "expired" | "idle" };

/** Whether a stored row still trusts this browser for this user. */
export function trustStateFor(
  row: TrustedDeviceRow | null | undefined,
  userId: string,
  now = Date.now(),
): TrustState {
  if (!row) return { trusted: false, reason: "none" };
  if (row.user_id !== userId) return { trusted: false, reason: "other_user" };
  if (row.revoked_at) return { trusted: false, reason: "revoked" };
  if (Date.parse(row.expires_at) <= now) return { trusted: false, reason: "expired" };
  if (now - Date.parse(row.last_seen_at) >= TRUSTED_IDLE_MS)
    return { trusted: false, reason: "idle" };
  return { trusted: true, expiresAt: row.expires_at };
}

/** A short "Chrome on Mac" style label. Never stores the full user agent. */
export function deviceLabel(userAgent: string | null | undefined): string {
  const ua = userAgent ?? "";
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /OPR\/|Opera/.test(ua)
      ? "Opera"
      : /Firefox\//.test(ua)
        ? "Firefox"
        : /Chrome\//.test(ua) || /CriOS\//.test(ua)
          ? "Chrome"
          : /Safari\//.test(ua)
            ? "Safari"
            : "Browser";
  const os = /iPhone/.test(ua)
    ? "iPhone"
    : /iPad/.test(ua)
      ? "iPad"
      : /Android/.test(ua)
        ? "Android"
        : /Windows/.test(ua)
          ? "Windows"
          : /Mac OS X|Macintosh/.test(ua)
            ? "Mac"
            : /CrOS/.test(ua)
              ? "Chromebook"
              : /Linux/.test(ua)
                ? "Linux"
                : "";
  return os ? `${browser} on ${os}` : browser;
}

/**
 * When the authenticator code was last entered in this Supabase session, from the JWT `amr`
 * claim (seconds). Entering the code again at aal2 refreshes the "totp" entry's timestamp.
 */
export function lastMfaAt(
  amr: Array<{ method?: unknown; timestamp?: unknown }> | null | undefined,
): number | null {
  let latest: number | null = null;
  for (const entry of amr ?? []) {
    if (entry?.method !== "totp" || typeof entry.timestamp !== "number") continue;
    const ms = entry.timestamp * 1000;
    if (latest == null || ms > latest) latest = ms;
  }
  return latest;
}

/** True when a sensitive action must ask for the code again. */
export function stepUpNeeded(mfaAt: number | null | undefined, now = Date.now()): boolean {
  if (mfaAt == null) return true;
  return now - mfaAt >= STEP_UP_WINDOW_MS;
}

/** Problem code the server uses when a sensitive action needs a fresh code. */
export const STEP_UP_CODE = "mfa_step_up_required";
export const STEP_UP_MESSAGE = "For your security, enter your authenticator code again to do this.";
