/**
 * Practice tasks and marking for real studios (0026). Staff read and write `assignment` and
 * `assignment_task` under RLS with their own session (no service key). Screens load these with
 * React Query (`liveAssignmentsQuery`), not the demo fixtures, which stay for the demo studio.
 * Families never call this: their copy comes from the family portal and they tick tasks off
 * through src/server/family-assignments.ts.
 */
import { queryOptions } from "@tanstack/react-query";
import {
  ASSIGNMENT_SELECT,
  MARK_OUTCOME,
  assignmentChatBody,
  assignmentProblem,
  fullyMarked,
  marksProblem,
  safeAttachmentUrl,
  toAssignment,
  type AssignmentRow,
  type LiveAssignment,
  type TaskDraft,
  type TaskMarkInput,
} from "@/lib/live-assignments";
import { liveStudioId, liveUserId } from "@/lib/studio-workspace";
import { practiceLogs, students, teacher } from "@/mocks/data";
import { libraryState } from "@/mocks/library";
import { getOrCreateFamilyConversation, sendMessage } from "../chat";
import { getStudentCourse, recordCourseFeedback } from "../curriculum";
import { client, friendly } from "./client";

function studioId() {
  const id = liveStudioId();
  if (!id) throw new Error("Practice tasks are saved for real studios only.");
  return id;
}

/** Library items a task can point at: only ones with an https link reach the family. */
export function liveAttachableLibrary(): { id: string; title: string; url: string }[] {
  return libraryState.demo.content.flatMap((item) => {
    const url = safeAttachmentUrl(item.url);
    return url && ["link", "video_link", "file", "video", "audio"].includes(item.kind)
      ? [{ id: item.id, title: item.title, url }]
      : [];
  });
}

/** A student's assignments, newest lesson first (last 26 weeks). */
export async function listLiveAssignments(studentId: string): Promise<LiveAssignment[]> {
  const { data, error } = await client()
    .from("assignment")
    .select(ASSIGNMENT_SELECT)
    .eq("studio_id", studioId())
    .eq("student_id", studentId)
    .order("lesson_date", { ascending: false })
    .limit(26);
  if (error) {
    // A database without 0026 yet shows no tasks instead of breaking the page.
    if (error.code === "42P01" || error.code === "PGRST205") return [];
    throw friendly(error, "Couldn't load practice tasks. Please try again.");
  }
  return ((data ?? []) as AssignmentRow[]).map(toAssignment);
}

export const liveAssignmentsQuery = (studentId: string) =>
  queryOptions({
    queryKey: ["live-assignments", studentId],
    queryFn: () => listLiveAssignments(studentId),
  });

async function courseItemIds(studentId: string) {
  return (await getStudentCourse(studentId)).items.map((item) => item.id);
}

/**
 * Saves the tasks set at one lesson (one assignment per lesson). A re-save keeps each task's
 * tick by its id; marked tasks are locked. Sends one family chat message.
 */
export async function saveLiveAssignment(input: {
  studentId: string;
  occurrenceKey: string;
  lessonDate: string;
  dueDate: string;
  tasks: TaskDraft[];
}): Promise<LiveAssignment> {
  const sid = studioId();
  const student = students.find((entry) => entry.id === input.studentId);
  if (!student) throw new Error("Student not found.");
  const problem = assignmentProblem(input, await courseItemIds(input.studentId));
  if (problem) throw new Error(problem);
  const existing = (await listLiveAssignments(input.studentId)).find(
    (entry) => entry.occurrenceKey === input.occurrenceKey,
  );
  if (existing?.markedAt || existing?.tasks.some((task) => task.mark))
    throw new Error("These tasks are already marked, so they can't be changed.");
  const db = client();
  const id = existing?.id ?? crypto.randomUUID();
  const { error } = await db.from("assignment").upsert({
    id,
    studio_id: sid,
    student_id: input.studentId,
    occurrence_key: input.occurrenceKey,
    lesson_date: input.lessonDate,
    due_date: input.dueDate,
    created_by: existing ? undefined : liveUserId(),
  });
  if (error) throw friendly(error, "Couldn't save the practice tasks. Please try again.");
  const keep = new Set(input.tasks.map((task) => task.id));
  const removed = (existing?.tasks ?? [])
    .filter((task) => !keep.has(task.id))
    .map((task) => task.id);
  if (removed.length) {
    const { error: deleteError } = await db
      .from("assignment_task")
      .delete()
      .eq("studio_id", sid)
      .in("id", removed);
    if (deleteError)
      throw friendly(deleteError, "Couldn't save the practice tasks. Please try again.");
  }
  const { error: taskError } = await db.from("assignment_task").upsert(
    input.tasks.map((task, position) => ({
      id: task.id,
      studio_id: sid,
      assignment_id: id,
      position,
      text: task.text.trim(),
      minutes_per_day: task.minutesPerDay,
      days_per_week: task.daysPerWeek,
      course_item_id: task.courseItemId || null,
      attachment_title: task.attachmentTitle?.trim() || null,
      attachment_url: safeAttachmentUrl(task.attachmentUrl),
    })),
  );
  if (taskError) throw friendly(taskError, "Couldn't save the practice tasks. Please try again.");
  const saved = (await listLiveAssignments(input.studentId)).find((entry) => entry.id === id);
  if (!saved) throw new Error("Couldn't save the practice tasks. Please try again.");
  // The tasks are saved; a chat failure shouldn't undo them, so it is reported, not thrown.
  try {
    const conversation = await getOrCreateFamilyConversation(student.familyId);
    await sendMessage({
      conversationId: conversation.id,
      authorName: teacher.name || "Your teacher",
      authorRole: "teacher",
      kind: "text",
      body: assignmentChatBody(input.dueDate, input.tasks, Boolean(existing)),
      assignmentCard: { assignmentId: id, label: "This week’s assignment" },
    });
  } catch (chatError) {
    console.warn("[assignment-store] tasks saved, family chat message not sent", chatError);
  }
  return saved;
}

/** Deletes an unmarked assignment. Practice the family already logged stays. */
export async function deleteLiveAssignment(assignment: LiveAssignment): Promise<void> {
  if (assignment.markedAt || assignment.tasks.some((task) => task.mark))
    throw new Error("Marked tasks can't be deleted.");
  const { error } = await client()
    .from("assignment")
    .delete()
    .eq("studio_id", studioId())
    .eq("id", assignment.id);
  if (error) throw friendly(error, "Couldn't delete the practice tasks. Please try again.");
}

/**
 * Marks tasks: Done well / Keep going / Needs work, with an optional comment shared with the
 * family. A task linked to a course item also adds a shared checkpoint on that item.
 */
export async function markLiveAssignment(
  assignment: LiveAssignment,
  marks: TaskMarkInput[],
): Promise<void> {
  const sid = studioId();
  const problem = marksProblem(assignment, marks);
  if (problem) throw new Error(problem);
  const db = client();
  const now = new Date().toISOString();
  for (const entry of marks) {
    const { error } = await db
      .from("assignment_task")
      .update({
        mark: entry.mark,
        mark_comment: entry.comment?.trim() || null,
        marked_at: now,
        marked_by: liveUserId(),
      })
      .eq("studio_id", sid)
      .eq("id", entry.taskId);
    if (error) throw friendly(error, "Couldn't save the marks. Please try again.");
  }
  if (fullyMarked(assignment, marks)) {
    const { error } = await db
      .from("assignment")
      .update({ marked_at: now })
      .eq("studio_id", sid)
      .eq("id", assignment.id);
    if (error) throw friendly(error, "Couldn't save the marks. Please try again.");
  }
  const ids = await courseItemIds(assignment.studentId);
  for (const entry of marks) {
    const task = assignment.tasks.find((item) => item.id === entry.taskId);
    if (!task?.courseItemId || !ids.includes(task.courseItemId)) continue;
    await recordCourseFeedback({
      studentId: assignment.studentId,
      courseItemId: task.courseItemId,
      outcome: MARK_OUTCOME[entry.mark],
      comment: entry.comment?.trim() || undefined,
      shared: true,
    });
  }
}

/** Staff delete any practice entry in their studio (RLS). Its task, if any, is un-ticked. */
export async function deleteLivePractice(id: string): Promise<void> {
  const { error } = await client()
    .from("practice_log")
    .delete()
    .eq("studio_id", studioId())
    .eq("id", id);
  if (error) throw friendly(error, "Couldn't delete the practice entry. Please try again.");
  const index = practiceLogs.findIndex((entry) => entry.id === id);
  if (index >= 0) practiceLogs.splice(index, 1);
}
