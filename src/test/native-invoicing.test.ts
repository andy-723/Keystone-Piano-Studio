import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { invoices, payments, studio } from "@/mocks/data";
import { billingProfileState, invoiceEvents, resetBillingExtras } from "@/mocks/billing-profile";
import { termInvoiceDrafts } from "@/mocks/billing";
import { clearEmailOutbox, getEmailOutbox } from "@/server/email";
import {
  changeDueDate,
  copyLastInvoice,
  createInvoice,
  deleteDraft,
  exportBillingCsv,
  getInvoice,
  issueCreditNote,
  recordPayment,
  reversePayment,
  sendInvoice,
  voidInvoice,
} from "@/services/billing";
import { applyLateFee, runBillingSchedule, sendPauseNotice, waiveLateFee } from "@/services/billing-reminders";
import { getBillingProfile, saveBillingProfile, savePayTo } from "@/services/billing-profile";
import { billNextTerm } from "@/services/billing-automation";
import { setStudioPlan } from "@/services/plans";
import { addDays, PROTOTYPE_TODAY } from "@/lib/calendar";
import { renderInvoicePdf } from "@/lib/invoice-pdf";
import { invoiceSentEmail } from "@/server/email/templates/billing";

vi.mock("@/services/_delay", () => ({ respond: async <T>(value: T) => structuredClone(value) }));

const snapshotInvoices = () => structuredClone(invoices);
const snapshotPayments = () => structuredClone(payments);
let invoiceSnap: ReturnType<typeof snapshotInvoices>;
let paymentSnap: ReturnType<typeof snapshotPayments>;
let gstSnap: boolean;
let planSnap: typeof studio.plan;

beforeEach(() => {
  invoiceSnap = snapshotInvoices();
  paymentSnap = snapshotPayments();
  gstSnap = studio.gstRegistered;
  planSnap = studio.plan;
  resetBillingExtras();
  termInvoiceDrafts.clear();
  clearEmailOutbox();
  billingProfileState.demo.nextInvoiceNumber = 100;
  billingProfileState.demo.numberingLockedAt = undefined;
  studio.plan = "pro";
});

afterEach(() => {
  invoices.splice(0, invoices.length, ...invoiceSnap);
  payments.splice(0, payments.length, ...paymentSnap);
  studio.gstRegistered = gstSnap;
  studio.plan = planSnap;
  resetBillingExtras();
  termInvoiceDrafts.clear();
  clearEmailOutbox();
});

describe("numbering", () => {
  it("drafts have no number; send allocates gapless INV- numbers and locks prefix", async () => {
    const draft = await createInvoice({
      familyId: "fam-1",
      lines: [{ description: "Books", qty: 1, unitCents: 2000, lineTotalCents: 2000, taxCents: 0, taxCode: "gst_free" }],
    });
    expect(draft.number).toBeNull();
    expect(draft.status).toBe("draft");

    const sent = await sendInvoice(draft.id);
    expect(sent?.number).toBe("INV-000100");
    expect(sent?.status).toBe("sent");
    expect((await getBillingProfile()).numberingLockedAt).toBeTruthy();

    const draft2 = await createInvoice({
      familyId: "fam-1",
      lines: [{ description: "Travel", qty: 1, unitCents: 1500, lineTotalCents: 1500, taxCents: 0, taxCode: "gst_free" }],
    });
    await deleteDraft(draft2.id);
    const draft3 = await createInvoice({
      familyId: "fam-1",
      lines: [{ description: "Travel", qty: 1, unitCents: 1500, lineTotalCents: 1500, taxCents: 0, taxCode: "gst_free" }],
    });
    const sent2 = await sendInvoice(draft3.id);
    expect(sent2?.number).toBe("INV-000101");

    await expect(saveBillingProfile("demo", { invoicePrefix: "XX-" })).rejects.toThrow(/locked/i);

    const voided = await voidInvoice(sent!.id, "Mistake");
    expect(voided.number).toBe("INV-000100");
    expect(voided.status).toBe("void");
  });

  it("credit notes use their own CN- sequence", async () => {
    const cn = await issueCreditNote({ familyId: "fam-1", reason: "Teacher absence", amountCents: 4900 });
    expect(cn.number).toMatch(/^CN-\d{6}$/);
  });
});

describe("GST freeze", () => {
  it("does not alter a sent invoice when GST setting changes", async () => {
    studio.gstRegistered = true;
    const draft = await createInvoice({
      familyId: "fam-2",
      lines: [{ description: "Lessons", qty: 1, unitCents: 11000, lineTotalCents: 11000, taxCents: 0, taxCode: "taxable" }],
    });
    const sent = await sendInvoice(draft.id);
    expect(sent?.isTaxInvoice).toBe(true);
    expect(sent?.taxCents).toBeGreaterThan(0);
    const tax = sent!.taxCents;
    studio.gstRegistered = false;
    const again = await getInvoice(sent!.id);
    expect(again?.taxCents).toBe(tax);
    expect(again?.isTaxInvoice).toBe(true);
  });
});

describe("payments", () => {
  it("partial then full; rejects overpayment; reversal restores balance; void rejected after payment", async () => {
    const draft = await createInvoice({
      familyId: "fam-3",
      lines: [{ description: "Fee", qty: 1, unitCents: 10000, lineTotalCents: 10000, taxCents: 0, taxCode: "gst_free" }],
    });
    const sent = await sendInvoice(draft.id);
    const partial = await recordPayment(sent!.id, {
      amountCents: 4000,
      method: "bank_transfer",
      receivedOn: PROTOTYPE_TODAY,
    });
    expect(partial.status).toBe("partially_paid");
    expect(partial.balanceCents).toBe(6000);
    await expect(
      recordPayment(sent!.id, { amountCents: 7000, method: "cash", receivedOn: PROTOTYPE_TODAY }),
    ).rejects.toThrow(/credit note/i);
    const paid = await recordPayment(sent!.id, {
      amountCents: 6000,
      method: "cash",
      receivedOn: PROTOTYPE_TODAY,
    });
    expect(paid.status).toBe("paid");
    await expect(voidInvoice(sent!.id, "nope")).rejects.toThrow();
    const paymentId = paid.payments?.find((p) => p.amountCents === 6000)?.id;
    expect(paymentId).toBeTruthy();
    const reversed = await reversePayment(paymentId!);
    expect((reversed.balanceCents ?? 0) > 0).toBe(true);
  });
});

describe("schedule", () => {
  it("is idempotent on the same day and supports late fee / pause actions", async () => {
    const overdue = invoices.find((invoice) => invoice.id === "inv-10");
    if (!overdue) throw new Error("missing inv-10");
    overdue.status = "sent";
    overdue.dueDate = addDays(PROTOTYPE_TODAY, -9);
    delete overdue.queriedAt;
    for (let i = invoiceEvents.length - 1; i >= 0; i--) {
      if (invoiceEvents[i]?.invoiceId === "inv-10") invoiceEvents.splice(i, 1);
    }
    const first = await runBillingSchedule("demo", PROTOTYPE_TODAY);
    const second = await runBillingSchedule("demo", PROTOTYPE_TODAY);
    expect(second.actions).toHaveLength(0);
    expect(first.actions.length).toBeGreaterThan(0);
    await expect(applyLateFee("inv-10")).resolves.toBeTruthy();
    await expect(applyLateFee("inv-10")).rejects.toThrow();
    await waiveLateFee("inv-4");
    await sendPauseNotice("inv-10");
  });
});

describe("export", () => {
  it("CSV includes overdue derived fields", async () => {
    const csv = await exportBillingCsv();
    expect(csv.invoices).toContain("isOverdue");
    expect(csv.payments.split("\n")[0]).toContain("amountCents");
    expect(csv.creditNotes.split("\n")[0]).toContain("issuedOn");
  });
});

describe("pay-to MFA", () => {
  it("requires MFA code and never puts full account number in the owner email", async () => {
    await expect(
      savePayTo("demo", { accountName: "Clarke Piano Studio", bsb: "062000", accountNumber: "87654321" }, "000000"),
    ).rejects.toThrow(/authenticator|six-digit/i);
    await savePayTo(
      "demo",
      { accountName: "Clarke Piano Studio", bsb: "062000", accountNumber: "87654321" },
      "123456",
    );
    const outbox = getEmailOutbox();
    const ownerMail = outbox.find((entry) => /bank details/i.test(entry.subject));
    expect(ownerMail).toBeTruthy();
    expect(JSON.stringify(ownerMail)).not.toContain("87654321");
  });
});

describe("emails and PDF", () => {
  it("templates omit health and lesson notes; PDF sha256 stored", async () => {
    const html = invoiceSentEmail({
      studioName: "Clarke",
      familyName: "Chen",
      invoiceNumber: "INV-000001",
      totalCents: 1000,
      dueDate: PROTOTYPE_TODAY,
    });
    expect(html.html.toLowerCase()).not.toContain("allerg");
    expect(html.html.toLowerCase()).not.toContain("health note");
    expect(html.html.toLowerCase()).not.toContain("lesson note");

    const draft = await createInvoice({
      familyId: "fam-1",
      lines: [{ description: "Books", qty: 1, unitCents: 1100, lineTotalCents: 1100, taxCents: 0, taxCode: "gst_free" }],
    });
    const sent = await sendInvoice(draft.id);
    expect(sent?.pdf?.sha256).toMatch(/^[a-f0-9]{64}$/);
    const pdf = await renderInvoicePdf(sent!);
    expect(pdf.sha256).toBe(sent?.pdf?.sha256);
  });
});

describe("plans", () => {
  it("Base can send invoices; billNextTerm requires Pro", async () => {
    await setStudioPlan("base");
    const draft = await createInvoice({
      familyId: "fam-1",
      lines: [{ description: "One-off", qty: 1, unitCents: 2000, lineTotalCents: 2000, taxCents: 0, taxCode: "gst_free" }],
    });
    await expect(sendInvoice(draft.id)).resolves.toMatchObject({ status: "sent" });
    await expect(copyLastInvoice("fam-1")).resolves.toMatchObject({ status: "draft" });
    await expect(billNextTerm("demo", "2027-term-2")).rejects.toThrow(/Pro/i);
    await setStudioPlan("pro");
  });
});

describe("due date", () => {
  it("changes due date on unpaid invoices only", async () => {
    const draft = await createInvoice({
      familyId: "fam-2",
      lines: [{ description: "Fee", qty: 1, unitCents: 5000, lineTotalCents: 5000, taxCents: 0, taxCode: "gst_free" }],
    });
    const sent = await sendInvoice(draft.id);
    const updated = await changeDueDate(sent!.id, addDays(PROTOTYPE_TODAY, 21));
    expect(updated.dueDate).toBe(addDays(PROTOTYPE_TODAY, 21));
  });
});
