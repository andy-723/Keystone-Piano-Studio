/**
 * Shared pieces for the live studio stores (src/services/live/*). The browser Supabase client
 * with the signed-in person's session, so RLS decides every read and write. No service key.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { getAuthClient } from "@/lib/auth-client";

export type Client = Pick<SupabaseClient, "from">;

let clientOverride: Client | null = null;
/** Tests inject a fake (or a local Supabase) client. */
export function setStudioStoreClientForTests(client: Client | null) {
  clientOverride = client;
}

export function client(): Client {
  const c = clientOverride ?? getAuthClient();
  if (!c) throw new Error("Sign-in is unavailable. Please reload and try again.");
  return c;
}

/** Turns a database refusal into words a studio owner can act on. */
export function friendly(
  error: { message?: string; code?: string } | null,
  fallback: string,
): Error {
  const message = error?.message ?? "";
  if (message.includes("base_plan_student_limit"))
    return new Error("The Base plan allows up to 35 students. Upgrade to Pro to add more.");
  if (error?.code === "42501" || /row-level security/i.test(message))
    return new Error("You don't have permission to change this, or your studio is read-only.");
  return new Error(fallback);
}
