import { invoices } from "@/mocks/data";
import type { Invoice, InvoiceStatus } from "@/mocks/types";
import { respond } from "./_delay";

/** GST-inclusive pricing: GST is one eleventh of the total, in whole cents. */
export function gstFromInclusive(totalCents: number): number {
  return Math.round(totalCents / 11);
}

export const getInvoices = (): Promise<Invoice[]> => respond(invoices);
export const getInvoice = (id: string): Promise<Invoice | null> => respond(invoices.find((i) => i.id === id) ?? null);

export async function setInvoiceStatus(id: string, status: InvoiceStatus): Promise<Invoice | null> {
  const inv = invoices.find((i) => i.id === id);
  if (inv) inv.status = status;
  return respond(inv ?? null);
}
