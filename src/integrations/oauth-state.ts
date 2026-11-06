import { createHmac, timingSafeEqual } from "node:crypto";
import type { IntegrationScope } from "@/mocks/integrations";
import { integrationStateSecret } from "./config";

export type OAuthKind = "stripe" | "xero" | "stripe-checkout";

export interface OAuthStatePayload {
  kind: OAuthKind;
  scope: IntegrationScope;
  nonce: string;
  exp: number;
  invoiceId?: string;
}

function sign(body: string): string {
  return createHmac("sha256", integrationStateSecret()).update(body).digest("base64url");
}

export function encodeOAuthState(payload: Omit<OAuthStatePayload, "exp" | "nonce"> & { invoiceId?: string; ttlMs?: number }): string {
  const full: OAuthStatePayload = {
    ...payload,
    nonce: crypto.randomUUID(),
    exp: Date.now() + (payload.ttlMs ?? 15 * 60 * 1000),
  };
  const body = Buffer.from(JSON.stringify(full), "utf8").toString("base64url");
  return `${body}.${sign(body)}`;
}

export function decodeOAuthState(raw: string | null | undefined, kind: OAuthKind): OAuthStatePayload {
  if (!raw || !raw.includes(".")) throw new Error("Missing OAuth state.");
  const [body, signature] = raw.split(".");
  if (!body || !signature) throw new Error("Invalid OAuth state.");
  const expected = sign(body);
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) throw new Error("OAuth state signature mismatch.");
  const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as OAuthStatePayload;
  if (payload.kind !== kind) throw new Error("OAuth state kind mismatch.");
  if (payload.exp < Date.now()) throw new Error("OAuth state expired.");
  if (payload.scope !== "demo" && payload.scope !== "new-studio") throw new Error("Invalid OAuth scope.");
  return payload;
}
