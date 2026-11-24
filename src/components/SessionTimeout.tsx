import { useEffect, useRef } from "react";
import { useRouterState } from "@tanstack/react-router";
import {
  getSessionLastActivityAt,
  getSessionStartedAt,
  getSessionTimeoutReason,
  sessionLimits,
  touchSessionActivity,
} from "@/lib/session-timeout";
import { signOutForSessionTimeout } from "@/lib/sign-out";

const ACTIVITY_EVENTS = ["pointerdown", "keydown", "click", "touchstart"] as const;

/** How often to re-check timers while the tab is open (activity also re-arms the idle alarm). */
const CHECK_EVERY_MS = 30_000;
/** Browsers fire a setTimeout longer than ~24.8 days at once; the 30-second check covers the rest. */
const MAX_ALARM_MS = 24 * 60 * 60 * 1000;

/**
 * Enforces idle + absolute session timeouts while the person is in the app (longer on a
 * trusted device, see src/lib/session-timeout.ts).
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
      const remaining = Math.min(
        MAX_ALARM_MS,
        Math.max(0, last + sessionLimits().idleMs - Date.now()),
      );
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
    const absoluteRemaining = Math.min(
      MAX_ALARM_MS,
      Math.max(0, startedAt + sessionLimits().absoluteMs - Date.now()),
    );
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
