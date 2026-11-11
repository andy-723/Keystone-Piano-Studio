import { getServerEnv } from "./env";
import { ProblemError } from "./problem";
import type { GoogleEvent } from "@/lib/lesson-calendar";

/**
 * Google Calendar one-way push (0010). Plain fetch, no SDK.
 *
 * Scope: calendar.app.created lets Keystone create its own "Keystone lessons" calendar and manage
 * events on calendars it created. It cannot read or change any other calendar the teacher has.
 */
export const GOOGLE_CALENDAR_SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/calendar.app.created",
];
export const KEYSTONE_CALENDAR_NAME = "Keystone lessons";
const STATE_TTL_MS = 10 * 60 * 1000;

export function googleConfig() {
  const env = getServerEnv();
  // The demo calendar runs this code in the browser, where there is no process.env.
  const vars = typeof process !== "undefined" && process.env ? process.env : {};
  const clientId = vars["GOOGLE_CALENDAR_CLIENT_ID"]?.trim() ?? "";
  const clientSecret = vars["GOOGLE_CALENDAR_CLIENT_SECRET"]?.trim() ?? "";
  return {
    clientId,
    clientSecret,
    redirectUri: `${env.appUrl}/calendar/google`,
    configured: Boolean(clientId && clientSecret),
  };
}

function requireConfig() {
  const config = googleConfig();
  if (!config.configured) {
    throw new ProblemError(
      503,
      "Google Calendar is not set up",
      "GOOGLE_CALENDAR_CLIENT_ID and GOOGLE_CALENDAR_CLIENT_SECRET are missing.",
    );
  }
  return config;
}

// ---------------------------------------------------------------------------
// OAuth state: signed, short-lived, bound to the Keystone user and studio. The callback page only
// finishes the link when the signed-in user matches the user in the state.
// ---------------------------------------------------------------------------
// Web Crypto (not node:crypto) so this module can be imported by client code that calls the
// server functions without pulling a Node built-in into the browser bundle.
async function hmacKey(secret: string) {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

const invalidState = () =>
  new ProblemError(
    400,
    "Invalid link",
    "This Google link isn't valid. Start the Google connection again.",
  );

export async function createOAuthState(
  input: { userId: string; studioId: string },
  now = Date.now(),
): Promise<string> {
  const { clientSecret } = requireConfig();
  const payload = Buffer.from(
    JSON.stringify({
      u: input.userId,
      s: input.studioId,
      e: now + STATE_TTL_MS,
      n: Buffer.from(crypto.getRandomValues(new Uint8Array(12))).toString("base64url"),
    }),
  ).toString("base64url");
  const signature = await crypto.subtle.sign(
    "HMAC",
    await hmacKey(clientSecret),
    new TextEncoder().encode(payload),
  );
  return `${payload}.${Buffer.from(signature).toString("base64url")}`;
}

export async function readOAuthState(
  state: string,
  now = Date.now(),
): Promise<{ userId: string; studioId: string }> {
  const { clientSecret } = requireConfig();
  const [payload, signature, extra] = state.split(".");
  if (!payload || !signature || extra !== undefined) throw invalidState();
  const valid = await crypto.subtle.verify(
    "HMAC",
    await hmacKey(clientSecret),
    Buffer.from(signature, "base64url"),
    new TextEncoder().encode(payload),
  );
  if (!valid || Buffer.from(signature, "base64url").toString("base64url") !== signature) {
    throw invalidState();
  }
  const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
    u: string;
    s: string;
    e: number;
  };
  if (typeof data.e !== "number" || data.e < now)
    throw new ProblemError(
      400,
      "Link expired",
      "This Google link has expired. Start the Google connection again.",
    );
  return { userId: data.u, studioId: data.s };
}

export function googleAuthUrl(state: string, loginHint?: string | null): string {
  const config = requireConfig();
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    scope: GOOGLE_CALENDAR_SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "false",
    state,
  });
  if (loginHint) params.set("login_hint", loginHint);
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

// ---------------------------------------------------------------------------
// Token exchange
// ---------------------------------------------------------------------------
type Fetch = typeof fetch;
let fetchImpl: Fetch = (...args) => fetch(...args);

/** Tests replace Google's HTTP endpoints. */
export function setGoogleFetchForTests(impl: Fetch | null) {
  fetchImpl = impl ?? ((...args) => fetch(...args));
  accessTokens.clear();
}

export class GoogleAuthRevoked extends Error {}

export async function exchangeCode(code: string): Promise<{
  refreshToken: string;
  accessToken: string;
  expiresIn: number;
  email: string | null;
  scope: string;
}> {
  const config = requireConfig();
  const response = await fetchImpl("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: config.redirectUri,
      grant_type: "authorization_code",
    }),
  });
  const body = (await response.json().catch(() => ({}))) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    id_token?: string;
    scope?: string;
    error_description?: string;
  };
  if (!response.ok || !body.access_token) {
    throw new ProblemError(
      400,
      "Google sign-in failed",
      body.error_description ?? "Google did not accept the sign-in. Try again.",
    );
  }
  if (!body.refresh_token) {
    throw new ProblemError(
      400,
      "Google sign-in incomplete",
      "Google did not return offline access. Remove Keystone from your Google account's third-party access and connect again.",
    );
  }
  if (!(body.scope ?? "").includes("calendar.app.created")) {
    throw new ProblemError(
      400,
      "Calendar access not granted",
      "Tick the calendar permission on Google's screen so Keystone can add your lessons.",
    );
  }
  let email: string | null = null;
  if (body.id_token) {
    try {
      // id_token comes straight from Google's token endpoint over TLS, so the claims are trusted here.
      const claims = JSON.parse(
        Buffer.from(body.id_token.split(".")[1] ?? "", "base64url").toString("utf8"),
      ) as { email?: string };
      email = claims.email ?? null;
    } catch {
      email = null;
    }
  }
  return {
    refreshToken: body.refresh_token,
    accessToken: body.access_token,
    expiresIn: body.expires_in ?? 3600,
    email,
    scope: body.scope ?? "",
  };
}

const accessTokens = new Map<string, { token: string; expiresAt: number }>();

export function rememberAccessToken(connectionId: string, token: string, expiresIn: number) {
  accessTokens.set(connectionId, { token, expiresAt: Date.now() + (expiresIn - 60) * 1000 });
}

export function forgetAccessToken(connectionId: string) {
  accessTokens.delete(connectionId);
}

export async function accessTokenFor(
  connectionId: string,
  loadRefreshToken: () => Promise<string | null>,
): Promise<string> {
  const cached = accessTokens.get(connectionId);
  if (cached && cached.expiresAt > Date.now()) return cached.token;
  const refreshToken = await loadRefreshToken();
  if (!refreshToken) throw new GoogleAuthRevoked("No Google refresh token");
  const config = requireConfig();
  const response = await fetchImpl("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  const body = (await response.json().catch(() => ({}))) as {
    access_token?: string;
    expires_in?: number;
    error?: string;
  };
  if (body.error === "invalid_grant") throw new GoogleAuthRevoked("Google access was removed");
  if (!response.ok || !body.access_token)
    throw new Error(`Google token refresh failed (${response.status})`);
  rememberAccessToken(connectionId, body.access_token, body.expires_in ?? 3600);
  return body.access_token;
}

export async function revokeToken(token: string): Promise<void> {
  await fetchImpl(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, {
    method: "POST",
  }).catch(() => undefined);
}

// ---------------------------------------------------------------------------
// Calendar API
// ---------------------------------------------------------------------------
const API = "https://www.googleapis.com/calendar/v3";

async function call(
  token: string,
  method: string,
  path: string,
  body?: unknown,
): Promise<Response> {
  const response = await fetchImpl(`${API}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      ...(body ? { "content-type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (response.status === 401) throw new GoogleAuthRevoked("Google rejected the access token");
  return response;
}

async function errorText(response: Response) {
  const body = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
  return `Google Calendar ${response.status}: ${body.error?.message ?? response.statusText}`;
}

export async function createKeystoneCalendar(token: string, timeZone: string): Promise<string> {
  const response = await call(token, "POST", "/calendars", {
    summary: KEYSTONE_CALENDAR_NAME,
    description:
      "Lessons from Keystone Music HQ. Change lessons in Keystone; edits made here are overwritten.",
    timeZone,
  });
  if (!response.ok) throw new Error(await errorText(response));
  const body = (await response.json()) as { id: string };
  return body.id;
}

export async function calendarExists(token: string, calendarId: string): Promise<boolean> {
  const response = await call(token, "GET", `/calendars/${encodeURIComponent(calendarId)}`);
  if (response.status === 404 || response.status === 403) return false;
  if (!response.ok) throw new Error(await errorText(response));
  return true;
}

/** Create or replace an event with our own id. Idempotent. */
export async function putEvent(
  token: string,
  calendarId: string,
  event: GoogleEvent,
): Promise<void> {
  const base = `/calendars/${encodeURIComponent(calendarId)}/events`;
  const update = await call(token, "PUT", `${base}/${event.id}?sendUpdates=none`, event);
  if (update.ok) return;
  if (update.status !== 404) throw new Error(await errorText(update));
  const insert = await call(token, "POST", `${base}?sendUpdates=none`, event);
  if (insert.ok) return;
  if (insert.status === 409) {
    // Deleted events keep their id; PUT above returns 404 for them in some cases. Retry once.
    const retry = await call(token, "PUT", `${base}/${event.id}?sendUpdates=none`, event);
    if (retry.ok) return;
    throw new Error(await errorText(retry));
  }
  throw new Error(await errorText(insert));
}

export async function deleteEvent(
  token: string,
  calendarId: string,
  eventId: string,
): Promise<void> {
  const response = await call(
    token,
    "DELETE",
    `/calendars/${encodeURIComponent(calendarId)}/events/${eventId}?sendUpdates=none`,
  );
  if (response.ok || response.status === 404 || response.status === 410) return;
  throw new Error(await errorText(response));
}
