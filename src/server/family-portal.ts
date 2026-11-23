import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { canRead, canWrite } from "@/lib/subscription";
import {
  familyLessons,
  familyNews,
  familySafeCourse,
  FAMILY_LESSON_DAYS,
  type FamilyGroupRow,
  type FamilyLesson,
  type FamilyNewsPost,
  type FamilyNewsRow,
} from "@/lib/family-portal";
import { addDays, todayIn, type LessonException, type LessonSeries } from "@/lib/lesson-calendar";
import type { CourseDocument } from "@/services/live/course-store";
import type { ClientNote, PracticeLog } from "@/mocks/types";
import { isMockOnboarding } from "./env";
import { studioPaused } from "./authz";
import { ProblemError } from "./problem";
import { verifyAccessToken } from "./session";
import { getStudioAccess } from "./subscription-store";
import { createServiceSupabase } from "./supabase";

/**
 * Family portal content for a signed-in parent of a real studio: the next 4 weeks of lessons,
 * studio news meant for them, and their children's active courses with shared feedback only.
 *
 * Parents have no RLS read on news_post or student_course (0014, 0015 are staff-only), so this
 * reads with the service key. Every query is scoped to the family of the verified user's own
 * guardian row (guardian.user_id); nothing in the request picks the family or the children.
 * Revoked parents have no guardian.user_id (0020), so they get nothing.
 */
export type FamilyPortalContent = {
  today: string;
  lessons: FamilyLesson[];
  news: FamilyNewsPost[];
  courses: CourseDocument[];
  /** The children's practice for the last 8 weeks (PR B, 0023). */
  practice: PracticeLog[];
  /** Notes the teacher marked shared, about the children or the family. Never private ones. */
  notes: ClientNote[];
};

/** Weeks of practice history the family portal sends. */
export const FAMILY_PRACTICE_DAYS = 56;
/** How far back a parent may log practice. */
export const FAMILY_PRACTICE_BACKDATE_DAYS = 30;

type PracticeRow = {
  id: string;
  student_id: string;
  practice_date: string;
  minutes: number;
  logged_by: string;
};

type SharedNoteRow = {
  id: string;
  subject_type: ClientNote["subjectType"];
  subject_id: string;
  body: string;
  category: ClientNote["category"];
  visibility: string;
  pinned: boolean;
  lesson_occurrence_id: string | null;
  author_name: string;
  created_at: string;
};

function toPractice(row: PracticeRow): PracticeLog {
  return {
    id: row.id,
    studentId: row.student_id,
    date: row.practice_date,
    minutes: row.minutes,
    loggedBy: row.logged_by === "teacher" ? "teacher" : "student",
  };
}

/** Family-safe copy of the notes: shared ones about this family or its children only. */
export function familySharedNotes(
  rows: SharedNoteRow[],
  familyId: string,
  childIds: string[],
): ClientNote[] {
  const children = new Set(childIds);
  return rows
    .filter(
      (row) =>
        row.visibility === "shared" &&
        ((row.subject_type === "student" && children.has(row.subject_id)) ||
          (row.subject_type === "family" && row.subject_id === familyId)),
    )
    .map((row) => ({
      id: row.id,
      subjectType: row.subject_type,
      subjectId: row.subject_id,
      authorName: row.author_name,
      body: row.body,
      category: row.category,
      visibility: "shared",
      pinned: row.pinned,
      createdAt: row.created_at,
      ...(row.lesson_occurrence_id ? { lessonOccurrenceId: row.lesson_occurrence_id } : {}),
    }));
}

/**
 * Optional 0023 tables: a studio database without them still gets the rest of the portal.
 * Postgres 42P01 / PostgREST PGRST205 mean the table isn't there yet.
 */
function missingTable(error: { code?: string; message: string } | null) {
  return Boolean(error && (error.code === "42P01" || error.code === "PGRST205"));
}

type FamilyContext = {
  studioId: string;
  familyId: string;
  childIds: string[];
  timeZone: string;
};

function fail(error: { message: string } | null, title: string) {
  if (error) throw new ProblemError(500, title, error.message);
}

export async function familyContextForUser(
  supabase: SupabaseClient,
  userId: string,
  preferredStudioId?: string,
): Promise<FamilyContext | null> {
  const { data: guardians, error } = await supabase
    .from("guardian")
    .select("id, studio_id, family_id, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  fail(error, "Family lookup failed");
  const rows = (guardians ?? []) as Array<{ studio_id: string; family_id: string }>;
  const guardian =
    (preferredStudioId && rows.find((row) => row.studio_id === preferredStudioId)) || rows[0];
  if (!guardian) return null;
  const [studioRes, studentRes] = await Promise.all([
    supabase.from("studio").select("timezone").eq("id", guardian.studio_id).maybeSingle(),
    supabase
      .from("student")
      .select("id")
      .eq("studio_id", guardian.studio_id)
      .eq("family_id", guardian.family_id),
  ]);
  fail(studioRes.error, "Studio lookup failed");
  fail(studentRes.error, "Student lookup failed");
  return {
    studioId: guardian.studio_id,
    familyId: guardian.family_id,
    childIds: ((studentRes.data ?? []) as Array<{ id: string }>).map((row) => row.id),
    timeZone: (studioRes.data?.timezone as string | undefined) || "Australia/Sydney",
  };
}

const hhmm = (value: string | null) => (value ? value.slice(0, 5) : null);

export async function loadFamilyPortal(
  supabase: SupabaseClient,
  ctx: FamilyContext,
  now: Date = new Date(),
): Promise<FamilyPortalContent> {
  const today = todayIn(ctx.timeZone, now);
  if (!ctx.childIds.length)
    return { today, lessons: [], news: [], courses: [], practice: [], notes: [] };
  const lastDay = addDays(today, FAMILY_LESSON_DAYS - 1);
  const [seriesRes, newsRes, groupRes, courseRes, practiceRes, noteRes] = await Promise.all([
    supabase
      .from("lesson_series")
      .select(
        "id, studio_id, student_id, teacher_user_id, repeat, first_date, until_date, start_time, duration_min",
      )
      .eq("studio_id", ctx.studioId)
      .in("student_id", ctx.childIds)
      .lte("first_date", lastDay)
      .or(`until_date.is.null,until_date.gte.${addDays(today, -365)}`),
    supabase
      .from("news_post")
      .select(
        "id, author_name, title, body, tag, audience, important, status, publish_at, pinned_until, expires_at, event_date, edited_at",
      )
      .eq("studio_id", ctx.studioId)
      .in("status", ["published", "scheduled"])
      .lte("publish_at", now.toISOString())
      .order("publish_at", { ascending: false })
      .limit(200),
    supabase
      .from("student_group")
      .select("id, student_ids, archived")
      .eq("studio_id", ctx.studioId)
      .overlaps("student_ids", ctx.childIds),
    supabase
      .from("student_course")
      .select("id, student_id, status, data")
      .eq("studio_id", ctx.studioId)
      .in("student_id", ctx.childIds)
      .eq("status", "active"),
    supabase
      .from("practice_log")
      .select("id, student_id, practice_date, minutes, logged_by")
      .eq("studio_id", ctx.studioId)
      .in("student_id", ctx.childIds)
      .gte("practice_date", addDays(today, -(FAMILY_PRACTICE_DAYS - 1)))
      .order("practice_date", { ascending: true }),
    // Shared notes only, filtered again below so a private note can never slip through.
    supabase
      .from("client_note")
      .select(
        "id, subject_type, subject_id, body, category, visibility, pinned, lesson_occurrence_id, author_name, created_at",
      )
      .eq("studio_id", ctx.studioId)
      .eq("visibility", "shared")
      .in("subject_id", [...ctx.childIds, ctx.familyId])
      .order("created_at", { ascending: true }),
  ]);
  fail(seriesRes.error, "Lessons lookup failed");
  fail(newsRes.error, "News lookup failed");
  fail(groupRes.error, "Groups lookup failed");
  fail(courseRes.error, "Course lookup failed");
  if (!missingTable(practiceRes.error)) fail(practiceRes.error, "Practice lookup failed");
  if (!missingTable(noteRes.error)) fail(noteRes.error, "Notes lookup failed");

  const series: LessonSeries[] = (
    (seriesRes.data ?? []) as Array<{
      id: string;
      studio_id: string;
      student_id: string;
      teacher_user_id: string;
      repeat: "weekly" | "once";
      first_date: string;
      until_date: string | null;
      start_time: string;
      duration_min: number;
    }>
  ).map((row) => ({
    id: row.id,
    studioId: row.studio_id,
    studentId: row.student_id,
    teacherUserId: row.teacher_user_id,
    repeat: row.repeat,
    firstDate: row.first_date,
    untilDate: row.until_date,
    startTime: hhmm(row.start_time) ?? "00:00",
    durationMin: row.duration_min,
    location: null,
    note: null,
    googleSyncStatus: "off" as LessonSeries["googleSyncStatus"],
    googleSyncError: null,
  }));
  let exceptions: LessonException[] = [];
  if (series.length) {
    const { data, error } = await supabase
      .from("lesson_exception")
      .select("id, studio_id, series_id, original_date, action, new_date, new_start_time")
      .eq("studio_id", ctx.studioId)
      .in(
        "series_id",
        series.map((entry) => entry.id),
      );
    fail(error, "Lessons lookup failed");
    exceptions = (
      (data ?? []) as Array<{
        id: string;
        studio_id: string;
        series_id: string;
        original_date: string;
        action: "cancel" | "move";
        new_date: string | null;
        new_start_time: string | null;
      }>
    ).map((row) => ({
      id: row.id,
      studioId: row.studio_id,
      seriesId: row.series_id,
      originalDate: row.original_date,
      action: row.action,
      newDate: row.new_date,
      newStartTime: hhmm(row.new_start_time),
    }));
  }

  const courses = (
    (courseRes.data ?? []) as Array<{
      id: string;
      student_id: string;
      status: "active";
      data: CourseDocument | null;
    }>
  )
    .filter((row) => row.data?.course)
    .map((row) =>
      familySafeCourse({
        ...row.data!,
        course: { ...row.data!.course, id: row.id, studentId: row.student_id, status: row.status },
      }),
    );

  return {
    today,
    lessons: familyLessons(series, exceptions, ctx.childIds, today),
    news: familyNews(
      (newsRes.data ?? []) as FamilyNewsRow[],
      ctx.familyId,
      ctx.childIds,
      (groupRes.data ?? []) as FamilyGroupRow[],
      now,
    ),
    courses,
    practice: practiceRes.error ? [] : ((practiceRes.data ?? []) as PracticeRow[]).map(toPractice),
    notes: noteRes.error
      ? []
      : familySharedNotes((noteRes.data ?? []) as SharedNoteRow[], ctx.familyId, ctx.childIds),
  };
}

export const familyPortalFn = createServerFn({ method: "POST" })
  .validator((data: { accessToken: string; studioId?: string }) => data)
  .handler(async ({ data }): Promise<{ content: FamilyPortalContent | null }> => {
    if (isMockOnboarding()) return { content: null };
    const session = await verifyAccessToken(data.accessToken);
    const supabase = createServiceSupabase();
    const ctx = await familyContextForUser(supabase, session.userId, data.studioId);
    if (!ctx) return { content: null };
    // Service-key reads skip the 0006 access gate, so check it here: families only see a
    // studio with full access (a paused studio is read-only for its owner alone).
    const { level } = await getStudioAccess(ctx.studioId);
    if (!canRead(level, "guardian")) throw studioPaused();
    return { content: await loadFamilyPortal(supabase, ctx) };
  });

export type FamilyPracticeInput = {
  studentId: string;
  date: string;
  minutes: number;
};

/**
 * Checks a parent's practice entry against their own family and the studio's calendar: one of
 * their children, a real date no later than today and no more than 30 days back, 1 to 600
 * minutes. Returns an error message, or null when it's fine.
 */
export function familyPracticeProblem(
  input: FamilyPracticeInput,
  ctx: FamilyContext,
  now: Date = new Date(),
): string | null {
  if (!ctx.childIds.includes(input.studentId)) return "That student isn't in your family.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date) || Number.isNaN(Date.parse(input.date)))
    return "Choose a practice date.";
  const today = todayIn(ctx.timeZone, now);
  if (input.date > today) return "Practice can't be logged for a future day.";
  if (input.date < addDays(today, -FAMILY_PRACTICE_BACKDATE_DAYS))
    return "Practice can only be logged for the last 30 days.";
  if (!Number.isInteger(input.minutes) || input.minutes < 1 || input.minutes > 600)
    return "Minutes must be between 1 and 600.";
  return null;
}

export async function insertFamilyPractice(
  supabase: SupabaseClient,
  ctx: FamilyContext,
  userId: string,
  input: FamilyPracticeInput,
  now: Date = new Date(),
): Promise<PracticeLog> {
  const problem = familyPracticeProblem(input, ctx, now);
  if (problem) throw new ProblemError(400, "Practice not saved", problem);
  const { data, error } = await supabase
    .from("practice_log")
    .insert({
      studio_id: ctx.studioId,
      student_id: input.studentId,
      practice_date: input.date,
      minutes: input.minutes,
      logged_by: "parent",
      logged_by_user_id: userId,
    })
    .select("id, student_id, practice_date, minutes, logged_by")
    .single();
  fail(error, "Practice not saved");
  return toPractice(data as PracticeRow);
}

/** A parent logs practice for one of their own children. The family comes from the token. */
export const familyLogPracticeFn = createServerFn({ method: "POST" })
  .validator(
    (data: {
      accessToken: string;
      studioId?: string;
      studentId: string;
      date: string;
      minutes: number;
    }) => data,
  )
  .handler(async ({ data }): Promise<{ log: PracticeLog }> => {
    const session = await verifyAccessToken(data.accessToken);
    const supabase = createServiceSupabase();
    const ctx = await familyContextForUser(supabase, session.userId, data.studioId);
    if (!ctx) throw new ProblemError(403, "Not a parent of this studio", "No family found.");
    // Writing needs a studio with full access, the same gate RLS applies to staff writes.
    const { level } = await getStudioAccess(ctx.studioId);
    if (!canWrite(level)) throw studioPaused();
    const log = await insertFamilyPractice(supabase, ctx, session.userId, {
      studentId: data.studentId,
      date: data.date,
      minutes: Number(data.minutes),
    });
    return { log };
  });
