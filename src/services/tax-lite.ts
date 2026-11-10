/**
 * Tax Lite — Starter Accounting Lite (not a second Xero / general ledger).
 * Pass-through expenses, Stripe gross vs fees, home-studio hours, EOFY CSV.
 */

import { PROTOTYPE_TODAY } from "@/lib/calendar";
import { eachDateInclusive, inRange } from "@/lib/snapshot-range";
import {
  australianFyLabel,
  australianFyStartYear,
  taxLiteFyBounds,
  type TaxLiteFyBounds,
  type TaxLiteFyKey,
} from "@/lib/tax-lite-fy";
import { families, payments, students } from "@/mocks/data";
import {
  TAX_LITE_CATEGORIES,
  TAX_LITE_CENTS_PER_KM,
  TAX_LITE_WFH_CENTS_PER_HOUR,
  taxLiteAdminHoursByFy,
  taxLiteExpenses,
  taxLiteKmEntries,
  type TaxLiteCategory,
  type TaxLiteExpense,
  type TaxLiteKmEntry,
} from "@/mocks/tax-lite";
import type { Invoice, InvoiceLine, Payment, PaymentMethod } from "@/mocks/types";
import { createInvoice, getInvoices, updateDraft } from "@/services/billing";
import { listDayLessonsSync } from "@/services/schedule";
import { respond } from "./_delay";

const STRIPE_METHODS: PaymentMethod[] = ["stripe_card", "stripe_becs", "stripe_payto"];

export type StripeFeeSource = "stored" | "derived";

export type TaxLiteStripeRow = {
  paymentId: string;
  invoiceId: string;
  receivedOn: string;
  method: PaymentMethod;
  grossCents: number;
  feeCents: number;
  netCents: number;
  feeSource: StripeFeeSource;
};

export type TaxLiteStripeSummary = {
  bounds: TaxLiteFyBounds;
  grossTuitionCents: number;
  merchantFeesCents: number;
  netCents: number;
  paymentCount: number;
  storedFeeCount: number;
  derivedFeeCount: number;
  rows: TaxLiteStripeRow[];
};

export type TaxLiteHomeStudioHours = {
  bounds: TaxLiteFyBounds;
  teachingHours: number;
  adminHours: number;
  totalHours: number;
  estimateCents: number;
  centsPerHour: number;
  lessonCount: number;
};

export type TaxLitePack = {
  bounds: TaxLiteFyBounds;
  stripe: TaxLiteStripeSummary;
  expenses: TaxLiteExpense[];
  expenseTotalCents: number;
  homeStudio: TaxLiteHomeStudioHours;
  kmEntries: TaxLiteKmEntry[];
  kmTotal: number;
  kmEstimateCents: number;
};

function csvEscape(value: string | number): string {
  const text = String(value);
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function isStripeMethod(method: PaymentMethod): boolean {
  return STRIPE_METHODS.includes(method);
}

/** AU-ish mock fee when webhook fields are missing — always labelled derived. */
export function deriveStripeFeeCents(method: PaymentMethod, grossCents: number): number {
  if (method === "stripe_card") return Math.round(grossCents * 0.017) + 30;
  if (method === "stripe_becs" || method === "stripe_payto") return Math.round(grossCents * 0.01) + 30;
  return 0;
}

function feeForPayment(payment: Payment): {
  grossCents: number;
  feeCents: number;
  netCents: number;
  feeSource: StripeFeeSource;
} {
  const gross = payment.grossAmountCents ?? Math.max(0, payment.amountCents);
  if (
    typeof payment.stripeFeeCents === "number" &&
    Number.isFinite(payment.stripeFeeCents) &&
    payment.stripeFeeCents >= 0
  ) {
    const fee = payment.stripeFeeCents;
    const net =
      typeof payment.netPayoutCents === "number" ? payment.netPayoutCents : gross - fee;
    return { grossCents: gross, feeCents: fee, netCents: net, feeSource: "stored" };
  }
  const fee = deriveStripeFeeCents(payment.method, gross);
  return { grossCents: gross, feeCents: fee, netCents: gross - fee, feeSource: "derived" };
}

function openDraftForFamily(familyId: string, invoices: Invoice[]): Invoice | undefined {
  return invoices.find((invoice) => invoice.familyId === familyId && invoice.status === "draft");
}

function reimbursementLine(input: {
  description: string;
  amountCents: number;
  includesGst: boolean;
  studentId?: string;
}): InvoiceLine {
  return {
    description: input.description.includes("reimbursement")
      ? input.description
      : `${input.description} (reimbursement)`,
    qty: 1,
    unitCents: input.amountCents,
    lineTotalCents: input.amountCents,
    taxCents: 0,
    taxCode: input.includesGst ? "taxable" : "gst_free",
    lineKind: "reimbursement",
    ...(input.studentId ? { studentId: input.studentId } : {}),
  };
}

export function listTaxLiteCategories(): readonly TaxLiteCategory[] {
  return TAX_LITE_CATEGORIES;
}

export async function listTaxLiteExpenses(fy: TaxLiteFyKey = "ytd"): Promise<TaxLiteExpense[]> {
  const bounds = taxLiteFyBounds(fy);
  return respond(
    taxLiteExpenses
      .filter((expense) => inRange(expense.date, bounds.start, bounds.end))
      .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id)),
  );
}

export async function logTaxLiteExpense(input: {
  date: string;
  vendor: string;
  category: TaxLiteCategory;
  amountCents: number;
  includesGst?: boolean;
  notes?: string;
  /** Pass this cost on to a student → reimbursement on next draft. */
  passThroughStudentId?: string;
}): Promise<TaxLiteExpense> {
  const vendor = input.vendor.trim();
  if (!vendor) throw new Error("Enter a vendor");
  if (!TAX_LITE_CATEGORIES.includes(input.category)) throw new Error("Choose a category");
  if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) {
    throw new Error("Enter a positive amount");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) throw new Error("Enter a valid date");

  let passThroughFamilyId: string | undefined;
  let attachedInvoiceId: string | undefined;
  const studentId = input.passThroughStudentId?.trim() || undefined;
  if (studentId) {
    const student = students.find((entry) => entry.id === studentId);
    if (!student) throw new Error("Student not found");
    passThroughFamilyId = student.familyId;
    const invoices = await getInvoices();
    const line = reimbursementLine({
      description: `${vendor} — ${input.category}`,
      amountCents: input.amountCents,
      includesGst: Boolean(input.includesGst),
      studentId,
    });
    const draft = openDraftForFamily(student.familyId, invoices);
    if (draft) {
      const updated = await updateDraft(draft.id, { lines: [...draft.lines, line] });
      attachedInvoiceId = updated.id;
    } else {
      const created = await createInvoice({
        familyId: student.familyId,
        lines: [line],
        issueDate: PROTOTYPE_TODAY,
      });
      attachedInvoiceId = created.id;
    }
  }

  const expense: TaxLiteExpense = {
    id: `tax-exp-${crypto.randomUUID()}`,
    date: input.date,
    vendor,
    category: input.category,
    amountCents: input.amountCents,
    includesGst: Boolean(input.includesGst),
    createdAt: new Date().toISOString(),
    ...(input.notes?.trim() ? { notes: input.notes.trim() } : {}),
    ...(studentId ? { passThroughStudentId: studentId } : {}),
    ...(passThroughFamilyId ? { passThroughFamilyId } : {}),
    ...(attachedInvoiceId ? { attachedInvoiceId } : {}),
  };
  taxLiteExpenses.unshift(expense);
  return respond(expense);
}

export async function getTaxLiteStripeSummary(
  fy: TaxLiteFyKey = "ytd",
): Promise<TaxLiteStripeSummary> {
  const bounds = taxLiteFyBounds(fy);
  const rows: TaxLiteStripeRow[] = [];
  for (const payment of payments) {
    if (payment.amountCents <= 0) continue;
    if (payment.reversesPaymentId) continue;
    if (!isStripeMethod(payment.method)) continue;
    if (!inRange(payment.receivedOn, bounds.start, bounds.end)) continue;
    const fees = feeForPayment(payment);
    rows.push({
      paymentId: payment.id,
      invoiceId: payment.invoiceId,
      receivedOn: payment.receivedOn,
      method: payment.method,
      ...fees,
    });
  }
  rows.sort((a, b) => b.receivedOn.localeCompare(a.receivedOn) || b.paymentId.localeCompare(a.paymentId));
  const grossTuitionCents = rows.reduce((sum, row) => sum + row.grossCents, 0);
  const merchantFeesCents = rows.reduce((sum, row) => sum + row.feeCents, 0);
  return respond({
    bounds,
    grossTuitionCents,
    merchantFeesCents,
    netCents: grossTuitionCents - merchantFeesCents,
    paymentCount: rows.length,
    storedFeeCount: rows.filter((row) => row.feeSource === "stored").length,
    derivedFeeCount: rows.filter((row) => row.feeSource === "derived").length,
    rows,
  });
}

function sumTeachingMinutes(start: string, end: string): { minutes: number; lessonCount: number } {
  let minutes = 0;
  let lessonCount = 0;
  for (const date of eachDateInclusive(start, end)) {
    const day = listDayLessonsSync(date);
    for (const lesson of day.lessons) {
      if (lesson.status === "cancelled_by_studio" || lesson.status === "cancelled_late") continue;
      minutes += lesson.lessonType.durationMin;
      lessonCount += 1;
    }
  }
  return { minutes, lessonCount };
}

export async function getTaxLiteHomeStudioHours(
  fy: TaxLiteFyKey = "ytd",
): Promise<TaxLiteHomeStudioHours> {
  const bounds = taxLiteFyBounds(fy);
  // Cap future FY end at prototype today so we don't invent unscheduled future lessons.
  const teachEnd = bounds.end > PROTOTYPE_TODAY ? PROTOTYPE_TODAY : bounds.end;
  const { minutes, lessonCount } = sumTeachingMinutes(bounds.start, teachEnd);
  const teachingHours = Math.round((minutes / 60) * 100) / 100;
  const adminHours = taxLiteAdminHoursByFy[bounds.fyLabel] ?? 0;
  const totalHours = Math.round((teachingHours + adminHours) * 100) / 100;
  const estimateCents = Math.round(totalHours * TAX_LITE_WFH_CENTS_PER_HOUR);
  return respond({
    bounds,
    teachingHours,
    adminHours,
    totalHours,
    estimateCents,
    centsPerHour: TAX_LITE_WFH_CENTS_PER_HOUR,
    lessonCount,
  });
}

export async function setTaxLiteAdminHours(hours: number, fyLabel?: string): Promise<number> {
  if (!Number.isFinite(hours) || hours < 0) throw new Error("Enter zero or more admin hours");
  const label = fyLabel ?? australianFyLabel(australianFyStartYear());
  const rounded = Math.round(hours * 100) / 100;
  taxLiteAdminHoursByFy[label] = rounded;
  return respond(rounded);
}

export async function listTaxLiteKmEntries(fy: TaxLiteFyKey = "ytd"): Promise<TaxLiteKmEntry[]> {
  const bounds = taxLiteFyBounds(fy);
  return respond(
    taxLiteKmEntries
      .filter((entry) => inRange(entry.date, bounds.start, bounds.end))
      .sort((a, b) => b.date.localeCompare(a.date)),
  );
}

export async function logTaxLiteKm(input: {
  date: string;
  kilometres: number;
  purpose: string;
}): Promise<TaxLiteKmEntry> {
  const purpose = input.purpose.trim();
  if (!purpose) throw new Error("Enter a purpose");
  if (!Number.isFinite(input.kilometres) || input.kilometres <= 0) {
    throw new Error("Enter kilometres driven");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) throw new Error("Enter a valid date");
  const entry: TaxLiteKmEntry = {
    id: `tax-km-${crypto.randomUUID()}`,
    date: input.date,
    kilometres: Math.round(input.kilometres * 10) / 10,
    purpose,
    createdAt: new Date().toISOString(),
  };
  taxLiteKmEntries.unshift(entry);
  return respond(entry);
}

export async function getTaxLitePack(fy: TaxLiteFyKey = "ytd"): Promise<TaxLitePack> {
  const [stripe, expenses, homeStudio, kmEntries] = await Promise.all([
    getTaxLiteStripeSummary(fy),
    listTaxLiteExpenses(fy),
    getTaxLiteHomeStudioHours(fy),
    listTaxLiteKmEntries(fy),
  ]);
  const kmTotal = kmEntries.reduce((sum, entry) => sum + entry.kilometres, 0);
  return respond({
    bounds: stripe.bounds,
    stripe,
    expenses,
    expenseTotalCents: expenses.reduce((sum, expense) => sum + expense.amountCents, 0),
    homeStudio,
    kmEntries,
    kmTotal: Math.round(kmTotal * 10) / 10,
    kmEstimateCents: Math.round(kmTotal * TAX_LITE_CENTS_PER_KM),
  });
}

/** Pass-through picker: active students with family label. */
export async function listTaxLitePassThroughStudents(): Promise<
  Array<{ studentId: string; name: string; familyId: string; familyName: string }>
> {
  const rows = students
    .map((student) => {
      const family = families.find((entry) => entry.id === student.familyId);
      return {
        studentId: student.id,
        name: `${student.firstName} ${student.lastName}`,
        familyId: student.familyId,
        familyName: family?.displayName ?? "Family",
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
  return respond(rows);
}

export function taxLiteEofyCsv(pack: TaxLitePack): { filename: string; csv: string } {
  const label = pack.bounds.fyLabel;
  const lines: string[] = [
    ["section", "field", "value", "notes"].map(csvEscape).join(","),
    ["summary", "financial_year", label, `Australia/Sydney · ${pack.bounds.start}–${pack.bounds.end}`]
      .map(csvEscape)
      .join(","),
    ["summary", "range", pack.bounds.key, pack.bounds.key === "ytd" ? "Year to date" : "Full FY"]
      .map(csvEscape)
      .join(","),
    ["stripe", "gross_tuition_cents", pack.stripe.grossTuitionCents, "Cash basis · Stripe methods only"]
      .map(csvEscape)
      .join(","),
    [
      "stripe",
      "merchant_fees_cents",
      pack.stripe.merchantFeesCents,
      `${pack.stripe.storedFeeCount} stored · ${pack.stripe.derivedFeeCount} derived estimates`,
    ]
      .map(csvEscape)
      .join(","),
    ["stripe", "net_cents", pack.stripe.netCents, ""].map(csvEscape).join(","),
    ["expenses", "total_cents", pack.expenseTotalCents, "Tax Lite log (not a full ledger)"]
      .map(csvEscape)
      .join(","),
    [
      "home_studio",
      "teaching_hours",
      pack.homeStudio.teachingHours,
      `${pack.homeStudio.lessonCount} scheduled/taught lessons`,
    ]
      .map(csvEscape)
      .join(","),
    ["home_studio", "admin_hours", pack.homeStudio.adminHours, "Manual admin claim"].map(csvEscape).join(","),
    [
      "home_studio",
      "total_hours",
      pack.homeStudio.totalHours,
      `ATO Fixed Rate ${pack.homeStudio.centsPerHour}c/hr`,
    ]
      .map(csvEscape)
      .join(","),
    ["home_studio", "estimate_cents", pack.homeStudio.estimateCents, ""].map(csvEscape).join(","),
    ["vehicle", "kilometres", pack.kmTotal, `${TAX_LITE_CENTS_PER_KM}c/km estimate`].map(csvEscape).join(","),
    ["vehicle", "estimate_cents", pack.kmEstimateCents, "Optional light log"].map(csvEscape).join(","),
  ];

  lines.push(["", "", "", ""].join(","));
  lines.push(
    ["expense_id", "date", "vendor", "category", "amount_cents", "includes_gst", "pass_through_student", "invoice_id"]
      .map(csvEscape)
      .join(","),
  );
  for (const expense of pack.expenses) {
    lines.push(
      [
        expense.id,
        expense.date,
        expense.vendor,
        expense.category,
        expense.amountCents,
        expense.includesGst ? "yes" : "no",
        expense.passThroughStudentId ?? "",
        expense.attachedInvoiceId ?? "",
      ]
        .map(csvEscape)
        .join(","),
    );
  }

  lines.push(["", "", "", ""].join(","));
  lines.push(
    ["payment_id", "received_on", "method", "gross_cents", "fee_cents", "net_cents", "fee_source"]
      .map(csvEscape)
      .join(","),
  );
  for (const row of pack.stripe.rows) {
    lines.push(
      [
        row.paymentId,
        row.receivedOn,
        row.method,
        row.grossCents,
        row.feeCents,
        row.netCents,
        row.feeSource,
      ]
        .map(csvEscape)
        .join(","),
    );
  }

  return {
    filename: `keystone-tax-lite-${label}-${pack.bounds.key}.csv`,
    csv: `${lines.join("\n")}\n`,
  };
}
