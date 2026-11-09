import type { ResolvedAccount } from "@/server/account";
import { safeNextPath } from "./auth-paths";

export type MfaGate = "ok" | "setup" | "challenge";

export function mfaRequiredForAccount(account: ResolvedAccount): boolean {
  if (account.platformStaff) return true;
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

export const NO_ACCOUNT_MESSAGE =
  "We couldn't find a Keystone Music HQ account for this sign-in. If your teacher invited you, use the same email address the invite was sent to.";
