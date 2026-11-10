import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { CircleHelp, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getTourProgress, saveTourProgress, type TourId } from "@/services/tour";
import { tourControl, tourText, type TourStep } from "@/lib/tour-steps";
import type { Lang } from "@/mocks/types";

/** How long a step waits for its element to appear (route change, suspense) before centring. */
export const TOUR_TARGET_WAIT_MS = 3000;

type TourContextValue = { tourId: TourId; lang: Lang; start: () => void; active: boolean };
const TourContext = createContext<TourContextValue | null>(null);

/** The surrounding tour, or null when none is mounted (for example in parent mode for the studio tour). */
export function useTour() {
  return useContext(TourContext);
}

function visible(element: Element | null): element is HTMLElement {
  if (!(element instanceof HTMLElement)) return false;
  const rect = element.getBoundingClientRect();
  return rect.width > 0 || rect.height > 0;
}

export function findTourTarget(target: string | null): HTMLElement | null {
  if (!target || typeof document === "undefined") return null;
  const matches = Array.from(document.querySelectorAll(`[data-tour="${target}"]`));
  return (matches.find(visible) as HTMLElement | undefined) ?? null;
}

type Props = {
  tourId: TourId;
  steps: TourStep[];
  lang?: Lang;
  /** Opens the step's screen (route or portal tab) before it is highlighted. */
  onStep?: (step: TourStep) => void;
  /** Offer the tour automatically the first time. */
  autoStart?: boolean;
  /** Tailwind classes that keep the card above this shell's bottom tab bar on phones. */
  cardBottomClass?: string;
  /** Hold the tour back while something more important is open (for example a terms update). */
  paused?: boolean;
  children: ReactNode;
};

export function TourProvider({
  tourId,
  steps,
  lang = "en",
  onStep,
  autoStart = true,
  cardBottomClass = "bottom-4",
  paused = false,
  children,
}: Props) {
  const [index, setIndex] = useState<number | null>(null);
  const onStepRef = useRef(onStep);
  onStepRef.current = onStep;

  useEffect(() => {
    let cancelled = false;
    void getTourProgress(tourId).then((progress) => {
      if (cancelled) return;
      if (progress.status === "in_progress")
        setIndex(Math.min(progress.stepIndex, steps.length - 1));
      else if (progress.status === "not_started" && autoStart) setIndex(0);
    });
    return () => {
      cancelled = true;
    };
  }, [tourId, steps.length, autoStart]);

  useEffect(() => {
    if (index === null || paused) return;
    const step = steps[index];
    if (!step) return;
    onStepRef.current?.(step);
    // Step 0 is only an offer; progress starts when the person moves on.
    if (index > 0) void saveTourProgress(tourId, { stepIndex: index, status: "in_progress" });
  }, [index, steps, tourId, paused]);

  const close = useCallback(
    (status: "dismissed" | "completed") => {
      void saveTourProgress(tourId, { stepIndex: 0, status });
      setIndex(null);
    },
    [tourId],
  );

  const start = useCallback(() => {
    void saveTourProgress(tourId, { stepIndex: 0, status: "in_progress" });
    setIndex(0);
  }, [tourId]);

  return (
    <TourContext.Provider value={{ tourId, lang, start, active: index !== null }}>
      {children}
      {index !== null && !paused && steps[index] && (
        <TourCard
          step={steps[index]}
          index={index}
          total={steps.length}
          lang={lang}
          cardBottomClass={cardBottomClass}
          onBack={() => setIndex((i) => (i === null ? i : Math.max(0, i - 1)))}
          onNext={() => (index >= steps.length - 1 ? close("completed") : setIndex(index + 1))}
          onSkip={() => close("dismissed")}
        />
      )}
    </TourContext.Provider>
  );
}

type Rect = { top: number; left: number; width: number; height: number };

function useTargetRect(target: string | null, stepKey: string) {
  const [rect, setRect] = useState<Rect | null>(null);

  useEffect(() => {
    setRect(null);
    if (!target) return;
    let element: HTMLElement | null = null;
    const measure = () => {
      if (!element || !element.isConnected) {
        setRect(null);
        return;
      }
      const r = element.getBoundingClientRect();
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
    };
    const attach = (found: HTMLElement) => {
      element = found;
      const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      const tall = found.getBoundingClientRect().height > window.innerHeight * 0.5;
      found.scrollIntoView?.({
        block: tall ? "start" : "center",
        behavior: reduce ? "auto" : "smooth",
      });
      measure();
    };
    const found = findTourTarget(target);
    let observer: MutationObserver | null = null;
    let timeout: ReturnType<typeof setTimeout> | null = null;
    if (found) attach(found);
    else {
      // Wait for the screen to render the element; no timers polling services.
      observer = new MutationObserver(() => {
        const next = findTourTarget(target);
        if (next) {
          observer?.disconnect();
          observer = null;
          attach(next);
        }
      });
      observer.observe(document.body, { childList: true, subtree: true });
      timeout = setTimeout(() => observer?.disconnect(), TOUR_TARGET_WAIT_MS);
    }
    window.addEventListener("scroll", measure, true);
    window.addEventListener("resize", measure);
    return () => {
      observer?.disconnect();
      if (timeout) clearTimeout(timeout);
      window.removeEventListener("scroll", measure, true);
      window.removeEventListener("resize", measure);
    };
  }, [target, stepKey]);

  return rect;
}

function TourCard({
  step,
  index,
  total,
  lang,
  cardBottomClass,
  onBack,
  onNext,
  onSkip,
}: {
  step: TourStep;
  index: number;
  total: number;
  lang: Lang;
  cardBottomClass: string;
  onBack: () => void;
  onNext: () => void;
  onSkip: () => void;
}) {
  const rect = useTargetRect(step.target, step.id);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const first = index === 0;
  const last = index === total - 1;
  const centred = !step.target || !rect;

  useLayoutEffect(() => {
    headingRef.current?.focus();
  }, [step.id]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onSkip();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onSkip]);

  const titleId = `tour-title-${step.id}`;
  // Phones: sit just above the highlighted element (or below it when there is room above the
  // bottom tab bar) so the card never covers it. Tablet and up: bottom-right corner.
  const phone = typeof window !== "undefined" && window.innerWidth < 768;
  const room = 320;
  const phoneStyle =
    !centred && phone && rect
      ? rect.top >= room + 16
        ? { bottom: window.innerHeight - rect.top + 16 }
        : window.innerHeight - (rect.top + rect.height) >= room + 160
          ? { top: rect.top + rect.height + 16 }
          : undefined
      : undefined;
  const position = centred
    ? "inset-x-3 top-1/2 -translate-y-1/2 mx-auto max-w-md"
    : phoneStyle
      ? "inset-x-3"
      : `inset-x-3 ${cardBottomClass} md:left-auto md:right-6 md:bottom-6 md:w-[26rem]`;

  return (
    <>
      {rect && (
        <div
          aria-hidden
          data-testid="tour-highlight"
          className="pointer-events-none fixed z-40 rounded-xl ring-4 ring-primary ring-offset-2 ring-offset-background motion-safe:transition-all"
          style={{
            top: rect.top - 6,
            left: rect.left - 6,
            width: rect.width + 12,
            height: rect.height + 12,
          }}
        />
      )}
      <section
        role="dialog"
        aria-modal="false"
        aria-labelledby={titleId}
        className={`fixed z-50 rounded-xl border-2 border-primary bg-card p-5 text-card-foreground shadow-2xl ${position}`}
        style={phoneStyle}
      >
        <div className="flex items-start justify-between gap-3">
          <p className="text-base text-muted-foreground">
            {tourControl("stepOf", lang, { n: index + 1, total })}
          </p>
          <Button
            variant="ghost"
            size="icon"
            className="-mr-2 -mt-2 size-11"
            aria-label={tourControl("skip", lang)}
            onClick={onSkip}
          >
            <X aria-hidden />
          </Button>
        </div>
        <h2
          id={titleId}
          ref={headingRef}
          tabIndex={-1}
          className="mt-1 text-xl font-semibold outline-none"
        >
          {tourText(step.title, lang)}
        </h2>
        <p className="mt-2 text-base">{tourText(step.body, lang)}</p>
        <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
          {first ? (
            <>
              <Button variant="ghost" className="min-h-12" onClick={onSkip}>
                {tourControl("notNow", lang)}
              </Button>
              <Button className="min-h-12" onClick={onNext}>
                {tourControl("start", lang)}
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" className="min-h-12" onClick={onBack}>
                {tourControl("back", lang)}
              </Button>
              <Button className="min-h-12" onClick={onNext}>
                {tourControl(last ? "finish" : "next", lang)}
              </Button>
            </>
          )}
        </div>
      </section>
    </>
  );
}

/** The ? button that replays the tour. Renders nothing when no tour is mounted. */
export function TourHelpButton({ className = "" }: { className?: string }) {
  const tour = useTour();
  if (!tour) return null;
  const label = tourControl("replay", tour.lang);
  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      className={`size-12 shrink-0 rounded-full ${className}`}
      aria-label={label}
      title={label}
      onClick={tour.start}
    >
      <CircleHelp className="size-6" aria-hidden />
    </Button>
  );
}
