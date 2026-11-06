import type { IntegrationScope } from "@/mocks/integrations";

/** Env helpers for live Stripe/Xero. Values exist only after Cursor secrets are added. */

function env(name: string): string | undefined {
  const value = process.env[name];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function stripeConfigured(): boolean {
  return Boolean(env("STRIPE_SECRET_KEY") && env("STRIPE_CONNECT_CLIENT_ID"));
}

export function xeroConfigured(): boolean {
  return Boolean(env("XERO_CLIENT_ID") && env("XERO_CLIENT_SECRET"));
}

export function stripeSecretKey(): string {
  const key = env("STRIPE_SECRET_KEY");
  if (!key) throw new Error("STRIPE_SECRET_KEY is not configured.");
  return key;
}

export function stripeConnectClientId(): string {
  const id = env("STRIPE_CONNECT_CLIENT_ID");
  if (!id) throw new Error("STRIPE_CONNECT_CLIENT_ID is not configured.");
  return id;
}

export function stripeWebhookSecret(): string | null {
  return env("STRIPE_WEBHOOK_SECRET") ?? null;
}

export function xeroClientId(): string {
  const id = env("XERO_CLIENT_ID");
  if (!id) throw new Error("XERO_CLIENT_ID is not configured.");
  return id;
}

export function xeroClientSecret(): string {
  const secret = env("XERO_CLIENT_SECRET");
  if (!secret) throw new Error("XERO_CLIENT_SECRET is not configured.");
  return secret;
}

export function integrationStateSecret(): string {
  return env("INTEGRATION_STATE_SECRET") || env("STRIPE_SECRET_KEY") || env("XERO_CLIENT_SECRET") || "keystone-sample-state-secret";
}

export function resolveAppBaseUrl(request: Request): string {
  const configured = env("APP_BASE_URL")?.replace(/\/$/, "");
  if (configured) return configured;
  const url = new URL(request.url);
  return `${url.protocol}//${url.host}`;
}

export function stripeCallbackUrl(request: Request): string {
  return `${resolveAppBaseUrl(request)}/api/integrations/stripe/callback`;
}

export function stripeRefreshUrl(request: Request): string {
  return `${resolveAppBaseUrl(request)}/api/integrations/stripe/refresh`;
}

export function stripeCheckoutReturnUrl(request: Request): string {
  return `${resolveAppBaseUrl(request)}/api/integrations/stripe/checkout-return`;
}

export function xeroCallbackUrl(request: Request): string {
  return `${resolveAppBaseUrl(request)}/api/integrations/xero/callback`;
}

export function parseScope(value: string | null | undefined): IntegrationScope {
  return value === "new-studio" ? "new-studio" : "demo";
}

export type ProviderMode = "live" | "sample";

export function providerModes(): { stripe: ProviderMode; xero: ProviderMode } {
  return {
    stripe: stripeConfigured() ? "live" : "sample",
    xero: xeroConfigured() ? "live" : "sample",
  };
}
