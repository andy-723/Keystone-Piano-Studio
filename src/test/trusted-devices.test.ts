import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  deviceLabel,
  lastMfaAt,
  STEP_UP_WINDOW_MS,
  stepUpNeeded,
  TRUSTED_DEVICE_MS,
  TRUSTED_IDLE_MS,
  trustStateFor,
  type TrustedDeviceRow,
} from "@/lib/trusted-device";
import {
  checkThisDevice,
  forgetOtherDevices,
  forgetThisDevice,
  hashDeviceToken,
  memoryTrustedDeviceStore,
  resetTrustedDevicesForTests,
  revokeAllTrustedDevices,
  trustThisDevice,
  type CookieJar,
} from "@/server/trusted-device";
import { requireRecentMfa } from "@/server/authz";
import {
  getSessionTimeoutReason,
  markSessionStarted,
  resetSessionTimeoutForTests,
  SESSION_ABSOLUTE_MS,
  SESSION_IDLE_MS,
  sessionLimits,
  setSessionTrustedUntil,
  touchSessionActivity,
} from "@/lib/session-timeout";

const T0 = Date.parse("2026-11-24T08:00:00Z");
const DAY = 24 * 60 * 60 * 1000;

function jar(): CookieJar & { value: string | undefined; expires: Date | null } {
  const box = {
    value: undefined as string | undefined,
    expires: null as Date | null,
    get: () => box.value,
    set: (token: string, expires: Date) => {
      box.value = token;
      box.expires = expires;
    },
    clear: () => {
      box.value = undefined;
      box.expires = null;
    },
  };
  return box;
}

const row = (patch: Partial<TrustedDeviceRow> = {}): TrustedDeviceRow => ({
  id: "d1",
  user_id: "u1",
  label: "Chrome on Mac",
  created_at: new Date(T0).toISOString(),
  last_seen_at: new Date(T0).toISOString(),
  expires_at: new Date(T0 + TRUSTED_DEVICE_MS).toISOString(),
  revoked_at: null,
  ...patch,
});

describe("trust rules", () => {
  it("trusts a live row for its own user for 30 days", () => {
    expect(TRUSTED_DEVICE_MS).toBe(30 * DAY);
    expect(TRUSTED_IDLE_MS).toBe(7 * DAY);
    expect(trustStateFor(row(), "u1", T0 + DAY)).toMatchObject({ trusted: true });
  });

  it("refuses a missing, other person's, revoked, expired or idle row", () => {
    expect(trustStateFor(null, "u1", T0)).toEqual({ trusted: false, reason: "none" });
    expect(trustStateFor(row(), "u2", T0)).toEqual({ trusted: false, reason: "other_user" });
    expect(trustStateFor(row({ revoked_at: new Date(T0).toISOString() }), "u1", T0)).toEqual({
      trusted: false,
      reason: "revoked",
    });
    expect(trustStateFor(row(), "u1", T0 + 30 * DAY)).toEqual({
      trusted: false,
      reason: "expired",
    });
    expect(trustStateFor(row(), "u1", T0 + 7 * DAY)).toEqual({ trusted: false, reason: "idle" });
    expect(trustStateFor(row(), "u1", T0 + 7 * DAY - 1)).toMatchObject({ trusted: true });
  });

  it("labels devices without keeping the user agent", () => {
    expect(
      deviceLabel(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36",
      ),
    ).toBe("Chrome on Mac");
    expect(
      deviceLabel(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
      ),
    ).toBe("Safari on iPhone");
    expect(deviceLabel(null)).toBe("Browser");
  });
});

describe("step-up for sensitive actions", () => {
  it("reads the newest authenticator time from the JWT amr", () => {
    expect(
      lastMfaAt([
        { method: "otp", timestamp: 100 },
        { method: "totp", timestamp: 200 },
        { method: "totp", timestamp: 150 },
      ]),
    ).toBe(200_000);
    expect(lastMfaAt([{ method: "oauth", timestamp: 1 }])).toBeNull();
    expect(lastMfaAt(undefined)).toBeNull();
  });

  it("asks again once the code is 10 minutes old, trusted device or not", () => {
    expect(stepUpNeeded(T0, T0 + STEP_UP_WINDOW_MS - 1)).toBe(false);
    expect(stepUpNeeded(T0, T0 + STEP_UP_WINDOW_MS)).toBe(true);
    expect(stepUpNeeded(null, T0)).toBe(true);
    expect(() => requireRecentMfa({ mfaVerifiedAt: T0 }, T0 + 60_000)).not.toThrow();
    expect(() => requireRecentMfa({ mfaVerifiedAt: T0 }, T0 + STEP_UP_WINDOW_MS)).toThrow(
      /authenticator code again/,
    );
    expect(() => requireRecentMfa({ mfaVerifiedAt: null }, T0)).toThrow(/authenticator code again/);
  });
});

describe("trusted device records", () => {
  beforeEach(() => resetTrustedDevicesForTests());
  const store = memoryTrustedDeviceStore;

  it("won't trust a staff browser before the authenticator code", async () => {
    await expect(
      trustThisDevice(
        { userId: "u1", aal: "aal1", mfaRequired: true },
        { store, cookies: jar(), now: T0 },
      ),
    ).rejects.toThrow(/authenticator code first/);
  });

  it("stores only a hash, sets a 30-day cookie and recognises the browser", async () => {
    const cookies = jar();
    const result = await trustThisDevice(
      { userId: "u1", aal: "aal2", mfaRequired: true },
      { store, cookies, userAgent: "Mozilla/5.0 (Windows NT 10.0) Firefox/133.0", now: T0 },
    );
    expect(result.expiresAt).toBe(new Date(T0 + TRUSTED_DEVICE_MS).toISOString());
    expect(cookies.value).toMatch(/^[A-Za-z0-9_-]{40,}$/);
    expect(cookies.expires?.getTime()).toBe(T0 + TRUSTED_DEVICE_MS);
    const stored = await store.findByHash(hashDeviceToken(cookies.value!));
    expect(stored?.label).toBe("Firefox on Windows");
    expect(JSON.stringify(stored)).not.toContain(cookies.value!);

    const check = await checkThisDevice("u1", { store, cookies, now: T0 + 6 * DAY });
    expect(check.trusted).toBe(true);
    // Use counts: 6 more days later it is still trusted (last seen moved forward).
    expect((await checkThisDevice("u1", { store, cookies, now: T0 + 12 * DAY })).trusted).toBe(
      true,
    );
  });

  it("families (no code) can trust a browser; idle for 7 days ends it and clears the cookie", async () => {
    const cookies = jar();
    await trustThisDevice(
      { userId: "g1", aal: "aal1", mfaRequired: false },
      { store, cookies, now: T0 },
    );
    const state = await checkThisDevice("g1", { store, cookies, now: T0 + 7 * DAY });
    expect(state).toEqual({ trusted: false, reason: "idle" });
    expect(cookies.value).toBeUndefined();
  });

  it("another person signing in on the same browser isn't trusted and keeps the owner's cookie", async () => {
    const cookies = jar();
    await trustThisDevice(
      { userId: "u1", aal: "aal2", mfaRequired: true },
      { store, cookies, now: T0 },
    );
    const state = await checkThisDevice("u2", { store, cookies, now: T0 });
    expect(state).toEqual({ trusted: false, reason: "other_user" });
    expect(cookies.value).toBeDefined();
  });

  it("sign out forgets this browser; sign out other devices keeps only this one", async () => {
    const here = jar();
    const laptop = jar();
    const phone = jar();
    const s = { userId: "u1", aal: "aal2", mfaRequired: true };
    await trustThisDevice(s, { store, cookies: here, now: T0 });
    await trustThisDevice(s, { store, cookies: laptop, now: T0 });
    await trustThisDevice(s, { store, cookies: phone, now: T0 });

    const result = await forgetOtherDevices("u1", { store, cookies: here, now: T0 + 1000 });
    expect(result.revoked).toBe(2);
    expect((await checkThisDevice("u1", { store, cookies: here, now: T0 + 2000 })).trusted).toBe(
      true,
    );
    expect((await checkThisDevice("u1", { store, cookies: laptop, now: T0 + 2000 })).trusted).toBe(
      false,
    );

    await forgetThisDevice("u1", { store, cookies: here, now: T0 + 3000 });
    expect(here.value).toBeUndefined();
    expect(await store.listActive("u1", new Date(T0 + 4000).toISOString())).toHaveLength(0);
  });

  it("revoking access or resetting MFA ends trust on every browser", async () => {
    const a = jar();
    const b = jar();
    const s = { userId: "u1", aal: "aal2", mfaRequired: true };
    await trustThisDevice(s, { store, cookies: a, now: T0 });
    await trustThisDevice(s, { store, cookies: b, now: T0 });
    expect(await revokeAllTrustedDevices("u1", store)).toBe(2);
    expect((await checkThisDevice("u1", { store, cookies: a, now: T0 + 1 })).trusted).toBe(false);
    expect((await checkThisDevice("u1", { store, cookies: b, now: T0 + 1 })).trusted).toBe(false);
  });

  it("trusting the same browser again replaces its old record", async () => {
    const cookies = jar();
    const s = { userId: "u1", aal: "aal2", mfaRequired: true };
    await trustThisDevice(s, { store, cookies, now: T0 });
    await trustThisDevice(s, { store, cookies, now: T0 + DAY });
    expect(await store.listActive("u1", new Date(T0 + DAY).toISOString())).toHaveLength(1);
  });
});

describe("browser session limits", () => {
  afterEach(() => resetSessionTimeoutForTests());

  it("not trusted: 30 minutes idle, 8 hours at most", () => {
    markSessionStarted(T0);
    expect(sessionLimits(T0)).toEqual({ idleMs: SESSION_IDLE_MS, absoluteMs: SESSION_ABSOLUTE_MS });
    expect(getSessionTimeoutReason(T0 + SESSION_IDLE_MS)).toBe("idle");
  });

  it("trusted: 7 days idle and signed in until the trust ends", () => {
    markSessionStarted(T0);
    setSessionTrustedUntil(T0 + TRUSTED_DEVICE_MS);
    expect(sessionLimits(T0).idleMs).toBe(TRUSTED_IDLE_MS);
    expect(getSessionTimeoutReason(T0 + 2 * 60 * 60 * 1000)).toBeNull();
    // Used every few days: still signed in on day 29.
    for (let day = 3; day <= 27; day += 3) touchSessionActivity(T0 + day * DAY);
    expect(getSessionTimeoutReason(T0 + 29 * DAY)).toBeNull();
    // Day 30: trust over, back to the normal limits, so the session has ended.
    expect(getSessionTimeoutReason(T0 + 30 * DAY)).toBe("absolute");
  });

  it("trusted but unused for 7 days signs out", () => {
    markSessionStarted(T0);
    setSessionTrustedUntil(T0 + TRUSTED_DEVICE_MS);
    expect(getSessionTimeoutReason(T0 + 7 * DAY)).toBe("idle");
  });
});
