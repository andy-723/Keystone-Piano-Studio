import { describe, expect, it, beforeEach } from "vitest";
import { PROTOTYPE_TODAY } from "@/lib/calendar";
import { canViewStudioSnapshot } from "@/lib/app-settings";
import { taxLiteFyBounds } from "@/lib/tax-lite-fy";
import { invoices, payments } from "@/mocks/data";
import { resetTaxLiteState, taxLiteExpenses } from "@/mocks/tax-lite";
import {
  getTaxLiteHomeStudioHours,
  getTaxLitePack,
  getTaxLiteStripeSummary,
  logTaxLiteExpense,
  taxLiteEofyCsv,
} from "@/services/tax-lite";

beforeEach(() => {
  resetTaxLiteState();
});

describe("tax lite FY bounds", () => {
  it("uses AU financial year 1 Jul–30 Jun around prototype today", () => {
    const ytd = taxLiteFyBounds("ytd", PROTOTYPE_TODAY);
    expect(ytd).toEqual({
      key: "ytd",
      fyLabel: "2026-27",
      start: "2026-07-01",
      end: PROTOTYPE_TODAY,
      timezone: "Australia/Sydney",
    });
    const fy = taxLiteFyBounds("fy", PROTOTYPE_TODAY);
    expect(fy.start).toBe("2026-07-01");
    expect(fy.end).toBe("2027-06-30");
    expect(fy.fyLabel).toBe("2026-27");
  });
});

describe("tax lite access", () => {
  it("reuses the owner/admin snapshot gate", () => {
    expect(canViewStudioSnapshot("owner")).toBe(true);
    expect(canViewStudioSnapshot("admin")).toBe(true);
    expect(canViewStudioSnapshot("teacher")).toBe(false);
  });
});

describe("stripe gross vs fees", () => {
  it("sums stored Stripe fee fields for YTD", async () => {
    const summary = await getTaxLiteStripeSummary("ytd");
    expect(summary.paymentCount).toBeGreaterThan(0);
    expect(summary.grossTuitionCents).toBeGreaterThan(0);
    expect(summary.merchantFeesCents).toBeGreaterThan(0);
    expect(summary.netCents).toBe(summary.grossTuitionCents - summary.merchantFeesCents);
    expect(summary.storedFeeCount).toBe(summary.paymentCount);
    expect(summary.derivedFeeCount).toBe(0);
    expect(payments.some((payment) => typeof payment.stripeFeeCents === "number")).toBe(true);
  });
});

describe("home studio hours", () => {
  it("estimates Fixed Rate dollars from timetable + admin hours", async () => {
    const hours = await getTaxLiteHomeStudioHours("ytd");
    expect(hours.teachingHours).toBeGreaterThan(0);
    expect(hours.adminHours).toBe(2.5);
    expect(hours.totalHours).toBeGreaterThan(hours.teachingHours);
    expect(hours.centsPerHour).toBe(70);
    expect(hours.estimateCents).toBe(Math.round(hours.totalHours * 70));
  });
});

describe("pass-through expenses", () => {
  it("appends a reimbursement line to the family's open draft", async () => {
    const before = invoices.find((invoice) => invoice.id === "inv-exam-draft");
    expect(before?.status).toBe("draft");
    const lineCount = before?.lines.length ?? 0;

    const expense = await logTaxLiteExpense({
      date: PROTOTYPE_TODAY,
      vendor: "Print Music Shop",
      category: "Teaching materials & pass-throughs",
      amountCents: 3290,
      includesGst: true,
      passThroughStudentId: "stu-1",
      notes: "Theory workbook",
    });

    expect(expense.passThroughFamilyId).toBe("fam-1");
    expect(expense.attachedInvoiceId).toBe("inv-exam-draft");
    const draft = invoices.find((invoice) => invoice.id === "inv-exam-draft");
    expect(draft?.lines.length).toBe(lineCount + 1);
    const line = draft?.lines.at(-1);
    expect(line?.lineKind).toBe("reimbursement");
    expect(line?.lineTotalCents).toBe(3290);
    expect(taxLiteExpenses[0]?.id).toBe(expense.id);
  });
});

describe("EOFY tax pack CSV", () => {
  it("exports gross, fees, expenses and WFH hours", async () => {
    const pack = await getTaxLitePack("ytd");
    const file = taxLiteEofyCsv(pack);
    expect(file.filename).toContain("2026-27");
    expect(file.csv).toContain("gross_tuition_cents");
    expect(file.csv).toContain("merchant_fees_cents");
    expect(file.csv).toContain("teaching_hours");
    expect(file.csv).toContain("expense_id");
    expect(file.csv.split("\n").length).toBeGreaterThan(10);
  });
});
