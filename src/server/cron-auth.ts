import { createHash, timingSafeEqual } from "node:crypto";
import { getServerEnv } from "./env";

/**
 * True when the request carries `Authorization: Bearer CRON_SECRET`.
 * Compares fixed-length hashes in constant time, so response timing does not leak the secret.
 * Always false when CRON_SECRET is not set.
 */
export function isCronAuthorized(request: Request): boolean {
  const secret = getServerEnv().cronSecret;
  if (!secret) return false;
  const given = request.headers.get("authorization") ?? "";
  const digest = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(given), digest(`Bearer ${secret}`));
}
