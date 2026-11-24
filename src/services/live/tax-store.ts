/**
 * Live Tax Lite records and Pro CFO lesson facts (0028). Same pattern as the other live stores:
 * loaded at sign-in into the in-memory store the screens already use, and each save goes to
 * Supabase first. Owners and admins only (RLS); other roles load nothing.
 *
 * Stripe fees: the server saves Stripe's actual fee per online payment (payment_stripe_fee).
 * They are copied onto the matching in-memory payments so Tax Lite reads them like the demo does.
 */
import { payments } from "@/mocks/data";
import {
  taxLiteAdminSessions,
  taxLiteExpenses,
  taxLiteKmEntries,
  taxLiteLessonConfirmations,
  type TaxLiteAdminSession,
  type TaxLiteCategory,
  type TaxLiteExpense,
  type TaxLiteKmEntry,
} from "@/mocks/tax-lite";
import { getAuthClient } from "@/lib/auth-client";
import {
  expandLessons,
  addDays,
  type LessonException,
  type LessonSeries,
} from "@/lib/lesson-calendar";
import type { AttendanceStatus, CreditEntry, CreditReason } from "@/lib/makeup-credits";
import { liveStudioId, type StudioWorkspace } from "@/lib/studio-workspace";
import { client, friendly, type Client } from "./client";

const missingTable = (error: { code?: string } | null) =>
  Boolean(error && (error.code === "42P01" || error.code === "PGRST205"));

type ExpenseRow = {
  id: string;
  expense_date: string;
  vendor: string;
  category: TaxLiteCategory;
  amount_cents: number;
  includes_gst: boolean;
  notes: string | null;
  pass_through_student_id: string | null;
  pass_through_family_id: string | null;
  attached_invoice_id: string | null;
  created_at: string;
};
type KmRow = {
  id: string;
  entry_date: string;
  kilometres: number | string;
  purpose: string;
  created_at: string;
};
type AdminRow = {
  id: string;
  session_date: string;
  hours: number | string;
  note: string;
  created_at: string;
};
type HomeRow = {
  occurrence_key: string;
  lesson_date: string;
  minutes: number;
  from_home: boolean;
  confirmed_at: string;
};
type FeeRow = { payment_id: string; gross_cents: number; fee_cents: number; net_cents: number };

export function toExpense(row: ExpenseRow): TaxLiteExpense {
  return {
    id: row.id,
    date: row.expense_date,
    vendor: row.vendor,
    category: row.category,
    amountCents: row.amount_cents,
    includesGst: row.includes_gst,
    createdAt: row.created_at,
    ...(row.notes ? { notes: row.notes } : {}),
    ...(row.pass_through_student_id ? { passThroughStudentId: row.pass_through_student_id } : {}),
    ...(row.pass_through_family_id ? { passThroughFamilyId: row.pass_through_family_id } : {}),
    ...(row.attached_invoice_id ? { attachedInvoiceId: row.attached_invoice_id } : {}),
  };
}

/** Copies Stripe's reported fees onto the in-memory payments (Tax Lite reads them there). */
export function applyStripeFees(rows: FeeRow[]) {
  const byPayment = new Map(rows.map((row) => [row.payment_id, row]));
  for (const payment of payments) {
    const fee = byPayment.get(payment.id);
    if (!fee) continue;
    payment.grossAmountCents = fee.gross_cents;
    payment.stripeFeeCents = fee.fee_cents;
    payment.netPayoutCents = fee.net_cents;
  }
}

/** Fills Tax Lite from this studio's rows. Call after loadLiveBilling (fees attach to payments). */
export async function loadLiveTaxLite(
  workspace: Extract<StudioWorkspace, { mode: "live" }>,
  c: Client,
) {
  if (workspace.role !== "owner" && workspace.role !== "admin") return;
  const studioId = workspace.studioId;
  const [expenseRes, kmRes, adminRes, homeRes, feeRes] = await Promise.all([
    c
      .from("tax_expense")
      .select(
        "id, expense_date, vendor, category, amount_cents, includes_gst, notes, pass_through_student_id, pass_through_family_id, attached_invoice_id, created_at",
      )
      .eq("studio_id", studioId)
      .order("expense_date", { ascending: false }),
    c
      .from("tax_km_entry")
      .select("id, entry_date, kilometres, purpose, created_at")
      .eq("studio_id", studioId)
      .order("entry_date", { ascending: false }),
    c
      .from("tax_admin_session")
      .select("id, session_date, hours, note, created_at")
      .eq("studio_id", studioId)
      .order("session_date", { ascending: false }),
    c
      .from("tax_home_lesson")
      .select("occurrence_key, lesson_date, minutes, from_home, confirmed_at")
      .eq("studio_id", studioId),
    c
      .from("payment_stripe_fee")
      .select("payment_id, gross_cents, fee_cents, net_cents")
      .eq("studio_id", studioId),
  ]);
  const failed = [expenseRes, kmRes, adminRes, homeRes, feeRes].find(
    (res) => res.error && !missingTable(res.error),
  );
  if (failed?.error) console.error("[tax-store] Tax Lite not fully loaded", failed.error.message);
  taxLiteExpenses.push(...((expenseRes.data ?? []) as ExpenseRow[]).map(toExpense));
  taxLiteKmEntries.push(
    ...((kmRes.data ?? []) as KmRow[]).map((row) => ({
      id: row.id,
      date: row.entry_date,
      kilometres: Number(row.kilometres),
      purpose: row.purpose,
      createdAt: row.created_at,
    })),
  );
  taxLiteAdminSessions.push(
    ...((adminRes.data ?? []) as AdminRow[]).map((row) => ({
      id: row.id,
      date: row.session_date,
      hours: Number(row.hours),
      note: row.note,
      createdAt: row.created_at,
    })),
  );
  for (const row of (homeRes.data ?? []) as HomeRow[]) {
    taxLiteLessonConfirmations[row.occurrence_key] = {
      date: row.lesson_date,
      minutes: row.minutes,
      fromHome: row.from_home,
      confirmedAt: row.confirmed_at,
    };
  }
  applyStripeFees((feeRes.data ?? []) as FeeRow[]);
}

function requireStudio(): string {
  const id = liveStudioId();
  if (!id) throw new Error("No studio is open.");
  return id;
}

export async function insertLiveTaxExpense(expense: TaxLiteExpense) {
  const studioId = requireStudio();
  const { error } = await client()
    .from("tax_expense")
    .insert({
      id: expense.id,
      studio_id: studioId,
      expense_date: expense.date,
      vendor: expense.vendor,
      category: expense.category,
      amount_cents: expense.amountCents,
      includes_gst: expense.includesGst,
      notes: expense.notes ?? null,
      pass_through_student_id: expense.passThroughStudentId ?? null,
      pass_through_family_id: expense.passThroughFamilyId ?? null,
      attached_invoice_id: expense.attachedInvoiceId ?? null,
    });
  if (error) throw friendly(error, "Couldn't save this cost. Please try again.");
}

export async function insertLiveTaxKm(entry: TaxLiteKmEntry) {
  const studioId = requireStudio();
  const { error } = await client().from("tax_km_entry").insert({
    id: entry.id,
    studio_id: studioId,
    entry_date: entry.date,
    kilometres: entry.kilometres,
    purpose: entry.purpose,
  });
  if (error) throw friendly(error, "Couldn't save these kilometres. Please try again.");
}

export async function insertLiveTaxAdminSession(session: TaxLiteAdminSession) {
  const studioId = requireStudio();
  const { error } = await client().from("tax_admin_session").insert({
    id: session.id,
    studio_id: studioId,
    session_date: session.date,
    hours: session.hours,
    note: session.note,
  });
  if (error) throw friendly(error, "Couldn't save this admin time. Please try again.");
}

export async function upsertLiveHomeLessons(
  rows: Array<{ key: string; date: string; minutes: number; fromHome: boolean }>,
) {
  if (!rows.length) return;
  const studioId = requireStudio();
  const { error } = await client()
    .from("tax_home_lesson")
    .upsert(
      rows.map((row) => ({
        studio_id: studioId,
        occurrence_key: row.key,
        lesson_date: row.date,
        minutes: row.minutes,
        from_home: row.fromHome,
        confirmed_at: new Date().toISOString(),
      })),
      { onConflict: "studio_id,occurrence_key" },
    );
  if (error) throw friendly(error, "Couldn't save these lessons. Please try again.");
}

let lastFeeRefresh = 0;
const FEE_REFRESH_EVERY_MS = 5 * 60 * 1000;

/**
 * Asks the server to fetch any Stripe fees not saved yet, then reloads the saved fees.
 * At most every five minutes; errors only log (Tax Lite still shows "no fee reported yet").
 */
export async function refreshLiveStripeFees(now = Date.now()): Promise<boolean> {
  const studioId = liveStudioId();
  if (!studioId || now - lastFeeRefresh < FEE_REFRESH_EVERY_MS) return false;
  lastFeeRefresh = now;
  try {
    const session = (await getAuthClient()?.auth.getSession())?.data.session;
    if (!session) return false;
    const { refreshStripeFeesFn } = await import("@/server/stripe-fees");
    const result = await refreshStripeFeesFn({
      data: { accessToken: session.access_token, studioId },
    });
    if (!result.saved) return false;
    const { data, error } = await client()
      .from("payment_stripe_fee")
      .select("payment_id, gross_cents, fee_cents, net_cents")
      .eq("studio_id", studioId);
    if (error) return false;
    applyStripeFees((data ?? []) as FeeRow[]);
    return true;
  } catch (err) {
    console.error("[tax-store] Stripe fee refresh failed", (err as Error).message);
    return false;
  }
}

export function resetFeeRefreshForTests() {
  lastFeeRefresh = 0;
}

// ---------------------------------------------------------------------------
// Lesson facts for Tax Lite (home hours) and Pro CFO (earned, unearned, at risk, make-ups)
// ---------------------------------------------------------------------------

/** One calendar lesson with its attendance mark, if any. */
export type LiveLessonFact = {
  key: string;
  studentId: string;
  date: string;
  startTime: string;
  durationMin: number;
  /** cancelled = cancelled on the calendar. */
  calendarStatus: "scheduled" | "moved" | "cancelled";
  mark: AttendanceStatus | null;
};

export type LiveLessonFacts = { lessons: LiveLessonFact[]; credits: CreditEntry[] };

type SeriesRow = {
  id: string;
  student_id: string;
  teacher_user_id: string;
  repeat: "weekly" | "once";
  first_date: string;
  until_date: string | null;
  start_time: string;
  duration_min: number;
};
type ExceptionRow = {
  id: string;
  series_id: string;
  original_date: string;
  action: "cancel" | "move";
  new_date: string | null;
  new_start_time: string | null;
};
type MarkRow = {
  occurrence_key: string;
  student_id: string;
  lesson_date: string;
  status: AttendanceStatus;
};
type CreditRow = {
  id: string;
  student_id: string;
  amount: 1 | 0 | -1;
  reason: CreditReason;
  occurrence_key: string | null;
  applies_to: string | null;
  makeup_series_id: string | null;
  expires_on: string | null;
  created_at: string;
};

/** Calendar lessons from..to (inclusive) with their marks, plus the make-up credit ledger. */
export async function loadLiveLessonFacts(
  from: string,
  to: string,
  c: Client = client(),
): Promise<LiveLessonFacts> {
  const studioId = requireStudio();
  const [seriesRes, exceptionRes, markRes, creditRes] = await Promise.all([
    c
      .from("lesson_series")
      .select(
        "id, student_id, teacher_user_id, repeat, first_date, until_date, start_time, duration_min",
      )
      .eq("studio_id", studioId)
      .lte("first_date", to)
      .or(`until_date.is.null,until_date.gte.${addDays(from, -120)}`),
    c
      .from("lesson_exception")
      .select("id, series_id, original_date, action, new_date, new_start_time")
      .eq("studio_id", studioId)
      .gte("original_date", addDays(from, -120))
      .lte("original_date", addDays(to, 120)),
    c
      .from("lesson_attendance")
      .select("occurrence_key, student_id, lesson_date, status")
      .eq("studio_id", studioId)
      .gte("lesson_date", from)
      .lte("lesson_date", to),
    c
      .from("makeup_credit")
      .select(
        "id, student_id, amount, reason, occurrence_key, applies_to, makeup_series_id, expires_on, created_at",
      )
      .eq("studio_id", studioId),
  ]);
  for (const res of [seriesRes, exceptionRes]) {
    if (res.error && !missingTable(res.error))
      throw friendly(res.error, "Couldn't load your lesson calendar. Please reload.");
  }
  const series: LessonSeries[] = ((seriesRes.data ?? []) as SeriesRow[]).map((row) => ({
    id: row.id,
    studioId,
    studentId: row.student_id,
    teacherUserId: row.teacher_user_id,
    repeat: row.repeat,
    firstDate: row.first_date,
    untilDate: row.until_date,
    startTime: row.start_time.slice(0, 5),
    durationMin: row.duration_min,
    location: null,
    note: null,
    googleSyncStatus: "off",
    googleSyncError: null,
  }));
  const exceptions: LessonException[] = ((exceptionRes.data ?? []) as ExceptionRow[]).map(
    (row) => ({
      id: row.id,
      studioId,
      seriesId: row.series_id,
      originalDate: row.original_date,
      action: row.action,
      newDate: row.new_date,
      newStartTime: row.new_start_time ? row.new_start_time.slice(0, 5) : null,
    }),
  );
  // A database without 0025 yet: no marks, no credits.
  const marks = new Map(
    (markRes.error ? [] : ((markRes.data ?? []) as MarkRow[])).map((row) => [
      row.occurrence_key,
      row,
    ]),
  );
  const lessons: LiveLessonFact[] = expandLessons(series, exceptions, from, to)
    .filter((o) => o.date >= from && o.date <= to)
    .map((o) => {
      const mark = marks.get(o.key);
      marks.delete(o.key);
      return {
        key: o.key,
        studentId: o.studentId,
        date: mark?.lesson_date ?? o.date,
        startTime: o.startTime,
        durationMin: o.durationMin,
        calendarStatus: o.status,
        mark: mark?.status ?? null,
      };
    });
  const durationBySeries = new Map(series.map((s) => [s.id, s.durationMin]));
  // Marks whose lesson has since left the calendar still count (as on the lesson record).
  for (const mark of marks.values()) {
    const seriesId = mark.occurrence_key.split("_")[0] ?? "";
    lessons.push({
      key: mark.occurrence_key,
      studentId: mark.student_id,
      date: mark.lesson_date,
      startTime: "",
      durationMin: durationBySeries.get(seriesId) ?? 0,
      calendarStatus: "scheduled",
      mark: mark.status,
    });
  }
  lessons.sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime));
  const credits: CreditEntry[] = creditRes.error
    ? []
    : ((creditRes.data ?? []) as CreditRow[]).map((row) => ({
        id: row.id,
        studioId,
        studentId: row.student_id,
        amount: row.amount,
        reason: row.reason,
        occurrenceKey: row.occurrence_key,
        appliesTo: row.applies_to,
        makeupSeriesId: row.makeup_series_id,
        expiresOn: row.expires_on,
        createdAt: row.created_at,
      }));
  return { lessons, credits };
}

/** After a Xero sync: copies each invoice's "sent to Xero" time from the database. */
export async function reloadLiveXeroStamps(c: Client = client()) {
  const studioId = requireStudio();
  const { data, error } = await c
    .from("invoice")
    .select("id, xero_synced_at")
    .eq("studio_id", studioId)
    .not("xero_synced_at", "is", null);
  if (error) return;
  const { invoices } = await import("@/mocks/data");
  const stamps = new Map(
    ((data ?? []) as Array<{ id: string; xero_synced_at: string }>).map((row) => [
      row.id,
      row.xero_synced_at,
    ]),
  );
  for (const invoice of invoices) {
    const at = stamps.get(invoice.id);
    if (at) invoice.xeroSyncedAt = at;
  }
}
