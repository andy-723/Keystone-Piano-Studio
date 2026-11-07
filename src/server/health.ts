import { createServerFn } from "@tanstack/react-start";

/** Shared health payload for the server function and GET /api/health. */
export function healthStatus() {
  return { ok: true as const };
}

/** Trivial TanStack Start server function used to prove server code runs. */
export const getHealth = createServerFn({ method: "GET" }).handler(() => healthStatus());
