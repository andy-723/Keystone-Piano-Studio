/**
 * Xero token refresh scaffold (no live Xero). Uses claim/save/release lease
 * functions from migration 0003. Never holds a database transaction across the HTTP call.
 */

/** Lease length in seconds — set by testing, not assumed. */
export const OAUTH_REFRESH_LEASE_SECONDS = 30;

/** Xero documents a ~30 minute grace period for the previous refresh token. */
export const XERO_REFRESH_TOKEN_GRACE_MS = 30 * 60 * 1000;

export type OAuthLeaseStore = {
  claim(connectionId: string, owner: string, leaseSeconds: number): Promise<number | null>;
  save(
    connectionId: string,
    owner: string,
    expectedVersion: number,
    newAccessSecretId: string,
    newRefreshSecretId: string,
    newExpiresAt: string,
  ): Promise<boolean>;
  release(connectionId: string, owner: string): Promise<void>;
  /** Simulated HTTP refresh; may throw to model a lost response. */
  httpRefresh(refreshSecretId: string): Promise<{
    accessSecretId: string;
    refreshSecretId: string;
    expiresAt: string;
  }>;
};

type ConnectionState = {
  tokenVersion: number;
  refreshSecretId: string;
  accessSecretId: string;
  leaseOwner: string | null;
  leaseUntil: number | null;
  previousRefreshSecretId: string | null;
  previousRefreshUntil: number | null;
};

/** In-memory compare-and-swap store for unit tests. */
export function createMemoryOAuthStore(
  initial: Partial<ConnectionState> = {},
): OAuthLeaseStore & { state: ConnectionState; httpImpl: OAuthLeaseStore["httpRefresh"] } {
  const state: ConnectionState = {
    tokenVersion: initial.tokenVersion ?? 0,
    refreshSecretId: initial.refreshSecretId ?? "refresh-v0",
    accessSecretId: initial.accessSecretId ?? "access-v0",
    leaseOwner: null,
    leaseUntil: null,
    previousRefreshSecretId: null,
    previousRefreshUntil: null,
  };

  const store: OAuthLeaseStore & {
    state: ConnectionState;
    httpImpl: OAuthLeaseStore["httpRefresh"];
  } = {
    state,
    httpImpl: async (refreshSecretId) => {
      if (
        refreshSecretId !== state.refreshSecretId &&
        !(
          state.previousRefreshSecretId === refreshSecretId &&
          state.previousRefreshUntil != null &&
          Date.now() <= state.previousRefreshUntil
        )
      ) {
        throw new Error("Invalid refresh token");
      }
      return {
        accessSecretId: `access-${crypto.randomUUID()}`,
        refreshSecretId: `refresh-${crypto.randomUUID()}`,
        expiresAt: new Date(Date.now() + 1800_000).toISOString(),
      };
    },
    async claim(_connectionId, owner, leaseSeconds) {
      const now = Date.now();
      if (state.leaseUntil != null && state.leaseUntil > now && state.leaseOwner !== owner) {
        return null;
      }
      state.leaseOwner = owner;
      state.leaseUntil = now + leaseSeconds * 1000;
      return state.tokenVersion;
    },
    async save(
      _connectionId,
      owner,
      expectedVersion,
      newAccessSecretId,
      newRefreshSecretId,
      _newExpiresAt,
    ) {
      const now = Date.now();
      if (state.tokenVersion !== expectedVersion) return false;
      if (state.leaseOwner !== owner || state.leaseUntil == null || state.leaseUntil < now)
        return false;
      state.previousRefreshSecretId = state.refreshSecretId;
      state.previousRefreshUntil = now + XERO_REFRESH_TOKEN_GRACE_MS;
      state.accessSecretId = newAccessSecretId;
      state.refreshSecretId = newRefreshSecretId;
      state.tokenVersion += 1;
      state.leaseOwner = null;
      state.leaseUntil = null;
      return true;
    },
    async release(_connectionId, owner) {
      if (state.leaseOwner === owner) {
        state.leaseOwner = null;
        state.leaseUntil = null;
      }
    },
    async httpRefresh(refreshSecretId) {
      return store.httpImpl(refreshSecretId);
    },
  };
  return store;
}

/**
 * Claim a lease, refresh outside any DB transaction, then compare-and-swap save.
 * On a lost HTTP response, retries with the old refresh token within the grace window.
 */
export async function refreshWithLease(
  connectionId: string,
  owner: string,
  store: OAuthLeaseStore,
  options: { leaseSeconds?: number } = {},
): Promise<{ ok: true; tokenVersion: number } | { ok: false; reason: string }> {
  const leaseSeconds = options.leaseSeconds ?? OAUTH_REFRESH_LEASE_SECONDS;
  const version = await store.claim(connectionId, owner, leaseSeconds);
  if (version == null) return { ok: false, reason: "lease_held" };

  // Snapshot the refresh secret before the HTTP call (no open DB transaction).
  // Callers supply httpRefresh; memory store uses current secret.
  let refreshSecretId = "refresh-v0";
  if (
    "state" in store &&
    store.state &&
    typeof store.state === "object" &&
    "refreshSecretId" in store.state
  ) {
    refreshSecretId = (store.state as ConnectionState).refreshSecretId;
  }

  try {
    let tokens: Awaited<ReturnType<OAuthLeaseStore["httpRefresh"]>>;
    try {
      tokens = await store.httpRefresh(refreshSecretId);
    } catch {
      // Lost/failed response: retry once with the same (old) refresh token within grace.
      tokens = await store.httpRefresh(refreshSecretId);
    }
    const saved = await store.save(
      connectionId,
      owner,
      version,
      tokens.accessSecretId,
      tokens.refreshSecretId,
      tokens.expiresAt,
    );
    if (!saved) {
      await store.release(connectionId, owner);
      return { ok: false, reason: "cas_lost" };
    }
    return { ok: true, tokenVersion: version + 1 };
  } catch (error) {
    await store.release(connectionId, owner);
    return { ok: false, reason: error instanceof Error ? error.message : "refresh_failed" };
  }
}
