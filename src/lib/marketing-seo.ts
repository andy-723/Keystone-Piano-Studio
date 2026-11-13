/**
 * Shared marketing SEO for public pages. The bare `/` route is the signed-in day-book, but
 * crawlers and link previews hit it before any redirect — so `/` must advertise the welcome page.
 */

export const MARKETING_SITE_ORIGIN = "https://www.keystonemusichq.com";

export const MARKETING_HOME_TITLE = "Keystone Music HQ — Studio Snapshot & Tax Lite";

export const MARKETING_HOME_DESCRIPTION =
  "Studio Snapshot for your teaching week. Tax Lite for EOFY. Explore the calm finance and operations workspace for independent Australian music studios.";

export const MARKETING_HOME_OG_DESCRIPTION =
  "Unpaid, unenrolled, not practising — one calm studio view. Discover Studio Snapshot, Tax Lite and Pro CFO tools for Australian music studios.";

/** Meta + canonical used by `/` (for crawlers) and `/welcome`. */
export function marketingHomeHead() {
  return {
    meta: [
      { title: MARKETING_HOME_TITLE },
      { name: "description", content: MARKETING_HOME_DESCRIPTION },
      { property: "og:title", content: MARKETING_HOME_TITLE },
      { property: "og:description", content: MARKETING_HOME_OG_DESCRIPTION },
      { property: "og:type", content: "website" },
      { property: "og:url", content: `${MARKETING_SITE_ORIGIN}/welcome` },
      { property: "og:image", content: `${MARKETING_SITE_ORIGIN}/og-image.png` },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: `${MARKETING_SITE_ORIGIN}/welcome` }],
  };
}

/** Public paths listed in sitemap.xml (keep in sync with public/sitemap.xml). */
export const SITEMAP_PATHS = [
  "/welcome",
  "/pricing",
  "/about",
  "/contact",
  "/help",
  "/terms",
  "/privacy",
  "/disclaimer",
] as const;
