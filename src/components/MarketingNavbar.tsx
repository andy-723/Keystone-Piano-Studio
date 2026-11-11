import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Menu, MenuItem, MenuLink } from "@/components/ui/navbar-menu";
import logo from "@/assets/brand/keystone-lockup-tagline-360@3x.png";
import {
  ArrowUpRight,
  BookOpen,
  LayoutDashboard,
  Receipt,
  Menu as MenuIcon,
  X,
} from "lucide-react";

export function MarketingNavbar() {
  const [expanded, setExpanded] = useState(false);
  return (
    <header className="mk-navbar-header font-mk-sans text-mk-ink">
      <div className="mk-navbar-bar">
        <Link
          to="/welcome"
          aria-label="Keystone Music HQ home"
          onClick={() => setExpanded(false)}
          className="min-w-0 shrink"
        >
          <img
            src={logo}
            alt="Keystone Music HQ — Studio OS & LMS management platform"
            width={1080}
            height={307}
            className="h-auto w-[250px] max-w-full sm:w-[280px]"
          />
        </Link>
        <Button
          type="button"
          variant="ghost"
          aria-label={expanded ? "Close navigation" : "Open navigation"}
          aria-expanded={expanded}
          aria-controls="marketing-navigation"
          onClick={() => setExpanded((value) => !value)}
          className="size-12 text-mk-ink hover:bg-mk-cream lg:hidden"
        >
          {expanded ? <X aria-hidden /> : <MenuIcon aria-hidden />}
        </Button>
        <div
          id="marketing-navigation"
          className={`mk-navbar-links ${expanded ? "mk-navbar-expanded" : ""}`}
        >
          <Menu onSelect={() => setExpanded(false)}>
            <MenuItem item="Explore Keystone">
              <div className="mk-navbar-products">
                {(
                  [
                    [
                      "snapshot-title",
                      "Studio Snapshot",
                      "A planned pulse of money, roll and practice.",
                      LayoutDashboard,
                    ],
                    [
                      "features-title",
                      "Teaching essentials",
                      "Day book, family chat and term invoices.",
                      BookOpen,
                    ],
                    [
                      "tax-title",
                      "Tax Lite · planned",
                      "Studio records for your EOFY review.",
                      Receipt,
                    ],
                  ] as const
                ).map(([hash, title, description, Icon]) => (
                  <MenuLink key={hash}>
                    <Link to="/welcome" hash={hash} className="mk-navbar-product">
                      <Icon className="size-7 shrink-0 text-mk-bronze" aria-hidden />
                      <span>
                        <span className="block font-mk-serif text-xl font-semibold">{title}</span>
                        <span className="mt-1 block text-base text-mk-ink/70">{description}</span>
                      </span>
                    </Link>
                  </MenuLink>
                ))}
              </div>
            </MenuItem>
            <MenuItem item="How it works">
              <div className="mk-navbar-simple">
                <MenuLink>
                  <Link to="/welcome" hash="enrolment">
                    From invite to first lesson
                  </Link>
                </MenuLink>
                <MenuLink>
                  <Link to="/welcome" hash="trust">
                    Student privacy & care
                  </Link>
                </MenuLink>
              </div>
            </MenuItem>
            <MenuItem item="Pricing">
              <div className="mk-navbar-simple">
                <MenuLink>
                  <Link to="/pricing">
                    <span className="block font-mk-serif text-xl font-semibold">
                      Compare Base & Pro
                    </span>
                    <span className="mt-1 block text-base text-mk-ink/70">
                      Find the right fit for your studio.
                    </span>
                  </Link>
                </MenuLink>
              </div>
            </MenuItem>
          </Menu>
          <Button
            asChild
            variant="ghost"
            className="min-h-12 text-base text-mk-ink hover:bg-mk-cream"
          >
            <a href="/login">
              Sign in <ArrowUpRight aria-hidden className="size-4" />
            </a>
          </Button>
        </div>
      </div>
    </header>
  );
}
