import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { canRead } from "@/lib/subscription";
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
};

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
  if (!ctx.childIds.length) return { today, lessons: [], news: [], courses: [] };
  const lastDay = addDays(today, FAMILY_LESSON_DAYS - 1);
  const [seriesRes, newsRes, groupRes, courseRes] = await Promise.all([
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
  ]);
  fail(seriesRes.error, "Lessons lookup failed");
  fail(newsRes.error, "News lookup failed");
  fail(groupRes.error, "Groups lookup failed");
  fail(courseRes.error, "Course lookup failed");

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
