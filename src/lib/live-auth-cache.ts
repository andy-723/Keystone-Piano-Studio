import type { StudioAccessGate } from "@/lib/post-login";

export type ShellRole = "teacher" | "parent";

export type VerifiedAccess = {
  access: StudioAccessGate;
  shellRole: ShellRole;
};

/** In-tab memory so SPA navigations stay instant after the first check. */
const verifiedTokens = new Map<string, VerifiedAccess>();

const STORAGE_KEY = "kmhq.live-auth.verified.v2";

type Stored = { token: string; gate: StudioAccessGate; shellRole?: ShellRole };

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

function writeStored(token: string, gate: StudioAccessGate, shellRole: ShellRole) {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ token, gate, shellRole } satisfies Stored),
    );
  } catch {
    // Private mode / quota — memory cache still helps within the same document.
  }
}

/** Remember that this access token already passed account + MFA + subscription gates. */
export function rememberVerifiedAccess(
  token: string,
  gate: StudioAccessGate,
  shellRole: ShellRole = "teacher",
) {
  const entry = { access: gate, shellRole };
  verifiedTokens.set(token, entry);
  writeStored(token, gate, shellRole);
}

/** Lookup a previously verified access token (memory, then sessionStorage for full reloads). */
export function getVerifiedAccess(token: string): VerifiedAccess | undefined {
  const known = verifiedTokens.get(token);
  if (known) return known;
  const stored = readStored();
  if (!stored || stored.token !== token) return undefined;
  const entry = { access: stored.gate, shellRole: stored.shellRole ?? ("teacher" as ShellRole) };
  verifiedTokens.set(token, entry);
  return entry;
}

export function clearVerifiedAccess() {
  verifiedTokens.clear();
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.removeItem(STORAGE_KEY);
    sessionStorage.removeItem("kmhq.live-auth.verified.v1");
  } catch {
    // ignore
  }
}

export function resetLiveAuthCacheForTests() {
  clearVerifiedAccess();
}
