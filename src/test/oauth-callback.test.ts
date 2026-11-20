import { describe, expect, it, vi } from "vitest";
import { emailLinkFailureMessage, finishCodeSignIn } from "@/lib/oauth-callback";

function fakeAuth(opts: {
  sessionBefore: boolean;
  exchangeError?: string;
  sessionAfter?: boolean;
}) {
  let calls = 0;
  return {
    getSession: vi.fn(async () => {
      calls += 1;
      const has = calls === 1 ? opts.sessionBefore : (opts.sessionAfter ?? false);
      return { data: { session: has ? { access_token: "t" } : null } };
    }),
    exchangeCodeForSession: vi.fn(async () => ({
      error: opts.exchangeError ? new Error(opts.exchangeError) : null,
    })),
  };
}

describe("Google / Microsoft sign-in callback", () => {
  it("uses the session the client already made from ?code and does not exchange it twice", async () => {
    const auth = fakeAuth({ sessionBefore: true });
    await expect(finishCodeSignIn(auth, "abc")).resolves.toEqual({ ok: true });
    expect(auth.exchangeCodeForSession).not.toHaveBeenCalled();
  });

  it("exchanges the code when there is no session yet", async () => {
    const auth = fakeAuth({ sessionBefore: false });
    await expect(finishCodeSignIn(auth, "abc")).resolves.toEqual({ ok: true });
    expect(auth.exchangeCodeForSession).toHaveBeenCalledWith("abc");
  });

  it("still signs in when the exchange reports 'already used' but a session exists", async () => {
    const auth = fakeAuth({
      sessionBefore: false,
      exchangeError: "already used",
      sessionAfter: true,
    });
    await expect(finishCodeSignIn(auth, "abc")).resolves.toEqual({ ok: true });
  });

  it("fails only when there is no session at all", async () => {
    const auth = fakeAuth({ sessionBefore: false, exchangeError: "invalid flow state" });
    const result = await finishCodeSignIn(auth, "abc");
    expect(result.ok).toBe(false);
  });
});

describe("emailed sign-in link failures", () => {
  it("says the link expired for otp_expired", () => {
    expect(emailLinkFailureMessage({ code: "otp_expired", status: 403 })).toMatch(
      /expired or was already used.*newest link/,
    );
  });

  it("says access is turned off for a revoked (banned) account, not that the link expired", () => {
    const msg = emailLinkFailureMessage({ code: "user_banned", status: 403 });
    expect(msg).toMatch(/turned off/);
    expect(msg).not.toMatch(/expired/);
  });

  it("asks to wait on rate limits", () => {
    expect(emailLinkFailureMessage({ code: "over_request_rate_limit", status: 429 })).toMatch(
      /Wait a minute/,
    );
  });

  it("does not blame the link for a network failure", () => {
    const msg = emailLinkFailureMessage(new TypeError("Failed to fetch"));
    expect(msg).toMatch(/connection/);
    expect(msg).not.toMatch(/expired/);
  });
});
