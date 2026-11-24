import { createClient } from "@supabase/supabase-js";
import { getServerEnv, isMockOnboarding } from "./env";
import { ProblemError } from "./problem";
import { lastMfaAt } from "@/lib/trusted-device";

export type VerifiedSession = {
  userId: string;
  email: string | null;
  aal: string | null;
  /** How this session was signed in (JWT amr), e.g. ["password"], ["otp"], ["oauth", "totp"]. */
  signInMethods: string[];
  /** When the authenticator code was last entered in this session (ms), from the JWT amr. */
  mfaVerifiedAt: number | null;
  /** Supabase session id (JWT session_id), when present. */
  sessionId: string | null;
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
  // Revoked access (Supabase Auth ban): refuse at once, not only when the token expires.
  const bannedUntil = (data.user as { banned_until?: string | null }).banned_until;
  if (bannedUntil && Date.parse(bannedUntil) > Date.now()) {
    throw new ProblemError(401, "Access revoked", "Your access has been revoked.");
  }

  let aal: string | null = null;
  let signInMethods: string[] = [];
  let mfaVerifiedAt: number | null = null;
  let sessionId: string | null = null;
  try {
    const payload = JSON.parse(
      Buffer.from(accessToken.split(".")[1] ?? "", "base64url").toString("utf8"),
    ) as {
      aal?: string;
      amr?: Array<{ method?: string; timestamp?: number }>;
      session_id?: string;
    };
    aal = payload.aal ?? null;
    mfaVerifiedAt = lastMfaAt(payload.amr);
    sessionId = typeof payload.session_id === "string" ? payload.session_id : null;
    signInMethods = (payload.amr ?? [])
      .map((entry) => entry?.method)
      .filter((method): method is string => typeof method === "string");
  } catch {
    aal = null;
    signInMethods = [];
    mfaVerifiedAt = null;
    sessionId = null;
  }

  return {
    userId: data.user.id,
    email: data.user.email ?? null,
    aal,
    signInMethods,
    mfaVerifiedAt,
    sessionId,
    accessToken,
  };
}
