import { queryOptions } from "@tanstack/react-query";
import { getInvoice, getInvoices, getTerm2Preview, getTerm2Drafts } from "@/services/billing";
import { getFamilies, getStudio } from "@/services/roster";

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
export const INVOICE_STATUS = { draft: "Draft", sent: "Sent", overdue: "Overdue", paid: "Paid", partially_paid: "Partially paid", void: "Void" };