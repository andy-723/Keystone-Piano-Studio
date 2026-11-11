/** Same-origin relative paths only — reject protocol-relative and absolute URLs. */
export function safeNextPath(next: string | null | undefined): string | null {
  if (!next) return null;
  const value = next.trim();
  if (!value.startsWith("/")) return null;
  if (value.startsWith("//")) return null;
  if (value.includes("://")) return null;
  if (value.includes("\\")) return null;
  return value;
}

export function maskEmail(email: string): string {
  const trimmed = email.trim();
  const at = trimmed.indexOf("@");
  if (at <= 0) return "***";
  const local = trimmed.slice(0, at);
  const domain = trimmed.slice(at + 1);
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}***@${domain}`;
}

/** Public web pages (Help, Privacy, Terms, Welcome, Pricing): no session and no app shell. */
export const PUBLIC_PAGE_PATHS = ["/help", "/privacy", "/terms", "/welcome", "/pricing"] as const;

export function isPublicPagePath(pathname: string): boolean {
  const path = pathname.replace(/\/+$/, "") || "/";
  return (PUBLIC_PAGE_PATHS as readonly string[]).includes(path);
}

/**
 * Where a visitor with no session goes. The bare home page (keystonemusichq.com/) shows the public
 * welcome page, which links to sign-in; every other app page goes to /login and comes back after.
 */
export function signedOutRedirect(pathname: string, search = ""): string {
  const path = pathname.replace(/\/+$/, "") || "/";
  if (path === "/") return "/welcome";
  return `/login?next=${encodeURIComponent(`${pathname}${search}`)}`;
}

/** Public routes that do not require a live session. */
export function isAuthExemptPath(pathname: string): boolean {
  if (pathname === "/login" || pathname === "/studio-enquiry") return true;
  if (isPublicPagePath(pathname)) return true;
  if (pathname.startsWith("/auth/")) return true;
  if (pathname.startsWith("/join/")) return true;
  if (pathname.startsWith("/intake/")) return true;
  if (pathname.startsWith("/api/")) return true;
  return false;
}

/**
 * Routes that render without the teacher/parent AppShell and do not need studio fixture priming.
 * Includes platform admin (`/admin`) so staff land without waiting on mock studio/parent loaders.
 */
export function isFocusFlowPath(pathname: string): boolean {
  if (pathname === "/login" || pathname === "/studio-enquiry" || pathname === "/admin") return true;
  if (
    pathname.startsWith("/join/") ||
    pathname.startsWith("/intake/") ||
    pathname.startsWith("/auth/")
  ) {
    return true;
  }
  return isPublicPagePath(pathname);
}

/**
 * Email link types our branded Supabase Auth templates send to /auth/callback
 * as ?token_hash=…&type=…. Anything else is ignored.
 */
export const EMAIL_LINK_TYPES = [
  "email",
  "magiclink",
  "signup",
  "invite",
  "recovery",
  "email_change",
] as const;
export type EmailLinkType = (typeof EMAIL_LINK_TYPES)[number];

export function parseEmailLink(
  params: URLSearchParams,
): { tokenHash: string; type: EmailLinkType } | null {
  const tokenHash = params.get("token_hash")?.trim();
  const type = params.get("type")?.trim();
  if (!tokenHash || !type) return null;
  if (!/^[A-Za-z0-9_-]{8,200}$/.test(tokenHash)) return null;
  if (!(EMAIL_LINK_TYPES as readonly string[]).includes(type)) return null;
  return { tokenHash, type: type as EmailLinkType };
}
