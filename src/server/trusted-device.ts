/**
 * "Trust this device for 30 days" (0029). The browser gets a random token in a secure httpOnly
 * cookie; only its SHA-256 hash is stored in `trusted_device`. Rules are pure in
 * src/lib/trusted-device.ts. Service role only: every function verifies the access token first
 * and only ever touches the verified user's own rows.
 */
import { createHash, randomBytes } from "node:crypto";
import { createServerFn } from "@tanstack/react-start";
import { deleteCookie, getCookie, getRequestHeader, setCookie } from "@tanstack/react-start/server";
import { isMockOnboarding } from "./env";
import { verifyAccessToken } from "./session";
import { createServiceSupabase } from "./supabase";
import { ProblemError } from "./problem";
import {
  deviceLabel,
  TRUSTED_DEVICE_COOKIE,
  TRUSTED_DEVICE_MS,
  trustStateFor,
  type TrustedDeviceRow,
  type TrustState,
} from "@/lib/trusted-device";

export function hashDeviceToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export type TrustedDeviceStore = {
  insert(row: TrustedDeviceRow & { token_hash: string }): Promise<void>;
  findByHash(tokenHash: string): Promise<TrustedDeviceRow | null>;
  touch(id: string, at: string): Promise<void>;
  listActive(userId: string, nowIso: string): Promise<TrustedDeviceRow[]>;
  /** Revoke the user's rows; `exceptId` keeps one (this browser). `onlyId` revokes just one. */
  revoke(
    userId: string,
    at: string,
    opts?: { exceptId?: string; onlyId?: string },
  ): Promise<number>;
};

export type CookieJar = {
  get(): string | undefined;
  set(token: string, expires: Date): void;
  clear(): void;
};

// ---------------------------------------------------------------------------
// Stores
// ---------------------------------------------------------------------------

type MemoryRow = TrustedDeviceRow & { token_hash: string };
const memoryRows: MemoryRow[] = [];

export function resetTrustedDevicesForTests() {
  memoryRows.splice(0, memoryRows.length);
}

export const memoryTrustedDeviceStore: TrustedDeviceStore = {
  async insert(row) {
    memoryRows.push({ ...row });
  },
  async findByHash(tokenHash) {
    const row = memoryRows.find((entry) => entry.token_hash === tokenHash);
    if (!row) return null;
    const { token_hash: _hash, ...rest } = row;
    void _hash;
    return { ...rest };
  },
  async touch(id, at) {
    const row = memoryRows.find((entry) => entry.id === id);
    if (row) row.last_seen_at = at;
  },
  async listActive(userId, nowIso) {
    return memoryRows
      .filter((row) => row.user_id === userId && !row.revoked_at && row.expires_at > nowIso)
      .map(({ token_hash: _hash, ...rest }) => {
        void _hash;
        return { ...rest };
      });
  },
  async revoke(userId, at, opts = {}) {
    let count = 0;
    for (const row of memoryRows) {
      if (row.user_id !== userId || row.revoked_at) continue;
      if (opts.exceptId && row.id === opts.exceptId) continue;
      if (opts.onlyId && row.id !== opts.onlyId) continue;
      row.revoked_at = at;
      count += 1;
    }
    return count;
  },
};

const COLUMNS = "id, user_id, label, created_at, last_seen_at, expires_at, revoked_at";

/** A missing table (0029 not applied yet) reads as "no trusted devices", never an error page. */
function missingTable(error: { code?: string } | null | undefined) {
  return error?.code === "42P01" || error?.code === "PGRST205";
}

function supabaseTrustedDeviceStore(): TrustedDeviceStore {
  // Service-key access to trusted_device — every caller below verified the access token and
  // only passes that verified user's id.
  const supabase = createServiceSupabase();
  return {
    async insert(row) {
      const { error } = await supabase.from("trusted_device").insert(row);
      if (error) {
        if (missingTable(error)) {
          throw new ProblemError(503, "Not available yet", "Trusted devices aren't set up yet.");
        }
        throw new ProblemError(500, "Could not trust this device", error.message);
      }
    },
    async findByHash(tokenHash) {
      const { data, error } = await supabase
        .from("trusted_device")
        .select(COLUMNS)
        .eq("token_hash", tokenHash)
        .maybeSingle();
      if (error) {
        if (missingTable(error)) return null;
        throw new ProblemError(500, "Trusted device lookup failed", error.message);
      }
      return (data as TrustedDeviceRow | null) ?? null;
    },
    async touch(id, at) {
      await supabase.from("trusted_device").update({ last_seen_at: at }).eq("id", id);
    },
    async listActive(userId, nowIso) {
      const { data, error } = await supabase
        .from("trusted_device")
        .select(COLUMNS)
        .eq("user_id", userId)
        .is("revoked_at", null)
        .gt("expires_at", nowIso)
        .order("last_seen_at", { ascending: false });
      if (error) {
        if (missingTable(error)) return [];
        throw new ProblemError(500, "Trusted device lookup failed", error.message);
      }
      return (data ?? []) as TrustedDeviceRow[];
    },
    async revoke(userId, at, opts = {}) {
      let query = supabase
        .from("trusted_device")
        .update({ revoked_at: at })
        .eq("user_id", userId)
        .is("revoked_at", null);
      if (opts.exceptId) query = query.neq("id", opts.exceptId);
      if (opts.onlyId) query = query.eq("id", opts.onlyId);
      const { data, error } = await query.select("id");
      if (error) {
        if (missingTable(error)) return 0;
        throw new ProblemError(500, "Could not sign out devices", error.message);
      }
      return (data ?? []).length;
    },
  };
}

export function trustedDeviceStore(): TrustedDeviceStore {
  return isMockOnboarding() ? memoryTrustedDeviceStore : supabaseTrustedDeviceStore();
}

function requestCookieJar(): CookieJar {
  return {
    get: () => getCookie(TRUSTED_DEVICE_COOKIE),
    set: (token, expires) =>
      setCookie(TRUSTED_DEVICE_COOKIE, token, {
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        path: "/",
        expires,
      }),
    clear: () => deleteCookie(TRUSTED_DEVICE_COOKIE, { path: "/" }),
  };
}

// ---------------------------------------------------------------------------
// Core (testable: store, cookie jar and clock are passed in)
// ---------------------------------------------------------------------------

export type DeviceSession = { userId: string; aal: string | null; mfaRequired: boolean };

/**
 * Trust this browser. Staff (who must use the authenticator) can only trust a browser from a
 * session that passed the code (aal2), so a stolen email link alone never gets 30 days.
 */
export async function trustThisDevice(
  session: DeviceSession,
  deps: { store: TrustedDeviceStore; cookies: CookieJar; userAgent?: string | null; now?: number },
): Promise<{ trusted: true; expiresAt: string }> {
  if (session.mfaRequired && session.aal !== "aal2") {
    throw new ProblemError(403, "Code needed", "Enter your authenticator code first.");
  }
  const now = deps.now ?? Date.now();
  const nowIso = new Date(now).toISOString();
  // Replace any earlier trust on this browser (one row per browser).
  const existing = deps.cookies.get();
  if (existing) {
    const row = await deps.store.findByHash(hashDeviceToken(existing));
    if (row && row.user_id === session.userId) {
      await deps.store.revoke(session.userId, nowIso, { onlyId: row.id });
    }
  }
  const token = randomBytes(32).toString("base64url");
  const expires = new Date(now + TRUSTED_DEVICE_MS);
  await deps.store.insert({
    id: crypto.randomUUID(),
    user_id: session.userId,
    token_hash: hashDeviceToken(token),
    label: deviceLabel(deps.userAgent),
    created_at: nowIso,
    last_seen_at: nowIso,
    expires_at: expires.toISOString(),
    revoked_at: null,
  });
  deps.cookies.set(token, expires);
  return { trusted: true, expiresAt: expires.toISOString() };
}

/** Is this browser trusted for this user? Counts as use (last seen). Clears a dead cookie. */
export async function checkThisDevice(
  userId: string,
  deps: { store: TrustedDeviceStore; cookies: CookieJar; now?: number },
): Promise<TrustState & { deviceId?: string }> {
  const token = deps.cookies.get();
  if (!token) return { trusted: false, reason: "none" };
  const now = deps.now ?? Date.now();
  const row = await deps.store.findByHash(hashDeviceToken(token));
  const state = trustStateFor(row, userId, now);
  if (!state.trusted) {
    // A cookie for someone else (shared computer, other person signed in) stays for them.
    if (state.reason !== "other_user") deps.cookies.clear();
    return state;
  }
  await deps.store.touch(row!.id, new Date(now).toISOString());
  return { ...state, deviceId: row!.id };
}

/** Sign out on this browser: stop trusting it. */
export async function forgetThisDevice(
  userId: string,
  deps: { store: TrustedDeviceStore; cookies: CookieJar; now?: number },
) {
  const token = deps.cookies.get();
  if (token) {
    const row = await deps.store.findByHash(hashDeviceToken(token));
    if (row && row.user_id === userId) {
      await deps.store.revoke(userId, new Date(deps.now ?? Date.now()).toISOString(), {
        onlyId: row.id,
      });
    }
  }
  deps.cookies.clear();
  return { ok: true as const };
}

/** "Sign out other devices": every trusted browser of this user except this one. */
export async function forgetOtherDevices(
  userId: string,
  deps: { store: TrustedDeviceStore; cookies: CookieJar; now?: number },
) {
  const here = await checkThisDevice(userId, deps);
  const count = await deps.store.revoke(userId, new Date(deps.now ?? Date.now()).toISOString(), {
    ...(here.deviceId ? { exceptId: here.deviceId } : {}),
  });
  return { ok: true as const, revoked: count };
}

/**
 * Revoke access / MFA reset / removed from the team: no browser stays trusted. Best effort, so
 * a missing table never blocks the revoke itself.
 */
export async function revokeAllTrustedDevices(userId: string, store = trustedDeviceStore()) {
  try {
    return await store.revoke(userId, new Date().toISOString());
  } catch (err) {
    console.error("[trusted-device] revoke all failed", err);
    return 0;
  }
}

// ---------------------------------------------------------------------------
// Server functions
// ---------------------------------------------------------------------------

async function deviceSession(accessToken: string): Promise<DeviceSession> {
  const session = await verifyAccessToken(accessToken);
  // Who must use the authenticator: platform staff and studio staff. Read with the service key,
  // guarded by the verified user id above.
  const supabase = createServiceSupabase();
  const [staff, member] = await Promise.all([
    supabase.from("platform_staff").select("user_id").eq("user_id", session.userId).maybeSingle(),
    supabase.from("studio_member").select("user_id").eq("user_id", session.userId).limit(1),
  ]);
  const mfaRequired = Boolean(staff.data) || (member.data ?? []).length > 0;
  return { userId: session.userId, aal: session.aal, mfaRequired };
}

function liveOnly() {
  if (isMockOnboarding()) {
    throw new ProblemError(400, "Mock mode", "Trusted devices need a real sign-in.");
  }
}

export const trustThisDeviceFn = createServerFn({ method: "POST" })
  .validator((data: { accessToken: string }) => data)
  .handler(async ({ data }) => {
    liveOnly();
    const session = await deviceSession(data.accessToken);
    return trustThisDevice(session, {
      store: trustedDeviceStore(),
      cookies: requestCookieJar(),
      userAgent: getRequestHeader("user-agent") ?? null,
    });
  });

export const checkThisDeviceFn = createServerFn({ method: "POST" })
  .validator((data: { accessToken: string }) => data)
  .handler(async ({ data }) => {
    if (isMockOnboarding()) return { trusted: false as const, reason: "none" as const };
    const session = await verifyAccessToken(data.accessToken);
    const state = await checkThisDevice(session.userId, {
      store: trustedDeviceStore(),
      cookies: requestCookieJar(),
    });
    return state.trusted
      ? { trusted: true as const, expiresAt: state.expiresAt }
      : { trusted: false as const, reason: state.reason };
  });

export const forgetThisDeviceFn = createServerFn({ method: "POST" })
  .validator((data: { accessToken: string }) => data)
  .handler(async ({ data }) => {
    if (isMockOnboarding()) return { ok: true as const };
    const cookies = requestCookieJar();
    try {
      const session = await verifyAccessToken(data.accessToken);
      return await forgetThisDevice(session.userId, { store: trustedDeviceStore(), cookies });
    } catch {
      // Expired session: still drop the cookie so this browser isn't trusted any more.
      cookies.clear();
      return { ok: true as const };
    }
  });

export const forgetOtherDevicesFn = createServerFn({ method: "POST" })
  .validator((data: { accessToken: string }) => data)
  .handler(async ({ data }) => {
    liveOnly();
    const session = await verifyAccessToken(data.accessToken);
    return forgetOtherDevices(session.userId, {
      store: trustedDeviceStore(),
      cookies: requestCookieJar(),
    });
  });

export const listTrustedDevicesFn = createServerFn({ method: "POST" })
  .validator((data: { accessToken: string }) => data)
  .handler(async ({ data }) => {
    if (isMockOnboarding()) return { devices: [] };
    const session = await verifyAccessToken(data.accessToken);
    const store = trustedDeviceStore();
    const cookies = requestCookieJar();
    const token = cookies.get();
    const here = token ? await store.findByHash(hashDeviceToken(token)) : null;
    const rows = await store.listActive(session.userId, new Date().toISOString());
    return {
      devices: rows
        .filter((row) => trustStateFor(row, session.userId).trusted)
        .map((row) => ({
          id: row.id,
          label: row.label,
          lastSeenAt: row.last_seen_at,
          expiresAt: row.expires_at,
          thisDevice: here?.id === row.id,
        })),
    };
  });
