/**
 * From / reply-to helpers for studio-sent mail, and family invoice links for chat chasers.
 * Prefer the studio's own email; fall back to Keystone's domain (never *.example).
 */

export const KEYSTONE_MAIL_FALLBACK = "noreply@keystonemusichq.com";

export function studioSenderFrom(studioName: string, studioEmail?: string | null): string {
  const address = studioEmail?.trim() || KEYSTONE_MAIL_FALLBACK;
  return `${studioName} <${address}>`;
}

export function studioReplyTo(studioEmail?: string | null): string {
  return studioEmail?.trim() || KEYSTONE_MAIL_FALLBACK;
}

/** Public origin for links in family-facing copy (APP_URL / VITE_APP_URL / window). */
export function publicAppOrigin(): string {
  const vite = (
    import.meta as ImportMeta & { env?: { VITE_APP_URL?: string } }
  ).env?.VITE_APP_URL?.trim();
  if (vite) return vite.replace(/\/$/, "");
  if (typeof process !== "undefined") {
    const appUrl = process.env?.APP_URL?.trim() || process.env?.VITE_APP_URL?.trim();
    if (appUrl) return appUrl.replace(/\/$/, "");
  }
  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin.replace(/\/$/, "");
  }
  return "https://www.keystonemusichq.com";
}

/** Deep link into the family portal invoices tab for a specific invoice. */
export function familyInvoiceLink(invoiceId: string): string {
  return `${publicAppOrigin()}/?view=invoices&invoice=${encodeURIComponent(invoiceId)}`;
}
