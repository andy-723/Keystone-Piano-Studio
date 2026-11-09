import { useEffect, useRef, useState } from "react";
import {
  LOGIN_ANIM_CYCLE_MS,
  LOGIN_ANIM_DURATION_MS,
  LOGIN_ANIM_ENDING_LEAD_MS,
  prefersReducedMotion,
} from "@/lib/login-animation";

type Phase = "idle" | "playing" | "ending";

/**
 * Drives the street-scene play-on / ending classes in a continuous loop: a 13 s colour reveal,
 * a short grey pause, then the reveal again. Pauses while the tab is hidden and restarts from
 * the top when it is shown again. Under prefers-reduced-motion the reveal runs once (colour fade
 * only; movement CSS is disabled) and does not loop. Never blocks form focus.
 */
export function useStreetAnimation() {
  const [phase, setPhase] = useState<Phase>("idle");
  const timers = useRef<Array<ReturnType<typeof setTimeout>>>([]);
  const frame = useRef<number | null>(null);

  useEffect(() => {
    const reduced = prefersReducedMotion();

    const clearAll = () => {
      for (const t of timers.current) clearTimeout(t);
      timers.current = [];
      if (frame.current != null) cancelAnimationFrame(frame.current);
      frame.current = null;
    };

    const runCycle = () => {
      clearAll();
      // Drop play-on for two frames so the browser restarts every CSS animation from 0.
      setPhase("idle");
      frame.current = requestAnimationFrame(() => {
        frame.current = requestAnimationFrame(() => {
          frame.current = null;
          setPhase("playing");
          timers.current.push(
            setTimeout(
              () => setPhase("ending"),
              LOGIN_ANIM_DURATION_MS - LOGIN_ANIM_ENDING_LEAD_MS,
            ),
          );
          if (reduced) {
            timers.current.push(setTimeout(() => setPhase("idle"), LOGIN_ANIM_DURATION_MS));
          } else {
            timers.current.push(setTimeout(runCycle, LOGIN_ANIM_CYCLE_MS));
          }
        });
      });
    };

    const onVisibility = () => {
      if (document.hidden) {
        clearAll();
        setPhase("idle");
      } else if (!reduced) {
        runCycle();
      }
    };

    if (!document.hidden) runCycle();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      clearAll();
    };
  }, []);

  return {
    playing: phase !== "idle",
    ending: phase === "ending",
    className: ["ks-street", phase !== "idle" ? "play-on" : "", phase === "ending" ? "ending" : ""]
      .filter(Boolean)
      .join(" "),
  };
}
