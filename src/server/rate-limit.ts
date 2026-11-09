import { invitationState } from "@/mocks/invitations";

const WINDOW_MS = 15 * 60 * 1000;
const FAIL_LIMIT = 5;
const TOKEN_RATE_PER_MIN = 10;
const ADMIN_RATE_PER_MIN = 30;

export function isIpLocked(ip: string, now = Date.now()): boolean {
  invitationState.lockouts = invitationState.lockouts.filter((entry) => entry.until > now);
  return invitationState.lockouts.some((entry) => entry.ip === ip && entry.until > now);
}

export function recordAuthFailure(ip: string, kind: "token" | "captcha", now = Date.now()) {
  invitationState.rateBuckets.push({ ip, at: now, kind });
  const recent = invitationState.rateBuckets.filter(
    (entry) => entry.ip === ip && now - entry.at <= WINDOW_MS,
  );
  invitationState.rateBuckets = invitationState.rateBuckets.filter(
    (entry) => now - entry.at <= WINDOW_MS,
  );
  if (recent.length >= FAIL_LIMIT) {
    invitationState.lockouts.push({ ip, until: now + WINDOW_MS });
  }
}

export function checkTokenLookupRate(ip: string, now = Date.now()): boolean {
  const minuteAgo = now - 60_000;
  const count = invitationState.rateBuckets.filter(
    (entry) => entry.ip === ip && entry.kind === "token" && entry.at >= minuteAgo,
  ).length;
  invitationState.rateBuckets.push({ ip, at: now, kind: "token" });
  return count < TOKEN_RATE_PER_MIN;
}

/** Rate-limit platform admin server functions (per IP, sliding 1-minute window). */
export function checkAdminActionRate(ip: string, now = Date.now()): boolean {
  const minuteAgo = now - 60_000;
  const kind = "admin" as const;
  const count = invitationState.rateBuckets.filter(
    (entry) => entry.ip === ip && entry.kind === kind && entry.at >= minuteAgo,
  ).length;
  invitationState.rateBuckets.push({ ip, at: now, kind });
  return count < ADMIN_RATE_PER_MIN;
}
