import type { IntegrationScope } from "@/mocks/integrations";
import type { CreditNote, InvoiceEvent, StudioBillingProfile } from "@/mocks/types";
import { melbourneIso, PROTOTYPE_TODAY } from "@/lib/calendar";
import { studio } from "@/mocks/data";

export function initialDemoBillingProfile(): StudioBillingProfile {
  return {
    legalName: studio.name,
    tradingName: studio.name,
    ...(studio.abn ? { abn: studio.abn } : {}),
    gstRegistered: studio.gstRegistered,
    invoicePrefix: "INV-",
    nextInvoiceNumber: 23,
    creditNotePrefix: "CN-",
    nextCreditNoteNumber: 2,
    numberingLockedAt: melbourneIso("2027-01-18", "10:00"),
    payTo: {
      accountName: "Clarke Piano Studio",
      bsb: "062000",
      accountNumber: "12345678",
      payId: "accounts@clarkepiano.example",
      payIdType: "email",
      cashNote: "Cash accepted at lessons",
    },
    attachPdf: true,
    preDueReminderDays: 3,
    receiptEmails: true,
    autoSendTermInvoices: false,
  };
}

export function initialNewStudioBillingProfile(): StudioBillingProfile {
  return {
    legalName: "",
    tradingName: "",
    gstRegistered: false,
    invoicePrefix: "INV-",
    nextInvoiceNumber: 1,
    creditNotePrefix: "CN-",
    nextCreditNoteNumber: 1,
    payTo: {},
    attachPdf: true,
    preDueReminderDays: 3,
    receiptEmails: true,
    autoSendTermInvoices: false,
  };
}

export const billingProfileState: Record<IntegrationScope, StudioBillingProfile> = {
  demo: initialDemoBillingProfile(),
  "new-studio": initialNewStudioBillingProfile(),
};

export const creditNotes: CreditNote[] = [];
export const invoiceEvents: InvoiceEvent[] = [];
export const billingAuditLog: Array<{ at: string; kind: string; detail: string }> = [];

/** Seed one open credit note and a late-fee proposal against fam-10's overdue invoice. */
export function seedBillingExtras() {
  if (!creditNotes.some((note) => note.id === "cn-demo-1")) {
    creditNotes.push({
      id: "cn-demo-1",
      number: "CN-000001",
      familyId: "fam-10",
      invoiceId: "inv-10",
      reason: "Goodwill credit for interrupted term",
      amountCents: 4900,
      taxCents: 445,
      status: "open",
      issuedOn: addPrototypeDays(-5),
    });
  }
  if (!invoiceEvents.some((event) => event.id === "evt-late-fee-inv-10")) {
    invoiceEvents.push({
      id: "evt-late-fee-inv-10",
      invoiceId: "inv-10",
      kind: "late_fee_proposed",
      actor: "system",
      at: melbourneIso(PROTOTYPE_TODAY, "09:00"),
      data: { amountCents: 490, afterDays: 7 },
    });
  }
}

function addPrototypeDays(offset: number): string {
  const [y, m, d] = PROTOTYPE_TODAY.split("-").map(Number);
  const date = new Date(Date.UTC(y!, m! - 1, d! + offset));
  return date.toISOString().slice(0, 10);
}

export function resetBillingExtras() {
  billingProfileState.demo = initialDemoBillingProfile();
  billingProfileState["new-studio"] = initialNewStudioBillingProfile();
  creditNotes.length = 0;
  invoiceEvents.length = 0;
  billingAuditLog.length = 0;
  seedBillingExtras();
}

seedBillingExtras();
