import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { LoginCard } from "@/components/login/LoginCard";
import { MfaCodeInputs } from "@/components/auth/MfaCodeInputs";
import {
  isAuthExemptPath,
  isFocusFlowPath,
  parseEmailLink,
  safeNextPath,
  signedOutRedirect,
} from "@/lib/auth-paths";
import {
  LOGIN_ANIM_CYCLE_MS,
  LOGIN_ANIM_DURATION_MS,
  LOGIN_ANIM_ENDING_LEAD_MS,
} from "@/lib/login-animation";
import {
  clearVerifiedAccess,
  getVerifiedAccess,
  rememberVerifiedAccess,
} from "@/lib/live-auth-cache";
import { decideMfaGate, destinationForAccount, NO_ACCOUNT_MESSAGE } from "@/lib/post-login";
import { requirePlatformAdmin, resetMockPlatformStaff, ProblemError } from "@/server/authz";
import { bootstrapPlatformAdmin, maskEmailForLog } from "@/lib/bootstrap-platform-admin";
import { isDemoModeAllowed, resetAuthClientForTests } from "@/lib/auth-client";
import { LiveAuthGuard, resetLiveAuthGuardForTests } from "@/components/LiveAuthGuard";

afterEach(() => {
  cleanup();
  resetMockPlatformStaff();
  resetAuthClientForTests();
  resetLiveAuthGuardForTests();
  try {
    localStorage.clear();
    sessionStorage.clear();
  } catch {
    // ignore
  }
});

function renderLoginCard() {
  const root = createRootRoute({
    component: () => <LoginCard />,
  });
  const login = createRoute({
    getParentRoute: () => root,
    path: "/login",
    component: () => <LoginCard />,
  });
  const studioEnquiry = createRoute({
    getParentRoute: () => root,
    path: "/studio-enquiry",
    component: () => <p>enquiry</p>,
  });
  const settingsTerms = createRoute({
    getParentRoute: () => root,
    path: "/settings/terms",
    component: () => <p>terms</p>,
  });
  const router = createRouter({
    routeTree: root.addChildren([login, studioEnquiry, settingsTerms]),
    history: createMemoryHistory({ initialEntries: ["/login"] }),
  });
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

describe("login page (mock mode)", () => {
  it("renders Welcome back and oauth buttons", async () => {
    renderLoginCard();
    expect(await screen.findByText("Welcome back")).toBeTruthy();
    expect(screen.getByText("Continue with Google")).toBeTruthy();
    expect(screen.getByText("Continue with Microsoft")).toBeTruthy();
    expect(screen.getAllByText(/Demo mode/i).length).toBeGreaterThan(0);
  });

  it("shows Check your inbox for any email", async () => {
    renderLoginCard();
    await screen.findByText("Welcome back");
    fireEvent.change(screen.getByLabelText(/Email address/i), {
      target: { value: "anyone@example.com" },
    });
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: /Continue with email/i }));
    await waitFor(() => expect(screen.getByTestId("login-check-inbox")).toBeTruthy());
    expect(screen.getByText(/Check your inbox/i)).toBeTruthy();
  });
});

describe("route guard helpers", () => {
  it("accepts same-origin next paths and rejects off-site next", () => {
    expect(safeNextPath("/students")).toBe("/students");
    expect(safeNextPath("/login?next=/")).toBe("/login?next=/");
    expect(safeNextPath("https://evil.example/phish")).toBeNull();
    expect(safeNextPath("//evil.example")).toBeNull();
    expect(safeNextPath("http://evil.example")).toBeNull();
  });

  it("marks public auth paths as exempt", () => {
    expect(isAuthExemptPath("/login")).toBe(true);
    expect(isAuthExemptPath("/auth/callback")).toBe(true);
    expect(isAuthExemptPath("/studio-enquiry")).toBe(true);
    expect(isAuthExemptPath("/api/health")).toBe(true);
    expect(isAuthExemptPath("/students")).toBe(false);
  });

  it("sends signed-out visitors on the home page to /welcome, and app pages to /login", () => {
    expect(signedOutRedirect("/")).toBe("/welcome");
    expect(signedOutRedirect("", "?utm_source=x")).toBe("/welcome");
    expect(signedOutRedirect("/students", "?tab=all")).toBe("/login?next=%2Fstudents%3Ftab%3Dall");
    expect(signedOutRedirect("/settings/terms")).toBe("/login?next=%2Fsettings%2Fterms");
  });

  it("treats Help, Privacy, Terms, Welcome and Pricing as public pages, but not in-app settings", () => {
    expect(isAuthExemptPath("/help")).toBe(true);
    expect(isAuthExemptPath("/welcome")).toBe(true);
    expect(isAuthExemptPath("/pricing")).toBe(true);
    expect(isAuthExemptPath("/disclaimer")).toBe(true);
    expect(isAuthExemptPath("/privacy")).toBe(true);
    expect(isAuthExemptPath("/terms")).toBe(true);
    expect(isAuthExemptPath("/settings/terms")).toBe(false);
    expect(isAuthExemptPath("/")).toBe(false);
  });

  it("treats admin and auth as focus flows (no studio fixture shell)", () => {
    expect(isFocusFlowPath("/admin")).toBe(true);
    expect(isFocusFlowPath("/login")).toBe(true);
    expect(isFocusFlowPath("/auth/mfa")).toBe(true);
    expect(isFocusFlowPath("/join/abc")).toBe(true);
    expect(isFocusFlowPath("/intake/abc")).toBe(true);
    expect(isFocusFlowPath("/help")).toBe(true);
    expect(isFocusFlowPath("/")).toBe(false);
    expect(isFocusFlowPath("/students")).toBe(false);
  });
});

describe("live auth verified-access cache", () => {
  it("survives a memory clear via sessionStorage for the same token", () => {
    rememberVerifiedAccess("tok-admin", { kind: "ok" });
    expect(getVerifiedAccess("tok-admin")).toEqual({ kind: "ok" });
    clearVerifiedAccess();
    expect(getVerifiedAccess("tok-admin")).toBeUndefined();
    rememberVerifiedAccess("tok-admin", { kind: "ok" });
    // Simulate a full document reload: memory map empty, sessionStorage still set.
    resetLiveAuthGuardForTests();
    // reset clears storage too — re-seed storage-only path:
    sessionStorage.setItem(
      "kmhq.live-auth.verified.v1",
      JSON.stringify({ token: "tok-admin", gate: { kind: "ok" } }),
    );
    expect(getVerifiedAccess("tok-other")).toBeUndefined();
    expect(getVerifiedAccess("tok-admin")).toEqual({ kind: "ok" });
  });

  it("sends platform staff to /admin by default", () => {
    expect(
      destinationForAccount({
        userId: "u1",
        email: null,
        aal: "aal2",
        platformStaff: { role: "platform_admin", displayName: "A" },
        memberships: [],
        guardianFamilyIds: [],
        studioAccess: [],
      }),
    ).toBe("/admin");
  });
});

describe("login page footer and demo fallback", () => {
  it("links Help, Privacy and Terms to public pages, never into the app", async () => {
    renderLoginCard();
    await screen.findByText("Welcome back");
    expect(screen.getByText("Help").closest("a")?.getAttribute("href")).toBe("/help");
    expect(screen.getByText("Privacy").closest("a")?.getAttribute("href")).toBe("/privacy");
    expect(screen.getByText("Terms").closest("a")?.getAttribute("href")).toBe("/terms");
  });

  it("does not allow the demo in a production build without Supabase keys", () => {
    vi.stubEnv("DEV", false);
    vi.stubEnv("VITE_ALLOW_DEMO", "");
    try {
      expect(isDemoModeAllowed()).toBe(false);
      vi.stubEnv("VITE_ALLOW_DEMO", "true");
      expect(isDemoModeAllowed()).toBe(true);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("does not render app content in production without Supabase keys", async () => {
    vi.stubEnv("DEV", false);
    vi.stubEnv("VITE_ALLOW_DEMO", "");
    try {
      const root = createRootRoute({
        component: () => (
          <LiveAuthGuard>
            <p>secret app</p>
          </LiveAuthGuard>
        ),
      });
      const home = createRoute({ getParentRoute: () => root, path: "/", component: () => null });
      const router = createRouter({
        routeTree: root.addChildren([home]),
        history: createMemoryHistory({ initialEntries: ["/"] }),
      });
      render(<RouterProvider router={router} />);
      expect(await screen.findByText("Sign-in is unavailable")).toBeTruthy();
      expect(screen.queryByText("secret app")).toBeNull();
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

describe("MFA code inputs", () => {
  it("accepts a pasted 6-digit code and auto-submits", () => {
    const onComplete = vi.fn();
    const onChange = vi.fn();
    render(<MfaCodeInputs value="" onChange={onChange} onComplete={onComplete} />);
    const first = screen.getByLabelText("Digit 1");
    fireEvent.paste(first, {
      clipboardData: { getData: () => "123456" },
    });
    expect(onChange).toHaveBeenCalledWith("123456");
    expect(onComplete).toHaveBeenCalledWith("123456");
  });
});

describe("login animation loop timing", () => {
  it("pauses between reveals and marks the ending inside the reveal", () => {
    expect(LOGIN_ANIM_CYCLE_MS).toBeGreaterThan(LOGIN_ANIM_DURATION_MS);
    expect(LOGIN_ANIM_ENDING_LEAD_MS).toBeLessThan(LOGIN_ANIM_DURATION_MS);
  });
});

describe("callback no-account message", () => {
  it("exposes the canonical no-account copy", () => {
    expect(NO_ACCOUNT_MESSAGE).toMatch(/couldn't find a Keystone Music HQ account/i);
  });

  it("routes platform staff to MFA setup when no TOTP", () => {
    const gate = decideMfaGate({
      account: {
        userId: "u1",
        email: null,
        aal: "aal1",
        platformStaff: { role: "platform_admin", displayName: "A" },
        memberships: [],
        guardianFamilyIds: [],
        studioAccess: [],
      },
      aal: "aal1",
      hasVerifiedTotp: false,
    });
    expect(gate).toBe("setup");
  });
});

describe("requirePlatformAdmin", () => {
  beforeEach(() => {
    resetMockPlatformStaff([
      { userId: "admin-1", role: "platform_admin", displayName: "Admin" },
      { userId: "support-1", role: "support", displayName: "Support" },
    ]);
  });

  it("refuses no row", async () => {
    await expect(requirePlatformAdmin("missing")).rejects.toBeInstanceOf(ProblemError);
  });

  it("refuses support role", async () => {
    await expect(requirePlatformAdmin("support-1")).rejects.toMatchObject({ status: 403 });
  });

  it("refuses aal1 when aal is provided", async () => {
    await expect(requirePlatformAdmin("admin-1", { aal: "aal1" })).rejects.toMatchObject({
      status: 403,
      code: "mfa_required",
    });
  });

  it("succeeds for platform_admin at aal2", async () => {
    await expect(requirePlatformAdmin("admin-1", { aal: "aal2" })).resolves.toMatchObject({
      role: "platform_admin",
    });
  });
});

describe("bootstrap script logic", () => {
  it("is idempotent and refuses a second admin via script", async () => {
    const prints: string[] = [];
    const staff = new Map<string, { role: string }>();
    const users = new Map<string, { id: string }>();

    const deps = {
      getEnv: (name: string) =>
        ({
          SUPABASE_URL: "http://127.0.0.1",
          SUPABASE_SERVICE_ROLE_KEY: "service-role",
          PLATFORM_ADMIN_EMAIL: "admin@example.com",
          PLATFORM_ADMIN_NAME: "Platform Admin",
        })[name],
      appUrl: "http://127.0.0.1:3000",
      print: (m: string) => prints.push(m),
      findUserByEmail: async (email: string) => users.get(email) ?? null,
      inviteUserByEmail: async (email: string) => {
        const row = { id: "user-1" };
        users.set(email, row);
        return row;
      },
      listPlatformAdmins: async () =>
        [...staff.entries()]
          .filter(([, value]) => value.role === "platform_admin")
          .map(([userId]) => ({ userId })),
      getPlatformStaff: async (userId: string) => staff.get(userId) ?? null,
      insertPlatformAdmin: async ({ userId }: { userId: string; displayName: string }) => {
        staff.set(userId, { role: "platform_admin" });
      },
      writeBootstrapAudit: async () => undefined,
    };

    await bootstrapPlatformAdmin(deps);
    expect(prints.at(-1)).toContain(maskEmailForLog("admin@example.com"));
    expect(staff.size).toBe(1);

    prints.length = 0;
    await bootstrapPlatformAdmin(deps);
    expect(prints.at(-1)).toMatch(/Platform admin ready/);

    // Different email while an admin exists → refuse second via script
    prints.length = 0;
    const deps2 = {
      ...deps,
      getEnv: (name: string) =>
        ({
          SUPABASE_URL: "http://127.0.0.1",
          SUPABASE_SERVICE_ROLE_KEY: "service-role",
          PLATFORM_ADMIN_EMAIL: "other@example.com",
          PLATFORM_ADMIN_NAME: "Other",
        })[name],
    };
    await bootstrapPlatformAdmin(deps2);
    expect(prints.at(-1)).toMatch(/Add further staff from \/admin/);
    expect(staff.size).toBe(1);
  });
});

describe("login route exists in router", () => {
  it("mounts /login without throwing", async () => {
    const root = createRootRoute({
      component: () => <LoginCard />,
    });
    const login = createRoute({
      getParentRoute: () => root,
      path: "/login",
      component: () => <LoginCard />,
    });
    const router = createRouter({
      routeTree: root.addChildren([login]),
      history: createMemoryHistory({ initialEntries: ["/login"] }),
    });
    render(
      <QueryClientProvider client={new QueryClient()}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );
    expect(await screen.findByText("Welcome back")).toBeTruthy();
  });
});

describe("branded email links (token_hash)", () => {
  it("accepts known types with a sane token hash", () => {
    expect(parseEmailLink(new URLSearchParams("token_hash=pkce_abc123def456&type=email"))).toEqual({
      tokenHash: "pkce_abc123def456",
      type: "email",
    });
    expect(
      parseEmailLink(new URLSearchParams("token_hash=abcdef1234567890&type=invite"))?.type,
    ).toBe("invite");
  });

  it("rejects missing, unknown or odd values", () => {
    expect(parseEmailLink(new URLSearchParams("type=email"))).toBeNull();
    expect(parseEmailLink(new URLSearchParams("token_hash=abcdef1234567890"))).toBeNull();
    expect(parseEmailLink(new URLSearchParams("token_hash=abcdef1234567890&type=sms"))).toBeNull();
    expect(
      parseEmailLink(new URLSearchParams("token_hash=<script>xx</script>&type=email")),
    ).toBeNull();
  });
});
