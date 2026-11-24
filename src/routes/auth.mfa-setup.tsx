import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { MfaCodeInputs } from "@/components/auth/MfaCodeInputs";
import { getAuthClient } from "@/lib/auth-client";
import { AUTHENTICATOR_APPS } from "@/lib/authenticator-apps";
import { safeNextPath } from "@/lib/auth-paths";
import { rememberVerifiedAccess } from "@/lib/live-auth-cache";
import {
  decideStudioAccessGate,
  shellRoleForAccount,
  destinationForAccount,
} from "@/lib/post-login";
import { markSessionStarted } from "@/lib/session-timeout";
import { applyTrustChoice } from "@/lib/trust-device-client";
import { recordMfaEnrolledFn, resolveAccountFn } from "@/server/account";

export const Route = createFileRoute("/auth/mfa-setup")({
  validateSearch: (search: Record<string, unknown>) => ({
    next: typeof search["next"] === "string" ? search["next"] : undefined,
  }),
  component: MfaSetupPage,
  head: () => ({ meta: [{ title: "Set up two-step sign-in — Keystone Music HQ" }] }),
});

function MfaSetupPage() {
  const { next } = Route.useSearch();
  const [factorId, setFactorId] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function enroll() {
      const client = getAuthClient();
      if (!client) return;
      const { data, error: enrollError } = await client.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: "Keystone Music HQ",
      });
      if (cancelled) return;
      if (enrollError || !data) {
        setError("Could not start authenticator setup. Try again from sign-in.");
        return;
      }
      setFactorId(data.id);
      setQr(data.totp.qr_code);
      setSecret(data.totp.secret);
    }
    void enroll();
    return () => {
      cancelled = true;
    };
  }, []);

  async function verify(digits: string) {
    if (!factorId) return;
    setBusy(true);
    setError(null);
    const client = getAuthClient();
    if (!client) return;
    const challenge = await client.auth.mfa.challenge({ factorId });
    if (challenge.error || !challenge.data) {
      setBusy(false);
      setError("That code didn't match. Codes change every 30 seconds.");
      return;
    }
    const verified = await client.auth.mfa.verify({
      factorId,
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
    await recordMfaEnrolledFn({ data: { accessToken: token, userAgent: navigator.userAgent } });
    const account = await resolveAccountFn({ data: { accessToken: token } });
    rememberVerifiedAccess(token, decideStudioAccessGate(account), shellRoleForAccount(account));
    markSessionStarted();
    await applyTrustChoice(token);
    window.location.replace(destinationForAccount(account, safeNextPath(next)));
  }

  const qrIsSvg = Boolean(qr?.trimStart().startsWith("<svg"));

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-[#F5EBD6] px-4 text-[#15100D]">
      <div className="w-full max-w-md rounded-[22px] border border-[#D9C79E] bg-[#FBF7EE] p-8">
        <h1 className="text-2xl font-semibold">Set up two-step sign-in</h1>
        <p className="mt-2 text-sm text-[#5A4F43]">
          Scan this QR code with your authenticator app, or enter the secret manually. Then enter
          the 6-digit code to confirm.
        </p>
        <div className="mt-4 rounded-[14px] border border-[#D9C79E] bg-[#F5EBD6] px-4 py-3 text-sm">
          <p className="font-semibold">No authenticator app yet? Get one free:</p>
          <ul className="mt-2 space-y-2">
            {AUTHENTICATOR_APPS.map((app) => (
              <li key={app.name}>
                <span className="font-medium">{app.name}</span>
                <span className="mt-1 flex flex-wrap gap-2">
                  <a
                    href={app.appStore}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-h-[44px] items-center rounded-[10px] bg-[#15100D] px-3 text-[#FBF7EE]"
                  >
                    iPhone: App Store
                  </a>
                  <a
                    href={app.googlePlay}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-h-[44px] items-center rounded-[10px] bg-[#15100D] px-3 text-[#FBF7EE]"
                  >
                    Android: Google Play
                  </a>
                </span>
              </li>
            ))}
          </ul>
        </div>
        {qr && (
          // Shown as an image, never injected as HTML: an <img> cannot run script, even if
          // the SVG from Supabase MFA enroll were ever tampered with.
          <img
            src={qrIsSvg ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(qr)}` : qr}
            alt="Authenticator QR code"
            className="mx-auto mt-6 h-48 w-48"
          />
        )}
        {secret && (
          <p className="mt-4 break-all rounded-[10px] bg-[#F5EBD6] px-3 py-2 font-mono text-sm">
            {secret}
          </p>
        )}
        <div className="mt-6">
          <MfaCodeInputs
            value={code}
            onChange={setCode}
            onComplete={(digits) => void verify(digits)}
            disabled={busy || !factorId}
            error={error}
          />
        </div>
      </div>
    </div>
  );
}
