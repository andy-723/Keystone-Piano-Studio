import { useContext, useEffect, useState, type ReactNode } from "react";
import { useRouterState } from "@tanstack/react-router";
import { getAuthClient, isDemoModeAllowed, isLiveAuthConfigured } from "@/lib/auth-client";
import { isAuthExemptPath } from "@/lib/auth-paths";
import {
  clearVerifiedAccess,
  getVerifiedAccess,
  rememberVerifiedAccess,
  resetLiveAuthCacheForTests,
} from "@/lib/live-auth-cache";
import { decideMfaGate, decideStudioAccessGate, type StudioAccessGate } from "@/lib/post-login";
import { StudioPausedScreen, StudioReadOnlyBanner } from "@/components/StudioAccessNotice";
import { resolveAccountFn } from "@/server/account";
import { QueryClientContext } from "@tanstack/react-query";
import { chooseStudioWorkspace, loadLiveStudio } from "@/services/live/studio-store";
import { markWorkspaceLoaded, resetStudioWorkspaceForTests } from "@/lib/studio-workspace";

/** Set once this tab has decided between demo data and the signed-in studio's own data. */
let workspaceReady = false;

type GuardState = "checking" | "ok" | "unavailable" | "studio_error";

export function resetLiveAuthGuardForTests() {
  resetLiveAuthCacheForTests();
  workspaceReady = false;
  resetStudioWorkspaceForTests();
}

function loginUrl(next: string) {
  return `/login?next=${encodeURIComponent(next)}`;
}

/**
 * Protects every non-public route.
 *
 * Live mode: a route renders only when there is a Supabase session that belongs to a
 * Keystone account (platform staff, studio member or guardian) AND has passed the MFA
 * gate (aal2 for staff roles). Anything else goes to /login, /auth/mfa-setup or /auth/mfa.
 *
 * No Supabase keys: the mock demo renders only in local dev or with VITE_ALLOW_DEMO=true.
 * A production build without keys shows "sign-in unavailable" instead of the demo app.
 */
export function LiveAuthGuard({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const search = useRouterState({ select: (state) => state.location.searchStr });
  const exempt = isAuthExemptPath(pathname);
  // Optional: tests render the guard without a query client.
  const queryClient = useContext(QueryClientContext);
  const [accessGate, setAccessGate] = useState<StudioAccessGate>({ kind: "ok" });
  const [state, setState] = useState<GuardState>(() => {
    if (exempt) return "ok";
    if (isLiveAuthConfigured()) return "checking";
    return isDemoModeAllowed() ? "ok" : "unavailable";
  });

  useEffect(() => {
    if (isAuthExemptPath(pathname)) {
      setState("ok");
      return;
    }
    if (!isLiveAuthConfigured()) {
      setState(isDemoModeAllowed() ? "ok" : "unavailable");
      return;
    }
    let cancelled = false;
    const next = `${pathname}${search || ""}`;
    void (async () => {
      const client = getAuthClient();
      if (!client) {
        window.location.replace(loginUrl(next));
        return;
      }
      const { data } = await client.auth.getSession();
      if (cancelled) return;
      const session = data.session;
      if (!session) {
        clearVerifiedAccess();
        window.location.replace(loginUrl(next));
        return;
      }
      const known = getVerifiedAccess(session.access_token);
      // A full reload empties the in-memory store, so the studio's data must load again.
      if (known && workspaceReady) {
        setAccessGate(known);
        setState("ok");
        return;
      }
      setState("checking");
      try {
        // Account resolve (server) and MFA factor list (Supabase) are independent — run together.
        const [account, factors] = await Promise.all([
          resolveAccountFn({ data: { accessToken: session.access_token } }),
          client.auth.mfa.listFactors(),
        ]);
        if (cancelled) return;
        const hasAccount =
          Boolean(account.platformStaff) ||
          account.memberships.length > 0 ||
          account.guardianFamilyIds.length > 0;
        if (!hasAccount) {
          clearVerifiedAccess();
          await client.auth.signOut({ scope: "local" });
          window.location.replace("/login");
          return;
        }
        const hasVerifiedTotp = (factors.data?.totp ?? []).some((f) => f.status === "verified");
        const gate = decideMfaGate({ account, aal: account.aal, hasVerifiedTotp });
        if (gate === "setup") {
          window.location.replace(`/auth/mfa-setup?next=${encodeURIComponent(next)}`);
          return;
        }
        if (gate === "challenge") {
          window.location.replace(`/auth/mfa?next=${encodeURIComponent(next)}`);
          return;
        }
        // Subscription gate (0006). The database enforces the same rule through RLS; this is
        // only so people see a clear screen instead of empty pages.
        const access = decideStudioAccessGate(account);
        // Real studios get their own data; the demo studio and platform staff keep the demo.
        // Runs before any studio screen mounts, then drops anything a loader cached earlier.
        if (!workspaceReady) {
          try {
            const choice = await chooseStudioWorkspace(account);
            if (cancelled) return;
            if (choice.workspace.mode === "live" && choice.row) {
              await loadLiveStudio(choice.workspace, choice.row, choice.plan);
            } else {
              markWorkspaceLoaded(choice.workspace);
            }
          } catch (err) {
            console.error("[live-auth] studio data failed to load", err);
            if (!cancelled) setState("studio_error");
            return;
          }
          if (cancelled) return;
          queryClient?.removeQueries();
          workspaceReady = true;
        }
        rememberVerifiedAccess(session.access_token, access);
        setAccessGate(access);
        setState("ok");
      } catch {
        if (!cancelled) window.location.replace(loginUrl(next));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pathname, search, queryClient]);

  if (exempt) return children;
  if (state === "unavailable") {
    return (
      <main className="flex min-h-[100dvh] flex-col items-center justify-center bg-[#F5EBD6] px-4 text-center text-[#15100D]">
        <h1 className="text-2xl font-semibold">Sign-in is unavailable</h1>
        <p className="mt-3 max-w-md text-base text-[#5A4F43]" role="status">
          Keystone Music HQ can&apos;t sign you in right now. Please try again shortly.
        </p>
        <a className="mt-6 text-[#604A19] underline" href="/help">
          Get help
        </a>
      </main>
    );
  }
  if (state === "studio_error") {
    return (
      <main className="flex min-h-[100dvh] flex-col items-center justify-center bg-[#F5EBD6] px-4 text-center text-[#15100D]">
        <h1 className="text-2xl font-semibold">Your studio didn&apos;t load</h1>
        <p className="mt-3 max-w-md text-base text-[#5A4F43]" role="alert">
          We couldn&apos;t load your studio&apos;s details. Check your connection and reload the
          page.
        </p>
        <button
          type="button"
          className="ks-btn ks-btn-primary mt-6"
          onClick={() => window.location.reload()}
        >
          Reload
        </button>
      </main>
    );
  }
  if (state !== "ok") {
    return <p className="p-6 text-[#5A4F43]">Checking sign-in…</p>;
  }
  if (accessGate.kind === "paused") {
    return <StudioPausedScreen ownerStudioId={accessGate.ownerStudioId} ended={accessGate.ended} />;
  }
  if (accessGate.kind === "read_only") {
    return (
      <>
        <StudioReadOnlyBanner studioId={accessGate.studioId} />
        {children}
      </>
    );
  }
  return children;
}
