import { studioSenderFrom } from "@/lib/studio-mail";
import { invoices, families, studio, teacher } from "@/mocks/data";
import { invoiceEvents } from "@/mocks/billing-profile";
import type { IntegrationScope } from "@/mocks/integrations";
import { addDays } from "@/lib/calendar";
import { respond } from "./_delay";
import { billingInternals, enrichInvoice, getInvoice } from "./billing";
import { withLiveBillingSave } from "./live/billing-store";
import { newRecordId } from "./live/studio-store";
import { studioNow, studioToday } from "@/lib/studio-clock";
import { readBillingProfile } from "./billing-profile";
import { lateFeeForInvoice } from "./terms";
import { emailProvider } from "./_lazy";
import {
  lateFeeNoticeEmail,
  pauseNoticeEmail,
  reminderEmail,
} from "@/server/email/templates/billing";

function eventsFor(invoiceId: string) {
  return invoiceEvents.filter((event) => event.invoiceId === invoiceId);
}

function hasEvent(invoiceId: string, kind: (typeof invoiceEvents)[number]["kind"]) {
  return eventsFor(invoiceId).some((event) => event.kind === kind);
}

function pushEvent(
  invoiceId: string,
  kind: (typeof invoiceEvents)[number]["kind"],
  data?: Record<string, unknown>,
) {
  invoiceEvents.push({
    id: newRecordId("evt"),
    invoiceId,
    kind,
    actor: "system",
    at: studioNow("09:15"),
    ...(data ? { data } : {}),
  });
}

function familyName(familyId: string) {
  return families.find((family) => family.id === familyId)?.displayName ?? "Family";
}

function guardianEmail(familyId: string, billToGuardianId?: string) {
  const family = families.find((entry) => entry.id === familyId);
  const guardian =
    family?.guardians.find((entry) => entry.id === billToGuardianId) ?? family?.guardians[0];
  return guardian?.email;
}

/**
 * Walk open invoices and emit pre-due / overdue reminders, late-fee proposals and pause notices.
 * Runs on every plan (studio agreement clause 1.4). Pro-only automation lives in billing-automation.ts.
 */
async function runBillingScheduleImpl(scope: IntegrationScope = "demo", today: string = studioToday()) {
  const profile = readBillingProfile(scope);
  const actions: string[] = [];
  const lateAfter = studio.billing?.lateFeeAfterDays ?? 7;
  const suspendAfter = studio.billing?.suspendAfterDays ?? 14;
  const termsScope = scope === "new-studio" ? "new-studio" : "demo";

  for (const raw of invoices) {
    if (raw.status === "draft" || raw.status === "paid" || raw.status === "void") continue;
    const live = await getInvoice(raw.id);
    if (!live) continue;
    const enriched = enrichInvoice(live, today);
    const balance = enriched.balanceCents ?? enriched.totalCents;
    if (balance <= 0) continue;

    const email = guardianEmail(enriched.familyId, enriched.billToGuardianId);
    const studioName = profile.tradingName || profile.legalName || studio.name;

    if (
      profile.preDueReminderDays != null &&
      !enriched.isOverdue &&
      enriched.dueDate === addDays(today, profile.preDueReminderDays) &&
      !hasEvent(enriched.id, "reminder_pre_due")
    ) {
      if (email) {
        const mail = reminderEmail({
          studioName,
          familyName: familyName(enriched.familyId),
          invoiceNumber: enriched.number ?? enriched.id,
          totalCents: balance,
          dueDate: enriched.dueDate,
          kind: "pre_due",
        });
        await (await emailProvider()).send({
          to: email,
          from: studioSenderFrom(studio.name, studio.email),
          subject: mail.subject,
          html: mail.html,
          text: mail.text,
          tags: [{ name: "kind", value: "reminder_pre_due" }],
        });
      }
      pushEvent(enriched.id, "reminder_pre_due", { dueDate: enriched.dueDate });
      actions.push(`pre_due:${enriched.id}`);
    }

    if (enriched.isOverdue && !hasEvent(enriched.id, "reminder_overdue")) {
      if (email) {
        const mail = reminderEmail({
          studioName,
          familyName: familyName(enriched.familyId),
          invoiceNumber: enriched.number ?? enriched.id,
          totalCents: balance,
          dueDate: enriched.dueDate,
          kind: "overdue",
        });
        await (await emailProvider()).send({
          to: email,
          from: studioSenderFrom(studio.name, studio.email),
          subject: mail.subject,
          html: mail.html,
          text: mail.text,
          tags: [{ name: "kind", value: "reminder_overdue" }],
        });
      }
      pushEvent(enriched.id, "reminder_overdue", { daysOverdue: enriched.daysOverdue });
      actions.push(`overdue_reminder:${enriched.id}`);
    }

    if (
      enriched.isOverdue &&
      (enriched.daysOverdue ?? 0) >= lateAfter &&
      !hasEvent(enriched.id, "late_fee_proposed") &&
      !hasEvent(enriched.id, "late_fee_applied") &&
      !hasEvent(enriched.id, "late_fee_waived")
    ) {
      const feeCents = lateFeeForInvoice(enriched.totalCents, termsScope);
      pushEvent(enriched.id, "late_fee_proposed", { amountCents: feeCents, afterDays: lateAfter });
      if (email) {
        const mail = lateFeeNoticeEmail({
          studioName,
          familyName: familyName(enriched.familyId),
          invoiceNumber: enriched.number ?? enriched.id,
          feeCents,
        });
        await (await emailProvider()).send({
          to: email,
          from: studioSenderFrom(studio.name, studio.email),
          subject: mail.subject,
          html: mail.html,
          text: mail.text,
          tags: [{ name: "kind", value: "late_fee_proposed" }],
        });
      }
      actions.push(`late_fee_proposed:${enriched.id}`);
    }

    if (
      enriched.isOverdue &&
      (enriched.daysOverdue ?? 0) >= suspendAfter &&
      !hasEvent(enriched.id, "pause_notice_sent") &&
      !hasEvent(enriched.id, "pause_notice_proposed")
    ) {
      pushEvent(enriched.id, "pause_notice_proposed", { afterDays: suspendAfter });
      actions.push(`pause_notice_proposed:${enriched.id}`);
    }
  }

  return respond({ ran: true as const, actions });
}

async function applyLateFeeImpl(invoiceId: string, scope: IntegrationScope = "demo") {
  const invoice = await getInvoice(invoiceId);
  if (!invoice) throw new Error("Invoice not found");
  if (invoice.status === "draft" || invoice.status === "void" || invoice.status === "paid") {
    throw new Error("Late fees apply only to open invoices");
  }
  if (invoice.queriedAt && !invoice.queryResolvedAt) {
    throw new Error("Resolve the family query before applying a late fee");
  }
  if (invoice.kind === "late_fee") throw new Error("Cannot add a late fee on a late fee invoice");
  if (hasEvent(invoiceId, "late_fee_applied")) throw new Error("Late fee already applied");
  if (hasEvent(invoiceId, "late_fee_waived")) throw new Error("Late fee was waived");

  const termsScope = scope === "new-studio" ? "new-studio" : "demo";
  const feeCents = lateFeeForInvoice(invoice.totalCents, termsScope);
  if (feeCents <= 0) throw new Error("No late fee applies");

  const feeInvoice = await billingInternals.createInvoice({
    familyId: invoice.familyId,
    kind: "late_fee",
    ...(invoice.billToGuardianId ? { billToGuardianId: invoice.billToGuardianId } : {}),
    dueDate: addDays(studioToday(), 7),
    lines: [
      {
        description: `Late fee for ${invoice.number ?? invoice.id}`,
        qty: 1,
        unitCents: feeCents,
        lineTotalCents: feeCents,
        taxCents: 0,
        taxCode: "gst_free",
      },
    ],
  });
  const stored = invoices.find((entry) => entry.id === feeInvoice.id);
  if (stored) stored.relatedInvoiceId = invoiceId;

  const sent = await billingInternals.sendInvoice(feeInvoice.id);
  pushEvent(invoiceId, "late_fee_applied", {
    amountCents: feeCents,
    lateFeeInvoiceId: feeInvoice.id,
  });
  return respond({ feeInvoice: sent ?? feeInvoice, amountCents: feeCents });
}

async function waiveLateFeeImpl(invoiceId: string) {
  const invoice = await getInvoice(invoiceId);
  if (!invoice) throw new Error("Invoice not found");
  if (hasEvent(invoiceId, "late_fee_applied")) throw new Error("Late fee already applied");
  pushEvent(invoiceId, "late_fee_waived", { by: teacher.id });
  return respond(invoice);
}

async function sendPauseNoticeImpl(invoiceId: string) {
  const invoice = await getInvoice(invoiceId);
  if (!invoice) throw new Error("Invoice not found");
  if (!invoice.isOverdue) throw new Error("Pause notices are for overdue invoices");
  if (hasEvent(invoiceId, "pause_notice_sent")) return respond(invoice);

  const profile = readBillingProfile("demo");
  const email = guardianEmail(invoice.familyId, invoice.billToGuardianId);
  if (email) {
    const mail = pauseNoticeEmail({
      studioName: profile.tradingName || profile.legalName || studio.name,
      familyName: familyName(invoice.familyId),
      invoiceNumber: invoice.number ?? invoice.id,
    });
    await (await emailProvider()).send({
      to: email,
      from: studioSenderFrom(studio.name, studio.email),
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
      tags: [{ name: "kind", value: "pause_notice" }],
    });
  }
  pushEvent(invoiceId, "pause_notice_sent");
  return respond(await getInvoice(invoiceId));
}

export const runBillingSchedule = withLiveBillingSave(runBillingScheduleImpl);
export const applyLateFee = withLiveBillingSave(applyLateFeeImpl);
export const waiveLateFee = withLiveBillingSave(waiveLateFeeImpl);
export const sendPauseNotice = withLiveBillingSave(sendPauseNoticeImpl);
