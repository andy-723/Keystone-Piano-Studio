import { beforeEach, describe, expect, it } from "vitest";
import {
  accountStatusFor,
  allowLinkSend,
  isBanned,
  resetLinkSendsForTests,
} from "@/server/account-links";
import { signInLinkEmail } from "@/server/email/templates/sign-in-link";
import { AUTHENTICATOR_APPS } from "@/lib/authenticator-apps";

const APP = "https://www.keystonemusichq.com";

describe("account status", () => {
  it("is Active once the person has signed in", () => {
    expect(
      accountStatusFor({
        last_sign_in_at: "2026-11-17T10:00:00Z",
        invited_at: "2026-11-16T10:00:00Z",
      }),
    ).toMatchObject({ state: "active", lastSignInAt: "2026-11-17T10:00:00Z" });
  });

  it("is 'not signed in yet' after an invite that was never used", () => {
    expect(accountStatusFor({ last_sign_in_at: null, invited_at: "2026-11-16T10:00:00Z" })).toEqual(
      {
        state: "not_signed_in",
        lastSignInAt: null,
        invitedAt: "2026-11-16T10:00:00Z",
      },
    );
  });

  it("shows Access revoked while a ban is in force, and goes back once it is lifted", () => {
    const now = Date.parse("2026-11-18T00:00:00Z");
    expect(isBanned({ banned_until: "2126-11-18T00:00:00Z" }, now)).toBe(true);
    expect(isBanned({ banned_until: "2026-11-01T00:00:00Z" }, now)).toBe(false);
    expect(isBanned({ banned_until: null }, now)).toBe(false);
    expect(
      accountStatusFor({
        last_sign_in_at: "2026-11-17T10:00:00Z",
        banned_until: "2126-11-18T00:00:00Z",
      }).state,
    ).toBe("revoked");
  });

  it("has no account when there is no auth user", () => {
    expect(accountStatusFor(null).state).toBe("no_account");
  });
});

describe("send sign-in link throttle", () => {
  beforeEach(() => resetLinkSendsForTests());
  it("allows one link per person per minute", () => {
    expect(allowLinkSend("staff:a", 0)).toBe(true);
    expect(allowLinkSend("staff:a", 30_000)).toBe(false);
    expect(allowLinkSend("staff:b", 30_000)).toBe(true);
    expect(allowLinkSend("staff:a", 61_000)).toBe(true);
  });
});

describe("sign-in link email", () => {
  const signInUrl = `${APP}/auth/callback?token_hash=abc12345&type=magiclink`;

  it("owner who never signed in gets the link plus authenticator store buttons", () => {
    const mail = signInLinkEmail({
      audience: "owner",
      name: "Winnie Hou",
      studioName: "Sunny Keys Studio",
      signInUrl,
      loginUrl: `${APP}/login`,
      hasSignedIn: false,
    });
    expect(mail.subject).toBe("Your Keystone Music HQ sign-in link");
    expect(mail.html).toContain("Hi Winnie,");
    expect(mail.html).toContain("token_hash=abc12345&amp;type=magiclink");
    expect(mail.text).toContain("Sunny Keys Studio");
    expect(mail.html).toContain(`href="${AUTHENTICATOR_APPS[0]!.appStore}"`);
    expect(mail.text).toContain("expires in about an hour");
  });

  it("family and already-active staff get no authenticator section", () => {
    for (const audience of ["family", "staff"] as const) {
      const mail = signInLinkEmail({
        audience,
        name: "Jane",
        studioName: "Keys",
        signInUrl,
        loginUrl: `${APP}/login`,
        hasSignedIn: audience === "staff",
      });
      expect(mail.html).not.toContain(AUTHENTICATOR_APPS[0]!.appStore);
    }
  });

  it("names typed by people can't add links", () => {
    const mail = signInLinkEmail({
      audience: "family",
      name: "<b>Jane</b>",
      studioName: "Keys [x](https://evil.test)",
      signInUrl,
      loginUrl: `${APP}/login`,
      hasSignedIn: true,
    });
    expect(mail.html).not.toContain('href="https://evil.test');
    expect(mail.html).not.toContain("<b>");
  });
});
