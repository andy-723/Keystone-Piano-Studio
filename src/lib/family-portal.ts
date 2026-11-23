/**
 * Family portal for real studios: the pure rules for what a parent may see. The server
 * (src/server/family-portal.ts) reads the studio's rows with the service key, scoped to the
 * verified parent's own family, and passes them through these functions before anything goes
 * back to the browser. Nothing here trusts an id from the browser.
 */
import type { CourseDocument } from "@/services/live/course-store";
import { expandLessons, type LessonException, type LessonSeries } from "@/lib/lesson-calendar";
import { addDays } from "@/lib/lesson-calendar";

export type FamilyNewsAudience = {
  kind: "studio" | "my_students" | "groups" | "families";
  groupIds?: string[];
  familyIds?: string[];
};

export type FamilyNewsRow = {
  id: string;
  author_name: string;
  title: string;
  body: string;
  tag: string;
  audience: FamilyNewsAudience | null;
  important: boolean;
  status: string;
  publish_at: string;
  pinned_until: string | null;
  expires_at: string | null;
  event_date: string | null;
  edited_at: string | null;
};

/** What a family receives for one post. No author ids, no audience detail, no attachments yet. */
export type FamilyNewsPost = {
  id: string;
  authorName: string;
  title: string;
  body: string;
  tag: string;
  important: boolean;
  publishAt: string;
  pinnedUntil: string | null;
  expiresAt: string | null;
  eventDate: string | null;
  editedAt: string | null;
};

export type FamilyGroupRow = {
  id: string;
  student_ids: string[] | null;
  archived?: boolean | null;
};

/**
 * True when the post is out (published, or scheduled and its time has come), not expired, and
 * meant for this family: the whole studio, the family by id (families / my_students, and group
 * posts saved since 23 Nov 2026 carry the families they reached), or a manual group that has one
 * of the family's children in it.
 */
export function newsVisibleToFamily(
  row: FamilyNewsRow,
  familyId: string,
  childIds: string[],
  groups: FamilyGroupRow[],
  now: Date,
): boolean {
  if (row.status !== "published" && row.status !== "scheduled") return false;
  const nowMs = now.getTime();
  const publishMs = Date.parse(row.publish_at);
  if (!Number.isFinite(publishMs) || publishMs > nowMs) return false;
  if (row.expires_at && Date.parse(row.expires_at) <= nowMs) return false;
  const audience = row.audience ?? { kind: "studio" };
  if (audience.kind === "studio") return true;
  if (audience.familyIds?.includes(familyId)) return true;
  if (audience.kind !== "groups") return false;
  const children = new Set(childIds);
  return (audience.groupIds ?? []).some((groupId) => {
    const group = groups.find((entry) => entry.id === groupId);
    return Boolean(
      group && !group.archived && (group.student_ids ?? []).some((id) => children.has(id)),
    );
  });
}

export function familyNews(
  rows: FamilyNewsRow[],
  familyId: string,
  childIds: string[],
  groups: FamilyGroupRow[],
  now: Date,
): FamilyNewsPost[] {
  return rows
    .filter((row) => newsVisibleToFamily(row, familyId, childIds, groups, now))
    .sort((a, b) => Date.parse(b.publish_at) - Date.parse(a.publish_at))
    .map((row) => ({
      id: row.id,
      authorName: row.author_name,
      title: row.title,
      body: row.body,
      tag: row.tag,
      important: row.important,
      publishAt: row.publish_at,
      pinnedUntil: row.pinned_until,
      expiresAt: row.expires_at,
      eventDate: row.event_date,
      editedAt: row.edited_at,
    }));
}

/**
 * A child's course as the family sees it: only the active course, and only feedback the teacher
 * marked as shared. Private feedback (and its comment) never leaves the server.
 */
export function familySafeCourse(doc: CourseDocument): CourseDocument {
  return {
    course: doc.course,
    sections: doc.sections ?? [],
    slots: doc.slots ?? [],
    items: doc.items ?? [],
    milestones: doc.milestones ?? [],
    feedback: (doc.feedback ?? []).filter((entry) => entry.shared === true),
  };
}

export type FamilyLesson = {
  key: string;
  studentId: string;
  date: string;
  startTime: string;
  durationMin: number;
  status: "scheduled" | "cancelled" | "moved";
  /** For a moved lesson, the date it was first planned on. */
  originalDate: string;
};

/** Number of days ahead the family portal lists (4 weeks). */
export const FAMILY_LESSON_DAYS = 28;

/** The family's lessons from today for 4 weeks, cancelled and moved ones included. */
export function familyLessons(
  series: LessonSeries[],
  exceptions: LessonException[],
  childIds: string[],
  today: string,
): FamilyLesson[] {
  const children = new Set(childIds);
  const own = series.filter((entry) => children.has(entry.studentId));
  const ownIds = new Set(own.map((entry) => entry.id));
  return expandLessons(
    own,
    exceptions.filter((entry) => ownIds.has(entry.seriesId)),
    today,
    addDays(today, FAMILY_LESSON_DAYS - 1),
  ).map((lesson) => ({
    key: lesson.key,
    studentId: lesson.studentId,
    date: lesson.date,
    startTime: lesson.startTime,
    durationMin: lesson.durationMin,
    status: lesson.status,
    originalDate: lesson.originalDate,
  }));
}

/**
 * An ISO time that shows the lesson's own wall-clock time. Display helpers (formatTime,
 * parentDate) format in Melbourne time, so the lesson's date and time are pinned to
 * Melbourne's offset on that date: a 4:00 pm lesson always reads 4:00 pm, in any studio state.
 */
export function wallClockIso(date: string, time: string): string {
  const guess = new Date(`${date}T${time}:00Z`);
  const name =
    new Intl.DateTimeFormat("en-US", {
      timeZone: "Australia/Melbourne",
      timeZoneName: "longOffset",
    })
      .formatToParts(guess)
      .find((part) => part.type === "timeZoneName")?.value ?? "GMT+10:00";
  const offset = name.replace("GMT", "") || "+00:00";
  return `${date}T${time}:00${offset}`;
}
