import { invoices, studio, students, families, weeklySlots, lessonTypes, payments } from "@/mocks/data";
import { termInvoiceDrafts } from "@/mocks/billing";
import { renewalState } from "@/mocks/renewals";
import { addDays, dayKind, TERMS_2027, weekday, PUBLIC_HOLIDAYS_2027, PROTOTYPE_TODAY } from "@/lib/calendar";
import type { Invoice, InvoiceStatus } from "@/mocks/types";
import { respond } from "./_delay";

/** GST-inclusive pricing: GST is one eleventh of the total, in whole cents. */
export function gstFromInclusive(totalCents: number): number {
  return Math.round(totalCents / 11);
}

function taxView(invoice: Invoice): Invoice {
  const followsSettings = invoice.status === "draft";
  const registered = followsSettings ? studio.gstRegistered : invoice.gstRegistered ?? invoice.isTaxInvoice;
  const taxCents = followsSettings ? registered ? gstFromInclusive(invoice.totalCents) : 0 : invoice.taxCents;
  let allocated = 0;
  const lines = invoice.lines.map((line, index) => {
    const tax = !followsSettings ? line.taxCents : !registered ? 0 : index === invoice.lines.length - 1 ? taxCents - allocated : gstFromInclusive(line.lineTotalCents);
    allocated += tax;
    return { ...line, taxCents: tax };
  });
  const records = payments.filter((payment) => payment.invoiceId === invoice.id);
  const paidCents = Math.min(invoice.totalCents, records.reduce((sum, payment) => sum + payment.amountCents, 0));
  return { ...invoice, lines, taxCents, subtotalCents: followsSettings ? invoice.totalCents - taxCents : invoice.subtotalCents, gstRegistered: registered, isTaxInvoice: followsSettings ? registered : invoice.isTaxInvoice, title: followsSettings ? registered ? "Tax invoice" : "Invoice" : invoice.title ?? (invoice.isTaxInvoice ? "Tax invoice" : "Invoice"), paidCents, balanceCents: invoice.totalCents - paidCents, payments: records };
}

export const getInvoices = (): Promise<Invoice[]> => respond(invoices.map(taxView));
export const getInvoice = (id: string): Promise<Invoice | null> => {
  const invoice = invoices.find((entry) => entry.id === id) ?? termInvoiceDrafts.get(id);
  return respond(invoice ? taxView(invoice) : null);
};

export async function getTerm2Preview() {
  const term = TERMS_2027[1];
  const rows = students.map((student) => {
    const slot = weeklySlots.find((entry) => entry.studentId === student.id);
    const lessonType = lessonTypes.find((entry) => entry.id === slot?.lessonTypeId);
    const dates: string[] = [];
    const skipped: string[] = [];
    if (slot) for (let date: string = term.start; date <= term.end; date = addDays(date, 1)) {
      if (weekday(date) !== slot.weekday) continue;
      if (dayKind(date).kind === "teaching") dates.push(date); else skipped.push(date);
    }
    return { student, family: families.find((family) => family.id === student.familyId), lessonType, dates, skipped, totalCents: dates.length * (lessonType?.priceCents ?? 0) };
  });
  return respond({ term, rows, holidays: Object.entries(PUBLIC_HOLIDAYS_2027).filter(([date]) => date >= term.start && date <= term.end) });
}

export async function prepareTerm2Invoices() {
  const preview = await getTerm2Preview();
  for (const family of families) {
    if (renewalState.active && renewalState.families.get(family.id)?.status !== "confirmed") { termInvoiceDrafts.delete(`inv-term2-${family.id}`); continue; }
    if (invoices.some((invoice) => invoice.termKey === "2027-term-2" && invoice.familyId === family.id)) continue;
    const lines = preview.rows.filter((row) => row.student.familyId === family.id).map((row) => ({
      description: `${row.student.firstName} ${row.student.lastName} – ${row.lessonType?.name ?? "Piano lesson"}, Term 2 2027`, qty: row.dates.length,
      unitCents: row.lessonType?.priceCents ?? 0, lineTotalCents: row.totalCents, taxCents: 0,
    }));
    const id = `inv-term2-${family.id}`;
    const totalCents = lines.reduce((total, line) => total + line.lineTotalCents, 0);
    termInvoiceDrafts.set(id, taxView({ id, number: `INV-2027-T2-${family.id.replace("fam-", "").padStart(3, "0")}`, familyId: family.id,
      status: "draft", issueDate: preview.term.start, dueDate: addDays(preview.term.start, 14), lines, totalCents, subtotalCents: totalCents, taxCents: 0, isTaxInvoice: studio.gstRegistered, termKey: "2027-term-2" }));
  }
  return getTerm2Drafts();
}

export const getTerm2Drafts = (): Promise<Invoice[]> => respond([...termInvoiceDrafts.values()].filter((draft) => !renewalState.active || renewalState.families.get(draft.familyId)?.status === "confirmed").map(taxView));

export async function sendTerm2Invoices() {
  const sent: Invoice[] = [];
  for (const draft of termInvoiceDrafts.values()) {
    if (renewalState.active && renewalState.families.get(draft.familyId)?.status !== "confirmed") continue;
    const existing = invoices.find((invoice) => invoice.id === draft.id);
    if (existing) { sent.push(taxView(existing)); continue; }
    const invoice = { ...taxView(draft), status: "sent" as const };
    invoices.push(invoice); sent.push(invoice);
  }
  termInvoiceDrafts.clear();
  return respond(sent);
}

export async function setInvoiceStatus(id: string, status: InvoiceStatus): Promise<Invoice | null> {
  const inv = invoices.find((i) => i.id === id);
  if (inv) {
    if (status === "draft" && inv.status !== "draft") throw new Error("An issued invoice cannot return to draft");
    if (inv.status === "draft" && status !== "draft") Object.assign(inv, taxView(inv));
    if (status === "paid") await recordInvoicePayment(id, "card");
    else inv.status = status;
  }
  return respond(inv ? taxView(inv) : null);
}

export async function recordInvoicePayment(id: string, method: "payto" | "becs" | "card") {
  const invoice = invoices.find((entry) => entry.id === id);
  if (!invoice) throw new Error("Invoice not found");
  if (!["payto", "becs", "card"].includes(method)) throw new Error("Payment method not found");
  if (invoice.status === "draft") Object.assign(invoice, taxView(invoice));
  const balance = taxView(invoice).balanceCents ?? invoice.totalCents;
  if (balance > 0) payments.push({ id: `payment-${crypto.randomUUID()}`, invoiceId: id, method, amountCents: balance, date: PROTOTYPE_TODAY });
  invoice.status = "paid";
  return respond(taxView(invoice));
}
