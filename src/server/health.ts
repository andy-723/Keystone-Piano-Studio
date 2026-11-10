import { createServerFn } from "@tanstack/react-start";

/**
 * Shared health payload for the server function and GET /api/health.
 * `commit` and `env` let an uptime check (and you, after a release or rollback) confirm which
 * build is live. Both come from Vercel's system env vars and are safe to expose.
 */
export function healthStatus() {
  const env = typeof process !== "undefined" ? process.env : {};
  return {
    ok: true as const,
    commit: env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "local",
    env: env.VERCEL_ENV ?? "local",
  };
}

/** Trivial TanStack Start server function used to prove server code runs. */
export const getHealth = createServerFn({ method: "GET" }).handler(() => healthStatus());
