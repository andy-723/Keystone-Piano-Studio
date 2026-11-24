import { familyInvoiceLink } from "@/lib/studio-mail";
/**
 * Pro CFO pack — margin, unearned tuition, churn, Xero ops UI, GST threshold monitor.
 * Composes billing / schedule / Tax Lite / integrations mocks. Not a ledger or live Xero API.
 */

import { addDays, melbourneIso } from "@/lib/calendar";
import { eachDateInclusive, inRange } from "@/lib/snapshot-range";
import { studioToday } from "@/lib/studio-clock";
import {
  families,
  invoices,
  lessonTypes,
  payments,
  practiceLogs,
  studio,
  students,
  teacher,
  weeklySlots,
} from "@/mocks/data";
import { integrationState } from "@/mocks/integrations";
import {
  GST_TURNOVER_THRESHOLD_CENTS,
  proCfoGstProjection,
  proCfoTeachers,
  proCfoXeroQueue,
  proCfoXeroStickyFails,
  type ProCfoTeacher,
  type ProCfoXeroQueueItem,
  type ProCfoXeroQueueStatus,
} from "@/mocks/pro-cfo";
import { creditLedger } from "@/mocks/scheduling";
import { taxLiteExpenses } from "@/mocks/tax-lite";
import type { Invoice } from "@/mocks/types";
import { enrichInvoice, getInvoices } from "@/services/billing";
import { getOrCreateFamilyConversation, sendMessage } from "@/services/chat";
import { connectXero, pushInvoiceToXero } from "@/services/integrations";
import { proFeaturesEnabled } from "@/services/plans";
import { listDayLessonsSync } from "@/services/schedule";
import { getTaxLiteStripeSummary } from "@/services/tax-lite";
import { isLiveStudio } from "@/lib/studio-workspace";
import { taxLiteFyBounds } from "@/lib/tax-lite-fy";
import { priceFor } from "@/lib/term-billing";
import { creditLots } from "@/lib/makeup-credits";
import { getLiveXeroStatus, syncLiveXeroNow } from "@/services/integrations";
import { loadLiveLessonFacts, reloadLiveXeroStamps, type LiveLessonFact } from "@/services/live/tax-store";
import { saveLiveStudioDetails, studioSnapshot } from "@/services/live/studio-store";
import type { IntegrationState } from "@/mocks/integrations";
import { respond } from "./_delay";

const QUIET_PRACTICE_DAYS = 14;
const PRACTICE_THRESHOLD_MIN = 240;
const UNEARNED_LOOKAHEAD_DAYS = 84;
const ROLLING_DAYS = 365;

export type ProCfoPulse = {
  grossCollectedCents: number;
  stripeFeesCents: number;
  netCashCents: number;
  teacherPayoutCents: number;
  taxLiteExpenseCents: number;
  /** Tuition net after contractor splits; solo studios use net after Tax Lite expenses. */
  studioMarginCents: number;
  marginMode: "multi_teacher" | "solo";
  unearnedTuitionCents: number;
  unearnedLessonCount: number;
};

export type ProCfoXeroHealth = {
  connected: boolean;
  mockConnected: boolean;
  organisationName: string | null;
  lastSyncedAt: string | null;
  gstRegistered: boolean;
  gstCollectedCents: number;
  gstCreditsCents: number;
  /** Estimated net GST (collected less credits), cash basis. GST only, not a BAS figure (T-07). */
  basEstimateCents: number;
  basis: "cash";
  label: string;
};

export type ProCfoAtRiskRow = {
  studentId: string;
  name: string;
  familyId: string;
  familyName: string;
  missedLessons: number;
  practiceMinutes: number;
  lastPracticeDate: string | null;
  reason: string;
};

export type ProCfoMakeupRow = {
  studentId: string;
  name: string;
  familyName: string;
  creditBalance: number;
  unitCents: number;
  liabilityCents: number;
};

export type ProCfoRevenueChurn = {
  earnedCents: number;
  collectedCents: number;
  earnedLessonCount: number;
  atRisk: ProCfoAtRiskRow[];
  makeupCredits: ProCfoMakeupRow[];
  makeupLiabilityCents: number;
};

export type ProCfoXeroQueueRow = {
  id: string;
  invoiceId: string;
  number: string;
  familyName: string;
  totalCents: number;
  status: ProCfoXeroQueueStatus;
  lastError?: string | undefined;
  attemptedAt?: string;
};

export type ProCfoPayoutRow = {
  teacherId: string;
  name: string;
  kind: ProCfoTeacher["kind"];
  lessonsTaught: number;
  rateCentsPerLesson: number;
  payoutCents: number;
  abn?: string;
};

export type ProCfoOverdueChaseRow = {
  invoiceId: string;
  number: string;
  familyId: string;
  familyName: string;
  balanceCents: number;
  daysOverdue: number;
  dueDate: string;
};

/** GST threshold monitor (T-01): past 12 months from payments, next 12 months from the owner's estimate. */
export type ProCfoGstRadar = {
  rolling12mTurnoverCents: number;
  /** Owner's estimate of the next 12 months, or null when not entered. */
  projectedNext12mCents: number | null;
  thresholdCents: number;
  percentOfThreshold: number;
  /** Past 12 months reached the threshold. */
  overThreshold: boolean;
  /** Projected next 12 months reaches the threshold. */
  projectedOverThreshold: boolean;
  /** Within 10% of the threshold on either test, or over it. */
  nearThreshold: boolean;
  softPreview: boolean;
};

export type ProCfoPack = {
  asOf: string;
  windowStart: string;
  windowEnd: string;
  proEnabled: boolean;
  pulse: ProCfoPulse;
  xeroHealth: ProCfoXeroHealth;
  revenueChurn: ProCfoRevenueChurn;
  xeroQueue: ProCfoXeroQueueRow[];
  payouts: ProCfoPayoutRow[];
  overdue: ProCfoOverdueChaseRow[];
  gstRadar: ProCfoGstRadar;
  /** Real studio data (not the demo). Payouts are hidden until contractor rates exist. */
  live?: boolean;
  /** Real studios: lessons counted whose length has no price in Settings, Lesson prices. */
  unpricedLessonCount?: number;
  /** Real studios: online payments Stripe hasn't reported a fee for yet. */
  missingFeeCount?: number;
};

function csvEscape(value: string | number): string {
  const text = String(value);
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function familyName(familyId: string) {
  return families.find((family) => family.id === familyId)?.displayName ?? "Family";
}

function unitCentsForStudent(studentId: string): number {
  const slot = weeklySlots.find((entry) => entry.studentId === studentId);
  const lessonType = lessonTypes.find((entry) => entry.id === slot?.lessonTypeId) ?? lessonTypes[0];
  return lessonType?.priceCents ?? 4900;
}

function creditBalance(studentId: string): number {
  return creditLedger
    .filter((entry) => entry.studentId === studentId)
    .reduce((sum, entry) => sum + entry.amount, 0);
}

function rollingWindow(today = studioToday()) {
  return { start: addDays(today, -(ROLLING_DAYS - 1)), end: today };
}

function buildPayouts(): ProCfoPayoutRow[] {
  return proCfoTeachers.map((teacher) => ({
    teacherId: teacher.id,
    name: teacher.name,
    kind: teacher.kind,
    lessonsTaught: teacher.lessonsTaught,
    rateCentsPerLesson: teacher.rateCentsPerLesson,
    payoutCents:
      teacher.kind === "contractor" ? teacher.lessonsTaught * teacher.rateCentsPerLesson : 0,
    ...(teacher.abn ? { abn: teacher.abn } : {}),
  }));
}

function buildUnearned(today: string): { unearnedTuitionCents: number; unearnedLessonCount: number } {
  let unearnedLessonCount = 0;
  let unearnedTuitionCents = 0;
  const end = addDays(today, UNEARNED_LOOKAHEAD_DAYS);
  const prepaidFamilies = new Set(
    invoices
      .filter((invoice) => {
        if (invoice.status === "draft" || invoice.status === "void") return false;
        const paid = payments
          .filter((payment) => payment.invoiceId === invoice.id && payment.amountCents > 0)
          .reduce((sum, payment) => sum + payment.amountCents, 0);
        return paid > 0;
      })
      .map((invoice) => invoice.familyId),
  );

  for (const slot of weeklySlots) {
    const student = students.find((entry) => entry.id === slot.studentId);
    if (!student) continue;
    if (!prepaidFamilies.has(student.familyId)) continue;
    const unit = unitCentsForStudent(slot.studentId);
    for (const date of eachDateInclusive(addDays(today, 1), end)) {
      const day = listDayLessonsSync(date);
      for (const lesson of day.lessons) {
        if (lesson.studentId !== slot.studentId) continue;
        if (lesson.status === "cancelled_by_studio" || lesson.status === "cancelled_late") continue;
        unearnedLessonCount += 1;
        unearnedTuitionCents += unit;
      }
    }
  }
  return { unearnedTuitionCents, unearnedLessonCount };
}

function buildEarned(start: string, end: string): { earnedCents: number; earnedLessonCount: number } {
  let earnedCents = 0;
  let earnedLessonCount = 0;
  for (const date of eachDateInclusive(start, end)) {
    const day = listDayLessonsSync(date);
    for (const lesson of day.lessons) {
      if (lesson.status !== "attended") continue;
      earnedLessonCount += 1;
      earnedCents += lesson.lessonType.priceCents;
    }
  }
  return { earnedCents, earnedLessonCount };
}

function buildCollected(start: string, end: string): number {
  return payments
    .filter(
      (payment) =>
        payment.amountCents > 0 &&
        !payment.reversesPaymentId &&
        inRange(payment.receivedOn ?? payment.date ?? "", start, end),
    )
    .reduce((sum, payment) => sum + payment.amountCents, 0);
}

function buildAtRisk(start: string, end: string): ProCfoAtRiskRow[] {
  const quietSince = addDays(end, -QUIET_PRACTICE_DAYS + 1);
  const missedByStudent = new Map<string, number>();
  for (const date of eachDateInclusive(start, end)) {
    const day = listDayLessonsSync(date);
    for (const lesson of day.lessons) {
      if (lesson.status === "absent" || lesson.status === "cancelled_late") {
        missedByStudent.set(lesson.studentId, (missedByStudent.get(lesson.studentId) ?? 0) + 1);
      }
    }
  }

  const rows: ProCfoAtRiskRow[] = [];
  for (const student of students) {
    const missed = missedByStudent.get(student.id) ?? 0;
    if (missed < 1) continue;
    const logs = practiceLogs.filter(
      (log) =>
        log.studentId === student.id &&
        log.loggedBy === "student" &&
        inRange(log.date, start, end),
    );
    const practiceMinutes = logs.reduce((sum, log) => sum + log.minutes, 0);
    const lastPracticeDate =
      practiceLogs
        .filter((log) => log.studentId === student.id && log.loggedBy === "student" && log.date <= end)
        .map((log) => log.date)
        .sort()
        .at(-1) ?? null;
    const quiet = !lastPracticeDate || lastPracticeDate < quietSince;
    const below = practiceMinutes < PRACTICE_THRESHOLD_MIN;
    if (!quiet && !below) continue;
    const reasons = [`${missed} missed lesson${missed === 1 ? "" : "s"}`];
    if (quiet) reasons.push(`No practice in ${QUIET_PRACTICE_DAYS} days`);
    if (below) reasons.push(`Below ${PRACTICE_THRESHOLD_MIN} min practice`);
    rows.push({
      studentId: student.id,
      name: `${student.firstName} ${student.lastName}`,
      familyId: student.familyId,
      familyName: familyName(student.familyId),
      missedLessons: missed,
      practiceMinutes,
      lastPracticeDate,
      reason: reasons.join(" · "),
    });
  }
  return rows.sort((a, b) => b.missedLessons - a.missedLessons || a.name.localeCompare(b.name));
}

function buildMakeupCredits(): { rows: ProCfoMakeupRow[]; liabilityCents: number } {
  const rows: ProCfoMakeupRow[] = [];
  for (const student of students) {
    const balance = creditBalance(student.id);
    if (balance <= 0) continue;
    const unitCents = unitCentsForStudent(student.id);
    rows.push({
      studentId: student.id,
      name: `${student.firstName} ${student.lastName}`,
      familyName: familyName(student.familyId),
      creditBalance: balance,
      unitCents,
      liabilityCents: balance * unitCents,
    });
  }
  rows.sort((a, b) => b.liabilityCents - a.liabilityCents || a.name.localeCompare(b.name));
  return {
    rows,
    liabilityCents: rows.reduce((sum, row) => sum + row.liabilityCents, 0),
  };
}

function gstOnInclusive(amountCents: number): number {
  return Math.round(amountCents / 11);
}

function buildXeroHealth(today: string): ProCfoXeroHealth {
  const xero = integrationState.demo.xero;
  const connected = xero.status === "connected";
  const mockConnected = !connected;
  const issued = invoices.filter(
    (invoice) => invoice.status !== "draft" && invoice.status !== "void" && invoice.isTaxInvoice,
  );
  let gstCollectedCents = 0;
  for (const invoice of issued) {
    const paid = payments
      .filter((payment) => payment.invoiceId === invoice.id && payment.amountCents > 0)
      .reduce((sum, payment) => sum + payment.amountCents, 0);
    if (paid <= 0) continue;
    const share = Math.min(1, paid / Math.max(invoice.totalCents, 1));
    gstCollectedCents += Math.round((invoice.taxCents ?? 0) * share);
  }
  const gstCreditsCents = taxLiteExpenses
    .filter((expense) => expense.includesGst && !expense.passThroughStudentId)
    .reduce((sum, expense) => sum + gstOnInclusive(expense.amountCents), 0);
  const basEstimateCents = Math.max(0, gstCollectedCents - gstCreditsCents);
  return {
    connected: connected || mockConnected,
    mockConnected,
    organisationName: connected
      ? xero.organisationName
      : "Clarke Piano Studio (mock Xero)",
    lastSyncedAt: connected
      ? xero.lastSyncedAt
      : melbourneIso(today, "10:28"),
    gstRegistered: Boolean(studio.gstRegistered),
    gstCollectedCents,
    gstCreditsCents,
    basEstimateCents,
    basis: "cash",
    label: connected
      ? `Xero connected · ${xero.organisationName ?? "organisation"}`
      : "Xero connected (mock) · GST health OK",
  };
}

function buildXeroQueue(): ProCfoXeroQueueRow[] {
  const byInvoice = new Map<string, ProCfoXeroQueueItem>();
  for (const item of proCfoXeroQueue) byInvoice.set(item.invoiceId, item);

  const rows: ProCfoXeroQueueRow[] = [];
  for (const invoice of invoices) {
    if (invoice.status === "draft" || invoice.status === "void") continue;
    const forced = byInvoice.get(invoice.id);
    let status: ProCfoXeroQueueStatus = invoice.xeroSyncedAt ? "synced" : "pending";
    let lastError: string | undefined;
    let attemptedAt: string | undefined;
    if (forced) {
      status = forced.status;
      lastError = forced.lastError;
      attemptedAt = forced.attemptedAt;
      if (forced.status === "synced") status = "synced";
    } else if (invoice.xeroSyncedAt) {
      status = "synced";
      attemptedAt = invoice.xeroSyncedAt;
    }
    if (status === "synced" && !forced) continue;
    rows.push({
      id: forced?.id ?? `xero-q-${invoice.id}`,
      invoiceId: invoice.id,
      number: invoice.number ?? invoice.id,
      familyName: familyName(invoice.familyId),
      totalCents: invoice.totalCents,
      status,
      ...(lastError ? { lastError } : {}),
      ...(attemptedAt ? { attemptedAt } : {}),
    });
  }

  // Ensure seeded fails appear even if invoice already synced in other tests
  for (const forced of proCfoXeroQueue) {
    if (rows.some((row) => row.invoiceId === forced.invoiceId)) continue;
    const invoice = invoices.find((entry) => entry.id === forced.invoiceId);
    if (!invoice || invoice.status === "draft" || invoice.status === "void") continue;
    rows.push({
      id: forced.id,
      invoiceId: invoice.id,
      number: invoice.number ?? invoice.id,
      familyName: familyName(invoice.familyId),
      totalCents: invoice.totalCents,
      status: forced.status,
      ...(forced.lastError ? { lastError: forced.lastError } : {}),
      ...(forced.attemptedAt ? { attemptedAt: forced.attemptedAt } : {}),
    });
  }

  const order: Record<ProCfoXeroQueueStatus, number> = { failed: 0, pending: 1, synced: 2 };
  return rows.sort(
    (a, b) => order[a.status] - order[b.status] || a.number.localeCompare(b.number),
  );
}

function buildOverdue(today: string): ProCfoOverdueChaseRow[] {
  return getInvoicesSync(today)
    .filter((invoice) => invoice.isOverdue)
    .map((invoice) => ({
      invoiceId: invoice.id,
      number: invoice.number ?? "—",
      familyId: invoice.familyId,
      familyName: familyName(invoice.familyId),
      balanceCents: invoice.balanceCents ?? invoice.totalCents,
      daysOverdue: invoice.daysOverdue ?? 0,
      dueDate: invoice.dueDate,
    }))
    .sort((a, b) => b.daysOverdue - a.daysOverdue);
}

function getInvoicesSync(today: string): Invoice[] {
  // enrich without async — mirror getInvoices mapping
  return invoices.map((invoice) => enrichInvoice(invoice, today));
}

function buildGstRadar(start: string, end: string, softPreview: boolean): ProCfoGstRadar {
  const rolling12mTurnoverCents = payments
    .filter(
      (payment) =>
        payment.amountCents > 0 &&
        !payment.reversesPaymentId &&
        inRange(payment.receivedOn ?? payment.date ?? "", start, end),
    )
    .reduce((sum, payment) => sum + (payment.grossAmountCents ?? payment.amountCents), 0);
  const projectedNext12mCents = isLiveStudio()
    ? (studio.gstNext12mEstimateCents ?? null)
    : proCfoGstProjection.next12mCents;
  const highest = Math.max(rolling12mTurnoverCents, projectedNext12mCents ?? 0);
  const percentOfThreshold =
    Math.round((rolling12mTurnoverCents / GST_TURNOVER_THRESHOLD_CENTS) * 1000) / 10;
  return {
    rolling12mTurnoverCents,
    projectedNext12mCents,
    thresholdCents: GST_TURNOVER_THRESHOLD_CENTS,
    percentOfThreshold,
    overThreshold: rolling12mTurnoverCents >= GST_TURNOVER_THRESHOLD_CENTS,
    projectedOverThreshold: (projectedNext12mCents ?? 0) >= GST_TURNOVER_THRESHOLD_CENTS,
    nearThreshold: highest >= GST_TURNOVER_THRESHOLD_CENTS * 0.9,
    softPreview,
  };
}

/** Owner enters what they expect to earn over the next 12 months (T-01: projected turnover test). */
export async function setProCfoProjectedTurnover(cents: number | null): Promise<number | null> {
  if (cents !== null && (!Number.isFinite(cents) || cents < 0)) {
    throw new Error("Enter a dollar amount of zero or more");
  }
  const value = cents === null ? null : Math.round(cents);
  if (isLiveStudio()) {
    const before = studioSnapshot();
    studio.gstNext12mEstimateCents = value;
    await saveLiveStudioDetails(before);
    return value;
  }
  proCfoGstProjection.next12mCents = value;
  return respond(proCfoGstProjection.next12mCents);
}

export async function getProCfoPack(today = studioToday()): Promise<ProCfoPack> {
  if (isLiveStudio()) return getLiveProCfoPack(today);
  const { start, end } = rollingWindow(today);
  const proEnabled = proFeaturesEnabled();
  const stripe = await getTaxLiteStripeSummary("ytd");
  const payouts = buildPayouts();
  const teacherPayoutCents = payouts.reduce((sum, row) => sum + row.payoutCents, 0);
  const taxLiteExpenseCents = taxLiteExpenses
    .filter((expense) => !expense.passThroughStudentId)
    .reduce((sum, expense) => sum + expense.amountCents, 0);
  const multiTeacher = teacherPayoutCents > 0;
  const studioMarginCents = multiTeacher
    ? stripe.netCents - teacherPayoutCents
    : stripe.netCents - taxLiteExpenseCents;
  const unearned = buildUnearned(today);
  const earned = buildEarned(start, end);
  const collectedCents = buildCollected(start, end);
  const makeup = buildMakeupCredits();

  // Warm invoice enrich path used by overdue chase
  await getInvoices();

  return respond({
    asOf: today,
    windowStart: start,
    windowEnd: end,
    proEnabled,
    pulse: {
      grossCollectedCents: stripe.grossTuitionCents,
      stripeFeesCents: stripe.merchantFeesCents,
      netCashCents: stripe.netCents,
      teacherPayoutCents,
      taxLiteExpenseCents,
      studioMarginCents,
      marginMode: multiTeacher ? "multi_teacher" : "solo",
      unearnedTuitionCents: unearned.unearnedTuitionCents,
      unearnedLessonCount: unearned.unearnedLessonCount,
    },
    xeroHealth: buildXeroHealth(today),
    revenueChurn: {
      earnedCents: earned.earnedCents,
      collectedCents,
      earnedLessonCount: earned.earnedLessonCount,
      atRisk: buildAtRisk(start, end),
      makeupCredits: makeup.rows,
      makeupLiabilityCents: makeup.liabilityCents,
    },
    xeroQueue: buildXeroQueue(),
    payouts,
    overdue: buildOverdue(today),
    gstRadar: buildGstRadar(start, end, !proEnabled),
  });
}

export async function retryXeroQueueItem(invoiceId: string) {
  if (!proFeaturesEnabled()) throw new Error("Xero retry is available on Pro.");
  if (isLiveStudio()) {
    // Real studios: the same push as Settings, Sync now (every unsent invoice and payment).
    await syncLiveXeroNow();
    await reloadLiveXeroStamps();
    const synced = Boolean(invoices.find((entry) => entry.id === invoiceId)?.xeroSyncedAt);
    return { ok: synced, invoiceId, status: synced ? ("synced" as const) : ("failed" as const) };
  }
  const xero = integrationState.demo.xero;
  if (xero.status !== "connected") await connectXero();

  const existing = proCfoXeroQueue.find((item) => item.invoiceId === invoiceId);
  const attemptedAt = melbourneIso(studioToday(), "11:05");

  if (proCfoXeroStickyFails.has(invoiceId)) {
    proCfoXeroStickyFails.delete(invoiceId);
    if (existing) {
      existing.status = "failed";
      existing.lastError = "Retry failed — mock transient error. Try again.";
      existing.attemptedAt = attemptedAt;
    } else {
      proCfoXeroQueue.push({
        id: `xero-q-${invoiceId}`,
        invoiceId,
        status: "failed",
        lastError: "Retry failed — mock transient error. Try again.",
        attemptedAt,
      });
    }
    return respond({ ok: false as const, invoiceId, status: "failed" as const });
  }

  const result = await pushInvoiceToXero(invoiceId);
  if (!result.synced) {
    if (existing) {
      existing.status = "failed";
      existing.lastError = "Could not push invoice to Xero (mock)";
      existing.attemptedAt = attemptedAt;
    }
    return respond({ ok: false as const, invoiceId, status: "failed" as const });
  }

  if (existing) {
    existing.status = "synced";
    existing.lastError = undefined;
    existing.attemptedAt = result.syncedAt ?? attemptedAt;
  } else {
    proCfoXeroQueue.push({
      id: `xero-q-${invoiceId}`,
      invoiceId,
      status: "synced",
      attemptedAt: result.syncedAt ?? attemptedAt,
    });
  }
  return respond({ ok: true as const, invoiceId, status: "synced" as const });
}

export function teacherRemittanceCsv(pack: ProCfoPack): { filename: string; csv: string } {
  const lines = [
    ["teacher_id", "name", "kind", "lessons_taught", "rate_cents", "payout_cents", "abn"].join(","),
    ...pack.payouts.map((row) =>
      [
        csvEscape(row.teacherId),
        csvEscape(row.name),
        csvEscape(row.kind),
        row.lessonsTaught,
        row.rateCentsPerLesson,
        row.payoutCents,
        csvEscape(row.abn ?? ""),
      ].join(","),
    ),
    "",
    ["total_contractor_payout_cents", pack.pulse.teacherPayoutCents].join(","),
  ];
  return {
    filename: `keystone-teacher-remittance-${pack.asOf}.csv`,
    csv: `${lines.join("\n")}\n`,
  };
}

/** Mock push of contractor bills to Xero — stamps queue health only. */
export async function pushTeacherBillsToXero() {
  if (!proFeaturesEnabled()) throw new Error("Teacher bill push is available on Pro.");
  if (isLiveStudio()) throw new Error("Contractor payouts aren't set up for your studio yet.");
  if (integrationState.demo.xero.status !== "connected") await connectXero();
  integrationState.demo.xero.lastSyncedAt = melbourneIso(studioToday(), "11:20");
  return respond({
    pushed: proCfoTeachers.filter((teacher) => teacher.kind === "contractor").length,
    syncedAt: integrationState.demo.xero.lastSyncedAt,
  });
}

export async function sendOverdueChase(invoiceId: string) {
  const invoice = enrichInvoice(
    invoices.find((entry) => entry.id === invoiceId) ??
      (() => {
        throw new Error("Invoice not found");
      })(),
  );
  if (!invoice.isOverdue) throw new Error("Invoice is not overdue");
  const balance = invoice.balanceCents ?? invoice.totalCents;
  const conversation = await getOrCreateFamilyConversation(invoice.familyId);
  const guardians =
    families.find((family) => family.id === invoice.familyId)?.guardians.map((g) => g.name.split(" ")[0]).join(" and ") ||
    "there";
  const payLink = familyInvoiceLink(invoice.id);
  const body = `Hi ${guardians}, a friendly reminder that invoice ${invoice.number ?? invoice.id} has ${formatDollars(balance)} outstanding (due ${invoice.dueDate}). You can pay securely here: ${payLink}\n\nWarmly,\n${studio.name}`;
  const message = await sendMessage({
    conversationId: conversation.id,
    authorName: teacher.name,
    authorRole: "teacher",
    kind: "text",
    body,
  });
  return respond({
    conversationId: conversation.id,
    messageId: message.id,
    payLink,
  });
}

function formatDollars(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

// ---------------------------------------------------------------------------
// Real studios (0028): the same pack from the studio's own records
// ---------------------------------------------------------------------------

const isMissed = (lesson: LiveLessonFact) =>
  lesson.mark === "absent" || lesson.mark === "cancelled_late";
const isCancelled = (lesson: LiveLessonFact) =>
  lesson.calendarStatus === "cancelled" || (lesson.mark ?? "").startsWith("cancelled_");

function liveXeroHealth(xero: IntegrationState["xero"]): ProCfoXeroHealth {
  const connected = xero.status === "connected";
  const issued = invoices.filter(
    (invoice) => invoice.status !== "draft" && invoice.status !== "void" && invoice.isTaxInvoice,
  );
  let gstCollectedCents = 0;
  for (const invoice of issued) {
    const paid = payments
      .filter((payment) => payment.invoiceId === invoice.id && payment.amountCents > 0)
      .reduce((sum, payment) => sum + payment.amountCents, 0);
    if (paid <= 0) continue;
    const share = Math.min(1, paid / Math.max(invoice.totalCents, 1));
    gstCollectedCents += Math.round((invoice.taxCents ?? 0) * share);
  }
  const gstCreditsCents = taxLiteExpenses
    .filter((expense) => expense.includesGst && !expense.passThroughStudentId)
    .reduce((sum, expense) => sum + gstOnInclusive(expense.amountCents), 0);
  const lastError = xero.live?.lastError ?? null;
  return {
    connected,
    mockConnected: false,
    organisationName: connected ? xero.organisationName : null,
    lastSyncedAt: connected ? xero.lastSyncedAt : null,
    gstRegistered: Boolean(studio.gstRegistered),
    gstCollectedCents,
    gstCreditsCents,
    basEstimateCents: Math.max(0, gstCollectedCents - gstCreditsCents),
    basis: "cash",
    label: connected
      ? `Xero connected · ${xero.organisationName ?? "organisation"}${lastError ? ` · last error: ${lastError}` : ""}`
      : xero.live?.needsReconnect
        ? "Xero needs reconnecting (Settings, Integrations)"
        : "Xero not connected",
  };
}

function liveXeroQueue(xero: IntegrationState["xero"]): ProCfoXeroQueueRow[] {
  if (xero.status !== "connected") return [];
  const lastError = xero.live?.lastError ?? undefined;
  return invoices
    .filter((invoice) => invoice.status !== "draft" && invoice.status !== "void" && !invoice.xeroSyncedAt)
    .map((invoice) => ({
      id: `xero-q-${invoice.id}`,
      invoiceId: invoice.id,
      number: invoice.number ?? "—",
      familyName: familyName(invoice.familyId),
      totalCents: invoice.totalCents,
      status: (lastError ? "failed" : "pending") as ProCfoXeroQueueStatus,
      ...(lastError ? { lastError } : {}),
    }))
    .sort((a, b) => a.number.localeCompare(b.number));
}

async function getLiveProCfoPack(today: string): Promise<ProCfoPack> {
  const { start, end } = rollingWindow(today);
  const proEnabled = proFeaturesEnabled();
  const ytd = taxLiteFyBounds("ytd", today);
  const stripe = await getTaxLiteStripeSummary("ytd");
  const received = payments.filter(
    (payment) =>
      payment.amountCents > 0 &&
      !payment.reversesPaymentId &&
      inRange(payment.receivedOn, ytd.start, ytd.end),
  );
  // D6: every way families pay (bank, cash, Stripe). Fees are Stripe's actual fees only.
  const grossCollectedCents = received.reduce(
    (sum, payment) => sum + (payment.grossAmountCents ?? payment.amountCents),
    0,
  );
  const netCashCents = grossCollectedCents - stripe.merchantFeesCents;
  const taxLiteExpenseCents = taxLiteExpenses
    .filter((expense) => !expense.passThroughStudentId && inRange(expense.date, ytd.start, ytd.end))
    .reduce((sum, expense) => sum + expense.amountCents, 0);

  const lookaheadEnd = addDays(today, UNEARNED_LOOKAHEAD_DAYS);
  const [{ lessons, credits }, xero] = await Promise.all([
    loadLiveLessonFacts(start, lookaheadEnd),
    proEnabled
      ? getLiveXeroStatus().catch(
          () => ({ status: "not_connected", organisationName: null, lastSyncedAt: null }) as IntegrationState["xero"],
        )
      : Promise.resolve({ status: "not_connected", organisationName: null, lastSyncedAt: null } as IntegrationState["xero"]),
  ]);

  // D7: prices come from Settings, Lesson prices, matched on lesson length (as Bill next term).
  let unpriced = 0;
  const priceOf = (durationMin: number) => {
    const cents = priceFor(lessonTypes, durationMin)?.priceCents ?? 0;
    if (!cents) unpriced += 1;
    return cents;
  };
  const studentIds = new Set(students.map((student) => student.id));

  let earnedCents = 0;
  let earnedLessonCount = 0;
  for (const lesson of lessons) {
    if (lesson.date > today || lesson.mark !== "attended") continue;
    earnedLessonCount += 1;
    earnedCents += priceOf(lesson.durationMin);
  }

  const prepaidFamilies = new Set(
    invoices
      .filter((invoice) => invoice.status !== "draft" && invoice.status !== "void")
      .filter((invoice) =>
        payments.some((payment) => payment.invoiceId === invoice.id && payment.amountCents > 0),
      )
      .map((invoice) => invoice.familyId),
  );
  const familyOf = new Map(students.map((student) => [student.id, student.familyId]));
  let unearnedTuitionCents = 0;
  let unearnedLessonCount = 0;
  for (const lesson of lessons) {
    if (lesson.date <= today || lesson.date > lookaheadEnd || isCancelled(lesson)) continue;
    const familyId = familyOf.get(lesson.studentId);
    if (!familyId || !prepaidFamilies.has(familyId)) continue;
    unearnedLessonCount += 1;
    unearnedTuitionCents += priceOf(lesson.durationMin);
  }

  // At risk (D10): missed lessons in the last 12 months and little or no student practice.
  const quietSince = addDays(today, -QUIET_PRACTICE_DAYS + 1);
  const missed = new Map<string, number>();
  for (const lesson of lessons) {
    if (lesson.date > today || lesson.date < start || !isMissed(lesson)) continue;
    missed.set(lesson.studentId, (missed.get(lesson.studentId) ?? 0) + 1);
  }
  const atRisk: ProCfoAtRiskRow[] = [];
  for (const student of students) {
    const count = missed.get(student.id) ?? 0;
    if (count < 1) continue;
    const own = practiceLogs.filter(
      (log) => log.studentId === student.id && log.loggedBy === "student" && log.date <= today,
    );
    const practiceMinutes = own
      .filter((log) => inRange(log.date, start, end))
      .reduce((sum, log) => sum + log.minutes, 0);
    const lastPracticeDate = own.map((log) => log.date).sort().at(-1) ?? null;
    const quiet = !lastPracticeDate || lastPracticeDate < quietSince;
    const below = practiceMinutes < PRACTICE_THRESHOLD_MIN;
    if (!quiet && !below) continue;
    const reasons = [`${count} missed lesson${count === 1 ? "" : "s"}`];
    if (quiet) reasons.push(`No practice in ${QUIET_PRACTICE_DAYS} days`);
    if (below) reasons.push(`Below ${PRACTICE_THRESHOLD_MIN} min practice`);
    atRisk.push({
      studentId: student.id,
      name: `${student.firstName} ${student.lastName}`,
      familyId: student.familyId,
      familyName: familyName(student.familyId),
      missedLessons: count,
      practiceMinutes,
      lastPracticeDate,
      reason: reasons.join(" · "),
    });
  }
  atRisk.sort((a, b) => b.missedLessons - a.missedLessons || a.name.localeCompare(b.name));

  // Make-up credits still to teach, priced at the student's latest lesson length.
  const latestLength = new Map<string, number>();
  for (const lesson of lessons) {
    if (lesson.date <= today && lesson.durationMin > 0) latestLength.set(lesson.studentId, lesson.durationMin);
  }
  for (const lesson of lessons) {
    if (!latestLength.has(lesson.studentId) && lesson.durationMin > 0)
      latestLength.set(lesson.studentId, lesson.durationMin);
  }
  const open = new Map<string, number>();
  for (const lot of creditLots(credits, today)) {
    if (lot.state !== "available" || !studentIds.has(lot.studentId)) continue;
    open.set(lot.studentId, (open.get(lot.studentId) ?? 0) + 1);
  }
  const makeupCredits: ProCfoMakeupRow[] = [];
  for (const [studentId, balance] of open) {
    const student = students.find((entry) => entry.id === studentId);
    if (!student) continue;
    const length = latestLength.get(studentId) ?? 0;
    const unitCents = length ? priceFor(lessonTypes, length)?.priceCents ?? 0 : 0;
    if (!unitCents) unpriced += balance;
    makeupCredits.push({
      studentId,
      name: `${student.firstName} ${student.lastName}`,
      familyName: familyName(student.familyId),
      creditBalance: balance,
      unitCents,
      liabilityCents: balance * unitCents,
    });
  }
  makeupCredits.sort((a, b) => b.liabilityCents - a.liabilityCents || a.name.localeCompare(b.name));

  return {
    asOf: today,
    windowStart: start,
    windowEnd: end,
    proEnabled,
    live: true,
    unpricedLessonCount: unpriced,
    missingFeeCount: stripe.missingFeeCount,
    pulse: {
      grossCollectedCents,
      stripeFeesCents: stripe.merchantFeesCents,
      netCashCents,
      teacherPayoutCents: 0,
      taxLiteExpenseCents,
      studioMarginCents: netCashCents - taxLiteExpenseCents,
      marginMode: "solo",
      unearnedTuitionCents,
      unearnedLessonCount,
    },
    xeroHealth: liveXeroHealth(xero),
    revenueChurn: {
      earnedCents,
      collectedCents: buildCollected(start, end),
      earnedLessonCount,
      atRisk,
      makeupCredits,
      makeupLiabilityCents: makeupCredits.reduce((sum, row) => sum + row.liabilityCents, 0),
    },
    xeroQueue: proEnabled ? liveXeroQueue(xero) : [],
    payouts: [],
    overdue: buildOverdue(today),
    gstRadar: buildGstRadar(start, end, !proEnabled),
  };
}
