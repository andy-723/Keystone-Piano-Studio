import { useCallback, useEffect, useRef, useState } from "react";
import {
  LOGIN_ANIM_DURATION_MS,
  markAnimPlayed,
  prefersReducedMotion,
  shouldAutoplayAnim,
} from "@/lib/login-animation";

/**
 * Drives the street-scene play-on / ending classes. Never blocks form focus.
 * Autoplay once per calendar day; pauses while the tab is hidden.
 */
export function useStreetAnimation() {
  const [playing, setPlaying] = useState(false);
  const [ending, setEnding] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const remainingRef = useRef(LOGIN_ANIM_DURATION_MS);
  const startedAtRef = useRef<number | null>(null);
  const reduced = prefersReducedMotion();

  const clearTimer = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const finish = useCallback(() => {
    clearTimer();
    setPlaying(false);
    setEnding(false);
    startedAtRef.current = null;
    remainingRef.current = LOGIN_ANIM_DURATION_MS;
    markAnimPlayed();
  }, []);

  const scheduleFinish = useCallback(
    (ms: number) => {
      clearTimer();
      startedAtRef.current = Date.now();
      timerRef.current = setTimeout(() => finish(), ms);
    },
    [finish],
  );

  const play = useCallback(() => {
    clearTimer();
    remainingRef.current = LOGIN_ANIM_DURATION_MS;
    setEnding(false);
    setPlaying(true);
    // Colour fade still runs under reduced motion; movement CSS is disabled.
    scheduleFinish(LOGIN_ANIM_DURATION_MS);
    // Mark ending shortly before finish so floating notes stop looping.
    window.setTimeout(() => setEnding(true), Math.max(0, LOGIN_ANIM_DURATION_MS - 1500));
    void reduced;
  }, [reduced, scheduleFinish]);

  useEffect(() => {
    if (shouldAutoplayAnim()) play();
    return () => clearTimer();
  }, [play]);

  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) {
        if (playing && startedAtRef.current != null) {
          const elapsed = Date.now() - startedAtRef.current;
          remainingRef.current = Math.max(0, remainingRef.current - elapsed);
          clearTimer();
        }
        return;
      }
      if (playing && remainingRef.current > 0) {
        scheduleFinish(remainingRef.current);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [playing, scheduleFinish]);

  return {
    playing,
    ending,
    className: ["ks-street", playing ? "play-on" : "", ending ? "ending" : ""]
      .filter(Boolean)
      .join(" "),
    replay: play,
  };
}
