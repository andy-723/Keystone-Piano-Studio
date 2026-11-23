import { createServiceSupabase } from "./supabase";
import { isMockOnboarding } from "./env";
import { ProblemError } from "./problem";
import {
  lessonRulesFrom,
  type StudioLessonRules,
  type AttendanceMark,
  AttendanceStatus,
  CreditEntry,
  CreditReason,
} from "@/lib/makeup-credits";

/**
 * Storage for lesson marks and the make-up credit ledger (0025). Service-key access only: every
 * caller must already have checked requireStudioRole for the studio it passes in, and every query
 * is scoped by that studio id. A database without 0025 reads as empty, so the calendar and Today
 * page keep working; saving a mark then says the update is still to be applied.
 */
export type NewMark = Omit<AttendanceMark, "markedAt"> & { markedBy: string | null };
export type NewCredit = Omit<CreditEntry, "id" | "createdAt"> & { createdBy: string | null };

export interface AttendanceStore {
  /** Marks for lessons that fell between from and to (inclusive), optionally for one student. */
  listMarks(
    studioId: string,
    from: string,
    to: string,
    studentId?: string,
  ): Promise<AttendanceMark[]>;
  getMark(studioId: string, occurrenceKey: string): Promise<AttendanceMark | null>;
  saveMark(studioId: string, mark: NewMark): Promise<AttendanceMark>;
  deleteMark(studioId: string, occurrenceKey: string): Promise<void>;
  /** The ledger, oldest first. Optionally for some students only. */
  listCredits(studioId: string, studentIds?: string[]): Promise<CreditEntry[]>;
  addCredit(studioId: string, entry: NewCredit): Promise<CreditEntry>;
  /** Cancel notice and make-up allowance from the studio's current studio agreement. */
  lessonRules(studioId: string): Promise<StudioLessonRules>;
}

// ---------------------------------------------------------------------------
// Memory store (mock mode, the demo studio in the browser, and unit tests)
// ---------------------------------------------------------------------------
export function createMemoryAttendanceStore() {
  const marks = new Map<string, AttendanceMark & { studioId: string }>();
  const credits: CreditEntry[] = [];
  let last = 0;
  // Strictly increasing timestamps so the ledger order is the order rows were added.
  const stamp = () => new Date((last = Math.max(Date.now(), last + 1))).toISOString();
  const strip = ({ studioId: _studio, ...mark }: AttendanceMark & { studioId: string }) => ({
    ...mark,
  });
  const store: AttendanceStore & { state: { marks: typeof marks; credits: typeof credits } } = {
    state: { marks, credits },
    async listMarks(studioId, from, to, studentId) {
      return [...marks.values()]
        .filter(
          (m) =>
            m.studioId === studioId &&
            m.lessonDate >= from &&
            m.lessonDate <= to &&
            (!studentId || m.studentId === studentId),
        )
        .map(strip);
    },
    async getMark(studioId, key) {
      const mark = marks.get(`${studioId}:${key}`);
      return mark ? strip(mark) : null;
    },
    async saveMark(studioId, { markedBy: _by, ...mark }) {
      const saved = { ...mark, studioId, markedAt: new Date().toISOString() };
      marks.set(`${studioId}:${mark.occurrenceKey}`, saved);
      return strip(saved);
    },
    async deleteMark(studioId, key) {
      marks.delete(`${studioId}:${key}`);
    },
    async listCredits(studioId, studentIds) {
      return credits
        .filter((c) => c.studioId === studioId && (!studentIds || studentIds.includes(c.studentId)))
        .map((c) => ({ ...c }));
    },
    async addCredit(studioId, { createdBy: _by, ...entry }) {
      const row: CreditEntry = { ...entry, studioId, id: crypto.randomUUID(), createdAt: stamp() };
      credits.push(row);
      return { ...row };
    },
    async lessonRules() {
      return lessonRulesFrom(null);
    },
  };
  return store;
}

// ---------------------------------------------------------------------------
// Supabase store
// ---------------------------------------------------------------------------
type MarkRow = {
  occurrence_key: string;
  series_id: string | null;
  student_id: string;
  lesson_date: string;
  status: AttendanceStatus;
  credit: boolean;
  marked_at: string;
};

type CreditRow = {
  id: string;
  studio_id: string;
  student_id: string;
  amount: number;
  reason: CreditReason;
  occurrence_key: string | null;
  applies_to: string | null;
  makeup_series_id: string | null;
  expires_on: string | null;
  created_at: string;
};

const MARK_COLUMNS =
  "occurrence_key, series_id, student_id, lesson_date, status, credit, marked_at";
const CREDIT_COLUMNS =
  "id, studio_id, student_id, amount, reason, occurrence_key, applies_to, makeup_series_id, expires_on, created_at";

const toMark = (row: MarkRow): AttendanceMark => ({
  occurrenceKey: row.occurrence_key,
  seriesId: row.series_id,
  studentId: row.student_id,
  lessonDate: row.lesson_date,
  status: row.status,
  credit: row.credit,
  markedAt: row.marked_at,
});

const toCredit = (row: CreditRow): CreditEntry => ({
  id: row.id,
  studioId: row.studio_id,
  studentId: row.student_id,
  amount: (row.amount > 0 ? 1 : row.amount < 0 ? -1 : 0) as CreditEntry["amount"],
  reason: row.reason,
  occurrenceKey: row.occurrence_key,
  appliesTo: row.applies_to,
  makeupSeriesId: row.makeup_series_id,
  expiresOn: row.expires_on,
  createdAt: row.created_at,
});

/** Postgres 42P01 / PostgREST PGRST205: the 0025 tables aren't there yet. */
export function missingTable(error: { code?: string } | null) {
  return Boolean(error && (error.code === "42P01" || error.code === "PGRST205"));
}

function fail(error: { message: string; code?: string } | null) {
  if (!error) return;
  if (missingTable(error))
    throw new ProblemError(
      503,
      "Attendance isn't switched on yet",
      "The attendance update (0025) still needs to be applied to the database.",
    );
  if (error.code === "23514") throw new ProblemError(400, "Check the lesson", error.message);
  throw new ProblemError(500, "Attendance update failed", error.message);
}

function createSupabaseAttendanceStore(): AttendanceStore {
  const db = () => createServiceSupabase();
  return {
    async listMarks(studioId, from, to, studentId) {
      let query = db()
        .from("lesson_attendance")
        .select(MARK_COLUMNS)
        .eq("studio_id", studioId)
        .gte("lesson_date", from)
        .lte("lesson_date", to);
      if (studentId) query = query.eq("student_id", studentId);
      const { data, error } = await query;
      if (missingTable(error)) return [];
      fail(error);
      return ((data ?? []) as MarkRow[]).map(toMark);
    },
    async getMark(studioId, key) {
      const { data, error } = await db()
        .from("lesson_attendance")
        .select(MARK_COLUMNS)
        .eq("studio_id", studioId)
        .eq("occurrence_key", key)
        .maybeSingle();
      if (missingTable(error)) return null;
      fail(error);
      return data ? toMark(data as MarkRow) : null;
    },
    async saveMark(studioId, mark) {
      const { data, error } = await db()
        .from("lesson_attendance")
        .upsert(
          {
            studio_id: studioId,
            occurrence_key: mark.occurrenceKey,
            series_id: mark.seriesId,
            student_id: mark.studentId,
            lesson_date: mark.lessonDate,
            status: mark.status,
            credit: mark.credit,
            marked_by: mark.markedBy,
            marked_at: new Date().toISOString(),
          },
          { onConflict: "studio_id,occurrence_key" },
        )
        .select(MARK_COLUMNS)
        .single();
      fail(error);
      return toMark(data as MarkRow);
    },
    async deleteMark(studioId, key) {
      const { error } = await db()
        .from("lesson_attendance")
        .delete()
        .eq("studio_id", studioId)
        .eq("occurrence_key", key);
      if (missingTable(error)) return;
      fail(error);
    },
    async listCredits(studioId, studentIds) {
      if (studentIds && !studentIds.length) return [];
      let query = db()
        .from("makeup_credit")
        .select(CREDIT_COLUMNS)
        .eq("studio_id", studioId)
        .order("created_at", { ascending: true });
      if (studentIds) query = query.in("student_id", studentIds);
      const { data, error } = await query;
      if (missingTable(error)) return [];
      fail(error);
      return ((data ?? []) as CreditRow[]).map(toCredit);
    },
    async addCredit(studioId, entry) {
      const { data, error } = await db()
        .from("makeup_credit")
        .insert({
          studio_id: studioId,
          student_id: entry.studentId,
          amount: entry.amount,
          reason: entry.reason,
          occurrence_key: entry.occurrenceKey,
          applies_to: entry.appliesTo,
          makeup_series_id: entry.makeupSeriesId,
          expires_on: entry.expiresOn,
          created_by: entry.createdBy,
        })
        .select(CREDIT_COLUMNS)
        .single();
      fail(error);
      return toCredit(data as CreditRow);
    },
    async lessonRules(studioId) {
      const { data, error } = await db()
        .from("terms_version")
        .select("merge_values, effective_at, terms_document!inner(kind)")
        .eq("studio_id", studioId)
        .eq("terms_document.kind", "studio_agreement")
        .lte("effective_at", new Date().toISOString())
        .order("version_no", { ascending: false })
        .limit(1);
      // The hint is only a reminder; a failed read falls back to the defaults.
      if (error) return lessonRulesFrom(null);
      const row = (data ?? [])[0] as { merge_values: Record<string, unknown> | null } | undefined;
      return lessonRulesFrom(row?.merge_values);
    },
  };
}

let override: AttendanceStore | null = null;
let mockStore: AttendanceStore | null = null;

/** Tests swap in a memory store. */
export function setAttendanceStoreForTests(store: AttendanceStore | null) {
  override = store;
}

/** The demo studio's marks live in the browser tab, like its calendar (reset on reload). */
export function browserDemoAttendanceStore(): AttendanceStore {
  override ??= createMemoryAttendanceStore();
  return override;
}

export function getAttendanceStore(): AttendanceStore {
  if (override) return override;
  if (isMockOnboarding()) {
    mockStore ??= createMemoryAttendanceStore();
    return mockStore;
  }
  return createSupabaseAttendanceStore();
}
