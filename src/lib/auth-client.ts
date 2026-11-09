import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let browserClient: SupabaseClient | null | undefined;

function readPublicEnv(name: string): string | undefined {
  if (typeof import.meta !== "undefined" && import.meta.env) {
    const value = (import.meta.env as Record<string, string | undefined>)[name];
    if (value != null && value.trim() !== "") return value.trim();
  }
  if (typeof process !== "undefined" && process.env) {
    const value = process.env[name];
    if (value != null && value.trim() !== "") return value.trim();
  }
  return undefined;
}

/** True when live Supabase browser keys are present (not mock mode). */
export function isLiveAuthConfigured(): boolean {
  const url = readPublicEnv("VITE_SUPABASE_URL") ?? readPublicEnv("SUPABASE_URL");
  const anon = readPublicEnv("VITE_SUPABASE_ANON_KEY") ?? readPublicEnv("SUPABASE_ANON_KEY");
  return Boolean(url && anon);
}

/**
 * The mock demo studio (role switcher, fixture data, no real sign-in) may only run
 * in local development or when a build explicitly opts in with VITE_ALLOW_DEMO=true.
 * A production build without Supabase keys must fail closed, never fall back to the demo.
 */
export function isDemoModeAllowed(): boolean {
  if (isLiveAuthConfigured()) return false;
  if (readPublicEnv("VITE_ALLOW_DEMO") === "true") return true;
  const env =
    typeof import.meta !== "undefined"
      ? (import.meta.env as Record<string, unknown> | undefined)
      : undefined;
  return Boolean(env?.["DEV"]);
}

/** Browser Supabase client with PKCE. Returns null when env is absent (mock mode). */
export function getAuthClient(): SupabaseClient | null {
  if (browserClient !== undefined) return browserClient;
  const url = readPublicEnv("VITE_SUPABASE_URL") ?? readPublicEnv("SUPABASE_URL");
  const anon = readPublicEnv("VITE_SUPABASE_ANON_KEY") ?? readPublicEnv("SUPABASE_ANON_KEY");
  if (!url || !anon) {
    browserClient = null;
    return null;
  }
  browserClient = createClient(url, anon, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: "pkce",
    },
  });
  return browserClient;
}

/** Test helper — clears the singleton. */
export function resetAuthClientForTests() {
  browserClient = undefined;
}
