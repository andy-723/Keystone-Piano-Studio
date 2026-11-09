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

/** Public web pages (Help, Privacy, Terms): no session and no app shell. */
export const PUBLIC_PAGE_PATHS = ["/help", "/privacy", "/terms"] as const;

export function isPublicPagePath(pathname: string): boolean {
  const path = pathname.replace(/\/+$/, "") || "/";
  return (PUBLIC_PAGE_PATHS as readonly string[]).includes(path);
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
