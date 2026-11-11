import type { ReactNode } from "react";
import * as Navigation from "@radix-ui/react-navigation-menu";
import { motion, useReducedMotion } from "framer-motion";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";

export function Menu({ children, onSelect }: { children: ReactNode; onSelect: () => void }) {
  return (
    <Navigation.Root
      aria-label="Main navigation"
      className="mk-navbar-menu"
      delayDuration={100}
      onClick={(event) => {
        if ((event.target as HTMLElement).closest("a")) onSelect();
      }}
    >
      <Navigation.List className="mk-navbar-list">{children}</Navigation.List>
      <div className="mk-navbar-viewport-position">
        <Navigation.Viewport className="mk-navbar-viewport" />
      </div>
    </Navigation.Root>
  );
}

export function MenuItem({ item, children }: { item: string; children: ReactNode }) {
  const reduced = useReducedMotion();
  return (
    <Navigation.Item>
      <Navigation.Trigger
        asChild
        onPointerMove={(event) => {
          if (window.matchMedia("(max-width: 1023px)").matches) event.preventDefault();
        }}
      >
        <Button
          variant="ghost"
          type="button"
          className="mk-navbar-trigger min-h-12 text-base text-mk-ink hover:bg-mk-cream"
        >
          <span>{item}</span>
          <ChevronDown className="size-4" aria-hidden />
        </Button>
      </Navigation.Trigger>
      <Navigation.Content className="mk-navbar-content">
        <motion.div
          initial={reduced ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          className="mk-navbar-panel"
        >
          {children}
        </motion.div>
      </Navigation.Content>
    </Navigation.Item>
  );
}

export function MenuLink({ children }: { children: ReactNode }) {
  return <Navigation.Link asChild>{children}</Navigation.Link>;
}
