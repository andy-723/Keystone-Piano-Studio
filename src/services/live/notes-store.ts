/**
 * Live practice logs and client notes (0023). Same pattern as the other stores: staff load
 * their studio's rows at sign-in (RLS), and a save goes to Supabase before the in-memory store
 * changes, so a failed save never shows as saved. Families never read these tables: their
 * copy comes from the server (src/server/family-portal.ts).
 */
import { practiceLogs } from "@/mocks/data";
import { clientNotes } from "@/mocks/notes";
import type { ClientNote, PracticeLog } from "@/mocks/types";
import {
  getStudioWorkspace,
  liveStudioId,
  liveUserId,
  type StudioWorkspace,
} from "@/lib/studio-workspace";
import { getAuthClient } from "@/lib/auth-client";
import { familyLogPracticeFn } from "@/server/family-portal";
import { client, friendly, type Client } from "./client";

type PracticeRow = {
  id: string;
  student_id: string;
  practice_date: string;
  minutes: number;
  logged_by: "student" | "parent" | "teacher";
};

type NoteRow = {
  id: string;
  subject_type: ClientNote["subjectType"];
  subject_id: string;
  body: string;
  category: ClientNote["category"];
  visibility: ClientNote["visibility"];
  pinned: boolean;
  lesson_occurrence_id: string | null;
  author_name: string;
  created_at: string;
};

/** Home practice (student or parent) counts as the student's own; the teacher's is lesson time. */
export function toPracticeLog(row: PracticeRow): PracticeLog {
  return {
    id: row.id,
    studentId: row.student_id,
    date: row.practice_date,
    minutes: row.minutes,
    loggedBy: row.logged_by === "teacher" ? "teacher" : "student",
  };
}

export function toClientNote(row: NoteRow): ClientNote {
  return {
    id: row.id,
    subjectType: row.subject_type,
    subjectId: row.subject_id,
    authorName: row.author_name,
    body: row.body,
    category: row.category,
    visibility: row.visibility,
    pinned: row.pinned,
    createdAt: row.created_at,
    ...(row.lesson_occurrence_id ? { lessonOccurrenceId: row.lesson_occurrence_id } : {}),
  };
}

/** Staff: the studio's practice logs (last 12 months) and notes. A missing 0023 is logged, not fatal. */
export async function loadLivePracticeAndNotes(
  workspace: Extract<StudioWorkspace, { mode: "live" }>,
  c: Client,
) {
  if (workspace.role === "guardian") return;
  const since = new Date(Date.now() - 366 * 86_400_000).toISOString().slice(0, 10);
  const [practiceRes, noteRes] = await Promise.all([
    c
      .from("practice_log")
      .select("id, student_id, practice_date, minutes, logged_by")
      .eq("studio_id", workspace.studioId)
      .gte("practice_date", since)
      .order("practice_date", { ascending: true }),
    c
      .from("client_note")
      .select(
        "id, subject_type, subject_id, body, category, visibility, pinned, lesson_occurrence_id, author_name, created_at",
      )
      .eq("studio_id", workspace.studioId)
      .order("created_at", { ascending: true }),
  ]);
  if (practiceRes.error || noteRes.error) {
    console.error(
      "[notes-store] practice and notes not loaded",
      (practiceRes.error ?? noteRes.error)?.message,
    );
    return;
  }
  practiceLogs.push(...((practiceRes.data ?? []) as PracticeRow[]).map(toPracticeLog));
  clientNotes.push(...((noteRes.data ?? []) as NoteRow[]).map(toClientNote));
}

function isGuardian() {
  const workspace = getStudioWorkspace();
  return workspace.mode === "live" && workspace.role === "guardian";
}

/**
 * Saves a practice log for a real studio and returns it with its database id. Parents go
 * through the server (checked against their own family); staff insert under RLS.
 * Returns null for the demo, which keeps its in-memory log.
 */
export async function saveLivePractice(
  input: Omit<PracticeLog, "id">,
): Promise<PracticeLog | null> {
  const studioId = liveStudioId();
  if (!studioId) return null;
  if (isGuardian()) {
    const session = (await getAuthClient()?.auth.getSession())?.data.session;
    if (!session) throw new Error("Your sign-in has ended. Please sign in again.");
    const { log } = await familyLogPracticeFn({
      data: {
        accessToken: session.access_token,
        studioId,
        studentId: input.studentId,
        date: input.date,
        minutes: input.minutes,
      },
    });
    return log;
  }
  const { data, error } = await client()
    .from("practice_log")
    .insert({
      studio_id: studioId,
      student_id: input.studentId,
      practice_date: input.date,
      minutes: input.minutes,
      logged_by: input.loggedBy === "teacher" ? "teacher" : "student",
      logged_by_user_id: liveUserId(),
    })
    .select("id, student_id, practice_date, minutes, logged_by")
    .single();
  if (error) throw friendly(error, "Couldn't save the practice minutes. Please try again.");
  return toPracticeLog(data as PracticeRow);
}

/** Inserts a new note; returns it with its database id and time, or null for the demo. */
export async function insertLiveNote(note: Omit<ClientNote, "id" | "createdAt">) {
  const studioId = liveStudioId();
  if (!studioId) return null;
  const { data, error } = await client()
    .from("client_note")
    .insert({
      studio_id: studioId,
      subject_type: note.subjectType,
      subject_id: note.subjectId,
      body: note.body,
      category: note.category,
      visibility: note.visibility,
      pinned: note.pinned,
      lesson_occurrence_id: note.lessonOccurrenceId ?? null,
      author_user_id: liveUserId(),
      author_name: note.authorName,
    })
    .select(
      "id, subject_type, subject_id, body, category, visibility, pinned, lesson_occurrence_id, author_name, created_at",
    )
    .single();
  if (error) throw friendly(error, "Couldn't save the note. Please try again.");
  return toClientNote(data as NoteRow);
}

export async function updateLiveNote(
  id: string,
  patch: Partial<Pick<ClientNote, "body" | "category" | "visibility" | "pinned">>,
) {
  const studioId = liveStudioId();
  if (!studioId) return;
  const { error } = await client()
    .from("client_note")
    .update(patch)
    .eq("id", id)
    .eq("studio_id", studioId);
  if (error) throw friendly(error, "Couldn't save the note. Please try again.");
}

export async function deleteLiveNote(id: string) {
  const studioId = liveStudioId();
  if (!studioId) return;
  const { error } = await client()
    .from("client_note")
    .delete()
    .eq("id", id)
    .eq("studio_id", studioId);
  if (error) throw friendly(error, "Couldn't delete the note. Please try again.");
}
