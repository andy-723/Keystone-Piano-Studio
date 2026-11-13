/**
 * App-level session lifetime for Keystone Music HQ.
 *
 * Supabase may keep a refresh token alive for days; these timers are enforced in the
 * browser for every account (including the demo account and mock/prototype mode).
 *
 * Defaults Andrew can ask to change:
 * - Idle: 30 minutes without activity
 * - Absolute: 8 hours from sign-in, even if the person stays active
 */

/** Idle timeout — no clicks, keypresses or navigation. */
export const SESSION_IDLE_MS = 30 * 60 * 1000;

/** Maximum session lifetime from sign-in. */
export const SESSION_ABSOLUTE_MS = 8 * 60 * 60 * 1000;

const STARTED_KEY = "kmhq.session.startedAt";
const ACTIVITY_KEY = "kmhq.session.lastActivityAt";
/** After a timeout (or sign-out), mock/prototype mode must go through /login or /demo again. */
const LOGIN_REQUIRED_KEY = "kmhq.session.loginRequired";

export type SessionTimeoutReason = "idle" | "absolute";

function readNumber(key: string): number | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(key);
    if (raw == null || raw === "") return null;
    const value = Number(raw);
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

function writeNumber(key: string, value: number) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(key, String(value));
  } catch {
    // Private mode / quota — in-memory checks still run for this document if we keep mirrors.
  }
}

/** Start (or restart) the absolute + idle clocks after a successful sign-in. */
export function markSessionStarted(now = Date.now()) {
  writeNumber(STARTED_KEY, now);
  writeNumber(ACTIVITY_KEY, now);
  clearSessionLoginRequired();
}

/**
 * Ensure markers exist for an already-open session (e.g. first load after this feature ships).
 * Never moves startedAt forward once set.
 */
export function ensureSessionMarkers(now = Date.now()) {
  if (readNumber(STARTED_KEY) == null) writeNumber(STARTED_KEY, now);
  if (readNumber(ACTIVITY_KEY) == null) writeNumber(ACTIVITY_KEY, now);
}

/** Record user activity so the idle timer resets. Absolute lifetime is unchanged. */
export function touchSessionActivity(now = Date.now()) {
  if (readNumber(STARTED_KEY) == null) return;
  writeNumber(ACTIVITY_KEY, now);
}

export function getSessionStartedAt(): number | null {
  return readNumber(STARTED_KEY);
}

export function getSessionLastActivityAt(): number | null {
  return readNumber(ACTIVITY_KEY);
}

export function clearSessionTimeoutState() {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.removeItem(STARTED_KEY);
    localStorage.removeItem(ACTIVITY_KEY);
  } catch {
    // ignore
  }
}

export function markSessionLoginRequired() {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(LOGIN_REQUIRED_KEY, "1");
  } catch {
    // ignore
  }
}

export function clearSessionLoginRequired() {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.removeItem(LOGIN_REQUIRED_KEY);
  } catch {
    // ignore
  }
}

/** True when mock/prototype mode must not auto-open the app after a timeout or sign-out. */
export function isSessionLoginRequired(): boolean {
  if (typeof localStorage === "undefined") return false;
  try {
    return localStorage.getItem(LOGIN_REQUIRED_KEY) === "1";
  } catch {
    return false;
  }
}

/** Pure check — absolute wins when both would fire. */
export function getSessionTimeoutReason(
  now = Date.now(),
  idleMs = SESSION_IDLE_MS,
  absoluteMs = SESSION_ABSOLUTE_MS,
): SessionTimeoutReason | null {
  const startedAt = readNumber(STARTED_KEY);
  if (startedAt == null) return null;
  if (now - startedAt >= absoluteMs) return "absolute";
  const lastActivity = readNumber(ACTIVITY_KEY) ?? startedAt;
  if (now - lastActivity >= idleMs) return "idle";
  return null;
}

export function isSessionTimedOut(now = Date.now()): boolean {
  return getSessionTimeoutReason(now) != null;
}

/** Test helper. */
export function resetSessionTimeoutForTests() {
  clearSessionTimeoutState();
  clearSessionLoginRequired();
}
