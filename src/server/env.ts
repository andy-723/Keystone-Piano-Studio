export type OnboardingBackend = "mock" | "supabase";

function envSource(): Record<string, string | undefined> {
  if (typeof process !== "undefined" && process.env)
    return process.env as Record<string, string | undefined>;
  return {};
}

function read(name: string): string | undefined {
  const value = envSource()[name];
  if (value == null || value.trim() === "") return undefined;
  return value.trim();
}

function requireWhen(condition: boolean, name: string): string {
  const value = read(name);
  if (condition && !value) throw new Error(`Missing required environment variable: ${name}`);
  return value ?? "";
}

/** Single source for onboarding/server secrets. Service-role and Resend never use VITE_. */
export function getServerEnv() {
  const backendRaw = (read("ONBOARDING_BACKEND") ?? "mock").toLowerCase();
  const supabaseUrl = read("SUPABASE_URL") ?? read("VITE_SUPABASE_URL");
  const supabaseAnon = read("SUPABASE_ANON_KEY") ?? read("VITE_SUPABASE_ANON_KEY");
  const serviceRole = read("SUPABASE_SERVICE_ROLE_KEY");
  const hasSupabase = Boolean(supabaseUrl && supabaseAnon && serviceRole);
  const backend: OnboardingBackend = backendRaw === "supabase" && hasSupabase ? "supabase" : "mock";

  return {
    backend,
    supabaseUrl: supabaseUrl ?? "",
    supabaseAnonKey: supabaseAnon ?? "",
    supabaseServiceRoleKey: serviceRole ?? "",
    resendApiKey: read("RESEND_API_KEY") ?? "",
    emailFrom: read("EMAIL_FROM") ?? "Keystone Music HQ <invites@mail.example.com>",
    appUrl: (read("APP_URL") ?? "http://127.0.0.1:3000").replace(/\/$/, ""),
    cronSecret: read("CRON_SECRET") ?? "",
    turnstileSiteKey: read("VITE_TURNSTILE_SITE_KEY") ?? "",
    turnstileSecretKey: read("TURNSTILE_SECRET_KEY") ?? "",
    supportEmail: read("SUPPORT_EMAIL") ?? "support@example.com",
    requireLive() {
      requireWhen(true, "SUPABASE_URL");
      requireWhen(true, "SUPABASE_ANON_KEY");
      requireWhen(true, "SUPABASE_SERVICE_ROLE_KEY");
      requireWhen(true, "RESEND_API_KEY");
      requireWhen(true, "EMAIL_FROM");
      requireWhen(true, "APP_URL");
      requireWhen(true, "CRON_SECRET");
      requireWhen(true, "TURNSTILE_SECRET_KEY");
    },
  };
}

export function isMockOnboarding() {
  return getServerEnv().backend === "mock";
}
