import { useEffect, useRef } from "react";
import { useRouterState } from "@tanstack/react-router";
import {
  getSessionLastActivityAt,
  getSessionStartedAt,
  getSessionTimeoutReason,
  SESSION_ABSOLUTE_MS,
  SESSION_IDLE_MS,
  touchSessionActivity,
} from "@/lib/session-timeout";
import { signOutForSessionTimeout } from "@/lib/sign-out";

const ACTIVITY_EVENTS = ["pointerdown", "keydown", "click", "touchstart"] as const;

/** How often to re-check timers while the tab is open (activity also re-arms the idle alarm). */
const CHECK_EVERY_MS = 30_000;

/**
 * Enforces idle + absolute session timeouts while the person is in the app.
 * Mount only after LiveAuthGuard has allowed the route (demo and live alike).
 */
export function SessionTimeout() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const search = useRouterState({ select: (state) => state.location.searchStr });
  const signingOut = useRef(false);

  useEffect(() => {
    let cancelled = false;
    let idleAlarm: ReturnType<typeof setTimeout> | null = null;

    async function expire() {
      if (cancelled || signingOut.current) return;
      if (!getSessionTimeoutReason()) return;
      signingOut.current = true;
      await signOutForSessionTimeout(pathname, search || "");
    }

    function armIdleAlarm() {
      if (idleAlarm) clearTimeout(idleAlarm);
      const last = getSessionLastActivityAt() ?? Date.now();
      const remaining = Math.max(0, last + SESSION_IDLE_MS - Date.now());
      idleAlarm = setTimeout(() => {
        void expire();
      }, remaining);
    }

    function onActivity() {
      if (signingOut.current) return;
      touchSessionActivity();
      armIdleAlarm();
      if (getSessionTimeoutReason()) void expire();
    }

    function onVisibility() {
      if (document.visibilityState === "visible") {
        if (getSessionTimeoutReason()) void expire();
        else onActivity();
      }
    }

    const startedAt = getSessionStartedAt() ?? Date.now();
    const absoluteRemaining = Math.max(0, startedAt + SESSION_ABSOLUTE_MS - Date.now());
    const absoluteAlarm = setTimeout(() => {
      void expire();
    }, absoluteRemaining);

    const interval = setInterval(() => {
      if (getSessionTimeoutReason()) void expire();
    }, CHECK_EVERY_MS);

    for (const event of ACTIVITY_EVENTS) {
      window.addEventListener(event, onActivity, { passive: true });
    }
    document.addEventListener("visibilitychange", onVisibility);
    // Navigation counts as activity (pathname/search in the effect deps).
    touchSessionActivity();
    armIdleAlarm();

    if (getSessionTimeoutReason()) void expire();

    return () => {
      cancelled = true;
      if (idleAlarm) clearTimeout(idleAlarm);
      clearTimeout(absoluteAlarm);
      clearInterval(interval);
      for (const event of ACTIVITY_EVENTS) {
        window.removeEventListener(event, onActivity);
      }
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [pathname, search]);

  return null;
}
