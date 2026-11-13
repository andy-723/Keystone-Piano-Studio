import { afterEach, describe, expect, it, vi } from "vitest";
import { resetSessionTimeoutForTests, markSessionStarted, isSessionLoginRequired } from "@/lib/session-timeout";
import { rememberVerifiedAccess, getVerifiedAccess, resetLiveAuthCacheForTests } from "@/lib/live-auth-cache";

const signOut = vi.fn(async () => ({}));

vi.mock("@/lib/auth-client", () => ({
  getAuthClient: () => ({
    auth: { signOut },
  }),
}));

afterEach(() => {
  resetSessionTimeoutForTests();
  resetLiveAuthCacheForTests();
  signOut.mockClear();
  vi.unstubAllGlobals();
});

describe("signOutLocal", () => {
  it("clears session markers, verified access, and the Supabase local session", async () => {
    markSessionStarted(1_700_000_000_000);
    rememberVerifiedAccess("tok", { kind: "ok" }, "teacher");
    const replace = vi.fn();
    vi.stubGlobal("location", { ...window.location, replace });

    const { signOutLocal } = await import("@/lib/sign-out");
    await signOutLocal({ redirectTo: "/login" });

    expect(signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(getVerifiedAccess("tok")).toBeUndefined();
    expect(isSessionLoginRequired()).toBe(true);
    expect(replace).toHaveBeenCalledWith("/login");
  });
});

describe("signOutForSessionTimeout", () => {
  it("sends people to login or welcome with a session_timeout reason", async () => {
    const replace = vi.fn();
    vi.stubGlobal("location", { ...window.location, replace });
    const { signOutForSessionTimeout } = await import("@/lib/sign-out");

    await signOutForSessionTimeout("/");
    expect(replace).toHaveBeenCalledWith("/welcome?reason=session_timeout");

    replace.mockClear();
    await signOutForSessionTimeout("/students");
    expect(replace).toHaveBeenCalledWith("/login?next=%2Fstudents&reason=session_timeout");
  });
});
