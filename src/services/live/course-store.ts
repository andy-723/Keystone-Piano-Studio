/**
 * Live student courses and studio Library templates (0015). Same pattern as studio-store:
 * loaded at sign-in, saved to Supabase before the in-memory store changes for good. Each
 * student course is one row holding its sections, slots, items, milestones and feedback.
 * Keystone-supplied Library templates ship with the app and are never saved.
 */
import {
  courseFeedback,
  courseItems,
  frameworkSections,
  frameworkSlots,
  studentCourses,
  termMilestones,
} from "@/mocks/curriculum";
import { libraryState } from "@/mocks/library";
import type {
  ContentItem,
  CourseItem,
  CourseTemplate,
  Feedback,
  FrameworkSection,
  FrameworkSlot,
  LessonTemplate,
  StudentCourse,
  TermMilestone,
} from "@/mocks/types";
import { liveStudioId, type StudioWorkspace } from "@/lib/studio-workspace";
import { courseReadiness, lastSignOff, sectionProgress, weekStart } from "@/lib/course-progress";
import { client, friendly, type Client } from "./client";

export type CourseDocument = {
  course: StudentCourse;
  sections: FrameworkSection[];
  slots: FrameworkSlot[];
  items: CourseItem[];
  milestones: TermMilestone[];
  feedback: Feedback[];
};
type CourseRow = {
  id: string;
  student_id: string;
  status: StudentCourse["status"];
  data: CourseDocument;
};
type LibraryKind = "content" | "lesson" | "course";
type LibraryRow = {
  id: string;
  kind: LibraryKind;
  data: ContentItem | LessonTemplate | CourseTemplate;
};

const LIBRARY_KIND = { content: "content", lessons: "lesson", courses: "course" } as const;
export type LibraryTab = keyof typeof LIBRARY_KIND;

/** Everything that belongs to one student course, read from the in-memory store. */
export function courseDocument(courseId: string): CourseDocument | null {
  const course = studentCourses.find((entry) => entry.id === courseId);
  if (!course) return null;
  // Course-owned sections share the course id as a prefix (see course-snapshot).
  const sections = frameworkSections.filter((entry) => entry.id.startsWith(`${course.id}-`));
  const sectionIds = new Set(sections.map((entry) => entry.id));
  const items = courseItems.filter((entry) => entry.studentCourseId === course.id);
  const itemIds = new Set(items.map((entry) => entry.id));
  return structuredClone({
    course,
    sections,
    slots: frameworkSlots.filter((entry) => sectionIds.has(entry.sectionId)),
    items,
    milestones: termMilestones.filter((entry) => entry.studentCourseId === course.id),
    feedback: courseFeedback.filter((entry) => itemIds.has(entry.courseItemId)),
  });
}

function pushCourseDocument(doc: CourseDocument) {
  studentCourses.push(doc.course);
  frameworkSections.push(...(doc.sections ?? []));
  frameworkSlots.push(...(doc.slots ?? []));
  courseItems.push(...(doc.items ?? []));
  termMilestones.push(...(doc.milestones ?? []));
  courseFeedback.push(...(doc.feedback ?? []));
}

/** Fills courses and the studio's own Library. A missing 0015 leaves them as they are (logged). */
export async function loadLiveCourses(
  workspace: Extract<StudioWorkspace, { mode: "live" }>,
  c: Client,
) {
  if (workspace.role === "guardian") return;
  const [courseRes, libraryRes] = await Promise.all([
    c
      .from("student_course")
      .select("id, student_id, status, data")
      .eq("studio_id", workspace.studioId)
      .order("created_at", { ascending: true }),
    c
      .from("library_item")
      .select("id, kind, data")
      .eq("studio_id", workspace.studioId)
      .order("created_at", { ascending: true }),
  ]);
  if (courseRes.error || libraryRes.error) {
    console.error(
      "[course-store] courses not loaded",
      (courseRes.error ?? libraryRes.error)?.message,
    );
    return;
  }
  for (const row of (courseRes.data ?? []) as CourseRow[]) {
    const doc = row.data;
    if (!doc?.course) continue;
    pushCourseDocument({
      ...doc,
      course: { ...doc.course, id: row.id, studentId: row.student_id, status: row.status },
    });
  }
  const library = libraryState.demo;
  for (const row of (libraryRes.data ?? []) as LibraryRow[]) {
    const item = { ...row.data, id: row.id, supplied: false };
    if (row.kind === "content") library.content.push(item as ContentItem);
    else if (row.kind === "lesson") library.lessons.push(item as LessonTemplate);
    else library.courses.push(item as CourseTemplate);
  }
  // A saved studio welcome lesson replaces the supplied default for its audience.
  for (const lesson of library.lessons) {
    if (lesson.supplied || !lesson.isWelcomeDefault) continue;
    for (const other of library.lessons) {
      if (other !== lesson && other.audience === lesson.audience) other.isWelcomeDefault = false;
    }
  }
}

/** Saves whole course documents. Archived courses go first so a new active one never clashes. */
export async function saveLiveCourses(courseIds: string[]) {
  const studioId = liveStudioId();
  if (!studioId) return;
  const docs = [...new Set(courseIds)]
    .map(courseDocument)
    .filter((doc): doc is CourseDocument => Boolean(doc));
  const rows = docs.map((doc) => ({
    id: doc.course.id,
    studio_id: studioId,
    student_id: doc.course.studentId,
    status: doc.course.status,
    data: doc,
  }));
  const archived = rows.filter((row) => row.status === "archived");
  const current = rows.filter((row) => row.status !== "archived");
  const c = client();
  for (const batch of [archived, current]) {
    if (!batch.length) continue;
    const { error } = await c.from("student_course").upsert(batch, { onConflict: "id" });
    if (error) throw friendly(error, "Couldn't save this course. Please try again.");
  }
  await saveProgressSnapshots(studioId, docs.filter((doc) => doc.course.status === "active"), c);
}

/** This week's progress row per student (0019). Best effort: a failure never blocks the course save. */
export function progressSnapshotRow(studioId: string, doc: CourseDocument, now = new Date()) {
  const progress = sectionProgress(doc.sections, doc.items);
  return {
    studio_id: studioId,
    student_id: doc.course.studentId,
    week_start: weekStart(now),
    course_id: doc.course.id,
    level: doc.course.grade.slice(0, 80) || null,
    target_term: /^\d{4}-T[1-4]$/.test(doc.course.targetTerm) ? doc.course.targetTerm : null,
    readiness_pct: courseReadiness(doc.sections, doc.items),
    sections: doc.sections.map((section) => {
      const row = progress.find((entry) => entry.sectionId === section.id);
      return { name: section.name, pct: row?.pct ?? 0, done: row?.done ?? 0, total: row?.total ?? 0 };
    }),
    last_signoff_at: lastSignOff(doc.feedback) ?? null,
  };
}
async function saveProgressSnapshots(studioId: string, docs: CourseDocument[], c: Client) {
  if (!docs.length) return;
  const { error } = await c
    .from("student_progress_snapshot")
    .upsert(docs.map((doc) => progressSnapshotRow(studioId, doc)), { onConflict: "student_id,week_start" });
  if (error) console.warn("[course-store] progress snapshot not saved", error.message);
}

const COURSE_LISTS = [
  studentCourses,
  frameworkSections,
  frameworkSlots,
  courseItems,
  termMilestones,
  courseFeedback,
] as unknown[][];

/**
 * Runs a course change and, for a live studio, saves the changed courses. If the save fails
 * the in-memory course store is put back as it was and the error is passed on.
 */
export async function withLiveCourseSave<T>(change: () => T, courseIds: (result: T) => string[]) {
  if (!liveStudioId()) return change();
  // Items are edited in place, so keep deep copies to put back.
  const snapshot = structuredClone(COURSE_LISTS);
  try {
    const result = change();
    await saveLiveCourses(courseIds(result));
    return result;
  } catch (error) {
    COURSE_LISTS.forEach((list, i) => list.splice(0, list.length, ...snapshot[i]!));
    throw error;
  }
}

/** Saves studio-made Library items (content, lessons or course templates). */
export async function saveLiveLibraryItems(
  tab: LibraryTab,
  items: Array<ContentItem | LessonTemplate | CourseTemplate>,
) {
  const studioId = liveStudioId();
  if (!studioId) return;
  const rows = items
    .filter((item) => !item.supplied)
    .map((item) => ({
      id: item.id,
      studio_id: studioId,
      kind: LIBRARY_KIND[tab],
      data: structuredClone(item),
    }));
  if (!rows.length) return;
  const { error } = await client().from("library_item").upsert(rows, { onConflict: "id" });
  if (error) throw friendly(error, "Couldn't save this Library item. Please try again.");
}
