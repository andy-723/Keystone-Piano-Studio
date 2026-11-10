import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { MfaCodeInputs } from "@/components/auth/MfaCodeInputs";
import { getAuthClient } from "@/lib/auth-client";
import { safeNextPath } from "@/lib/auth-paths";
import { rememberVerifiedAccess } from "@/lib/live-auth-cache";
import { decideStudioAccessGate, destinationForAccount } from "@/lib/post-login";
import { resolveAccountFn } from "@/server/account";

export const Route = createFileRoute("/auth/mfa")({
  validateSearch: (search: Record<string, unknown>) => ({
    next: typeof search.next === "string" ? search.next : undefined,
  }),
  component: MfaChallengePage,
  head: () => ({ meta: [{ title: "Two-step sign-in — Keystone Music HQ" }] }),
});

function MfaChallengePage() {
  const { next } = Route.useSearch();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function verify(digits: string) {
    setError(null);
    setBusy(true);
    const client = getAuthClient();
    if (!client) {
      setBusy(false);
      setError("Sign-in is unavailable.");
      return;
    }
    const factors = await client.auth.mfa.listFactors();
    const totp = (factors.data?.totp ?? []).find((factor) => factor.status === "verified");
    if (!totp) {
      setBusy(false);
      window.location.replace("/auth/mfa-setup");
      return;
    }
    const challenge = await client.auth.mfa.challenge({ factorId: totp.id });
    if (challenge.error || !challenge.data) {
      setBusy(false);
      setError("That code didn't match. Codes change every 30 seconds.");
      return;
    }
    const verified = await client.auth.mfa.verify({
      factorId: totp.id,
      challengeId: challenge.data.id,
      code: digits,
    });
    if (verified.error) {
      setBusy(false);
      setCode("");
      setError("That code didn't match. Codes change every 30 seconds.");
      return;
    }
    const { data: sessionData } = await client.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      setBusy(false);
      setError("Session expired. Sign in again.");
      return;
    }
    const account = await resolveAccountFn({ data: { accessToken: token } });
    // aal2 session is verified — seed the guard cache so /admin (or studio) skips a second round-trip.
    rememberVerifiedAccess(token, decideStudioAccessGate(account));
    window.location.replace(destinationForAccount(account, safeNextPath(next)));
  }

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-[#F5EBD6] px-4 text-[#15100D]">
      <div className="w-full max-w-md rounded-[22px] border border-[#D9C79E] bg-[#FBF7EE] p-8 shadow-sm">
        <h1 className="text-2xl font-semibold">Enter your authenticator code</h1>
        <p className="mt-2 text-sm text-[#5A4F43]">
          Open your authenticator app and enter the 6-digit code for Keystone Music HQ.
        </p>
        <div className="mt-6">
          <MfaCodeInputs
            value={code}
            onChange={setCode}
            onComplete={(digits) => void verify(digits)}
            disabled={busy}
            error={error}
          />
        </div>
        <p className="mt-6 text-sm text-[#5A4F43]">
          <Link
            to="/auth/mfa-recovery"
            className="font-medium text-[#604A19] underline-offset-2 hover:underline"
          >
            Lost your authenticator?
          </Link>
        </p>
      </div>
    </div>
  );
}
