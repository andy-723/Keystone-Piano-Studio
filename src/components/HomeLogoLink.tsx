import { useEffect, useState, type ReactNode } from "react";
import { getAuthClient, isLiveAuthConfigured } from "@/lib/auth-client";

/**
 * Where the Keystone logo goes: the public welcome page, unless the person is signed in to a
 * live account, then their studio ("/"). It never opens the demo app: with no Supabase keys,
 * or no session, the answer is always /welcome. The session check reads local storage only.
 */
export function useHomeHref(): "/" | "/welcome" {
  const [href, setHref] = useState<"/" | "/welcome">("/welcome");
  useEffect(() => {
    if (!isLiveAuthConfigured()) return;
    const client = getAuthClient();
    if (!client) return;
    let cancelled = false;
    void client.auth.getSession().then(({ data }) => {
      if (!cancelled && data.session) setHref("/");
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return href;
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
      aria-label={href === "/" ? "Keystone Music HQ, your studio" : "Keystone Music HQ home"}
      className={className}
      onClick={onClick}
    >
      {children}
    </a>
  );
}
