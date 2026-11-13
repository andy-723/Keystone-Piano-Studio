import { createClient } from "@supabase/supabase-js";
import { getServerEnv, isMockOnboarding } from "./env";
import { ProblemError } from "./problem";

export type VerifiedSession = {
  userId: string;
  email: string | null;
  aal: string | null;
  /** How this session was signed in (JWT amr), e.g. ["password"], ["otp"], ["oauth", "totp"]. */
  signInMethods: string[];
  accessToken: string;
};

/**
 * Verifies an access token with Supabase Auth and returns user id + aal from JWT claims.
 * Never trusts a user id from the request body.
 */
export async function verifyAccessToken(accessToken: string): Promise<VerifiedSession> {
  if (!accessToken) throw new ProblemError(401, "Unauthorized", "Missing access token.");
  if (isMockOnboarding()) {
    throw new ProblemError(
      400,
      "Mock mode",
      "Live session verification is unavailable in mock mode.",
    );
  }
  const env = getServerEnv();
  const client = createClient(env.supabaseUrl, env.supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
  const { data, error } = await client.auth.getUser(accessToken);
  if (error || !data.user) {
    throw new ProblemError(401, "Unauthorized", "Invalid or expired session.");
  }

  let aal: string | null = null;
  let signInMethods: string[] = [];
  try {
    const payload = JSON.parse(
      Buffer.from(accessToken.split(".")[1] ?? "", "base64url").toString("utf8"),
    ) as { aal?: string; amr?: Array<{ method?: string }> };
    aal = payload.aal ?? null;
    signInMethods = (payload.amr ?? [])
      .map((entry) => entry?.method)
      .filter((method): method is string => typeof method === "string");
  } catch {
    aal = null;
    signInMethods = [];
  }

  return {
    userId: data.user.id,
    email: data.user.email ?? null,
    aal,
    signInMethods,
    accessToken,
  };
}
