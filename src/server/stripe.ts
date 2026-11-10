import { createHmac, timingSafeEqual } from "node:crypto";
import { ProblemError } from "./problem";

/**
 * Minimal Stripe client for Keystone's OWN subscription billing (Synoratech charging studios).
 * This is not Stripe Connect: teachers' family payments use their own connected accounts.
 * No SDK dependency: signature check per Stripe's documented scheme, REST calls via fetch.
 */

export const STRIPE_SIGNATURE_TOLERANCE_SECONDS = 300;

export type StripeEvent = {
  id: string;
  type: string;
  created: number;
  /** Set only on events from connected accounts — never expected on the billing endpoint. */
  account?: string;
  livemode?: boolean;
  data: { object: Record<string, unknown> };
};

export function signStripePayload(payload: string, secret: string, timestamp: number): string {
  const signature = createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex");
  return `t=${timestamp},v1=${signature}`;
}

/** Verifies the Stripe-Signature header and returns the parsed event. Throws 400 on failure. */
export function verifyStripeEvent(
  payload: string,
  header: string | null,
  secret: string,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): StripeEvent {
  if (!secret) throw new ProblemError(500, "Stripe webhook secret is not configured");
  if (!header) throw new ProblemError(400, "Missing Stripe-Signature header");

  let timestamp: number | null = null;
  const signatures: string[] = [];
  for (const part of header.split(",")) {
    const [key, value] = part.split("=", 2);
    if (key === "t" && value) timestamp = Number(value);
    if (key === "v1" && value) signatures.push(value);
  }
  if (timestamp === null || Number.isNaN(timestamp) || signatures.length === 0) {
    throw new ProblemError(400, "Malformed Stripe-Signature header");
  }
  if (Math.abs(nowSeconds - timestamp) > STRIPE_SIGNATURE_TOLERANCE_SECONDS) {
    throw new ProblemError(400, "Stripe signature timestamp outside tolerance");
  }

  const expected = Buffer.from(
    createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex"),
    "utf8",
  );
  const matched = signatures.some((candidate) => {
    const given = Buffer.from(candidate, "utf8");
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
  if (!matched) throw new ProblemError(400, "Stripe signature mismatch");

  try {
    return JSON.parse(payload) as StripeEvent;
  } catch {
    throw new ProblemError(400, "Invalid JSON payload");
  }
}

function formEncode(params: Record<string, string | number | boolean | undefined | null>) {
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    body.append(key, String(value));
  }
  return body;
}

/** POST to the Stripe API with the platform secret key. */
export async function stripePost<T>(
  secretKey: string,
  path: string,
  params: Record<string, string | number | boolean | undefined | null>,
  idempotencyKey?: string,
): Promise<T> {
  if (!secretKey)
    throw new ProblemError(503, "Billing is not set up yet", "STRIPE_SECRET_KEY is missing.");
  const response = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
    },
    body: formEncode(params),
  });
  const json = (await response.json().catch(() => ({}))) as T & { error?: { message?: string } };
  if (!response.ok) {
    throw new ProblemError(
      502,
      "Stripe request failed",
      json.error?.message ?? `HTTP ${response.status}`,
    );
  }
  return json;
}
