import { lessonNotes, type LessonNotes } from "@/mocks/lessons";
import { readiness, weekPractice } from "@/lib/lesson-progress";
import { formatShortDate } from "@/lib/format";
import { getDayLessons } from "./schedule";
import { getPracticeLogs, getRequirements, getStudentProgress } from "./curriculum";
import { getMessages, getOrCreateFamilyConversation, sendMessage } from "./chat";
import { getFamily, getTeacher } from "./roster";
import { respond } from "./_delay";

export async function getLiveLesson(id: string) {
  const separator = id.lastIndexOf("_");
  const date = id.slice(separator + 1);
  if (separator < 0 || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const day = await getDayLessons(date);
  const lesson = day.lessons.find((entry) => entry.id === id);
  if (!lesson) return null;
  const [requirements, progress, practice, family] = await Promise.all([
    getRequirements(lesson.gradeGoal.replace(/^AMEB /, "")), getStudentProgress(lesson.studentId),
    getPracticeLogs(lesson.studentId), getFamily(lesson.student.familyId),
  ]);
  return { lesson, date, requirements, progress, practice, family, draft: await respond(lessonNotes.get(id) ?? { notes: "", voiceSeconds: 0 }) };
}

export async function saveLessonNotes(id: string, input: Pick<LessonNotes, "notes" | "voiceSeconds">) {
  const draft = { ...lessonNotes.get(id), ...input };
  lessonNotes.set(id, draft);
  return respond(draft, 0);
}

// Coalesce double taps while a summary is being sent.
const pendingSummaries = new Map<string, ReturnType<typeof sendSummary>>();
async function sendSummary(id: string) {
  const data = await getLiveLesson(id);
  if (!data) throw new Error("Lesson not found");
  const draft = lessonNotes.get(id) ?? { notes: "", voiceSeconds: 0 };
  if (draft.summaryMessageId && draft.conversationId) {
    const previous = (await getMessages(draft.conversationId)).find((message) => message.id === draft.summaryMessageId);
    if (previous) return previous;
  }
  const conversation = await getOrCreateFamilyConversation(data.lesson.student.familyId);
  const teacher = await getTeacher();
  const practice = weekPractice(data.practice, data.date);
  const passed = data.requirements.filter((requirement) => data.progress.some((entry) => entry.requirementId === requirement.id && entry.status === "passed"));
  const body = [
    `Lesson summary · ${data.lesson.student.firstName} ${data.lesson.student.lastName} · ${formatShortDate(data.date)}`,
    `${data.lesson.gradeGoal} · ${readiness(data.requirements, data.progress)}% ready`,
    `Passed: ${passed.length} of ${data.requirements.length} requirements${passed.length ? ` — ${passed.map((requirement) => requirement.title).join(", ")}` : ""}.`,
    `Practice this week: ${practice.student} minutes logged by student; ${practice.teacher} minutes added by teacher.`,
    draft.notes.trim() ? `Notes: ${draft.notes.trim()}` : "",
    draft.voiceSeconds ? `Voice note: ${draft.voiceSeconds}-second simulated clip (no audio recorded).` : "",
  ].filter(Boolean).join("\n\n");
  const message = await sendMessage({ conversationId: conversation.id, authorName: teacher.name, authorRole: "teacher", kind: "text", body });
  lessonNotes.set(id, { ...draft, summaryMessageId: message.id, conversationId: conversation.id });
  return message;
}

export async function finishLesson(id: string) {
  const existing = pendingSummaries.get(id);
  if (existing) return existing;
  const sending = sendSummary(id);
  pendingSummaries.set(id, sending);
  try { return await sending; } finally { pendingSummaries.delete(id); }
}