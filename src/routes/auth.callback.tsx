import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { getAuthClient, isLiveAuthConfigured } from "@/lib/auth-client";
import { safeNextPath } from "@/lib/auth-paths";
import { decideMfaGate, destinationForAccount, NO_ACCOUNT_MESSAGE } from "@/lib/post-login";
import { resolveAccountFn, recordNoAccountFn } from "@/server/account";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/auth/callback")({
  validateSearch: (search: Record<string, unknown>) => ({
    next: typeof search.next === "string" ? search.next : undefined,
    code: typeof search.code === "string" ? search.code : undefined,
  }),
  component: AuthCallbackPage,
  head: () => ({ meta: [{ title: "Sign in — Keystone Music HQ" }] }),
});

function AuthCallbackPage() {
  const { next } = Route.useSearch();
  const [message, setMessage] = useState("Finishing sign-in…");
  const [failed, setFailed] = useState(false);

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
      const code = url.searchParams.get("code");
      if (code) {
        const { error } = await client.auth.exchangeCodeForSession(code);
        if (error) {
          if (!cancelled) {
            setFailed(true);
            setMessage("This sign-in link could not be completed. Request a new one from /login.");
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

      const account = await resolveAccountFn({
        data: { accessToken: session.access_token },
      });

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

      const factors = await client.auth.mfa.listFactors();
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
      window.location.replace(destinationForAccount(account, nextSafe));
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, [next]);

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-[#F5EBD6] px-4 text-[#15100D]">
      <h1 className="text-3xl font-semibold">Sign in</h1>
      <p
        className="mt-3 max-w-md text-center text-base text-[#5A4F43]"
        role="status"
        aria-live="polite"
      >
        {message}
      </p>
      {failed && (
        <Button className="mt-6" asChild>
          <Link to="/login">Back to sign in</Link>
        </Button>
      )}
    </div>
  );
}
