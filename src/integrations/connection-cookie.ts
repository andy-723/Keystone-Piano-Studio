import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import type { IntegrationScope } from "@/mocks/integrations";
import { integrationStateSecret } from "./config";

const COOKIE = "ks_live_integrations";

export interface LiveStripeConnection {
  scope: IntegrationScope;
  accountId: string;
  businessName: string;
  bankLast4: string | null;
  livemode: boolean;
}

export interface LiveXeroConnection {
  scope: IntegrationScope;
  tenantId: string;
  organisationName: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  lastSyncedAt: string | null;
}

export interface LiveIntegrationsCookie {
  stripe?: LiveStripeConnection | null;
  xero?: LiveXeroConnection | null;
}

function keyBytes() {
  return createHash("sha256").update(integrationStateSecret()).digest();
}

function encrypt(payload: LiveIntegrationsCookie): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyBytes(), iv);
  const json = Buffer.from(JSON.stringify(payload), "utf8");
  const encrypted = Buffer.concat([cipher.update(json), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("base64url");
}

function decrypt(raw: string): LiveIntegrationsCookie {
  const buffer = Buffer.from(raw, "base64url");
  const iv = buffer.subarray(0, 12);
  const tag = buffer.subarray(12, 28);
  const data = buffer.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", keyBytes(), iv);
  decipher.setAuthTag(tag);
  const json = Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
  return JSON.parse(json) as LiveIntegrationsCookie;
}

export function readLiveIntegrations(request: Request): LiveIntegrationsCookie {
  const header = request.headers.get("cookie") || "";
  const match = header.match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`));
  if (!match?.[1]) return {};
  try {
    return decrypt(decodeURIComponent(match[1]));
  } catch {
    return {};
  }
}

function cookieSecurity(request?: Request): string {
  const proto = request ? new URL(request.url).protocol : "https:";
  return proto === "https:" ? "Secure; " : "";
}

export function liveIntegrationsCookieHeader(payload: LiveIntegrationsCookie, request?: Request): string {
  const value = encrypt(payload);
  return `${COOKIE}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; ${cookieSecurity(request)}Max-Age=${60 * 60 * 24 * 180}`;
}

export function clearLiveIntegrationsCookieHeader(request?: Request): string {
  return `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; ${cookieSecurity(request)}Max-Age=0`;
}

export function mergeLiveIntegrations(
  current: LiveIntegrationsCookie,
  patch: Partial<LiveIntegrationsCookie>,
): LiveIntegrationsCookie {
  const next: LiveIntegrationsCookie = {};
  const stripe = patch.stripe === undefined ? current.stripe : patch.stripe;
  const xero = patch.xero === undefined ? current.xero : patch.xero;
  if (stripe !== undefined) next.stripe = stripe;
  if (xero !== undefined) next.xero = xero;
  return next;
}
