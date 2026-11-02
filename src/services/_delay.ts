/** Simulates a network round trip so screens behave like they would against the real API. */
export function respond<T>(value: T, ms = 120): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(structuredClone(value)), ms));
}
