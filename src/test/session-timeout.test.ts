import { afterEach, describe, expect, it, vi } from "vitest";
import {
  SESSION_ABSOLUTE_MS,
  SESSION_IDLE_MS,
  clearSessionLoginRequired,
  ensureSessionMarkers,
  getSessionLastActivityAt,
  getSessionStartedAt,
  getSessionTimeoutReason,
  isSessionLoginRequired,
  isSessionTimedOut,
  markSessionLoginRequired,
  markSessionStarted,
  resetSessionTimeoutForTests,
  touchSessionActivity,
} from "@/lib/session-timeout";
import { signedOutRedirect } from "@/lib/auth-paths";

afterEach(() => {
  resetSessionTimeoutForTests();
  vi.useRealTimers();
});

describe("session timeout defaults", () => {
  it("uses a 30-minute idle timeout and an 8-hour absolute lifetime", () => {
    expect(SESSION_IDLE_MS).toBe(30 * 60 * 1000);
    expect(SESSION_ABSOLUTE_MS).toBe(8 * 60 * 60 * 1000);
  });
});

describe("session timeout clocks", () => {
  it("starts idle and absolute clocks together on sign-in", () => {
    const t0 = 1_700_000_000_000;
    markSessionStarted(t0);
    expect(getSessionStartedAt()).toBe(t0);
    expect(getSessionLastActivityAt()).toBe(t0);
    expect(isSessionLoginRequired()).toBe(false);
    expect(getSessionTimeoutReason(t0)).toBeNull();
  });

  it("resets idle on activity but keeps the absolute start", () => {
    const t0 = 1_700_000_000_000;
    markSessionStarted(t0);
    const later = t0 + 10 * 60 * 1000;
    touchSessionActivity(later);
    expect(getSessionStartedAt()).toBe(t0);
    expect(getSessionLastActivityAt()).toBe(later);
    expect(getSessionTimeoutReason(later + SESSION_IDLE_MS - 1)).toBeNull();
    expect(getSessionTimeoutReason(later + SESSION_IDLE_MS)).toBe("idle");
  });

  it("expires on absolute lifetime even when the person stays active", () => {
    const t0 = 1_700_000_000_000;
    markSessionStarted(t0);
    const almost = t0 + SESSION_ABSOLUTE_MS - 1;
    touchSessionActivity(almost);
    expect(getSessionTimeoutReason(almost)).toBeNull();
    expect(getSessionTimeoutReason(t0 + SESSION_ABSOLUTE_MS)).toBe("absolute");
    expect(isSessionTimedOut(t0 + SESSION_ABSOLUTE_MS)).toBe(true);
  });

  it("prefers absolute when both idle and absolute would fire", () => {
    const t0 = 1_700_000_000_000;
    markSessionStarted(t0);
    expect(getSessionTimeoutReason(t0 + SESSION_ABSOLUTE_MS + SESSION_IDLE_MS)).toBe("absolute");
  });

  it("ensureSessionMarkers does not move startedAt forward", () => {
    const t0 = 1_700_000_000_000;
    markSessionStarted(t0);
    ensureSessionMarkers(t0 + 60_000);
    expect(getSessionStartedAt()).toBe(t0);
  });

  it("marks login-required after a timeout so mock mode cannot silently reopen", () => {
    markSessionStarted(1_700_000_000_000);
    markSessionLoginRequired();
    expect(isSessionLoginRequired()).toBe(true);
    clearSessionLoginRequired();
    expect(isSessionLoginRequired()).toBe(false);
  });

  it("returns null when no session markers exist (not yet signed in)", () => {
    expect(getSessionTimeoutReason()).toBeNull();
    expect(isSessionTimedOut()).toBe(false);
  });
});

describe("session timeout redirect", () => {
  it("sends the home page to welcome and other routes to login", () => {
    expect(signedOutRedirect("/")).toBe("/welcome");
    expect(signedOutRedirect("/students")).toBe("/login?next=%2Fstudents");
  });
});
