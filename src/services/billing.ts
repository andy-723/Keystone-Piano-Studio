import { invoices, studio, students, families, weeklySlots, lessonTypes, payments, teacher } from "@/mocks/data";
import { termInvoiceDrafts } from "@/mocks/billing";
import { creditNotes, invoiceEvents } from "@/mocks/billing-profile";
import { renewalState } from "@/mocks/renewals";
import { addDays, dayKind, TERMS_2027, weekday, PUBLIC_HOLIDAYS_2027, PROTOTYPE_TODAY, melbourneIso } from "@/lib/calendar";
import type {
  Invoice,
  InvoiceLine,
  InvoiceStatus,
  InvoiceSnapshot,
  LegacyPaymentMethod,
  Payment,
  PaymentMethod,
  CreditNote,
} from "@/mocks/types";
import { respond } from "./_delay";
import { isLiveStudio } from "@/lib/studio-workspace";
import { studioNow, studioToday } from "@/lib/studio-clock";
import { billingProfileState } from "@/mocks/billing-profile";
import {
  issueLiveInvoice,
  nextLiveCreditNoteNumber,
  withLiveBillingSave,
} from "./live/billing-store";
import { newRecordId } from "./live/studio-store";
import { pushInvoiceToXero } from "./integrations";
import {
  allocateCreditNoteNumber,
  allocateInvoiceNumber,
  readBillingProfile,
} from "./billing-profile";
import { emailProvider, renderInvoicePdf } from "./_lazy";
import {
  creditNoteEmail,
  invoiceSentEmail,
  paymentReceiptEmail,
} from "@/server/email/templates/billing";

/** GST-inclusive pricing: GST is one eleventh of the total, in whole cents. */
export function gstFromInclusive(totalCents: number): number {
  return Math.round(totalCents / 11);
}

const LEGACY_METHOD_MAP: Record<LegacyPaymentMethod, PaymentMethod> = {
  payto: "stripe_payto",
  becs: "stripe_becs",
  card: "stripe_card",
};

function isLegacyMethod(method: string): method is LegacyPaymentMethod {
  return method === "payto" || method === "becs" || method === "card";
}

function mapPaymentMethod(method: PaymentMethod | LegacyPaymentMethod): PaymentMethod {
  return isLegacyMethod(method) ? LEGACY_METHOD_MAP[method] : method;
}

function paymentRecords(invoiceId: string): Payment[] {
  return payments.filter((payment) => payment.invoiceId === invoiceId);
}

function paidCentsFor(invoiceId: string, totalCents: number): number {
  const sum = paymentRecords(invoiceId).reduce((total, payment) => total + payment.amountCents, 0);
  return Math.max(0, Math.min(totalCents, sum));
}

function taxView(invoice: Invoice): Invoice {
  const followsSettings = invoice.status === "draft";
  const registered = followsSettings ? studio.gstRegistered : invoice.gstRegistered ?? invoice.isTaxInvoice;
  const taxableTotal = invoice.lines
    .filter((line) => line.taxCode !== "gst_free")
    .reduce((sum, line) => sum + line.lineTotalCents, 0);
  const taxCents = followsSettings
    ? registered
      ? gstFromInclusive(taxableTotal)
      : 0
    : invoice.taxCents;
  let allocated = 0;
  const taxableIndexes = invoice.lines
    .map((line, index) => (line.taxCode === "gst_free" ? -1 : index))
    .filter((index) => index >= 0);
  const lines = invoice.lines.map((line, index) => {
    if (!followsSettings) return { ...line };
    if (!registered || line.taxCode === "gst_free") return { ...line, taxCents: 0 };
    const isLast = index === taxableIndexes.at(-1);
    const tax = isLast ? taxCents - allocated : gstFromInclusive(line.lineTotalCents);
    allocated += tax;
    return { ...line, taxCents: tax };
  });
  const records = paymentRecords(invoice.id);
  const paidCents = paidCentsFor(invoice.id, invoice.totalCents);
  const balanceCents = invoice.totalCents - paidCents;
  const viewed: Invoice = {
    ...invoice,
    lines,
    taxCents,
    subtotalCents: followsSettings ? invoice.totalCents - taxCents : invoice.subtotalCents,
    gstRegistered: registered,
    isTaxInvoice: followsSettings ? registered : invoice.isTaxInvoice,
    title: followsSettings
      ? registered
        ? "Tax invoice"
        : "Invoice"
      : invoice.title ?? (invoice.isTaxInvoice ? "Tax invoice" : "Invoice"),
    paidCents,
    balanceCents,
    payments: records,
  };
  return enrichInvoice(viewed);
}

/** Derive overdue flags on every read — overdue is never a stored status. */
export function enrichInvoice(invoice: Invoice, today: string = studioToday()): Invoice {
  const balance = invoice.balanceCents ?? invoice.totalCents - (invoice.paidCents ?? 0);
  const unpaid =
    invoice.status !== "draft" &&
    invoice.status !== "paid" &&
    invoice.status !== "void" &&
    balance > 0;
  const dayMs = 86_400_000;
  const days = Math.round((Date.parse(today) - Date.parse(invoice.dueDate)) / dayMs);
  const isOverdue = Boolean(unpaid && days > 0);
  return {
    ...invoice,
    isOverdue,
    daysOverdue: isOverdue ? Math.max(1, days) : 0,
  };
}

function pushEvent(
  invoiceId: string,
  kind: (typeof invoiceEvents)[number]["kind"],
  data?: Record<string, unknown>,
  actor: "system" | string = teacher.id,
) {
  invoiceEvents.push({
    id: newRecordId("evt"),
    invoiceId,
    kind,
    actor,
    at: studioNow(),
    ...(data ? { data } : {}),
  });
}

/** Credit note number from the database, mirrored in the local profile. */
async function liveCreditNoteNumber() {
  const number = await nextLiveCreditNoteNumber();
  const profile = billingProfileState.demo;
  const used = Number(number.slice(profile.creditNotePrefix.length));
  if (Number.isInteger(used)) profile.nextCreditNoteNumber = Math.max(profile.nextCreditNoteNumber, used + 1);
  profile.numberingLockedAt ??= studioNow();
  return number;
}

function findMutableInvoice(id: string): Invoice | undefined {
  return invoices.find((entry) => entry.id === id) ?? termInvoiceDrafts.get(id);
}

function familyFor(familyId: string) {
  return families.find((family) => family.id === familyId);
}

function buildSnapshot(invoice: Invoice): InvoiceSnapshot {
  const profile = readBillingProfile("demo");
  const family = familyFor(invoice.familyId);
  const guardian =
    family?.guardians.find((entry) => entry.id === invoice.billToGuardianId) ?? family?.guardians[0];
  const viewed = taxView(invoice);
  return {
    seller: {
      legalName: profile.legalName,
      tradingName: profile.tradingName,
      ...(profile.abn ? { abn: profile.abn } : {}),
      ...(studio.address ? { address: studio.address } : {}),
      ...(studio.email ? { email: studio.email } : {}),
    },
    buyer: {
      name: family?.displayName ?? "Family",
      email: guardian?.email ?? "",
    },
    payTo: { ...profile.payTo },
    lines: viewed.lines.map((line) => ({ ...line })),
    totals: {
      subtotalCents: viewed.subtotalCents,
      taxCents: viewed.taxCents,
      totalCents: viewed.totalCents,
    },
    title: viewed.title ?? (viewed.isTaxInvoice ? "Tax invoice" : "Invoice"),
    gstRegistered: Boolean(viewed.gstRegistered),
  };
}

function syncStatusFromBalance(invoice: Invoice) {
  if (invoice.status === "draft" || invoice.status === "void") return;
  const paid = paidCentsFor(invoice.id, invoice.totalCents);
  if (paid <= 0) invoice.status = "sent";
  else if (paid >= invoice.totalCents) invoice.status = "paid";
  else invoice.status = "partially_paid";
}

export const getInvoices = (): Promise<Invoice[]> => respond(invoices.map(taxView));

export type PaymentFlag = { invoice: Invoice; kind: "overdue" | "due_soon"; days: number };

/** Flags unpaid invoices that are overdue or due within `soonDays` of `today`. */
export function paymentFlags(list: Invoice[], today: string = studioToday(), soonDays = 7): PaymentFlag[] {
  const dayMs = 86_400_000;
  const diff = (date: string) => Math.round((Date.parse(date) - Date.parse(today)) / dayMs);
  return list
    .filter(
      (invoice) =>
        invoice.status !== "draft" &&
        invoice.status !== "paid" &&
        invoice.status !== "void" &&
        (invoice.balanceCents ?? invoice.totalCents) > 0,
    )
    .map((invoice): PaymentFlag | null => {
      const enriched = enrichInvoice(invoice, today);
      if (enriched.isOverdue) {
        return { invoice: enriched, kind: "overdue", days: enriched.daysOverdue ?? Math.max(1, -diff(invoice.dueDate)) };
      }
      const days = diff(invoice.dueDate);
      if (days <= soonDays) return { invoice: enriched, kind: "due_soon", days };
      return null;
    })
    .filter((flag): flag is PaymentFlag => flag !== null)
    .sort((a, b) =>
      a.kind === b.kind
        ? a.invoice.dueDate.localeCompare(b.invoice.dueDate)
        : a.kind === "overdue"
          ? -1
          : 1,
    );
}

export const getInvoice = (id: string): Promise<Invoice | null> => {
  const invoice = findMutableInvoice(id);
  return respond(invoice ? taxView(invoice) : null);
};

export async function getTerm2Preview() {
  const term = TERMS_2027[1];
  const rows = students.map((student) => {
    const slot = weeklySlots.find((entry) => entry.studentId === student.id);
    const lessonType = lessonTypes.find((entry) => entry.id === slot?.lessonTypeId);
    const dates: string[] = [];
    const skipped: string[] = [];
    if (slot)
      for (let date: string = term.start; date <= term.end; date = addDays(date, 1)) {
        if (weekday(date) !== slot.weekday) continue;
        if (dayKind(date).kind === "teaching") dates.push(date);
        else skipped.push(date);
      }
    return {
      student,
      family: families.find((family) => family.id === student.familyId),
      lessonType,
      dates,
      skipped,
      totalCents: dates.length * (lessonType?.priceCents ?? 0),
    };
  });
  return respond({
    term,
    rows,
    holidays: Object.entries(PUBLIC_HOLIDAYS_2027).filter(([date]) => date >= term.start && date <= term.end),
  });
}

async function prepareTerm2InvoicesImpl() {
  const preview = await getTerm2Preview();
  for (const family of families) {
    if (renewalState.active && renewalState.families.get(family.id)?.status !== "confirmed") {
      for (const [key, entry] of termInvoiceDrafts) if (entry.familyId === family.id) termInvoiceDrafts.delete(key);
      continue;
    }
    if (invoices.some((invoice) => invoice.termKey === "2027-term-2" && invoice.familyId === family.id)) continue;
    const lines: InvoiceLine[] = preview.rows
      .filter((row) => row.student.familyId === family.id)
      .map((row) => {
        const line: InvoiceLine = {
          description: `${row.student.firstName} ${row.student.lastName} – ${row.lessonType?.name ?? "Piano lesson"}, Term 2 2027`,
          qty: row.dates.length,
          unitCents: row.lessonType?.priceCents ?? 0,
          lineTotalCents: row.totalCents,
          taxCents: 0,
          taxCode: "taxable",
          studentId: row.student.id,
        };
        if (row.lessonType?.id) line.lessonTypeId = row.lessonType.id;
        return line;
      });
    // Real studios need uuid ids; reuse this family's open draft so preparing twice adds nothing.
    const id = isLiveStudio()
      ? ([...termInvoiceDrafts.values()].find((entry) => entry.familyId === family.id)?.id ?? crypto.randomUUID())
      : `inv-term2-${family.id}`;
    const totalCents = lines.reduce((total, line) => total + line.lineTotalCents, 0);
    const draft: Invoice = {
      id,
      number: null,
      familyId: family.id,
      status: "draft",
      kind: "standard",
      collection: "manual",
      issueDate: preview.term.start,
      dueDate: addDays(preview.term.start, 14),
      lines,
      totalCents,
      subtotalCents: totalCents,
      taxCents: 0,
      isTaxInvoice: studio.gstRegistered,
      termKey: "2027-term-2",
    };
    if (family.guardians[0]?.id) draft.billToGuardianId = family.guardians[0].id;
    termInvoiceDrafts.set(id, taxView(draft));
  }
  return getTerm2Drafts();
}

export const getTerm2Drafts = (): Promise<Invoice[]> =>
  respond(
    [...termInvoiceDrafts.values()]
      .filter(
        (draft) =>
          !renewalState.active || renewalState.families.get(draft.familyId)?.status === "confirmed",
      )
      .map(taxView),
  );

async function sendTerm2InvoicesImpl() {
  const sent: Invoice[] = [];
  for (const draft of [...termInvoiceDrafts.values()]) {
    if (renewalState.active && renewalState.families.get(draft.familyId)?.status !== "confirmed") continue;
    const existing = invoices.find((invoice) => invoice.id === draft.id);
    if (existing) {
      sent.push(taxView(existing));
      continue;
    }
    // Batch term send freezes and numbers without per-family email round-trips.
    const issued = await issueInvoice(draft.id, { notify: false });
    if (issued) sent.push(issued);
  }
  termInvoiceDrafts.clear();
  return respond(sent);
}

async function setInvoiceStatusImpl(id: string, status: InvoiceStatus): Promise<Invoice | null> {
  const inv = findMutableInvoice(id);
  if (inv) {
    if (status === "draft" && inv.status !== "draft") throw new Error("An issued invoice cannot return to draft");
    if (inv.status === "draft" && status !== "draft") Object.assign(inv, taxView(inv));
    if (status === "paid") await recordInvoicePaymentImpl(id, "card");
    else if (status === "void") await voidInvoiceImpl(id, "Marked void");
    else if (status === "sent" && inv.status === "draft") await sendInvoiceImpl(id);
    else {
      inv.status = status;
      if (status === "sent") await pushInvoiceToXero(id);
    }
  }
  return respond(inv ? taxView(inv) : null);
}

async function recordInvoicePaymentImpl(id: string, method: PaymentMethod | LegacyPaymentMethod) {
  const mapped = mapPaymentMethod(method);
  const invoice = findMutableInvoice(id);
  if (!invoice) throw new Error("Invoice not found");
  const balance = taxView(invoice).balanceCents ?? invoice.totalCents;
  if (balance <= 0) {
    invoice.status = "paid";
    return respond(taxView(invoice));
  }
  return recordPaymentImpl(id, { method: mapped, amountCents: balance });
}

async function createInvoiceImpl(input: {
  familyId: string;
  lines: InvoiceLine[];
  dueDate?: string;
  issueDate?: string;
  kind?: Invoice["kind"];
  billToGuardianId?: string;
  billingPeriod?: Invoice["billingPeriod"];
  collection?: Invoice["collection"];
}): Promise<Invoice> {
  const family = familyFor(input.familyId);
  if (!family) throw new Error("Family not found");
  if (!input.lines.length) throw new Error("Add at least one line");
  const totalCents = input.lines.reduce((sum, line) => sum + line.lineTotalCents, 0);
  const id = newRecordId("inv");
  const draftBase: Invoice = {
    id,
    number: null,
    familyId: input.familyId,
    status: "draft",
    kind: input.kind ?? "standard",
    collection: input.collection ?? "manual",
    issueDate: input.issueDate ?? studioToday(),
    dueDate: input.dueDate ?? addDays(studioToday(), 14),
    lines: input.lines.map((line) => ({ ...line })),
    totalCents,
    subtotalCents: totalCents,
    taxCents: 0,
    isTaxInvoice: studio.gstRegistered,
  };
  const billTo = input.billToGuardianId ?? family.guardians[0]?.id;
  if (billTo) draftBase.billToGuardianId = billTo;
  if (input.billingPeriod) draftBase.billingPeriod = input.billingPeriod;
  const draft = taxView(draftBase);
  invoices.push(draft);
  pushEvent(id, "created");
  return respond(taxView(draft));
}

async function updateDraftImpl(id: string, patch: Partial<Pick<Invoice, "lines" | "dueDate" | "issueDate" | "billToGuardianId" | "ccGuardianIds" | "billingPeriod" | "collection" | "reviewedAt">>): Promise<Invoice> {
  const invoice = findMutableInvoice(id);
  if (!invoice) throw new Error("Invoice not found");
  if (invoice.status !== "draft") throw new Error("Only drafts can be edited");
  if (patch.lines) {
    invoice.lines = patch.lines.map((line) => ({ ...line }));
    invoice.totalCents = invoice.lines.reduce((sum, line) => sum + line.lineTotalCents, 0);
  }
  if (patch.dueDate) invoice.dueDate = patch.dueDate;
  if (patch.issueDate) invoice.issueDate = patch.issueDate;
  if (patch.billToGuardianId !== undefined) invoice.billToGuardianId = patch.billToGuardianId;
  if (patch.ccGuardianIds !== undefined) invoice.ccGuardianIds = patch.ccGuardianIds;
  if (patch.billingPeriod !== undefined) invoice.billingPeriod = patch.billingPeriod;
  if (patch.collection !== undefined) invoice.collection = patch.collection;
  if (patch.reviewedAt !== undefined) invoice.reviewedAt = patch.reviewedAt;
  Object.assign(invoice, taxView(invoice));
  return respond(taxView(invoice));
}

async function deleteDraftImpl(id: string): Promise<{ deleted: true }> {
  const index = invoices.findIndex((entry) => entry.id === id);
  if (index >= 0) {
    if (invoices[index]!.status !== "draft") throw new Error("Only drafts can be deleted");
    invoices.splice(index, 1);
    return respond({ deleted: true as const });
  }
  if (termInvoiceDrafts.has(id)) {
    termInvoiceDrafts.delete(id);
    return respond({ deleted: true as const });
  }
  throw new Error("Draft not found");
}

async function copyLastInvoiceImpl(familyId: string): Promise<Invoice> {
  const prior = invoices
    .filter((invoice) => invoice.familyId === familyId && invoice.status !== "draft" && invoice.kind !== "late_fee")
    .sort((a, b) => b.issueDate.localeCompare(a.issueDate) || (b.number ?? "").localeCompare(a.number ?? ""))[0];
  if (!prior) throw new Error("No previous invoice to copy");
  return createInvoiceImpl({
    familyId,
    lines: prior.lines
      .filter((line) => !line.creditNoteId)
      .map((line) => ({ ...line, taxCents: 0 })),
    dueDate: addDays(studioToday(), 14),
    issueDate: studioToday(),
    ...(prior.billToGuardianId ? { billToGuardianId: prior.billToGuardianId } : {}),
    ...(prior.collection ? { collection: prior.collection } : {}),
  });
}

async function issueInvoice(id: string, opts: { notify: boolean }): Promise<Invoice | null> {
  const invoice = findMutableInvoice(id);
  if (!invoice) return null;
  if (invoice.status === "void") throw new Error("Cannot send a void invoice");
  if (invoice.status !== "draft" && invoice.number) return taxView(invoice);

  const frozen = taxView(invoice);
  Object.assign(invoice, frozen);
  invoice.issueDate = invoice.issueDate || studioToday();
  if (isLiveStudio()) {
    // The database numbers it (gapless per studio) before anything is emailed.
    invoice.snapshot = buildSnapshot(invoice);
    const issued = await issueLiveInvoice(invoice);
    invoice.number = issued.number;
    invoice.status = "sent";
    invoice.sentAt = issued.sentAt;
    const profile = billingProfileState.demo;
    const used = Number(issued.number.slice(profile.invoicePrefix.length));
    if (Number.isInteger(used)) profile.nextInvoiceNumber = Math.max(profile.nextInvoiceNumber, used + 1);
    profile.numberingLockedAt ??= issued.sentAt;
  } else {
    invoice.number = allocateInvoiceNumber("demo");
    invoice.status = "sent";
    invoice.sentAt = studioNow();
    invoice.snapshot = buildSnapshot(invoice);
  }

  const profile = readBillingProfile("demo");
  let pdfBytes: Uint8Array | undefined;
  if (profile.attachPdf && opts.notify) {
    const pdf = await renderInvoicePdf(invoice);
    invoice.pdf = { path: pdf.path, sha256: pdf.sha256 };
    pdfBytes = pdf.bytes;
  }

  pushEvent(invoice.id, "sent", { number: invoice.number });

  if (opts.notify) {
    const family = familyFor(invoice.familyId);
    const guardian =
      family?.guardians.find((entry) => entry.id === invoice.billToGuardianId) ?? family?.guardians[0];
    if (guardian?.email) {
      const mail = invoiceSentEmail({
        studioName: profile.tradingName || profile.legalName || studio.name,
        familyName: family?.displayName ?? guardian.name,
        invoiceNumber: invoice.number,
        totalCents: invoice.totalCents,
        dueDate: invoice.dueDate,
      });
      const attachments =
        pdfBytes
          ? [
              {
                filename: `${invoice.number}.pdf`,
                content: pdfBytes,
                contentType: "application/pdf",
              },
            ]
          : undefined;
      await (await emailProvider()).send({
        to: guardian.email,
        from: `${studio.name} <studio@keystone.example>`,
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
        tags: [{ name: "kind", value: "invoice_sent" }],
        ...(attachments ? { attachments } : {}),
      });
      pushEvent(invoice.id, "emailed", { to: guardian.email });
    }
  }

  if (termInvoiceDrafts.has(id)) {
    termInvoiceDrafts.delete(id);
    if (!invoices.some((entry) => entry.id === id)) invoices.push(invoice);
  }

  await pushInvoiceToXero(invoice.id);
  pushEvent(invoice.id, "xero_pushed");
  return taxView(invoice);
}

async function sendInvoiceImpl(id: string): Promise<Invoice | null> {
  return respond(await issueInvoice(id, { notify: true }));
}

async function sendInvoicesImpl(ids: string[]): Promise<Invoice[]> {
  const sent: Invoice[] = [];
  for (const id of ids) {
    const invoice = await sendInvoiceImpl(id);
    if (invoice) sent.push(invoice);
  }
  return respond(sent);
}

async function recordPaymentImpl(
  id: string,
  input: {
    method: PaymentMethod | LegacyPaymentMethod;
    amountCents: number;
    receivedOn?: string;
    reference?: string;
    recordedBy?: string;
    stripePaymentIntentId?: string;
  },
): Promise<Invoice> {
  const invoice = findMutableInvoice(id);
  if (!invoice) throw new Error("Invoice not found");
  if (invoice.status === "draft") Object.assign(invoice, taxView(invoice));
  if (invoice.status === "void") throw new Error("Cannot record payment on a void invoice");
  if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) {
    throw new Error("Enter a positive payment amount");
  }
  const balance = taxView(invoice).balanceCents ?? invoice.totalCents;
  if (input.amountCents > balance) {
    throw new Error("Payment exceeds the balance. Issue a credit note for any overpayment.");
  }

  const method = mapPaymentMethod(input.method);
  const isStripe =
    method === "stripe_card" || method === "stripe_becs" || method === "stripe_payto";
  const stripeFeeCents = isStripe
    ? method === "stripe_card"
      ? Math.round(input.amountCents * 0.017) + 30
      : Math.round(input.amountCents * 0.01) + 30
    : 0;
  const payment: Payment = {
    id: newRecordId("payment"),
    invoiceId: id,
    familyId: invoice.familyId,
    method,
    amountCents: input.amountCents,
    receivedOn: input.receivedOn ?? studioToday(),
    date: input.receivedOn ?? studioToday(),
    recordedBy: input.recordedBy ?? teacher.id,
    ...(input.reference ? { reference: input.reference } : {}),
    ...(input.stripePaymentIntentId ? { stripePaymentIntentId: input.stripePaymentIntentId } : {}),
    ...(isStripe
      ? {
          grossAmountCents: input.amountCents,
          stripeFeeCents,
          netPayoutCents: input.amountCents - stripeFeeCents,
        }
      : {}),
  };
  payments.push(payment);
  syncStatusFromBalance(invoice);
  pushEvent(id, "payment_recorded", { paymentId: payment.id, amountCents: payment.amountCents, method });

  const sync = await pushInvoiceToXero(id);
  if (sync.synced && "syncedAt" in sync && typeof sync.syncedAt === "string") {
    payment.xeroSyncedAt = sync.syncedAt;
  }

  const profile = readBillingProfile("demo");
  if (profile.receiptEmails) {
    const family = familyFor(invoice.familyId);
    const guardian =
      family?.guardians.find((entry) => entry.id === invoice.billToGuardianId) ?? family?.guardians[0];
    if (guardian?.email) {
      const mail = paymentReceiptEmail({
        studioName: profile.tradingName || profile.legalName || studio.name,
        familyName: family?.displayName ?? guardian.name,
        invoiceNumber: invoice.number ?? id,
        amountCents: payment.amountCents,
        methodLabel: method,
        receivedOn: payment.receivedOn,
      });
      await (await emailProvider()).send({
        to: guardian.email,
        from: `${studio.name} <studio@keystone.example>`,
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
        tags: [{ name: "kind", value: "payment_receipt" }],
      });
    }
  }

  return respond(taxView(invoice));
}

async function reversePaymentImpl(paymentId: string, reason?: string): Promise<Invoice> {
  const original = payments.find((payment) => payment.id === paymentId);
  if (!original) throw new Error("Payment not found");
  if (original.amountCents <= 0) throw new Error("Only positive payments can be reversed");
  if (payments.some((payment) => payment.reversesPaymentId === paymentId)) {
    throw new Error("Payment already reversed");
  }
  const invoice = findMutableInvoice(original.invoiceId);
  if (!invoice) throw new Error("Invoice not found");
  if (invoice.status === "void") throw new Error("Cannot reverse payment on a void invoice");

  const reversal: Payment = {
    id: newRecordId("payment"),
    invoiceId: original.invoiceId,
    familyId: original.familyId,
    method: original.method,
    amountCents: -original.amountCents,
    receivedOn: studioToday(),
    date: studioToday(),
    recordedBy: teacher.id,
    reversesPaymentId: paymentId,
    ...(reason ? { reference: reason } : {}),
  };
  payments.push(reversal);
  syncStatusFromBalance(invoice);
  pushEvent(invoice.id, "payment_reversed", {
    paymentId,
    reversalId: reversal.id,
    amountCents: reversal.amountCents,
  });
  return respond(taxView(invoice));
}

async function voidInvoiceImpl(id: string, reason: string): Promise<Invoice> {
  const invoice = findMutableInvoice(id);
  if (!invoice) throw new Error("Invoice not found");
  if (invoice.status === "void") return respond(taxView(invoice));
  if (invoice.status === "draft") {
    invoice.status = "void";
    invoice.voidedAt = studioNow();
    invoice.voidReason = reason;
    pushEvent(id, "voided", { reason });
    return respond(taxView(invoice));
  }
  const paid = paidCentsFor(id, invoice.totalCents);
  if (paid > 0) throw new Error("Reverse payments before voiding");
  invoice.status = "void";
  invoice.voidedAt = studioNow();
  invoice.voidReason = reason;
  pushEvent(id, "voided", { reason });
  return respond(taxView(invoice));
}

async function issueCreditNoteImpl(input: {
  familyId: string;
  amountCents: number;
  reason: string;
  invoiceId?: string;
  taxCents?: number;
}): Promise<CreditNote> {
  if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) {
    throw new Error("Enter a positive credit amount");
  }
  const family = familyFor(input.familyId);
  if (!family) throw new Error("Family not found");
  if (input.invoiceId) {
    const invoice = findMutableInvoice(input.invoiceId);
    if (!invoice || invoice.familyId !== input.familyId) throw new Error("Invoice not found for family");
  }
  const taxCents =
    input.taxCents ?? (studio.gstRegistered ? gstFromInclusive(input.amountCents) : 0);
  const note: CreditNote = {
    id: newRecordId("cn"),
    number: isLiveStudio() ? await liveCreditNoteNumber() : allocateCreditNoteNumber("demo"),
    familyId: input.familyId,
    ...(input.invoiceId ? { invoiceId: input.invoiceId } : {}),
    reason: input.reason,
    amountCents: input.amountCents,
    taxCents,
    status: "open",
    issuedOn: studioToday(),
  };
  creditNotes.push(note);
  if (input.invoiceId) pushEvent(input.invoiceId, "credit_note_issued", { creditNoteId: note.id, number: note.number });

  const guardian = family.guardians[0];
  if (guardian?.email) {
    const profile = readBillingProfile("demo");
    const mail = creditNoteEmail({
      studioName: profile.tradingName || profile.legalName || studio.name,
      familyName: family.displayName,
      creditNoteNumber: note.number,
      amountCents: note.amountCents,
      reason: note.reason,
    });
    await (await emailProvider()).send({
      to: guardian.email,
      from: `${studio.name} <studio@keystone.example>`,
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
      tags: [{ name: "kind", value: "credit_note" }],
    });
  }
  return respond(note);
}

async function applyCreditImpl(creditNoteId: string, invoiceId: string): Promise<Invoice> {
  const note = creditNotes.find((entry) => entry.id === creditNoteId);
  if (!note) throw new Error("Credit note not found");
  if (note.status !== "open") throw new Error("Credit note is not open");
  const invoice = findMutableInvoice(invoiceId);
  if (!invoice) throw new Error("Invoice not found");
  if (invoice.familyId !== note.familyId) throw new Error("Credit note belongs to another family");
  const balance = taxView(invoice).balanceCents ?? invoice.totalCents;
  const amount = Math.min(note.amountCents, balance);
  if (amount <= 0) throw new Error("Invoice has no balance to credit");

  await recordPaymentImpl(invoiceId, {
    method: "credit",
    amountCents: amount,
    reference: note.number,
  });
  note.status = "applied";
  note.invoiceId = invoiceId;
  invoice.lines.push({
    description: `Credit ${note.number}`,
    qty: 1,
    unitCents: 0,
    lineTotalCents: 0,
    taxCents: 0,
    taxCode: "gst_free",
    creditNoteId: note.id,
  });
  return respond(taxView(invoice));
}

async function refundCreditImpl(creditNoteId: string): Promise<CreditNote> {
  const note = creditNotes.find((entry) => entry.id === creditNoteId);
  if (!note) throw new Error("Credit note not found");
  if (note.status === "refunded") return respond(note);
  if (note.status === "applied") throw new Error("Applied credits cannot be refunded — reverse the payment first");
  note.status = "refunded";
  return respond(note);
}

async function changeDueDateImpl(id: string, dueDate: string): Promise<Invoice> {
  const invoice = findMutableInvoice(id);
  if (!invoice) throw new Error("Invoice not found");
  if (invoice.status === "void" || invoice.status === "paid") {
    throw new Error("Cannot change the due date on this invoice");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) throw new Error("Enter a valid due date");
  const previous = invoice.dueDate;
  invoice.dueDate = dueDate;
  pushEvent(id, "due_date_changed", { from: previous, to: dueDate });
  return respond(taxView(invoice));
}

function csvEscape(cell: string | number | boolean) {
  return `"${String(cell).replaceAll('"', '""')}"`;
}

/** Accountant export: invoices, payments and credit notes as three CSV strings. */
export async function exportBillingCsv(_range?: { from?: string; to?: string }): Promise<{
  invoices: string;
  payments: string;
  creditNotes: string;
}> {
  void _range;
  const list = invoices.map((invoice) => enrichInvoice(taxView(invoice)));
  const invoiceCsv = [
    ["number", "familyId", "status", "issueDate", "dueDate", "totalCents", "paidCents", "balanceCents", "isOverdue", "daysOverdue"].join(","),
    ...list.map((invoice) =>
      [
        invoice.number ?? "",
        invoice.familyId,
        invoice.status,
        invoice.issueDate,
        invoice.dueDate,
        invoice.totalCents,
        invoice.paidCents ?? 0,
        invoice.balanceCents ?? invoice.totalCents,
        Boolean(invoice.isOverdue),
        invoice.daysOverdue ?? 0,
      ]
        .map(csvEscape)
        .join(","),
    ),
  ].join("\n");
  const paymentCsv = [
    ["id", "invoiceId", "familyId", "amountCents", "method", "receivedOn", "reference"].join(","),
    ...payments.map((payment) =>
      [
        payment.id,
        payment.invoiceId,
        payment.familyId,
        payment.amountCents,
        payment.method,
        payment.receivedOn ?? payment.date ?? "",
        payment.reference ?? "",
      ]
        .map(csvEscape)
        .join(","),
    ),
  ].join("\n");
  const creditCsv = [
    ["number", "familyId", "invoiceId", "reason", "amountCents", "taxCents", "status", "issuedOn"].join(","),
    ...creditNotes.map((note) =>
      [note.number, note.familyId, note.invoiceId ?? "", note.reason, note.amountCents, note.taxCents, note.status, note.issuedOn]
        .map(csvEscape)
        .join(","),
    ),
  ].join("\n");
  return respond({ invoices: invoiceCsv, payments: paymentCsv, creditNotes: creditCsv });
}

async function markInvoiceQueriedImpl(id: string): Promise<Invoice> {
  const invoice = findMutableInvoice(id);
  if (!invoice) throw new Error("Invoice not found");
  if (invoice.status === "draft" || invoice.status === "void") {
    throw new Error("Only open invoices can be queried");
  }
  invoice.queriedAt = studioNow();
  delete invoice.queryResolvedAt;
  pushEvent(id, "queried");
  return respond(taxView(invoice));
}

async function resolveInvoiceQueryImpl(id: string): Promise<Invoice> {
  const invoice = findMutableInvoice(id);
  if (!invoice) throw new Error("Invoice not found");
  if (!invoice.queriedAt) throw new Error("Invoice has no open query");
  invoice.queryResolvedAt = studioNow();
  pushEvent(id, "query_resolved");
  return respond(taxView(invoice));
}

export async function getInvoiceEvents(id: string) {
  const list = invoiceEvents
    .filter((event) => event.invoiceId === id)
    .slice()
    .sort((a, b) => a.at.localeCompare(b.at));
  return respond(list);
}

/** Render invoice PDF bytes as a Blob plus a base64 string for download/share. */
export async function downloadInvoicePdf(id: string): Promise<{ blob: Blob; base64: string; filename: string }> {
  const invoice = findMutableInvoice(id);
  if (!invoice) throw new Error("Invoice not found");
  const viewed = taxView(invoice);
  if (!viewed.snapshot) viewed.snapshot = buildSnapshot(viewed);
  const pdf = await renderInvoicePdf(viewed);
  const bytes = pdf.bytes;
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]!);
  const base64 = btoa(binary);
  const filename = `${viewed.number ?? viewed.id}.pdf`;
  const blob = new Blob([bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer], {
    type: "application/pdf",
  });
  return respond({ blob, base64, filename });
}

// Public billing services: a live studio's change is saved before it stands (see billing-store).
export const prepareTerm2Invoices = withLiveBillingSave(prepareTerm2InvoicesImpl);
export const sendTerm2Invoices = withLiveBillingSave(sendTerm2InvoicesImpl);
export const setInvoiceStatus = withLiveBillingSave(setInvoiceStatusImpl);
export const recordInvoicePayment = withLiveBillingSave(recordInvoicePaymentImpl);
export const createInvoice = withLiveBillingSave(createInvoiceImpl);
export const updateDraft = withLiveBillingSave(updateDraftImpl);
export const deleteDraft = withLiveBillingSave(deleteDraftImpl);
export const copyLastInvoice = withLiveBillingSave(copyLastInvoiceImpl);
export const sendInvoice = withLiveBillingSave(sendInvoiceImpl);
export const sendInvoices = withLiveBillingSave(sendInvoicesImpl);
export const recordPayment = withLiveBillingSave(recordPaymentImpl);
export const reversePayment = withLiveBillingSave(reversePaymentImpl);
export const voidInvoice = withLiveBillingSave(voidInvoiceImpl);
export const issueCreditNote = withLiveBillingSave(issueCreditNoteImpl);
export const applyCredit = withLiveBillingSave(applyCreditImpl);
export const refundCredit = withLiveBillingSave(refundCreditImpl);
export const changeDueDate = withLiveBillingSave(changeDueDateImpl);
export const markInvoiceQueried = withLiveBillingSave(markInvoiceQueriedImpl);
export const resolveInvoiceQuery = withLiveBillingSave(resolveInvoiceQueryImpl);
/** Unwrapped services, for other billing services that are wrapped themselves. */
export const billingInternals = { createInvoice: createInvoiceImpl, sendInvoice: sendInvoiceImpl, sendInvoices: sendInvoicesImpl, updateDraft: updateDraftImpl, prepareTerm2Invoices: prepareTerm2InvoicesImpl };
