import { useEffect, useState, type ReactNode } from "react";
import { useRouterState } from "@tanstack/react-router";
import { getAuthClient, isLiveAuthConfigured } from "@/lib/auth-client";
import { isAuthExemptPath } from "@/lib/auth-paths";

/**
 * In live mode, redirects unauthenticated users to /login?next=… for protected routes.
 * Mock mode is a no-op (demo role switcher unchanged).
 */
export function LiveAuthGuard({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const search = useRouterState({ select: (state) => state.location.searchStr });
  const [ready, setReady] = useState(!isLiveAuthConfigured());

  useEffect(() => {
    if (!isLiveAuthConfigured()) {
      setReady(true);
      return;
    }
    if (isAuthExemptPath(pathname)) {
      setReady(true);
      return;
    }
    let cancelled = false;
    void (async () => {
      const client = getAuthClient();
      if (!client) {
        const next = `${pathname}${search || ""}`;
        window.location.replace(`/login?next=${encodeURIComponent(next)}`);
        return;
      }
      const { data } = await client.auth.getSession();
      if (cancelled) return;
      if (!data.session) {
        const next = `${pathname}${search || ""}`;
        window.location.replace(`/login?next=${encodeURIComponent(next)}`);
        return;
      }
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [pathname, search]);

  if (!ready) {
    return <p className="p-6 text-[#5A4F43]">Checking sign-in…</p>;
  }
  return children;
}
