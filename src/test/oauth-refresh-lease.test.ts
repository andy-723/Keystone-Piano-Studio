import { expect, it } from "vitest";
import {
  createMemoryOAuthStore,
  refreshWithLease,
  OAUTH_REFRESH_LEASE_SECONDS,
} from "@/services/providers/accounting";

it("exports a named lease constant set by testing, not assumed", () => {
  expect(OAUTH_REFRESH_LEASE_SECONDS).toBeTypeOf("number");
  expect(OAUTH_REFRESH_LEASE_SECONDS).toBeGreaterThan(0);
});

it("compare-and-swap: second worker loses when first saves first", async () => {
  const store = createMemoryOAuthStore({ tokenVersion: 3, refreshSecretId: "refresh-v3" });
  const first = await store.claim("conn-1", "worker-a", 30);
  expect(first).toBe(3);
  const second = await store.claim("conn-1", "worker-b", 30);
  expect(second).toBeNull();

  const saved = await store.save(
    "conn-1",
    "worker-a",
    3,
    "access-new",
    "refresh-new",
    new Date().toISOString(),
  );
  expect(saved).toBe(true);
  expect(store.state.tokenVersion).toBe(4);

  const late = await store.save(
    "conn-1",
    "worker-b",
    3,
    "access-late",
    "refresh-late",
    new Date().toISOString(),
  );
  expect(late).toBe(false);
});

it("refreshWithLease retries a lost HTTP response with the old refresh token", async () => {
  const store = createMemoryOAuthStore({ tokenVersion: 1, refreshSecretId: "refresh-v1" });
  let attempts = 0;
  store.httpImpl = async () => {
    attempts += 1;
    if (attempts === 1) throw new Error("network lost");
    return {
      accessSecretId: "access-recovered",
      refreshSecretId: "refresh-recovered",
      expiresAt: new Date(Date.now() + 1800_000).toISOString(),
    };
  };
  const result = await refreshWithLease("conn-1", "worker-a", store);
  expect(result).toEqual({ ok: true, tokenVersion: 2 });
  expect(attempts).toBe(2);
  expect(store.state.refreshSecretId).toBe("refresh-recovered");
});

it("two simulated workers: exactly one refreshWithLease succeeds under contention", async () => {
  const store = createMemoryOAuthStore({ tokenVersion: 0, refreshSecretId: "refresh-v0" });
  let releaseHttp!: () => void;
  const gate = new Promise<void>((resolve) => {
    releaseHttp = resolve;
  });
  store.httpImpl = async () => {
    await gate;
    return {
      accessSecretId: `access-${crypto.randomUUID()}`,
      refreshSecretId: `refresh-${crypto.randomUUID()}`,
      expiresAt: new Date(Date.now() + 1800_000).toISOString(),
    };
  };
  const first = refreshWithLease("conn-1", "worker-a", store);
  await Promise.resolve();
  const second = await refreshWithLease("conn-1", "worker-b", store);
  expect(second).toEqual({ ok: false, reason: "lease_held" });
  releaseHttp();
  await expect(first).resolves.toEqual({ ok: true, tokenVersion: 1 });
});
