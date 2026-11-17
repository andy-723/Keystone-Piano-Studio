import { describe, expect, it, vi } from "vitest";
import { finishCodeSignIn } from "@/lib/oauth-callback";

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
