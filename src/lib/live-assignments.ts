/**
 * Weekly practice tasks (assignments) and marking for real studios (0026). Pure rules shared by
 * the staff store (src/services/live/assignment-store.ts), the family server functions
 * (src/server/family-assignments.ts) and the screens. Base and Pro both get these; recordings and
 * video lessons stay Pro and demo-only.
 */
import { addDays } from "@/lib/lesson-calendar";
import type { Feedback } from "@/mocks/types";

export type TaskMark = "done_well" | "keep_going" | "needs_work";
export const TASK_MARKS: TaskMark[] = ["done_well", "keep_going", "needs_work"];
export const TASK_MARK_LABEL: Record<TaskMark, string> = {
  done_well: "Done well",
  keep_going: "Keep going",
  needs_work: "Needs work",
};
/** A mark on a task linked to a course item also adds this checkpoint to the course. */
export const MARK_OUTCOME: Record<TaskMark, Feedback["outcome"]> = {
  done_well: "pass",
  keep_going: "carry_over",
  needs_work: "needs_work",
};

export const MAX_TASKS = 20;
/** Default due date: the day before the next weekly lesson. */
export const DEFAULT_DUE_DAYS = 6;
export const MAX_DUE_DAYS = 60;
/** Families can tick off or delete their own practice for this many days back (as in 0023). */
export const FAMILY_PRACTICE_DELETE_DAYS = 30;

export type LiveTask = {
  id: string;
  position: number;
  text: string;
  minutesPerDay: number;
  daysPerWeek: number;
  courseItemId: string | null;
  attachmentTitle: string | null;
  attachmentUrl: string | null;
  doneAt: string | null;
  doneBy: "student" | "parent" | null;
  practiceLogId: string | null;
  mark: TaskMark | null;
  markComment: string | null;
  markedAt: string | null;
};

export type LiveAssignment = {
  id: string;
  studentId: string;
  occurrenceKey: string | null;
  lessonDate: string;
  dueDate: string;
  markedAt: string | null;
  createdAt: string;
  tasks: LiveTask[];
};

/** What a family sees: no course ids (who marked it is never selected). */
export type FamilyTask = Omit<LiveTask, "courseItemId">;
export type FamilyAssignment = Omit<LiveAssignment, "occurrenceKey" | "tasks"> & {
  tasks: FamilyTask[];
};

export type TaskDraft = {
  id: string;
  text: string;
  minutesPerDay: number;
  daysPerWeek: number;
  courseItemId?: string | undefined;
  attachmentTitle?: string | undefined;
  attachmentUrl?: string | undefined;
};

export type AssignmentRow = {
  id: string;
  student_id: string;
  occurrence_key: string | null;
  lesson_date: string;
  due_date: string;
  marked_at: string | null;
  created_at: string;
  assignment_task?: TaskRow[] | null;
};

export type TaskRow = {
  id: string;
  position: number;
  text: string;
  minutes_per_day: number;
  days_per_week: number;
  course_item_id: string | null;
  attachment_title: string | null;
  attachment_url: string | null;
  done_at: string | null;
  done_by: "student" | "parent" | null;
  practice_log_id: string | null;
  mark: TaskMark | null;
  mark_comment: string | null;
  marked_at: string | null;
};

export const ASSIGNMENT_SELECT =
  "id, student_id, occurrence_key, lesson_date, due_date, marked_at, created_at, assignment_task(id, position, text, minutes_per_day, days_per_week, course_item_id, attachment_title, attachment_url, done_at, done_by, practice_log_id, mark, mark_comment, marked_at)";

export function toTask(row: TaskRow): LiveTask {
  return {
    id: row.id,
    position: row.position,
    text: row.text,
    minutesPerDay: row.minutes_per_day,
    daysPerWeek: row.days_per_week,
    courseItemId: row.course_item_id,
    attachmentTitle: row.attachment_title,
    attachmentUrl: row.attachment_url,
    doneAt: row.done_at,
    doneBy: row.done_by,
    practiceLogId: row.practice_log_id,
    mark: row.mark,
    markComment: row.mark_comment,
    markedAt: row.marked_at,
  };
}

export function toAssignment(row: AssignmentRow): LiveAssignment {
  return {
    id: row.id,
    studentId: row.student_id,
    occurrenceKey: row.occurrence_key,
    lessonDate: row.lesson_date,
    dueDate: row.due_date,
    markedAt: row.marked_at,
    createdAt: row.created_at,
    tasks: (row.assignment_task ?? []).map(toTask).sort((a, b) => a.position - b.position),
  };
}

export function familySafeAssignment(assignment: LiveAssignment): FamilyAssignment {
  return {
    id: assignment.id,
    studentId: assignment.studentId,
    lessonDate: assignment.lessonDate,
    dueDate: assignment.dueDate,
    markedAt: assignment.markedAt,
    createdAt: assignment.createdAt,
    tasks: assignment.tasks.map(({ courseItemId: _c, ...task }) => task),
  };
}

const isDate = (value: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));

/** Only https links go to families; anything else is dropped from the task. */
export function safeAttachmentUrl(url: string | undefined | null): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && url.length <= 2000 ? parsed.toString() : null;
  } catch {
    return null;
  }
}

/** Checks a teacher's tasks before saving. Returns an error message, or null when it's fine. */
export function assignmentProblem(
  input: { lessonDate: string; dueDate: string; tasks: TaskDraft[] },
  courseItemIds: string[] | null = null,
): string | null {
  if (!isDate(input.lessonDate)) return "Choose the lesson.";
  if (!input.tasks.length) return "Add at least one task.";
  if (input.tasks.length > MAX_TASKS) return `Keep it to ${MAX_TASKS} tasks or fewer.`;
  if (new Set(input.tasks.map((task) => task.id)).size !== input.tasks.length)
    return "Each task needs its own id.";
  for (const task of input.tasks) {
    const text = task.text.trim();
    if (!text || text.length > 300) return "Give each task a title (up to 300 characters).";
    if (!Number.isInteger(task.minutesPerDay) || task.minutesPerDay < 1 || task.minutesPerDay > 240)
      return "Minutes per day must be between 1 and 240.";
    if (!Number.isInteger(task.daysPerWeek) || task.daysPerWeek < 1 || task.daysPerWeek > 7)
      return "Days per week must be between 1 and 7.";
    if (task.courseItemId && courseItemIds && !courseItemIds.includes(task.courseItemId))
      return "That course item isn't in this student's course.";
  }
  if (!isDate(input.dueDate) || input.dueDate < input.lessonDate)
    return "Choose a due date on or after the lesson.";
  if (input.dueDate > addDays(input.lessonDate, MAX_DUE_DAYS))
    return `Choose a due date within ${MAX_DUE_DAYS} days of the lesson.`;
  return null;
}

/** The most recent earlier assignment that still has tasks to mark. */
export function assignmentToMark(
  assignments: LiveAssignment[],
  lessonDate: string,
): LiveAssignment | null {
  return (
    [...assignments]
      .filter((entry) => entry.lessonDate < lessonDate && !entry.markedAt && entry.tasks.length)
      .sort((a, b) => b.lessonDate.localeCompare(a.lessonDate))[0] ?? null
  );
}

export type TaskMarkInput = { taskId: string; mark: TaskMark; comment?: string | undefined };

export function marksProblem(assignment: LiveAssignment, marks: TaskMarkInput[]): string | null {
  if (!marks.length) return "Mark at least one task.";
  if (new Set(marks.map((entry) => entry.taskId)).size !== marks.length)
    return "Mark each task once.";
  for (const entry of marks) {
    if (!assignment.tasks.some((task) => task.id === entry.taskId))
      return "That task isn't in this assignment.";
    if (!TASK_MARKS.includes(entry.mark)) return "Choose Done well, Keep going or Needs work.";
    if ((entry.comment?.trim().length ?? 0) > 1000) return "Keep comments under 1,000 characters.";
  }
  return null;
}

/** Every task has a mark once these marks are saved. */
export function fullyMarked(assignment: LiveAssignment, marks: TaskMarkInput[]): boolean {
  const marked = new Set([
    ...assignment.tasks.filter((task) => task.mark).map((task) => task.id),
    ...marks.map((entry) => entry.taskId),
  ]);
  return assignment.tasks.every((task) => marked.has(task.id));
}

/** The family chat message when tasks are sent. No child's name (it shows in the chat already). */
export function assignmentChatBody(
  dueDate: string,
  tasks: Pick<TaskDraft, "text" | "minutesPerDay" | "daysPerWeek" | "attachmentTitle">[],
  updated = false,
): string {
  return [
    `${updated ? "Practice tasks updated" : "New practice tasks"} · due ${dueDate}`,
    ...tasks.map(
      (task) =>
        `${task.text.trim()}: ${task.daysPerWeek} days × ${task.minutesPerDay} min${task.attachmentTitle ? ` · ${task.attachmentTitle}` : ""}`,
    ),
  ].join("\n");
}

/** Families see tasks due from 14 days ago, so recent marks stay visible after the due date. */
export const FAMILY_ASSIGNMENT_DAYS_BACK = 14;

/** Can a family tick this task off now? Returns an error message, or null when it's fine. */
export function familyTaskProblem(minutes: number): string | null {
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 600)
    return "Minutes must be between 1 and 600.";
  return null;
}

/**
 * Can a family delete this practice entry? Only entries a parent or the student logged for one
 * of their own children, in the last 30 days. Teacher-added minutes are the teacher's to delete.
 */
export function familyPracticeDeleteProblem(
  row: { student_id: string; logged_by: string; practice_date: string },
  childIds: string[],
  today: string,
): string | null {
  if (!childIds.includes(row.student_id)) return "That practice entry isn't in your family.";
  if (row.logged_by === "teacher")
    return "Your teacher added these minutes. Ask them to remove it.";
  if (row.practice_date < addDays(today, -FAMILY_PRACTICE_DELETE_DAYS))
    return "Only practice from the last 30 days can be deleted.";
  return null;
}
