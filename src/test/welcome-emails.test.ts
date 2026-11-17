import { describe, expect, it } from "vitest";
import { ownerWelcomeEmail } from "@/server/email/templates/owner-welcome";
import { familyWelcomeEmail } from "@/server/email/templates/family-welcome";
import { AUTHENTICATOR_APPS } from "@/lib/authenticator-apps";

const APP = "https://www.keystonemusichq.com";

describe("Welcome to Keystone Music HQ emails", () => {
  it("studio owner: welcome, pilot dates, setup steps, agreements and self-serve help", () => {
    const mail = ownerWelcomeEmail({
      ownerName: "Winnie Lee",
      studioName: "Sunny Keys Studio",
      signInUrl: `${APP}/login`,
      appUrl: APP,
      supportEmail: "support@keystonemusichq.com",
      access: { status: "pilot", plan: "pro", endsOn: "2027-05-17" },
    });
    expect(mail.subject).toBe("Welcome to Keystone Music HQ, Sunny Keys Studio");
    expect(mail.html).toContain(`${APP}/email/keystone-music-hq-email-logo.png`);
    expect(mail.html).toContain("Hi Winnie,");
    expect(mail.text).toContain(
      "free pilot of the Pro plan (unlimited students) until 17 May 2027",
    );
    expect(mail.text).toContain("Families can't open an invite until your terms are published");
    expect(mail.text).toContain("pilot Order Form");
    expect(mail.html).toContain(`href="${APP}/terms"`);
    expect(mail.html).toContain(`href="${APP}/privacy"`);
    expect(mail.html).toContain(`href="${APP}/help"`);
    expect(mail.html).toContain(`href="${APP}/support"`);
    expect(mail.html).toContain('href="mailto:support@keystonemusichq.com"');
    expect(mail.text).not.toContain("<");
  });

  it("studio owner gets App Store and Google Play links for an authenticator, before the sign-in button", () => {
    const mail = ownerWelcomeEmail({
      ownerName: "Winnie Lee",
      studioName: "Sunny Keys Studio",
      signInUrl: `${APP}/login`,
    });
    for (const app of AUTHENTICATOR_APPS) {
      expect(mail.html).toContain(`href="${app.appStore}"`);
      expect(mail.html).toContain(`href="${app.googlePlay}"`);
      expect(mail.text).toContain(app.googlePlay);
    }
    expect(mail.html.indexOf(AUTHENTICATOR_APPS[0]!.appStore)).toBeLessThan(
      mail.html.indexOf("Sign in to Keystone</a>"),
    );
  });

  it("studio owner without free access is told how to subscribe", () => {
    const mail = ownerWelcomeEmail({
      ownerName: "Sam",
      studioName: "Keys",
      signInUrl: `${APP}/login`,
      access: { status: "none", plan: "base", endsOn: null },
    });
    expect(mail.text).toContain("Plan and billing");
    expect(mail.text).not.toContain("Order Form");
  });

  it("family: sign-in link, expectations, what they agreed to, and where to get help", () => {
    const mail = familyWelcomeEmail({
      studioName: "Sunny Keys Studio",
      guardianName: "Jane Nguyen",
      signInUrl: `${APP}/auth/callback?token_hash=abc12345&type=magiclink`,
      loginUrl: `${APP}/login`,
      teacherName: "Ms Lee",
      studentNames: ["Mia", "Leo"],
      studioTermsVersionNo: 2,
      acceptedOn: "17 November 2026",
    });
    expect(mail.subject).toBe("Welcome to Keystone Music HQ, from Sunny Keys Studio");
    expect(mail.text).toContain("Mia and Leo's enrolment");
    expect(mail.text).toContain("studio terms (version 2), accepted on 17 November 2026");
    expect(mail.html).toContain("token_hash=abc12345&amp;type=magiclink");
    expect(mail.text).toContain("message Ms Lee in the family app");
    expect(mail.text).toContain("A short tour opens the first time you sign in");
    expect(mail.text).not.toContain("authenticator");
    expect(mail.html).toContain(`href="${APP}/help"`);
    expect(mail.html).toContain(`href="${APP}/privacy"`);
  });

  it("names typed by people can't add links or HTML to the email", () => {
    const mail = familyWelcomeEmail({
      studioName: "Keys [click me](https://evil.test)",
      guardianName: "<script>alert(1)</script> Jane",
      signInUrl: `${APP}/auth/callback?token_hash=abc12345&type=magiclink`,
      loginUrl: `${APP}/login`,
    });
    expect(mail.html).not.toContain('https://evil.test"');
    expect(mail.html).not.toContain('href="https://evil.test');
    expect(mail.html).not.toContain("<script>");
  });
});
