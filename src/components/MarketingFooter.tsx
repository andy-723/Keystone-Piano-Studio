import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { motion, useReducedMotion } from "framer-motion";
import keystoneLogo from "@/assets/brand/keystone-lockup-tagline-360@3x.png";

/**
 * Footer for the public marketing pages. Columns fade in from a soft blur as they scroll into
 * view (still for people who turn off motion). Company details (ABN etc.) are added once
 * Synoratech Pty Ltd is incorporated.
 */
const SECTIONS = [
  {
    label: "Product",
    links: [
      { to: "/welcome", label: "Features" },
      { to: "/pricing", label: "Pricing" },
      { to: "/contact", label: "Request a studio" },
    ],
  },
  {
    label: "Company",
    links: [
      { to: "/about", label: "About us" },
      { to: "/contact", label: "Contact us" },
      { to: "/login", label: "Sign in" },
    ],
  },
  {
    label: "Support",
    links: [{ to: "/help", label: "Help centre" }],
  },
  {
    label: "Legal",
    links: [
      { to: "/terms", label: "Terms of use" },
      { to: "/privacy", label: "Privacy" },
      { to: "/disclaimer", label: "Disclaimer" },
    ],
  },
] as const;

function Reveal({ delay = 0.1, className, children }: { delay?: number; className?: string; children: ReactNode }) {
  const reduce = useReducedMotion();
  if (reduce) return <div className={className}>{children}</div>;
  return (
    <motion.div
      initial={{ filter: "blur(4px)", y: -8, opacity: 0 }}
      whileInView={{ filter: "blur(0px)", y: 0, opacity: 1 }}
      viewport={{ once: true }}
      transition={{ delay, duration: 0.8 }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

export function MarketingFooter() {
  return (
    <div className="bg-mk-cream pt-12">
      <footer className="relative mx-auto w-full max-w-6xl rounded-t-[2.5rem] border-t border-mk-gold/60 bg-mk-paper px-6 py-12 text-mk-ink shadow-mk-lift md:rounded-t-[3.5rem] md:px-10 lg:py-16">
        <div
          aria-hidden
          className="absolute left-1/2 top-0 h-px w-1/3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-mk-gold blur-sm"
        />
        <div className="grid w-full gap-10 xl:grid-cols-3">
          <Reveal className="space-y-4">
            <img
              src={keystoneLogo}
              alt="Keystone Music HQ — Studio OS & LMS management platform"
              className="h-14 w-auto w-auto"
            />
            <p className="text-base text-mk-ink/70">
              © {new Date().getFullYear()} Keystone Music HQ. All rights reserved.
            </p>
            <p className="text-base text-mk-ink/70">Data hosted in Sydney, Australia.</p>
          </Reveal>
          <div className="grid grid-cols-2 gap-8 md:grid-cols-4 xl:col-span-2">
            {SECTIONS.map((section, i) => (
              <Reveal key={section.label} delay={0.1 + i * 0.1}>
                <h3 className="font-mk-sans text-base font-semibold uppercase tracking-[0.14em] text-mk-bronze">
                  {section.label}
                </h3>
                <ul className="mt-4 space-y-1">
                  {section.links.map((link) => (
                    <li key={link.label}>
                      <Link
                        to={link.to}
                        className="inline-flex min-h-12 items-center text-base text-mk-ink/75 transition-colors duration-300 hover:text-mk-bronze"
                      >
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </Reveal>
            ))}
          </div>
        </div>
      </footer>
    </div>
  );
}
