/**
 * Live family invoicing on the 0004 tables (0016 adds the staff numbering functions). Same
 * pattern as studio-store: loaded at sign-in, saved to Supabase before a change stands.
 *
 * Billing services change the in-memory store as before; `withLiveBillingSave` wraps each one,
 * works out what changed (invoices, lines, payments, credit notes, events) and saves it. If the
 * save fails the store is put back. Numbers come from the database (gapless per studio), never
 * from the browser.
 */
import { invoices, payments } from "@/mocks/data";
import { billingProfileState, creditNotes, invoiceEvents } from "@/mocks/billing-profile";
import type {
  CreditNote,
  Invoice,
  InvoiceEvent,
  InvoiceLine,
  Payment,
  StudioBillingProfile,
} from "@/mocks/types";
import { liveStudioId, type StudioWorkspace } from "@/lib/studio-workspace";
import { client, friendly, type Client } from "./client";

type InvoiceRow = {
  id: string;
  family_id: string;
  number: string | null;
  status: Invoice["status"];
  kind: NonNullable<Invoice["kind"]>;
  related_invoice_id: string | null;
  bill_to_guardian_id: string | null;
  cc_guardian_ids: string[] | null;
  billing_period_start: string | null;
  billing_period_end: string | null;
  terms_version_id: string | null;
  snapshot: Invoice["snapshot"] | null;
  pdf_path: string | null;
  pdf_sha256: string | null;
  collection: NonNullable<Invoice["collection"]>;
  queried_at: string | null;
  query_resolved_at: string | null;
  voided_at: string | null;
  void_reason: string | null;
  sent_at: string | null;
  issue_date: string;
  due_date: string;
  subtotal_cents: number;
  tax_cents: number;
  total_cents: number;
  is_tax_invoice: boolean;
  gst_registered: boolean | null;
  title: Invoice["title"] | null;
  term_key: string | null;
  reviewed_at: string | null;
  xero_synced_at: string | null;
  invoice_line?: LineRow[];
};
type LineRow = {
  id?: string;
  description: string;
  qty: number;
  unit_cents: number;
  tax_cents: number;
  line_total_cents: number;
  student_id: string | null;
  lesson_type_id: string | null;
  tax_code: NonNullable<InvoiceLine["taxCode"]>;
  credit_note_id: string | null;
  created_at?: string;
};
type PaymentRow = {
  id: string;
  invoice_id: string;
  family_id: string;
  amount_cents: number;
  method: Payment["method"];
  received_on: string;
  reference: string | null;
  recorded_by: string | null;
  reverses_payment_id: string | null;
  stripe_payment_intent_id: string | null;
  xero_synced_at: string | null;
};
type CreditNoteRow = {
  id: string;
  number: string;
  family_id: string;
  invoice_id: string | null;
  reason: string;
  amount_cents: number;
  tax_cents: number;
  status: CreditNote["status"];
  issued_on: string;
  pdf_path: string | null;
  pdf_sha256: string | null;
};
type EventRow = {
  id: string;
  invoice_id: string;
  kind: InvoiceEvent["kind"];
  actor: string;
  at: string;
  data: Record<string, unknown> | null;
};
type ProfileRow = {
  invoice_prefix: string;
  next_invoice_number: number;
  credit_note_prefix: string;
  next_credit_note_number: number;
  numbering_locked_at: string | null;
  pay_to_account_name: string | null;
  pay_to_bsb: string | null;
  pay_to_account_number: string | null;
  pay_to_pay_id: string | null;
  pay_to_pay_id_type: "email" | "mobile" | "abn" | null;
  pay_to_cash_note: string | null;
  attach_pdf: boolean;
  pre_due_reminder_days: number | null;
  receipt_emails: boolean;
  auto_send_term_invoices: boolean;
  tailored_pre_due_days: number | null;
  tailored_pre_due_note: string | null;
};

const INVOICE_COLUMNS =
  "id, family_id, number, status, kind, related_invoice_id, bill_to_guardian_id, cc_guardian_ids, billing_period_start, billing_period_end, terms_version_id, snapshot, pdf_path, pdf_sha256, collection, queried_at, query_resolved_at, voided_at, void_reason, sent_at, issue_date, due_date, subtotal_cents, tax_cents, total_cents, is_tax_invoice, gst_registered, title, term_key, reviewed_at, xero_synced_at";
const LINE_COLUMNS =
  "id, description, qty, unit_cents, tax_cents, line_total_cents, student_id, lesson_type_id, tax_code, credit_note_id, created_at";
const PROFILE_COLUMNS =
  "invoice_prefix, next_invoice_number, credit_note_prefix, next_credit_note_number, numbering_locked_at, pay_to_account_name, pay_to_bsb, pay_to_account_number, pay_to_pay_id, pay_to_pay_id_type, pay_to_cash_note, attach_pdf, pre_due_reminder_days, receipt_emails, auto_send_term_invoices, tailored_pre_due_days, tailored_pre_due_note";

/** Drops null and undefined so loaded records look like the ones the app builds. */
function compact<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== null && entry !== undefined),
  ) as T;
}

function toLine(row: LineRow): InvoiceLine {
  return compact<Record<string, unknown>>({
    description: row.description,
    qty: row.qty,
    unitCents: row.unit_cents,
    taxCents: row.tax_cents,
    lineTotalCents: row.line_total_cents,
    studentId: row.student_id ?? undefined,
    lessonTypeId: row.lesson_type_id ?? undefined,
    taxCode: row.tax_code,
    creditNoteId: row.credit_note_id ?? undefined,
  }) as unknown as InvoiceLine;
}

function toInvoice(row: InvoiceRow): Invoice {
  const lines = [...(row.invoice_line ?? [])]
    .sort((a, b) => (a.created_at ?? "").localeCompare(b.created_at ?? ""))
    .map(toLine);
  return compact({
    id: row.id,
    number: row.number,
    familyId: row.family_id,
    status: row.status,
    kind: row.kind,
    relatedInvoiceId: row.related_invoice_id ?? undefined,
    billToGuardianId: row.bill_to_guardian_id ?? undefined,
    ccGuardianIds: row.cc_guardian_ids?.length ? row.cc_guardian_ids : undefined,
    billingPeriod:
      row.billing_period_start && row.billing_period_end
        ? { start: row.billing_period_start, end: row.billing_period_end }
        : undefined,
    termsVersionId: row.terms_version_id ?? undefined,
    snapshot: row.snapshot ?? undefined,
    pdf: row.pdf_path ? { path: row.pdf_path, sha256: row.pdf_sha256 ?? "" } : undefined,
    collection: row.collection,
    queriedAt: row.queried_at ?? undefined,
    queryResolvedAt: row.query_resolved_at ?? undefined,
    voidedAt: row.voided_at ?? undefined,
    voidReason: row.void_reason ?? undefined,
    sentAt: row.sent_at ?? undefined,
    issueDate: row.issue_date,
    dueDate: row.due_date,
    lines,
    subtotalCents: row.subtotal_cents,
    taxCents: row.tax_cents,
    totalCents: row.total_cents,
    isTaxInvoice: row.is_tax_invoice,
    gstRegistered: row.gst_registered ?? undefined,
    title: row.title ?? undefined,
    termKey: row.term_key ?? undefined,
    reviewedAt: row.reviewed_at ?? undefined,
    xeroSyncedAt: row.xero_synced_at ?? undefined,
  }) as Invoice;
}

/** A sent invoice must be a uuid row in the database; a number is the database's to give. */
function invoiceRow(invoice: Invoice, studioId: string) {
  return {
    id: invoice.id,
    studio_id: studioId,
    family_id: invoice.familyId,
    number: invoice.number,
    status: invoice.status,
    kind: invoice.kind ?? "standard",
    related_invoice_id: invoice.relatedInvoiceId ?? null,
    bill_to_guardian_id: invoice.billToGuardianId ?? null,
    cc_guardian_ids: invoice.ccGuardianIds ?? [],
    billing_period_start: invoice.billingPeriod?.start ?? null,
    billing_period_end: invoice.billingPeriod?.end ?? null,
    terms_version_id: invoice.termsVersionId ?? null,
    snapshot: invoice.snapshot ?? null,
    pdf_path: invoice.pdf?.path ?? null,
    pdf_sha256: invoice.pdf?.sha256 ?? null,
    collection: invoice.collection ?? "manual",
    queried_at: invoice.queriedAt ?? null,
    query_resolved_at: invoice.queryResolvedAt ?? null,
    voided_at: invoice.voidedAt ?? null,
    void_reason: invoice.voidReason ?? null,
    sent_at: invoice.sentAt ?? null,
    issue_date: invoice.issueDate,
    due_date: invoice.dueDate,
    subtotal_cents: invoice.subtotalCents,
    tax_cents: invoice.taxCents,
    total_cents: invoice.totalCents,
    is_tax_invoice: invoice.isTaxInvoice,
    gst_registered: invoice.gstRegistered ?? null,
    title: invoice.title ?? null,
    term_key: invoice.termKey ?? null,
    reviewed_at: invoice.reviewedAt ?? null,
    xero_synced_at: invoice.xeroSyncedAt ?? null,
  };
}

function lineRow(line: InvoiceLine, invoiceId: string, studioId: string, index: number) {
  return {
    studio_id: studioId,
    invoice_id: invoiceId,
    description: line.description,
    qty: line.qty,
    unit_cents: line.unitCents,
    tax_cents: line.taxCents,
    line_total_cents: line.lineTotalCents,
    student_id: line.studentId ?? null,
    lesson_type_id: line.lessonTypeId ?? null,
    tax_code: line.taxCode ?? "taxable",
    credit_note_id: line.creditNoteId ?? null,
    // Keeps line order on reload.
    created_at: new Date(Date.now() + index).toISOString(),
  };
}

function toPayment(row: PaymentRow): Payment {
  return compact({
    id: row.id,
    invoiceId: row.invoice_id,
    familyId: row.family_id,
    amountCents: row.amount_cents,
    method: row.method,
    receivedOn: row.received_on,
    date: row.received_on,
    reference: row.reference ?? undefined,
    recordedBy: row.recorded_by ?? "",
    reversesPaymentId: row.reverses_payment_id ?? undefined,
    stripePaymentIntentId: row.stripe_payment_intent_id ?? undefined,
    xeroSyncedAt: row.xero_synced_at ?? undefined,
  }) as Payment;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function paymentRow(payment: Payment, studioId: string) {
  return {
    id: payment.id,
    studio_id: studioId,
    invoice_id: payment.invoiceId,
    family_id: payment.familyId,
    amount_cents: payment.amountCents,
    method: payment.method,
    received_on: payment.receivedOn,
    reference: payment.reference ?? null,
    // recorded_by is a user id; the demo's teacher ids are not.
    recorded_by: UUID.test(payment.recordedBy ?? "") ? payment.recordedBy : null,
    reverses_payment_id: payment.reversesPaymentId ?? null,
    stripe_payment_intent_id: payment.stripePaymentIntentId ?? null,
    xero_synced_at: payment.xeroSyncedAt ?? null,
  };
}

function toCreditNote(row: CreditNoteRow): CreditNote {
  return compact({
    id: row.id,
    number: row.number,
    familyId: row.family_id,
    invoiceId: row.invoice_id ?? undefined,
    reason: row.reason,
    amountCents: row.amount_cents,
    taxCents: row.tax_cents,
    status: row.status,
    issuedOn: row.issued_on,
    pdf: row.pdf_path ? { path: row.pdf_path, sha256: row.pdf_sha256 ?? "" } : undefined,
  }) as CreditNote;
}

function creditNoteRow(note: CreditNote, studioId: string) {
  return {
    id: note.id,
    studio_id: studioId,
    number: note.number,
    family_id: note.familyId,
    invoice_id: note.invoiceId ?? null,
    reason: note.reason,
    amount_cents: note.amountCents,
    tax_cents: note.taxCents,
    status: note.status,
    issued_on: note.issuedOn,
    pdf_path: note.pdf?.path ?? null,
    pdf_sha256: note.pdf?.sha256 ?? null,
  };
}

function toEvent(row: EventRow): InvoiceEvent {
  return compact({
    id: row.id,
    invoiceId: row.invoice_id,
    kind: row.kind,
    actor: row.actor,
    at: row.at,
    data: row.data ?? undefined,
  }) as InvoiceEvent;
}

/** Billing settings stored in the database, laid over the app's profile. */
export function applyProfileRow(profile: StudioBillingProfile, row: ProfileRow) {
  const payTo = compact({
    accountName: row.pay_to_account_name ?? undefined,
    bsb: row.pay_to_bsb ?? undefined,
    accountNumber: row.pay_to_account_number ?? undefined,
    payId: row.pay_to_pay_id ?? undefined,
    payIdType: row.pay_to_pay_id_type ?? undefined,
    cashNote: row.pay_to_cash_note ?? undefined,
  });
  Object.assign(profile, {
    invoicePrefix: row.invoice_prefix,
    nextInvoiceNumber: row.next_invoice_number,
    creditNotePrefix: row.credit_note_prefix,
    nextCreditNoteNumber: row.next_credit_note_number,
    payTo,
    attachPdf: row.attach_pdf,
    preDueReminderDays: row.pre_due_reminder_days,
    receiptEmails: row.receipt_emails,
    autoSendTermInvoices: row.auto_send_term_invoices,
  });
  if (row.numbering_locked_at) profile.numberingLockedAt = row.numbering_locked_at;
  else delete profile.numberingLockedAt;
  if (row.tailored_pre_due_days !== null) profile.tailoredPreDueDays = row.tailored_pre_due_days;
  else delete profile.tailoredPreDueDays;
  if (row.tailored_pre_due_note) profile.tailoredPreDueNote = row.tailored_pre_due_note;
  else delete profile.tailoredPreDueNote;
}

/** Fills invoices, payments, credit notes, events and billing settings. Missing tables are logged. */
export async function loadLiveBilling(
  workspace: Extract<StudioWorkspace, { mode: "live" }>,
  c: Client,
) {
  const studioId = workspace.studioId;
  const [invoiceRes, paymentRes, creditRes, eventRes, profileRes] = await Promise.all([
    c
      .from("invoice")
      .select(`${INVOICE_COLUMNS}, invoice_line(${LINE_COLUMNS})`)
      .eq("studio_id", studioId)
      .order("created_at", { ascending: true }),
    c
      .from("payment")
      .select(
        "id, invoice_id, family_id, amount_cents, method, received_on, reference, recorded_by, reverses_payment_id, stripe_payment_intent_id, xero_synced_at",
      )
      .eq("studio_id", studioId)
      .order("created_at", { ascending: true }),
    c
      .from("credit_note")
      .select(
        "id, number, family_id, invoice_id, reason, amount_cents, tax_cents, status, issued_on, pdf_path, pdf_sha256",
      )
      .eq("studio_id", studioId)
      .order("created_at", { ascending: true }),
    // Families have no read access to invoice events; staff do.
    workspace.role === "guardian"
      ? Promise.resolve({ data: [], error: null })
      : c
          .from("invoice_event")
          .select("id, invoice_id, kind, actor, at, data")
          .eq("studio_id", studioId)
          .order("at", { ascending: true }),
    workspace.role === "guardian"
      ? Promise.resolve({ data: null, error: null })
      : c
          .from("studio_billing_profile")
          .select(PROFILE_COLUMNS)
          .eq("studio_id", studioId)
          .maybeSingle(),
  ]);
  const failed = [invoiceRes, paymentRes, creditRes, eventRes, profileRes].find((res) => res.error);
  if (failed?.error) {
    console.error("[billing-store] invoices not loaded", failed.error.message);
    return;
  }
  invoices.push(...((invoiceRes.data ?? []) as InvoiceRow[]).map(toInvoice));
  payments.push(...((paymentRes.data ?? []) as PaymentRow[]).map(toPayment));
  creditNotes.push(...((creditRes.data ?? []) as CreditNoteRow[]).map(toCreditNote));
  invoiceEvents.push(...((eventRes.data ?? []) as EventRow[]).map(toEvent));
  if (profileRes.data) applyProfileRow(billingProfileState.demo, profileRes.data as ProfileRow);
}

/** Saves billing settings (not numbering, which only the database moves once locked). */
export async function saveLiveBillingProfile(profile: StudioBillingProfile) {
  const studioId = liveStudioId();
  if (!studioId) return;
  const row: Record<string, unknown> = {
    pay_to_account_name: profile.payTo.accountName ?? null,
    pay_to_bsb: profile.payTo.bsb ?? null,
    pay_to_account_number: profile.payTo.accountNumber ?? null,
    pay_to_pay_id: profile.payTo.payId ?? null,
    pay_to_pay_id_type: profile.payTo.payIdType ?? null,
    pay_to_cash_note: profile.payTo.cashNote ?? null,
    attach_pdf: profile.attachPdf,
    pre_due_reminder_days: profile.preDueReminderDays,
    receipt_emails: profile.receiptEmails,
    auto_send_term_invoices: Boolean(profile.autoSendTermInvoices),
    tailored_pre_due_days: profile.tailoredPreDueDays ?? null,
    tailored_pre_due_note: profile.tailoredPreDueNote ?? null,
  };
  if (!profile.numberingLockedAt) {
    Object.assign(row, {
      invoice_prefix: profile.invoicePrefix,
      next_invoice_number: profile.nextInvoiceNumber,
      credit_note_prefix: profile.creditNotePrefix,
      next_credit_note_number: profile.nextCreditNoteNumber,
    });
  }
  const { error } = await client()
    .from("studio_billing_profile")
    .update(row)
    .eq("studio_id", studioId);
  if (error) throw friendly(error, "Couldn't save your billing settings. Please try again.");
}

/**
 * Saves a draft as it stands, then has the database number and send it. Returns the number.
 * Called before any email goes out, so a family never gets an invoice the studio has not saved.
 */
export async function issueLiveInvoice(
  invoice: Invoice,
): Promise<{ number: string; sentAt: string }> {
  const studioId = liveStudioId();
  if (!studioId) throw new Error("Not a live studio");
  const c = client();
  const draft = { ...invoiceRow(invoice, studioId), number: null, status: "draft", sent_at: null };
  const saved = await c.from("invoice").upsert(draft, { onConflict: "id" });
  if (saved.error) throw friendly(saved.error, "Couldn't save this invoice. Please try again.");
  await replaceLines(invoice, studioId);
  const { data, error } = await c.rpc("send_studio_invoice", { p_invoice_id: invoice.id });
  if (error) throw friendly(error, "Couldn't send this invoice. Please try again.");
  const row = (Array.isArray(data) ? data[0] : data) as { number: string; sent_at: string };
  if (!row?.number) throw new Error("Couldn't number this invoice. Please try again.");
  syncedLines.set(invoice.id, JSON.stringify(invoice.lines));
  return { number: row.number, sentAt: row.sent_at };
}

/** The next credit note number for this studio, from the database. */
export async function nextLiveCreditNoteNumber(): Promise<string> {
  const studioId = liveStudioId();
  if (!studioId) throw new Error("Not a live studio");
  const { data, error } = await client().rpc("issue_studio_credit_note_number", {
    p_studio_id: studioId,
  });
  if (error || typeof data !== "string")
    throw friendly(error ?? { message: "no number" }, "Couldn't number this credit note.");
  return data;
}

/** Lines already saved for an invoice in this sign-in, so a re-save can skip them. */
const syncedLines = new Map<string, string>();

async function replaceLines(invoice: Invoice, studioId: string) {
  const c = client();
  const removed = await c
    .from("invoice_line")
    .delete()
    .eq("invoice_id", invoice.id)
    .eq("studio_id", studioId);
  if (removed.error) throw friendly(removed.error, "Couldn't save this invoice. Please try again.");
  if (invoice.lines.length) {
    const added = await c
      .from("invoice_line")
      .insert(invoice.lines.map((line, index) => lineRow(line, invoice.id, studioId, index)));
    if (added.error) throw friendly(added.error, "Couldn't save this invoice. Please try again.");
  }
}

type BillingSnapshot = {
  invoices: Invoice[];
  payments: Payment[];
  creditNotes: CreditNote[];
  invoiceEvents: InvoiceEvent[];
  profile: StudioBillingProfile;
};

function takeSnapshot(): BillingSnapshot {
  return structuredClone({
    invoices,
    payments,
    creditNotes,
    invoiceEvents,
    profile: billingProfileState.demo,
  });
}

function restore(snapshot: BillingSnapshot) {
  invoices.splice(0, invoices.length, ...snapshot.invoices);
  payments.splice(0, payments.length, ...snapshot.payments);
  creditNotes.splice(0, creditNotes.length, ...snapshot.creditNotes);
  invoiceEvents.splice(0, invoiceEvents.length, ...snapshot.invoiceEvents);
  billingProfileState.demo = snapshot.profile;
}

/** Read-time fields that are never stored. */
function stored(invoice: Invoice) {
  const {
    paidCents,
    balanceCents,
    isOverdue,
    daysOverdue,
    payments: list,
    lines,
    ...rest
  } = invoice;
  void paidCents;
  void balanceCents;
  void isOverdue;
  void daysOverdue;
  void list;
  void lines;
  return JSON.stringify(rest);
}

/** Saves everything that changed since `before`, parents before children. */
async function saveChanges(before: BillingSnapshot) {
  const studioId = liveStudioId();
  if (!studioId) return;
  const c = client();
  const fail = (error: { message: string; code?: string }) =>
    friendly(error, "Couldn't save this invoice change. Please try again.");
  const old = new Map(before.invoices.map((invoice) => [invoice.id, invoice]));

  const changed = invoices.filter((invoice) => {
    const prior = old.get(invoice.id);
    return !prior || stored(prior) !== stored(invoice);
  });
  if (changed.length) {
    const { error } = await c.from("invoice").upsert(
      changed.map((invoice) => invoiceRow(invoice, studioId)),
      { onConflict: "id" },
    );
    if (error) throw fail(error);
  }

  const oldNotes = new Map(before.creditNotes.map((note) => [note.id, note]));
  const notes = creditNotes.filter((note) => {
    const prior = oldNotes.get(note.id);
    return !prior || JSON.stringify(prior) !== JSON.stringify(note);
  });
  if (notes.length) {
    const { error } = await c.from("credit_note").upsert(
      notes.map((note) => creditNoteRow(note, studioId)),
      { onConflict: "id" },
    );
    if (error) throw fail(error);
  }

  for (const invoice of invoices) {
    const prior = old.get(invoice.id);
    const now = JSON.stringify(invoice.lines);
    const was = syncedLines.get(invoice.id) ?? (prior ? JSON.stringify(prior.lines) : undefined);
    if (now === was) continue;
    if (!prior || prior.status === "draft") {
      await replaceLines(invoice, studioId);
    } else {
      // A sent invoice only ever gains lines (credit applied); the rest stay as sent.
      const added = invoice.lines.slice(prior.lines.length);
      if (added.length) {
        const { error } = await c
          .from("invoice_line")
          .insert(
            added.map((line, i) => lineRow(line, invoice.id, studioId, prior.lines.length + i)),
          );
        if (error) throw fail(error);
      }
    }
    syncedLines.set(invoice.id, now);
  }

  const oldPayments = new Set(before.payments.map((payment) => payment.id));
  const newPayments = payments.filter((payment) => !oldPayments.has(payment.id));
  if (newPayments.length) {
    const { error } = await c
      .from("payment")
      .insert(newPayments.map((payment) => paymentRow(payment, studioId)));
    if (error) throw fail(error);
  }

  const oldEvents = new Set(before.invoiceEvents.map((event) => event.id));
  const newEvents = invoiceEvents.filter(
    (event) =>
      !oldEvents.has(event.id) && invoices.some((invoice) => invoice.id === event.invoiceId),
  );
  if (newEvents.length) {
    const { error } = await c.from("invoice_event").insert(
      newEvents.map((event) => ({
        id: event.id,
        studio_id: studioId,
        invoice_id: event.invoiceId,
        kind: event.kind,
        actor: event.actor,
        at: event.at,
        data: event.data ?? null,
      })),
    );
    if (error) throw fail(error);
  }

  const kept = new Set(invoices.map((invoice) => invoice.id));
  const deleted = before.invoices.filter((invoice) => !kept.has(invoice.id));
  for (const invoice of deleted) {
    const { error } = await c
      .from("invoice")
      .delete()
      .eq("id", invoice.id)
      .eq("studio_id", studioId);
    if (error) throw fail(error);
    syncedLines.delete(invoice.id);
  }
}

let queue: Promise<unknown> = Promise.resolve();

/**
 * Wraps a public billing service so a live studio's change is saved before it stands. Calls run
 * one at a time, so two changes never save over each other. Services call each other through
 * their unwrapped versions, so one user action saves once.
 */
export function withLiveBillingSave<A extends unknown[], R>(
  run: (...args: A) => Promise<R>,
): (...args: A) => Promise<R> {
  return (...args: A) => {
    if (!liveStudioId()) return run(...args);
    const task = queue.then(async () => {
      const before = takeSnapshot();
      try {
        const result = await run(...args);
        await saveChanges(before);
        return result;
      } catch (error) {
        restore(before);
        throw error;
      }
    });
    queue = task.catch(() => undefined);
    return task;
  };
}

export function resetLiveBillingForTests() {
  queue = Promise.resolve();
  syncedLines.clear();
}
