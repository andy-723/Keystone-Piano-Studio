import { QueryClient } from "@tanstack/react-query";
import { createRouter, isRedirect, rootRouteId } from "@tanstack/react-router";
import { describe, expect, it } from "vitest";

import { routeTree } from "@/routeTree.gen";

// Match routes without running loaders or rendering: loaders may need a server or
// network the test run lacks, and jsdom never loads the stylesheets React waits on.
describe("App routing", () => {
  it("matches a page for / instead of falling back to not found", () => {
    const router = createRouter({ routeTree, context: { queryClient: new QueryClient() } });

    const matches = router.matchRoutes("/");

    expect(matches.at(-1)?.routeId).not.toBe(rootRouteId);
  });

  it("sends the bare domain to the public welcome page, for everyone", async () => {
    const router = createRouter({ routeTree, context: { queryClient: new QueryClient() } });
    const home = router.routesById["/"];
    let thrown: unknown;
    try {
      // beforeLoad only reads search here.
      await (home.options.beforeLoad as unknown as (ctx: { search: { date?: string } }) => unknown)(
        {
          search: {},
        },
      );
    } catch (err) {
      thrown = err;
    }
    expect(isRedirect(thrown)).toBe(true);
    expect((thrown as { options: { to: string } }).options.to).toBe("/welcome");
  });

  it("keeps old /?date= day-book links working by sending them to /today", async () => {
    const router = createRouter({ routeTree, context: { queryClient: new QueryClient() } });
    const home = router.routesById["/"];
    let thrown: unknown;
    try {
      await (home.options.beforeLoad as unknown as (ctx: { search: { date?: string } }) => unknown)(
        {
          search: { date: "2026-11-20" },
        },
      );
    } catch (err) {
      thrown = err;
    }
    expect(isRedirect(thrown)).toBe(true);
    expect((thrown as { options: { to: string; search: unknown } }).options).toMatchObject({
      to: "/today",
      search: { date: "2026-11-20" },
    });
  });

  it("matches the day-book at /today", () => {
    const router = createRouter({ routeTree, context: { queryClient: new QueryClient() } });
    expect(router.matchRoutes("/today").at(-1)?.routeId).toBe("/today");
  });

  it("matches Studio snapshot at /snapshot", () => {
    const router = createRouter({ routeTree, context: { queryClient: new QueryClient() } });
    const matches = router.matchRoutes("/snapshot");
    expect(matches.at(-1)?.routeId).toBe("/snapshot");
  });
});
