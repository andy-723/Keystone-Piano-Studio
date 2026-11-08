import type { LegacyPaymentMethod, PaymentMethod } from "./types";

export const parentGuardianId = "g-1";
export const parentPayments: { invoiceId: string; method: PaymentMethod | LegacyPaymentMethod }[] = [];