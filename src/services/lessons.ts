import { lessonNotes, type LessonNotes } from "@/mocks/lessons";
import { weekPractice } from "@/lib/lesson-progress";
import { formatShortDate } from "@/lib/format";
import { getLessonOccurrence } from "./schedule";
import { getPracticeLogs, getRequirements, getStudentProgress, getStudentCourse, getCourseReminders } from "./curriculum";
import { getMessages, getOrCreateFamilyConversation, sendMessage } from "./chat";
import { getFamily, getTeacher } from "./roster";
import { respond } from "./_delay";

export async function getLiveLesson(id: string) {
  const separator = id.lastIndexOf("_");
  const date = id.slice(separator + 1);
  if (separator < 0 || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const lesson = await getLessonOccurrence(id);
  if (!lesson) return null;
  const [requirements, progress, practice, family] = await Promise.all([
    getRequirements(lesson.gradeGoal.replace(/^AMEB /, "")), getStudentProgress(lesson.studentId),
    getPracticeLogs(lesson.studentId), getFamily(lesson.student.familyId),
  ]);
  const [course, reminders] = await Promise.all([getStudentCourse(lesson.studentId), getCourseReminders(lesson.studentId, lesson.startsAt.slice(0, 10))]);
  return { lesson, date: lesson.startsAt.slice(0, 10), requirements, progress, practice, family, course, reminders, draft: await respond(lessonNotes.get(id) ?? { notes: "", voiceSeconds: 0 }) };
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
  const passed = data.course.items.filter((item) => item.stage === 5);
  const body = [
    `Lesson summary · ${data.lesson.student.firstName} ${data.lesson.student.lastName} · ${formatShortDate(data.date)}`,
    `${data.course.course.framework} ${data.course.course.grade} · ${data.course.readiness}% ready`,
    `Exam ready: ${passed.length} of ${data.course.items.length} course items${passed.length ? ` — ${passed.map((item) => item.title).join(", ")}` : ""}.`,
    `Practice this week: ${practice.student} minutes logged by student; ${practice.teacher} minutes added by teacher.`,
    draft.notes.trim() ? `Notes: ${draft.notes.trim()}` : "",
    draft.voiceSeconds ? `Voice note: ${draft.voiceSeconds}-second simulated clip (no audio recorded).` : "",
  ].filter(Boolean).join("\n\n");
  const message = await sendMessage({ conversationId: conversation.id, authorName: teacher.name, authorRole: "teacher", kind: "text", body,
    lessonSummary: { lessonId: id, studentName: `${data.lesson.student.firstName} ${data.lesson.student.lastName}`, gradeGoal: `${data.course.course.framework} ${data.course.course.grade}`, readiness: data.course.readiness, date: data.date, passedCount: passed.length, requirementCount: data.course.items.length, studentMinutes: practice.student, teacherMinutes: practice.teacher, notes: draft.notes.trim(), voiceSeconds: draft.voiceSeconds },
  });
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