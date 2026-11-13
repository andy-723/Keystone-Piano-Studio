import type { ResolvedAccount } from "@/server/account";
import { safeNextPath } from "./auth-paths";
import { canRead } from "./subscription";

export type MfaGate = "ok" | "setup" | "challenge";

export function mfaRequiredForAccount(account: ResolvedAccount): boolean {
  if (account.platformStaff) return true;
  // The demo login only ever sees in-browser demo fixtures; staff server routes still need aal2.
  if (account.demoOnly) return false;
  return account.memberships.some(
    (m) => m.role === "owner" || m.role === "admin" || m.role === "teacher",
  );
}

export function decideMfaGate(input: {
  account: ResolvedAccount;
  aal: string | null | undefined;
  hasVerifiedTotp: boolean;
}): MfaGate {
  const required = mfaRequiredForAccount(input.account);
  if (!required) return "ok";
  if (!input.hasVerifiedTotp) return "setup";
  if (input.aal !== "aal2") return "challenge";
  return "ok";
}

export function destinationForAccount(account: ResolvedAccount, next?: string | null): string {
  const safe = safeNextPath(next);
  if (safe) return safe;
  if (account.platformStaff) return "/admin";
  if (account.memberships.length > 0) return "/";
  if (account.guardianFamilyIds.length > 0) return "/";
  return "/login";
}

/**
 * Password sign-in is only for the demo account (ADR-062). Real people sign in with an email link,
 * Google or Microsoft. If anyone else ends up with a password session (for example they set a
 * password on their own account), it is refused and signed out.
 */
export function passwordSessionRefused(account: ResolvedAccount): boolean {
  const usedPassword = (account.signInMethods ?? []).includes("password");
  return usedPassword && !account.demoOnly;
}

export const DEMO_LOGIN_REFUSED_MESSAGE =
  "That email and password didn't open the demo. Studio owners and families sign in on the main sign-in page.";

export const NO_ACCOUNT_MESSAGE =
  "We couldn't find a Keystone Music HQ account for this sign-in. If your teacher invited you, use the same email address the invite was sent to.";

export type StudioAccessGate =
  | { kind: "ok" }
  | { kind: "read_only"; studioId: string }
  | { kind: "paused"; ownerStudioId: string | null; ended: boolean };

/**
 * Subscription gate after sign-in (0006). Platform staff are never gated. A person with full
 * access to any studio gets in; an owner whose only studios are paused gets read-only (MSA 12.2);
 * everyone else sees the paused screen.
 */
export function decideStudioAccessGate(account: ResolvedAccount): StudioAccessGate {
  if (account.platformStaff) return { kind: "ok" };
  // The demo studio runs on in-browser fixtures, so its subscription row doesn't matter.
  if (account.demoOnly) return { kind: "ok" };
  const entries = account.studioAccess ?? [];
  if (entries.length === 0) return { kind: "ok" };
  if (entries.some((entry) => entry.level === "full")) return { kind: "ok" };
  const readable = entries.find((entry) => canRead(entry.level, entry.role));
  if (readable) return { kind: "read_only", studioId: readable.studioId };
  const owned = entries.find((entry) => entry.role === "owner");
  return {
    kind: "paused",
    ownerStudioId: owned?.studioId ?? null,
    ended: Boolean(owned && owned.level === "none"),
  };
}
