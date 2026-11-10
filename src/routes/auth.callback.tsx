import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { getAuthClient, isLiveAuthConfigured } from "@/lib/auth-client";
import { parseEmailLink, safeNextPath } from "@/lib/auth-paths";
import { rememberVerifiedAccess } from "@/lib/live-auth-cache";
import {
  decideMfaGate,
  decideStudioAccessGate,
  shellRoleForAccount,
  destinationForAccount,
  NO_ACCOUNT_MESSAGE,
} from "@/lib/post-login";
import { resolveAccountFn, recordNoAccountFn } from "@/server/account";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/auth/callback")({
  validateSearch: (search: Record<string, unknown>) => ({
    next: typeof search["next"] === "string" ? search["next"] : undefined,
    code: typeof search["code"] === "string" ? search["code"] : undefined,
    token_hash: typeof search["token_hash"] === "string" ? search["token_hash"] : undefined,
    type: typeof search["type"] === "string" ? search["type"] : undefined,
  }),
  component: AuthCallbackPage,
  head: () => ({ meta: [{ title: "Sign in — Keystone Music HQ" }] }),
});

function AuthCallbackPage() {
  const { next, token_hash: tokenHash, type } = Route.useSearch();
  const [message, setMessage] = useState("Finishing sign-in…");
  const [failed, setFailed] = useState(false);
  // Branded emails link here with ?token_hash=…&type=…. We wait for a tap before
  // using the token so mail scanners that open links can't burn it.
  const emailLink = useMemo(
    () => parseEmailLink(new URLSearchParams({ token_hash: tokenHash ?? "", type: type ?? "" })),
    [tokenHash, type],
  );
  const [confirmed, setConfirmed] = useState(false);
  const awaitingTap = Boolean(emailLink) && !confirmed && !failed;

  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (!isLiveAuthConfigured()) {
        window.location.replace(safeNextPath(next) || "/");
        return;
      }
      const client = getAuthClient();
      if (!client) {
        setFailed(true);
        setMessage(NO_ACCOUNT_MESSAGE);
        return;
      }

      const url = new URL(window.location.href);
      // Provider / Supabase errors come back as ?error=…&error_description=… (or in the hash).
      const hash = new URLSearchParams(url.hash.replace(/^#/, ""));
      const providerError =
        url.searchParams.get("error_description") ??
        hash.get("error_description") ??
        url.searchParams.get("error") ??
        hash.get("error");
      if (providerError) {
        console.error("[auth] sign-in returned an error", providerError);
        if (!cancelled) {
          setFailed(true);
          setMessage(`Sign-in didn't finish: ${providerError.slice(0, 200)}`);
        }
        return;
      }
      if (emailLink) {
        if (!confirmed) return;
        const { error } = await client.auth.verifyOtp({
          token_hash: emailLink.tokenHash,
          type: emailLink.type,
        });
        if (error) {
          console.error("[auth] email link verify failed", error);
          if (!cancelled) {
            setFailed(true);
            setMessage(
              "This sign-in link has expired or was already used. Request a new link from the sign-in page.",
            );
          }
          return;
        }
      }

      const code = url.searchParams.get("code");
      if (!emailLink && code) {
        const { error } = await client.auth.exchangeCodeForSession(code);
        if (error) {
          if (!cancelled) {
            setFailed(true);
            console.error("[auth] code exchange failed", error);
            setMessage(
              "This sign-in link has expired, was already used, or was opened in a different browser from the one you requested it in. Request a new link, then open it on the same device and browser (on a phone, open it in Safari or Chrome rather than inside your email app).",
            );
          }
          return;
        }
      }

      const { data: sessionData } = await client.auth.getSession();
      const session = sessionData.session;
      if (!session) {
        if (!cancelled) {
          setFailed(true);
          setMessage("No active session. Please sign in again.");
        }
        return;
      }

      // Account resolve and MFA factor list are independent — fetch in parallel.
      const [account, factors] = await Promise.all([
        resolveAccountFn({ data: { accessToken: session.access_token } }),
        client.auth.mfa.listFactors(),
      ]);

      const hasAccount =
        Boolean(account.platformStaff) ||
        account.memberships.length > 0 ||
        account.guardianFamilyIds.length > 0;

      if (!hasAccount) {
        await recordNoAccountFn({
          data: {
            accessToken: session.access_token,
            userAgent: navigator.userAgent,
          },
        });
        await client.auth.signOut({ scope: "global" });
        if (!cancelled) {
          setFailed(true);
          setMessage(NO_ACCOUNT_MESSAGE);
        }
        return;
      }

      const hasVerifiedTotp = (factors.data?.totp ?? []).some(
        (factor) => factor.status === "verified",
      );
      const gate = decideMfaGate({
        account,
        aal: account.aal,
        hasVerifiedTotp,
      });
      const nextSafe = safeNextPath(next);
      if (gate === "setup") {
        window.location.replace(
          `/auth/mfa-setup${nextSafe ? `?next=${encodeURIComponent(nextSafe)}` : ""}`,
        );
        return;
      }
      if (gate === "challenge") {
        window.location.replace(
          `/auth/mfa${nextSafe ? `?next=${encodeURIComponent(nextSafe)}` : ""}`,
        );
        return;
      }
      rememberVerifiedAccess(session.access_token, decideStudioAccessGate(account), shellRoleForAccount(account));
      window.location.replace(destinationForAccount(account, nextSafe));
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, [next, emailLink, confirmed]);

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-[#F5EBD6] px-4 text-[#15100D]">
      <h1 className="text-3xl font-semibold">Sign in</h1>
      {awaitingTap ? (
        <>
          <p className="mt-3 max-w-md text-center text-base text-[#5A4F43]">
            Tap continue to finish signing in to Keystone Music HQ.
          </p>
          <Button
            className="mt-6"
            onClick={() => setConfirmed(true)}
            data-testid="email-link-continue"
          >
            Continue
          </Button>
        </>
      ) : (
        <p
          className="mt-3 max-w-md text-center text-base text-[#5A4F43]"
          role="status"
          aria-live="polite"
        >
          {message}
        </p>
      )}
      {failed && (
        <Button className="mt-6" asChild>
          <Link to="/login" search={{ next: undefined }}>Back to sign in</Link>
        </Button>
      )}
    </div>
  );
}
