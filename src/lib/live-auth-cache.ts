import type { StudioAccessGate } from "@/lib/post-login";

/** In-tab memory so SPA navigations stay instant after the first check. */
const verifiedTokens = new Map<string, StudioAccessGate>();

const STORAGE_KEY = "kmhq.live-auth.verified.v1";

type Stored = { token: string; gate: StudioAccessGate };

function readStored(): Stored | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Stored;
    if (!parsed || typeof parsed.token !== "string" || !parsed.gate || typeof parsed.gate !== "object") {
      return null;
    }
    if (!("kind" in parsed.gate)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeStored(token: string, gate: StudioAccessGate) {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ token, gate } satisfies Stored));
  } catch {
    // Private mode / quota — memory cache still helps within the same document.
  }
}

/** Remember that this access token already passed account + MFA + subscription gates. */
export function rememberVerifiedAccess(token: string, gate: StudioAccessGate) {
  verifiedTokens.set(token, gate);
  writeStored(token, gate);
}

/** Lookup a previously verified access token (memory, then sessionStorage for full reloads). */
export function getVerifiedAccess(token: string): StudioAccessGate | undefined {
  const known = verifiedTokens.get(token);
  if (known) return known;
  const stored = readStored();
  if (!stored || stored.token !== token) return undefined;
  verifiedTokens.set(token, stored.gate);
  return stored.gate;
}

export function clearVerifiedAccess() {
  verifiedTokens.clear();
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

export function resetLiveAuthCacheForTests() {
  clearVerifiedAccess();
}
