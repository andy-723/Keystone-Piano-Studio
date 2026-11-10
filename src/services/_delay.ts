/**
 * Simulates a network round trip so screens behave like they would against the real API.
 * Only in dev and tests: in a production build the mock services answer at once, because the
 * fake delay stacks up (the root loader and parent home chain dozens of calls) and made the
 * live app feel slow.
 */
const SIMULATE_LATENCY = !import.meta.env.PROD;

export function respond<T>(value: T, ms = 120): Promise<T> {
  // No setTimeout(0) in production: browsers clamp nested timers to 4 ms, which still adds up.
  if (!SIMULATE_LATENCY || ms <= 0) return Promise.resolve().then(() => structuredClone(value));
  return new Promise((resolve) => setTimeout(() => resolve(structuredClone(value)), ms));
}
