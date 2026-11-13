import { describe, expect, it } from "vitest";
import { isDemoOnlyAccount, type ResolvedAccount } from "@/server/account";
import {
  decideMfaGate,
  decideStudioAccessGate,
  mfaRequiredForAccount,
  passwordSessionRefused,
} from "@/lib/post-login";
import { isAuthExemptPath, isFocusFlowPath } from "@/lib/auth-paths";

const DEMO = "00000000-0000-0000-0000-00000000demo";
const REAL = "00000000-0000-0000-0000-00000000real";

function account(patch: Partial<ResolvedAccount>): ResolvedAccount {
  return {
    userId: "u1",
    email: "demo@example.test",
    aal: "aal1",
    platformStaff: null,
    memberships: [{ studioId: DEMO, role: "owner" }],
    guardianFamilyIds: [],
    studioAccess: [],
    demoOnly: true,
    signInMethods: ["password"],
    ...patch,
  };
}

describe("isDemoOnlyAccount", () => {
  const demoStudioIds = new Set([DEMO]);

  it("is true only when every studio membership is the demo studio", () => {
    expect(
      isDemoOnlyAccount({
        platformStaff: null,
        guardianFamilyIds: [],
        memberships: [{ studioId: DEMO }],
        demoStudioIds,
      }),
    ).toBe(true);
  });

  it("is false as soon as the account also belongs to a real studio", () => {
    expect(
      isDemoOnlyAccount({
        platformStaff: null,
        guardianFamilyIds: [],
        memberships: [{ studioId: DEMO }, { studioId: REAL }],
        demoStudioIds,
      }),
    ).toBe(false);
  });

  it("is false for platform staff, guardians and accounts with no studio", () => {
    const base = { memberships: [{ studioId: DEMO }], demoStudioIds };
    expect(
      isDemoOnlyAccount({ ...base, platformStaff: { role: "support" }, guardianFamilyIds: [] }),
    ).toBe(false);
    expect(isDemoOnlyAccount({ ...base, platformStaff: null, guardianFamilyIds: ["f1"] })).toBe(
      false,
    );
    expect(
      isDemoOnlyAccount({
        platformStaff: null,
        guardianFamilyIds: [],
        memberships: [],
        demoStudioIds,
      }),
    ).toBe(false);
  });
});

describe("demo login gates", () => {
  it("lets the demo account in with a password and no two-step code", () => {
    const demo = account({});
    expect(passwordSessionRefused(demo)).toBe(false);
    expect(mfaRequiredForAccount(demo)).toBe(false);
    expect(decideMfaGate({ account: demo, aal: "aal1", hasVerifiedTotp: false })).toBe("ok");
    expect(decideStudioAccessGate(demo)).toEqual({ kind: "ok" });
  });

  it("refuses a password session for anyone who is not demo-only", () => {
    const owner = account({ demoOnly: false, memberships: [{ studioId: REAL, role: "owner" }] });
    expect(passwordSessionRefused(owner)).toBe(true);
    const staff = account({
      demoOnly: false,
      memberships: [],
      platformStaff: { role: "platform_admin", displayName: "A" },
    });
    expect(passwordSessionRefused(staff)).toBe(true);
  });

  it("still makes real staff do two-step sign-in", () => {
    const owner = account({
      demoOnly: false,
      signInMethods: ["otp"],
      memberships: [{ studioId: REAL, role: "owner" }],
    });
    expect(passwordSessionRefused(owner)).toBe(false);
    expect(decideMfaGate({ account: owner, aal: "aal1", hasVerifiedTotp: false })).toBe("setup");
  });

  it("treats a missing flag as not demo (older server responses)", () => {
    const { demoOnly: _ignored, ...legacy } = account({});
    expect(passwordSessionRefused(legacy)).toBe(true);
    expect(mfaRequiredForAccount(legacy)).toBe(true);
  });
});

describe("/demo route", () => {
  it("is public and renders without the studio shell", () => {
    expect(isAuthExemptPath("/demo")).toBe(true);
    expect(isFocusFlowPath("/demo")).toBe(true);
  });
});
