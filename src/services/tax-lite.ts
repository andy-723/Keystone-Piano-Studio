/**
 * Tax Lite — Starter Accounting Lite (not a second Xero / general ledger).
 * On-charged costs, Stripe gross vs actual fees, confirmed home-studio hours, EOFY summary CSV.
 * Keystone is not a registered tax or BAS agent: figures are estimates from the studio's own data.
 */

import { eachDateInclusive, inRange } from "@/lib/snapshot-range";
import { studioToday } from "@/lib/studio-clock";
import {
  australianFyLabel,
  australianFyStartYear,
  taxLiteFyBounds,
  type TaxLiteFyBounds,
  type TaxLiteFyKey,
} from "@/lib/tax-lite-fy";
import { families, payments, students, studio } from "@/mocks/data";
import { CENTS_PER_KM_CAP_KM, TAX_DISCLAIMER } from "@/lib/tax-copy";
import {
  TAX_LITE_CATEGORIES,
  TAX_LITE_CENTS_PER_KM,
  TAX_LITE_WFH_CENTS_PER_HOUR,
  taxLiteAdminSessions,
  taxLiteExpenses,
  taxLiteKmEntries,
  taxLiteLessonConfirmations,
  type TaxLiteAdminSession,
  type TaxLiteCategory,
  type TaxLiteExpense,
  type TaxLiteKmEntry,
} from "@/mocks/tax-lite";
import type { Invoice, InvoiceLine, Payment, PaymentMethod } from "@/mocks/types";
import { createInvoice, getInvoices, updateDraft } from "@/services/billing";
import { listDayLessonsSync, weekMonday } from "@/services/schedule";
import { respond } from "./_delay";

const STRIPE_METHODS: PaymentMethod[] = ["stripe_card", "stripe_becs", "stripe_payto"];

/** "missing" = Stripe has not reported a fee for this payment yet; Keystone never models one (T-06). */
export type StripeFeeSource = "stored" | "missing";

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
  missingFeeCount: number;
  /** GST included in reported Stripe fees (fee / 11); shown to GST-registered studios as a possible credit. */
  feeGstCents: number;
  gstRegistered: boolean;
  rows: TaxLiteStripeRow[];
};

export type TaxLiteHomeStudioHours = {
  bounds: TaxLiteFyBounds;
  /** Confirmed by the teacher as taught from home. Only these count (T-05). */
  teachingHours: number;
  /** Pre-filled from the timetable; not counted until confirmed. */
  scheduledHours: number;
  pendingLessonCount: number;
  adminHours: number;
  adminSessions: TaxLiteAdminSession[];
  totalHours: number;
  estimateCents: number;
  centsPerHour: number;
  /** Lessons confirmed as taught from home. */
  lessonCount: number;
};

export type TaxLitePendingLesson = {
  lessonId: string;
  date: string;
  startsAt: string;
  studentFirstName: string;
  minutes: number;
};

export type TaxLitePendingWeek = {
  weekStart: string;
  lessons: TaxLitePendingLesson[];
};

export type TaxLitePack = {
  bounds: TaxLiteFyBounds;
  stripe: TaxLiteStripeSummary;
  expenses: TaxLiteExpense[];
  expenseTotalCents: number;
  homeStudio: TaxLiteHomeStudioHours;
  kmEntries: TaxLiteKmEntry[];
  kmTotal: number;
  /** Km counted for the estimate (capped at 5,000 business km). */
  kmCounted: number;
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

/** GST included in a GST-inclusive amount (1/11). */
export function gstIncludedCents(inclusiveCents: number): number {
  return Math.round(inclusiveCents / 11);
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
  // Stripe has not reported a fee yet: never model one from a rate card (T-06).
  return { grossCents: gross, feeCents: 0, netCents: gross, feeSource: "missing" };
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
    description: input.description,
    qty: 1,
    unitCents: input.amountCents,
    lineTotalCents: input.amountCents,
    taxCents: 0,
    // GST on an on-charge follows the studio's registration, not whether the purchase had GST (T-09).
    taxCode: studio.gstRegistered ? "taxable" : "gst_free",
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
        issueDate: studioToday(),
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
    missingFeeCount: rows.filter((row) => row.feeSource === "missing").length,
    feeGstCents: gstIncludedCents(merchantFeesCents),
    gstRegistered: Boolean(studio.gstRegistered),
    rows,
  });
}

type ScheduledLesson = TaxLitePendingLesson;

/** Scheduled (not cancelled) lessons in range: the pre-fill for confirmation, never counted on their own. */
function scheduledLessons(start: string, end: string): ScheduledLesson[] {
  const out: ScheduledLesson[] = [];
  for (const date of eachDateInclusive(start, end)) {
    const day = listDayLessonsSync(date);
    for (const lesson of day.lessons) {
      if (lesson.status === "cancelled_by_studio" || lesson.status === "cancelled_late") continue;
      out.push({
        lessonId: lesson.id,
        date,
        startsAt: lesson.startsAt,
        studentFirstName: lesson.student.firstName,
        minutes: lesson.lessonType.durationMin,
      });
    }
  }
  return out;
}

function teachRange(fy: TaxLiteFyKey) {
  const bounds = taxLiteFyBounds(fy);
  // Never count future lessons: they have not been taught yet.
  const teachEnd = bounds.end > studioToday() ? studioToday() : bounds.end;
  return { bounds, teachEnd };
}

const hoursOf = (minutes: number) => Math.round((minutes / 60) * 100) / 100;

export async function getTaxLiteHomeStudioHours(
  fy: TaxLiteFyKey = "ytd",
): Promise<TaxLiteHomeStudioHours> {
  const { bounds, teachEnd } = teachRange(fy);
  const scheduled = scheduledLessons(bounds.start, teachEnd);
  let confirmedMinutes = 0;
  let lessonCount = 0;
  let pendingLessonCount = 0;
  for (const lesson of scheduled) {
    const confirmation = taxLiteLessonConfirmations[lesson.lessonId];
    if (!confirmation) {
      pendingLessonCount += 1;
      continue;
    }
    if (confirmation.fromHome) {
      confirmedMinutes += confirmation.minutes;
      lessonCount += 1;
    }
  }
  const adminSessions = taxLiteAdminSessions
    .filter((session) => inRange(session.date, bounds.start, bounds.end))
    .sort((a, b) => b.date.localeCompare(a.date));
  const adminHours = Math.round(adminSessions.reduce((sum, row) => sum + row.hours, 0) * 100) / 100;
  const teachingHours = hoursOf(confirmedMinutes);
  const totalHours = Math.round((teachingHours + adminHours) * 100) / 100;
  return respond({
    bounds,
    teachingHours,
    scheduledHours: hoursOf(scheduled.reduce((sum, lesson) => sum + lesson.minutes, 0)),
    pendingLessonCount,
    adminHours,
    adminSessions,
    totalHours,
    estimateCents: Math.round(totalHours * TAX_LITE_WFH_CENTS_PER_HOUR),
    centsPerHour: TAX_LITE_WFH_CENTS_PER_HOUR,
    lessonCount,
  });
}

/** Weeks with lessons still to confirm, most recent first (T-05). */
export async function listTaxLitePendingWeeks(
  fy: TaxLiteFyKey = "ytd",
  limit = 4,
): Promise<TaxLitePendingWeek[]> {
  const { bounds, teachEnd } = teachRange(fy);
  const byWeek = new Map<string, TaxLitePendingLesson[]>();
  for (const lesson of scheduledLessons(bounds.start, teachEnd)) {
    if (taxLiteLessonConfirmations[lesson.lessonId]) continue;
    const week = weekMonday(lesson.date);
    byWeek.set(week, [...(byWeek.get(week) ?? []), lesson]);
  }
  return respond(
    [...byWeek.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .slice(0, limit)
      .map(([weekStart, lessons]) => ({ weekStart, lessons })),
  );
}

/**
 * Teacher confirms which scheduled lessons were actually taught from home (T-05).
 * Lessons in `taughtFromHome` count; lessons in `notFromHome` are recorded and never counted.
 */
export async function confirmTaxLiteLessons(input: {
  taughtFromHome: string[];
  notFromHome?: string[];
}): Promise<number> {
  const all = scheduledLessons("2000-01-01", studioToday());
  const byId = new Map(all.map((lesson) => [lesson.lessonId, lesson]));
  const confirmedAt = new Date().toISOString();
  let count = 0;
  for (const [ids, fromHome] of [
    [input.taughtFromHome, true],
    [input.notFromHome ?? [], false],
  ] as const) {
    for (const id of ids) {
      const lesson = byId.get(id);
      if (!lesson) throw new Error("Only lessons already taught can be confirmed");
      taxLiteLessonConfirmations[id] = { date: lesson.date, minutes: lesson.minutes, fromHome, confirmedAt };
      count += 1;
    }
  }
  return respond(count);
}

/** Log an admin session worked from home, as it happens (T-05). */
export async function addTaxLiteAdminSession(input: {
  date: string;
  hours: number;
  note: string;
}): Promise<TaxLiteAdminSession> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) throw new Error("Enter a valid date");
  if (input.date > studioToday()) throw new Error("Log admin time after you have done it");
  if (!Number.isFinite(input.hours) || input.hours <= 0 || input.hours > 24) {
    throw new Error("Enter the hours you worked, up to 24");
  }
  const note = input.note.trim();
  if (!note) throw new Error("Say what the admin time was for");
  const session: TaxLiteAdminSession = {
    id: `tax-admin-${crypto.randomUUID()}`,
    date: input.date,
    hours: Math.round(input.hours * 100) / 100,
    note,
    createdAt: new Date().toISOString(),
  };
  taxLiteAdminSessions.unshift(session);
  return respond(session);
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
    kmCounted: Math.round(Math.min(kmTotal, CENTS_PER_KM_CAP_KM) * 10) / 10,
    kmEstimateCents: Math.round(Math.min(kmTotal, CENTS_PER_KM_CAP_KM) * TAX_LITE_CENTS_PER_KM),
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
    ["summary", "disclaimer", "", TAX_DISCLAIMER].map(csvEscape).join(","),
    ["summary", "reviewed_by_user", "yes", "Figures reviewed before export. Keystone does not decide what is deductible."]
      .map(csvEscape)
      .join(","),
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
      pack.stripe.missingFeeCount > 0
        ? `Actual fees reported by Stripe · ${pack.stripe.missingFeeCount} payment(s) with no fee reported yet`
        : "Actual fees reported by Stripe",
    ]
      .map(csvEscape)
      .join(","),
    ["stripe", "net_cents", pack.stripe.netCents, ""].map(csvEscape).join(","),
    ...(pack.stripe.gstRegistered
      ? [["stripe", "fee_gst_cents", pack.stripe.feeGstCents, "GST included in Stripe fees (possible GST credit)"].map(csvEscape).join(",")]
      : []),
    ["expenses", "total_cents", pack.expenseTotalCents, "Costs you logged (not a full ledger). On-charged costs are also income on the family invoice."]
      .map(csvEscape)
      .join(","),
    [
      "home_studio",
      "teaching_hours",
      pack.homeStudio.teachingHours,
      `${pack.homeStudio.lessonCount} lessons you confirmed were taught from home`,
    ]
      .map(csvEscape)
      .join(","),
    ["home_studio", "admin_hours", pack.homeStudio.adminHours, `${pack.homeStudio.adminSessions.length} admin sessions logged`].map(csvEscape).join(","),
    ["home_studio", "unconfirmed_lessons", pack.homeStudio.pendingLessonCount, "Scheduled but not confirmed; not counted"].map(csvEscape).join(","),
    [
      "home_studio",
      "total_hours",
      pack.homeStudio.totalHours,
      `Fixed rate method ${pack.homeStudio.centsPerHour}c/hr (actual hours recorded)`,
    ]
      .map(csvEscape)
      .join(","),
    ["home_studio", "estimate_cents", pack.homeStudio.estimateCents, ""].map(csvEscape).join(","),
    ["vehicle", "kilometres", pack.kmTotal, `${TAX_LITE_CENTS_PER_KM}c/km, up to ${CENTS_PER_KM_CAP_KM} km; sole traders only`].map(csvEscape).join(","),
    ["vehicle", "estimate_cents", pack.kmEstimateCents, "Optional light log; companies cannot use cents per km"].map(csvEscape).join(","),
  ];

  lines.push(["", "", "", ""].join(","));
  lines.push(
    ["expense_id", "date", "vendor", "category", "amount_cents", "includes_gst", "on_charged_to_student", "invoice_id"]
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
    filename: `keystone-eofy-summary-${label}-${pack.bounds.key}.csv`,
    csv: `${lines.join("\n")}\n`,
  };
}
