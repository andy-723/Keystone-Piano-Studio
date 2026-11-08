/** Default JSON/body size limit for server routes (bytes). */
export const DEFAULT_BODY_LIMIT_BYTES = 256 * 1024;

/**
 * Documented exceptions (step 7):
 * - Stripe webhook route (when added) keeps its raw body for signature checks and
 *   may use a higher limit; it must still reject oversized payloads after verify.
 */
export const BODY_LIMIT_EXCEPTIONS: Array<{ route: string; reason: string }> = [
  {
    route: "/api/stripe/webhook",
    reason: "Raw body required for Stripe signature checks (not implemented yet).",
  },
];

export async function readJsonWithLimit<T>(
  request: Request,
  limitBytes = DEFAULT_BODY_LIMIT_BYTES,
): Promise<T> {
  const lengthHeader = request.headers.get("content-length");
  if (lengthHeader && Number(lengthHeader) > limitBytes) {
    throw new Error("Request body too large");
  }
  const buffer = await request.arrayBuffer();
  if (buffer.byteLength > limitBytes) throw new Error("Request body too large");
  if (buffer.byteLength === 0) return {} as T;
  return JSON.parse(new TextDecoder().decode(buffer)) as T;
}
