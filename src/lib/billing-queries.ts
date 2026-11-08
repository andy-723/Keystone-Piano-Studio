import { queryOptions } from "@tanstack/react-query";
import { getInvoice, getInvoices, getTerm2Preview, getTerm2Drafts } from "@/services/billing";
import { getFamilies, getStudio } from "@/services/roster";
import type { Invoice, InvoiceStatus, PaymentMethod, LegacyPaymentMethod } from "@/mocks/types";

export const invoiceListQuery = queryOptions({ queryKey: ["invoices"], queryFn: async () => {
  const [invoices, families, studio] = await Promise.all([getInvoices(), getFamilies(), getStudio()]);
  return { invoices, families, studio };
} });
export const invoiceDetailQuery = (id: string) => queryOptions({ queryKey: ["invoice", id], queryFn: async () => {
  const [invoice, families, studio] = await Promise.all([getInvoice(id), getFamilies(), getStudio()]);
  return invoice ? { invoice, family: families.find((entry) => entry.id === invoice.familyId), studio } : null;
} });
export const term2Query = queryOptions({ queryKey: ["term2-preview"], queryFn: getTerm2Preview });
export const term2DraftsQuery = queryOptions({ queryKey: ["term2-drafts"], queryFn: async () => {
  const [invoices, families, studio] = await Promise.all([getTerm2Drafts(), getFamilies(), getStudio()]);
  return { invoices, families, studio };
} });

/** Status labels. `overdue` is a filter key / UI label, not a stored InvoiceStatus. */
export const INVOICE_STATUS = {
  draft: "Draft",
  sent: "Sent",
  overdue: "Overdue",
  paid: "Paid",
  partially_paid: "Partially paid",
  void: "Void",
} as const;

export type InvoiceFilterKey = keyof typeof INVOICE_STATUS | "all";

export function invoiceNumberLabel(invoice: Pick<Invoice, "number">): string {
  return invoice.number ?? "Draft (no number yet)";
}

/** Prefer Overdue when derived; otherwise the stored status label. */
export function invoiceDisplayStatus(invoice: Pick<Invoice, "status" | "isOverdue">): string {
  if (invoice.isOverdue) return INVOICE_STATUS.overdue;
  return INVOICE_STATUS[invoice.status] ?? invoice.status;
}

export function matchesInvoiceFilter(
  invoice: Pick<Invoice, "status" | "isOverdue">,
  filter: InvoiceStatus | "overdue" | "all",
): boolean {
  if (filter === "all") return true;
  if (filter === "overdue") return Boolean(invoice.isOverdue);
  return invoice.status === filter;
}

export function paymentMethodLabel(method: PaymentMethod | LegacyPaymentMethod | string): string {
  switch (method) {
    case "stripe_payto":
    case "payto":
      return "PayTo";
    case "stripe_becs":
    case "becs":
      return "Direct debit";
    case "stripe_card":
    case "card":
      return "Card";
    case "bank_transfer":
      return "Bank transfer";
    case "payid":
      return "PayID";
    case "cash":
      return "Cash";
    case "card_in_person":
      return "Card (in person)";
    case "credit":
      return "Credit";
    default:
      return method;
  }
}
