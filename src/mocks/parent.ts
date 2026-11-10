import type { LegacyPaymentMethod, PaymentMethod } from "./types";

export let parentGuardianId = "g-1";
/** Live studios: the signed-in guardian's own id (set when their family is loaded). */
export function setParentGuardianId(id: string) {
  parentGuardianId = id;
}
export const parentPayments: { invoiceId: string; method: PaymentMethod | LegacyPaymentMethod }[] = [];