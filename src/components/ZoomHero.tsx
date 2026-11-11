import { useEffect, useRef, type ReactNode } from "react";

/**
 * Sticky scroll-driven zoom: the stage image pushes in toward the piano while the
 * headline scales past the viewer, then the section unpins into the next one.
 * Uses native scrolling (no scroll locking) and is static under reduced motion.
 */
export function ZoomHero({
  image,
  alt,
  overlay,
  nav,
  children,
}: {
  image: string;
  alt: string;
  overlay: ReactNode;
  nav: ReactNode;
  children: ReactNode;
}) {
  const trackRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      track.dataset["static"] = "true";
      return;
    }
    let raf = 0;
    const update = () => {
      raf = 0;
      const rect = track.getBoundingClientRect();
      const travel = track.offsetHeight - window.innerHeight;
      const p = travel > 0 ? Math.min(1, Math.max(0, -rect.top / travel)) : 0;
      track.style.setProperty("--zoom-p", p.toFixed(4));
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div ref={trackRef} className="mk-zoom-track relative">
      <section className="mk-zoom-stage sticky top-0 isolate flex h-svh flex-col overflow-hidden bg-mk-ink text-mk-paper">
        <img
          src={image}
          alt={alt}
          width={1600}
          height={1008}
          className="mk-zoom-image absolute inset-0 -z-10 h-full w-full object-cover"
        />
        <div className="mk-zoom-shade absolute inset-0 -z-10" aria-hidden>
          {overlay}
        </div>
        <div className="mk-zoom-nav relative z-20">{nav}</div>
        <div className="mk-zoom-copy flex flex-1">{children}</div>
        <div
          className="mk-zoom-fade pointer-events-none absolute inset-0 z-30 bg-mk-paper"
          aria-hidden
        />
      </section>
    </div>
  );
}
