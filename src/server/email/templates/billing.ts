import { formatAUD } from "@/lib/format";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function wrap(title: string, bodyHtml: string, bodyText: string) {
  return {
    subject: title,
    html: `<!doctype html><html><body style="font-family:Georgia,serif;color:#1c1917;background:#f7f3eb;padding:24px"><div style="max-width:560px;margin:0 auto;background:#fff;padding:28px;border:1px solid #e7e5e4"><h1 style="font-size:22px;margin:0 0 16px">${escapeHtml(title)}</h1>${bodyHtml}</div></body></html>`,
    text: `${title}\n\n${bodyText}`,
  };
}

export function invoiceSentEmail(input: {
  studioName: string;
  familyName: string;
  invoiceNumber: string;
  totalCents: number;
  dueDate: string;
  viewUrl?: string;
}) {
  const amount = formatAUD(input.totalCents);
  const title = `${input.studioName}: invoice ${input.invoiceNumber}`;
  return wrap(
    title,
    `<p>Hi ${escapeHtml(input.familyName)},</p><p>Please find invoice <strong>${escapeHtml(input.invoiceNumber)}</strong> for <strong>${escapeHtml(amount)}</strong>, due ${escapeHtml(input.dueDate)}.</p>${input.viewUrl ? `<p><a href="${escapeHtml(input.viewUrl)}">View invoice</a></p>` : ""}`,
    `Hi ${input.familyName},\n\nPlease find invoice ${input.invoiceNumber} for ${amount}, due ${input.dueDate}.${input.viewUrl ? `\n\nView invoice: ${input.viewUrl}` : ""}`,
  );
}

export function paymentReceiptEmail(input: {
  studioName: string;
  familyName: string;
  invoiceNumber: string;
  amountCents: number;
  methodLabel: string;
  receivedOn: string;
}) {
  const amount = formatAUD(input.amountCents);
  const title = `${input.studioName}: payment received for ${input.invoiceNumber}`;
  return wrap(
    title,
    `<p>Hi ${escapeHtml(input.familyName)},</p><p>We received ${escapeHtml(amount)} via ${escapeHtml(input.methodLabel)} on ${escapeHtml(input.receivedOn)} for invoice ${escapeHtml(input.invoiceNumber)}.</p>`,
    `Hi ${input.familyName},\n\nWe received ${amount} via ${input.methodLabel} on ${input.receivedOn} for invoice ${input.invoiceNumber}.`,
  );
}

export function reminderEmail(input: {
  studioName: string;
  familyName: string;
  invoiceNumber: string;
  totalCents: number;
  dueDate: string;
  kind: "pre_due" | "overdue";
}) {
  const amount = formatAUD(input.totalCents);
  const title =
    input.kind === "pre_due"
      ? `${input.studioName}: reminder — invoice ${input.invoiceNumber} due soon`
      : `${input.studioName}: overdue invoice ${input.invoiceNumber}`;
  const lead =
    input.kind === "pre_due"
      ? `This is a friendly reminder that invoice ${input.invoiceNumber} for ${amount} is due on ${input.dueDate}.`
      : `Invoice ${input.invoiceNumber} for ${amount} was due on ${input.dueDate} and is still unpaid.`;
  return wrap(
    title,
    `<p>Hi ${escapeHtml(input.familyName)},</p><p>${escapeHtml(lead)}</p>`,
    `Hi ${input.familyName},\n\n${lead}`,
  );
}

export function lateFeeNoticeEmail(input: {
  studioName: string;
  familyName: string;
  invoiceNumber: string;
  feeCents: number;
}) {
  const fee = formatAUD(input.feeCents);
  const title = `${input.studioName}: late fee notice for ${input.invoiceNumber}`;
  return wrap(
    title,
    `<p>Hi ${escapeHtml(input.familyName)},</p><p>A late fee of ${escapeHtml(fee)} may apply to overdue invoice ${escapeHtml(input.invoiceNumber)} under the studio terms.</p>`,
    `Hi ${input.familyName},\n\nA late fee of ${fee} may apply to overdue invoice ${input.invoiceNumber} under the studio terms.`,
  );
}

export function pauseNoticeEmail(input: {
  studioName: string;
  familyName: string;
  invoiceNumber: string;
}) {
  const title = `${input.studioName}: lessons may pause — unpaid invoice ${input.invoiceNumber}`;
  return wrap(
    title,
    `<p>Hi ${escapeHtml(input.familyName)},</p><p>Lessons may pause until invoice ${escapeHtml(input.invoiceNumber)} is settled, as set out in the studio terms.</p>`,
    `Hi ${input.familyName},\n\nLessons may pause until invoice ${input.invoiceNumber} is settled, as set out in the studio terms.`,
  );
}

export function creditNoteEmail(input: {
  studioName: string;
  familyName: string;
  creditNoteNumber: string;
  amountCents: number;
  reason: string;
}) {
  const amount = formatAUD(input.amountCents);
  const title = `${input.studioName}: credit note ${input.creditNoteNumber}`;
  return wrap(
    title,
    `<p>Hi ${escapeHtml(input.familyName)},</p><p>Credit note ${escapeHtml(input.creditNoteNumber)} for ${escapeHtml(amount)} has been issued. Reason: ${escapeHtml(input.reason)}.</p>`,
    `Hi ${input.familyName},\n\nCredit note ${input.creditNoteNumber} for ${amount} has been issued. Reason: ${input.reason}.`,
  );
}

export function payToChangedEmail(input: {
  studioName: string;
  accountName: string;
  bsb: string;
  accountMasked: string;
  payId?: string;
}) {
  const title = `${input.studioName}: bank details updated`;
  const payIdLine = input.payId ? ` PayID ${input.payId}.` : "";
  return wrap(
    title,
    `<p>Pay-to details for ${escapeHtml(input.studioName)} were updated.</p><p>Account name: ${escapeHtml(input.accountName)}<br/>BSB: ${escapeHtml(input.bsb)}<br/>Account: ${escapeHtml(input.accountMasked)}${input.payId ? `<br/>PayID: ${escapeHtml(input.payId)}` : ""}</p><p>Full account numbers are never included in this notice.</p>`,
    `Pay-to details for ${input.studioName} were updated.\n\nAccount name: ${input.accountName}\nBSB: ${input.bsb}\nAccount: ${input.accountMasked}.${payIdLine}\n\nFull account numbers are never included in this notice.`,
  );
}

/**
 * Every billing email by kind. The browser names a kind and its details; for a real studio the
 * server renders the email itself from this list (src/server/billing-email.ts), with the studio
 * name taken from the database, so no HTML ever comes from the browser.
 */
export const billingEmailTemplates = {
  invoice_sent: invoiceSentEmail,
  payment_receipt: paymentReceiptEmail,
  credit_note: creditNoteEmail,
  reminder_pre_due: (input: Omit<Parameters<typeof reminderEmail>[0], "kind">) =>
    reminderEmail({ ...input, kind: "pre_due" }),
  reminder_overdue: (input: Omit<Parameters<typeof reminderEmail>[0], "kind">) =>
    reminderEmail({ ...input, kind: "overdue" }),
  late_fee_proposed: lateFeeNoticeEmail,
  pause_notice: pauseNoticeEmail,
  pay_to_changed: payToChangedEmail,
} as const;

export type BillingEmailKind = keyof typeof billingEmailTemplates;

/** A kind's details without the studio name (the server fills that in for real studios). */
export type BillingEmailParams<K extends BillingEmailKind> = Omit<
  Parameters<(typeof billingEmailTemplates)[K]>[0],
  "studioName"
>;

export function isBillingEmailKind(value: unknown): value is BillingEmailKind {
  return typeof value === "string" && Object.hasOwn(billingEmailTemplates, value);
}

export function renderBillingEmail<K extends BillingEmailKind>(
  kind: K,
  studioName: string,
  params: BillingEmailParams<K>,
) {
  const template = billingEmailTemplates[kind] as (input: Record<string, unknown>) => {
    subject: string;
    html: string;
    text: string;
  };
  return template({ ...(params as Record<string, unknown>), studioName });
}
