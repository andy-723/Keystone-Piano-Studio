import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import type { ResolvedAccount } from "@/server/account";
import { shellRoleForAccount } from "@/lib/post-login";
import { AppSettingsProvider, useAppSettings } from "@/lib/app-settings";

const account = vi.hoisted(() => ({ current: null as ResolvedAccount | null }));

vi.mock("@/lib/auth-client", () => ({
  isLiveAuthConfigured: () => true,
  isDemoModeAllowed: () => false,
  getAuthClient: () => ({
    auth: {
      getSession: async () => ({ data: { session: { access_token: `token-${Math.random()}` } } }),
      signOut: async () => ({}),
      mfa: { listFactors: async () => ({ data: { totp: [{ status: "verified" }] } }) },
    },
  }),
}));

vi.mock("@/server/account", () => ({
  resolveAccountFn: async () => account.current,
}));

vi.mock("@/services/live/studio-store", () => ({
  chooseStudioWorkspace: async () => ({
    workspace: { mode: "demo" },
    row: null,
    plan: null,
  }),
  loadLiveStudio: async () => undefined,
}));

vi.mock("@/lib/studio-workspace", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/studio-workspace")>();
  return {
    ...actual,
    markWorkspaceLoaded: () => undefined,
    resetStudioWorkspaceForTests: () => undefined,
  };
});

const { LiveAuthGuard } = await import("@/components/LiveAuthGuard");

function base(overrides: Partial<ResolvedAccount>): ResolvedAccount {
  return {
    userId: "u1",
    email: "person@example.com",
    aal: "aal2",
    platformStaff: null,
    memberships: [],
    guardianFamilyIds: [],
    studioAccess: [],
    ...overrides,
  };
}

const guardian = base({ guardianFamilyIds: ["fam-1"] });
const teacher = base({ memberships: [{ studioId: "s1", role: "teacher" }] });

function Shell() {
  const { role } = useAppSettings();
  return <p>{role === "parent" ? "family portal" : "studio screens"}</p>;
}

function renderGuarded() {
  const root = createRootRoute({
    component: () => (
      <AppSettingsProvider>
        <LiveAuthGuard>
          <Shell />
        </LiveAuthGuard>
      </AppSettingsProvider>
    ),
  });
  const home = createRoute({ getParentRoute: () => root, path: "/", component: () => null });
  const router = createRouter({
    routeTree: root.addChildren([home]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  render(<RouterProvider router={router} />);
}

afterEach(cleanup);

describe("which app a signed-in person lands in", () => {
  it("sends guardian-only accounts to the family portal and everyone else to the studio", () => {
    expect(shellRoleForAccount(guardian)).toBe("parent");
    expect(shellRoleForAccount(teacher)).toBe("teacher");
    expect(
      shellRoleForAccount({ ...guardian, memberships: [{ studioId: "s1", role: "owner" }] }),
    ).toBe("teacher");
    expect(
      shellRoleForAccount({
        ...guardian,
        platformStaff: { role: "support", displayName: "Support" },
      }),
    ).toBe("teacher");
  });

  it("a live guardian sign-in opens the family portal, never the studio screens", async () => {
    account.current = guardian;
    renderGuarded();
    expect(await screen.findByText("family portal")).toBeTruthy();
    expect(screen.queryByText("studio screens")).toBeNull();
  });

  it("a live teacher sign-in still opens the studio screens", async () => {
    account.current = teacher;
    renderGuarded();
    expect(await screen.findByText("studio screens")).toBeTruthy();
  });
});
