import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { canWrite } from "@/lib/subscription";
import { todayIn } from "@/lib/lesson-calendar";
import {
  familyPracticeDeleteProblem,
  familySafeAssignment,
  familyTaskProblem,
  toAssignment,
  ASSIGNMENT_SELECT,
  type AssignmentRow,
  type FamilyAssignment,
} from "@/lib/live-assignments";
import type { PracticeLog } from "@/mocks/types";
import { studioPaused } from "./authz";
import { familyContextForUser, fail, type FamilyContext } from "./family-portal";
import { ProblemError } from "./problem";
import { verifyAccessToken } from "./session";
import { getStudioAccess } from "./subscription-store";
import { createServiceSupabase } from "./supabase";

/**
 * Family writes for practice tasks (0026) and practice entries (0023). Families have no table
 * access, so these use the service key, and every row is checked against the family of the
 * verified user's own guardian row; nothing in the request picks the family or the children.
 */

async function familyWriteContext(accessToken: string, studioId?: string) {
  const session = await verifyAccessToken(accessToken);
  const supabase = createServiceSupabase();
  const ctx = await familyContextForUser(supabase, session.userId, studioId);
  if (!ctx) throw new ProblemError(403, "Not a parent of this studio", "No family found.");
  // Writing needs a studio with full access, the same gate RLS applies to staff writes.
  const { level } = await getStudioAccess(ctx.studioId);
  if (!canWrite(level)) throw studioPaused();
  return { supabase, ctx, userId: session.userId };
}

/**
 * Ticks a task done and logs the minutes as today's practice. Ticking a task that is already
 * done changes nothing (a double tap never logs practice twice).
 */
export async function completeFamilyTask(
  supabase: SupabaseClient,
  ctx: FamilyContext,
  userId: string,
  input: { taskId: string; minutes: number },
  now: Date = new Date(),
): Promise<{ assignment: FamilyAssignment; log: PracticeLog | null }> {
  const problem = familyTaskProblem(input.minutes);
  if (problem) throw new ProblemError(400, "Practice not saved", problem);
  const { data: taskRow, error: taskError } = await supabase
    .from("assignment_task")
    .select("id, assignment_id, studio_id, done_at")
    .eq("id", input.taskId)
    .eq("studio_id", ctx.studioId)
    .maybeSingle();
  fail(taskError, "Task lookup failed");
  const task = taskRow as { id: string; assignment_id: string; done_at: string | null } | null;
  if (!task) throw new ProblemError(404, "Task not found", "That task isn't in your family.");
  const reload = async () => {
    const { data, error } = await supabase
      .from("assignment")
      .select(ASSIGNMENT_SELECT)
      .eq("id", task.assignment_id)
      .eq("studio_id", ctx.studioId)
      .maybeSingle();
    fail(error, "Task lookup failed");
    const row = data as AssignmentRow | null;
    if (!row || !ctx.childIds.includes(row.student_id))
      throw new ProblemError(404, "Task not found", "That task isn't in your family.");
    return familySafeAssignment(toAssignment(row));
  };
  const before = await reload();
  if (task.done_at) return { assignment: before, log: null };

  const { data: logRow, error: logError } = await supabase
    .from("practice_log")
    .insert({
      studio_id: ctx.studioId,
      student_id: before.studentId,
      practice_date: todayIn(ctx.timeZone, now),
      minutes: input.minutes,
      logged_by: "parent",
      logged_by_user_id: userId,
    })
    .select("id, student_id, practice_date, minutes, logged_by")
    .single();
  fail(logError, "Practice not saved");
  const log = logRow as { id: string; student_id: string; practice_date: string; minutes: number };
  // Only an unticked task takes the tick, so two taps racing still leave one linked entry.
  const { data: ticked, error: tickError } = await supabase
    .from("assignment_task")
    .update({ done_at: now.toISOString(), done_by: "parent", practice_log_id: log.id })
    .eq("id", task.id)
    .eq("studio_id", ctx.studioId)
    .is("done_at", null)
    .select("id");
  if (tickError || !(ticked ?? []).length) {
    await supabase.from("practice_log").delete().eq("id", log.id).eq("studio_id", ctx.studioId);
    fail(tickError, "Practice not saved");
    return { assignment: await reload(), log: null };
  }
  return {
    assignment: await reload(),
    log: {
      id: log.id,
      studentId: log.student_id,
      date: log.practice_date,
      minutes: log.minutes,
      loggedBy: "student",
      assignmentTaskId: task.id,
    },
  };
}

/** Deletes one of the family's own practice entries (not the teacher's), last 30 days only. */
export async function deleteFamilyPractice(
  supabase: SupabaseClient,
  ctx: FamilyContext,
  practiceId: string,
  now: Date = new Date(),
): Promise<void> {
  const { data, error } = await supabase
    .from("practice_log")
    .select("id, student_id, practice_date, logged_by")
    .eq("id", practiceId)
    .eq("studio_id", ctx.studioId)
    .maybeSingle();
  fail(error, "Practice lookup failed");
  const row = data as {
    id: string;
    student_id: string;
    practice_date: string;
    logged_by: string;
  } | null;
  if (!row)
    throw new ProblemError(404, "Practice not found", "That practice entry isn't in your family.");
  const problem = familyPracticeDeleteProblem(row, ctx.childIds, todayIn(ctx.timeZone, now));
  if (problem) throw new ProblemError(403, "Practice not deleted", problem);
  const { error: deleteError } = await supabase
    .from("practice_log")
    .delete()
    .eq("id", row.id)
    .eq("studio_id", ctx.studioId);
  fail(deleteError, "Practice not deleted");
}

/** A parent ticks off one of their own children's practice tasks. */
export const familyCompleteTaskFn = createServerFn({ method: "POST" })
  .validator(
    (data: { accessToken: string; studioId?: string; taskId: string; minutes: number }) => data,
  )
  .handler(async ({ data }) => {
    const { supabase, ctx, userId } = await familyWriteContext(data.accessToken, data.studioId);
    return completeFamilyTask(supabase, ctx, userId, {
      taskId: String(data.taskId),
      minutes: Number(data.minutes),
    });
  });

/** A parent deletes a practice entry they (or the student) logged. */
export const familyDeletePracticeFn = createServerFn({ method: "POST" })
  .validator((data: { accessToken: string; studioId?: string; practiceId: string }) => data)
  .handler(async ({ data }): Promise<{ deleted: true }> => {
    const { supabase, ctx } = await familyWriteContext(data.accessToken, data.studioId);
    await deleteFamilyPractice(supabase, ctx, String(data.practiceId));
    return { deleted: true };
  });
