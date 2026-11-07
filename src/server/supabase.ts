import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getServerEnv, isMockOnboarding } from "./env";

/** Browser-safe anon client (publishable keys only). */
export function createBrowserSupabase(): SupabaseClient | null {
  const env = getServerEnv();
  if (!env.supabaseUrl || !env.supabaseAnonKey) return null;
  return createClient(env.supabaseUrl, env.supabaseAnonKey, {
    auth: { persistSession: true, autoRefreshToken: true },
  });
}

/** Service-role client for invite token verification. Never import from client components. */
export function createServiceSupabase(): SupabaseClient {
  if (isMockOnboarding()) throw new Error("Supabase service client is unavailable in mock mode.");
  const env = getServerEnv();
  if (!env.supabaseUrl || !env.supabaseServiceRoleKey) {
    throw new Error("Missing required environment variable: SUPABASE_SERVICE_ROLE_KEY");
  }
  return createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
