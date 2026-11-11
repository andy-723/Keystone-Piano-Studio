import { useEffect, useRef, type ReactNode } from "react";

/** Progressive enhancement: content stays readable before hydration and without motion. */
export function MarketingMotion({ children }: { children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!root.current || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("mk-revealed");
          observer.unobserve(entry.target);
        });
      },
      { threshold: 0.08 },
    );
    root.current
      .querySelectorAll(
        "section h2, section article, section ol > li, section dl > div, [data-reveal]",
      )
      .forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, []);
  return (
    <div ref={root} className="marketing-site">
      {children}
    </div>
  );
}
