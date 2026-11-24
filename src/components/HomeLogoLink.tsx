import { useEffect, useState, type AnchorHTMLAttributes, type ReactNode } from "react";
import { getAuthClient, isLiveAuthConfigured } from "@/lib/auth-client";

/**
 * True once this browser holds a live Supabase session. Starts false (and stays false with no
 * Supabase keys), so server HTML and signed-out visitors always see the public links. The check
 * reads local storage only.
 */
export function useHasLiveSession(): boolean {
  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => {
    if (!isLiveAuthConfigured()) return;
    const client = getAuthClient();
    if (!client) return;
    let cancelled = false;
    void client.auth.getSession().then(({ data }) => {
      if (!cancelled && data.session) setSignedIn(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return signedIn;
}

/**
 * Where the Keystone logo goes: the public welcome page, unless the person is signed in to a
 * live account, then their studio's day-book ("/today"). It never opens the demo app: with no
 * Supabase keys, or no session, the answer is always /welcome.
 */
export function useHomeHref(): "/today" | "/welcome" {
  return useHasLiveSession() ? "/today" : "/welcome";
}

/**
 * "Sign in" on the public pages. A visitor who is already signed in sees "Open my studio" instead,
 * because the bare domain now always shows the welcome page.
 */
export function SignInOrStudioLink({
  signInLabel = "Sign in",
  ...anchorProps
}: { signInLabel?: ReactNode } & Omit<
  AnchorHTMLAttributes<HTMLAnchorElement>,
  "href" | "children"
>) {
  const signedIn = useHasLiveSession();
  return signedIn ? (
    <a {...anchorProps} href="/today">
      Open my studio
    </a>
  ) : (
    <a {...anchorProps} href="/login">
      {signInLabel}
    </a>
  );
}

export function HomeLogoLink({
  children,
  className,
  onClick,
}: {
  children: ReactNode;
  className?: string | undefined;
  onClick?: (() => void) | undefined;
}) {
  const href = useHomeHref();
  return (
    <a
      href={href}
      aria-label={href === "/today" ? "Keystone Music HQ, your studio" : "Keystone Music HQ home"}
      className={className}
      onClick={onClick}
    >
      {children}
    </a>
  );
}
