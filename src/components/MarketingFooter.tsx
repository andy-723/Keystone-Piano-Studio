import { Link } from "@tanstack/react-router";

/**
 * Footer for the public marketing pages (/welcome, /pricing). Company details (ABN etc.) are
 * added here once Synoratech Pty Ltd is incorporated; until then it shows the product name only.
 */
const LINKS = [
  { to: "/pricing", label: "Pricing" },
  { to: "/help", label: "Help" },
  { to: "/terms", label: "Terms of use" },
  { to: "/privacy", label: "Privacy" },
  { to: "/disclaimer", label: "Disclaimer" },
] as const;

export function MarketingFooter() {
  return (
    <footer className="border-t border-mk-gold/50 bg-mk-paper">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-5 py-8 text-base text-mk-ink/70 md:px-10">
        <p>© 2026 Keystone Music HQ</p>
        <nav aria-label="Footer" className="flex flex-wrap gap-x-6 gap-y-2">
          {LINKS.map((link) => (
            <Link key={link.to} to={link.to} className="hover:text-mk-ink">
              {link.label}
            </Link>
          ))}
          <span>Data hosted in Sydney, Australia</span>
        </nav>
      </div>
    </footer>
  );
}
