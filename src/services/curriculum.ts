import { practiceLogs, requirements, studentProgress } from "@/mocks/data";
import type { PracticeLog, Requirement, StudentProgress } from "@/mocks/types";
import { respond } from "./_delay";
import { students } from "@/mocks/data";
import { courseFeedback, courseItems, frameworkSections, frameworkSlots, seedStudentCourse, stageNames, termMilestones } from "@/mocks/curriculum";
import { courseReadiness, hasNoFeedbackInThreeLessons, stageAfterFeedback } from "@/lib/course-progress";
import type { CourseItem, Feedback, StudentCourse } from "@/mocks/types";

function courseState(studentId: string) {
  const student = students.find((entry) => entry.id === studentId);
  if (!student) throw new Error("Student not found.");
  const course = seedStudentCourse(student);
  const sections = frameworkSections.filter((entry) => entry.id.startsWith(`${course.id}-`));
  const items = courseItems.filter((entry) => entry.studentCourseId === course.id);
  const slots = frameworkSlots.filter((entry) => sections.some((section) => section.id === entry.sectionId));
  const feedback = courseFeedback.filter((entry) => items.some((item) => item.id === entry.courseItemId));
  return { course, sections, slots, items, feedback, stageNames, milestones: termMilestones.filter((entry) => entry.studentCourseId === course.id), readiness: courseReadiness(sections, items), weightLabel: "Studio default" };
}
export const getStudentCourse = (studentId: string) => respond(courseState(studentId));
export async function saveStudentCourse(studentId: string, input: Pick<StudentCourse, "targetTerm"> & { items: CourseItem[] }) {
  const state = courseState(studentId);
  if (!/^2027-T[1-4]$/.test(input.targetTerm)) throw new Error("Choose a target term.");
  if (input.items.some((item) => !item.title.trim() || !state.sections.some((section) => section.id === item.sectionId) || item.slotId && !state.slots.some((slot) => slot.id === item.slotId && slot.sectionId === item.sectionId) || !Number.isInteger(item.stage) || item.stage < 1 || item.stage > 5)) throw new Error("Give every item a title and a valid section, slot and stage.");
  const ids = input.items.map((item) => item.id);
  if (new Set(ids).size !== ids.length || input.items.some((item) => courseItems.some((existing) => existing.id === item.id && existing.studentCourseId !== state.course.id))) throw new Error("Course items must have unique IDs.");
  state.course.targetTerm = input.targetTerm;
  for (let i = courseItems.length - 1; i >= 0; i--) if (courseItems[i]?.studentCourseId === state.course.id) courseItems.splice(i, 1);
  courseItems.push(...input.items.map((item) => ({ ...item, studentCourseId: state.course.id, title: item.title.trim(), composer: item.composer?.trim(), updatedAt: new Date().toISOString() })));
  for (let i = termMilestones.length - 1; i >= 0; i--) if (termMilestones[i]?.studentCourseId === state.course.id && !ids.includes(termMilestones[i]?.courseItemId ?? "")) termMilestones.splice(i, 1);
  return getStudentCourse(studentId);
}
export async function recordCourseFeedback(input: Omit<Feedback, "id" | "createdAt"> & { studentId: string }) {
  const state = courseState(input.studentId);
  const item = state.items.find((entry) => entry.id === input.courseItemId);
  if (!item) throw new Error("Course item not found.");
  if (input.occurrenceId) {
    const { getLessonOccurrence } = await import("./schedule");
    const lesson = await getLessonOccurrence(input.occurrenceId);
    if (!lesson || lesson.studentId !== input.studentId) throw new Error("Lesson does not belong to this student.");
  }
  if (!["pass", "stage_move", "carry_over", "needs_work"].includes(input.outcome)) throw new Error("Choose a checkpoint outcome.");
  const stage = stageAfterFeedback(item.stage, input.outcome, input.newStage);
  const feedback: Feedback = { id: crypto.randomUUID(), courseItemId: item.id, occurrenceId: input.occurrenceId, submissionId: input.submissionId, outcome: input.outcome, newStage: stage, comment: input.comment?.trim() || undefined, shared: input.shared ?? false, createdAt: new Date().toISOString() };
  courseFeedback.push(feedback);
  item.stage = stage; item.updatedAt = feedback.createdAt;
  return getStudentCourse(input.studentId);
}
export async function getCourseReminders(studentId: string, beforeDate: string) {
  const state = courseState(studentId);
  const { getDayLessons } = await import("./schedule");
  const { addDays } = await import("@/lib/calendar");
  const dates: string[] = [];
  for (let date = addDays(beforeDate, -1); date >= "2027-01-28"; date = addDays(date, -1)) dates.push(date);
  const days = await Promise.all(dates.map(getDayLessons));
  const recent = days.flatMap((day) => day.lessons.filter((lesson) => lesson.studentId === studentId && lesson.status === "attended").map((lesson) => lesson.id)).slice(0, 3);
  const reminders = state.sections.flatMap((section) => hasNoFeedbackInThreeLessons(state.items.filter((item) => item.sectionId === section.id).map((item) => item.id), recent, state.feedback) ? [section.name] : []);
  // Aural and sight-reading are separate teaching strands inside Musicianship.
  for (const item of state.items.filter((entry) => entry.title === "Sight-reading")) if (hasNoFeedbackInThreeLessons([item.id], recent, state.feedback) && !reminders.includes(state.sections.find((section) => section.id === item.sectionId)?.name ?? "")) reminders.push(item.title);
  return respond(reminders);
}

export const getRequirements = (grade: string): Promise<Requirement[]> =>
  respond(requirements.filter((r) => r.grade === grade));

export const getStudentProgress = (studentId: string): Promise<StudentProgress[]> =>
  respond(studentProgress.filter((p) => p.studentId === studentId));

export async function setProgress(studentId: string, requirementId: string, status: StudentProgress["status"]) {
  const p = studentProgress.find((x) => x.studentId === studentId && x.requirementId === requirementId);
  if (p) p.status = status;
  else studentProgress.push({ studentId, requirementId, status });
  return respond(status, 60);
}

export const getPracticeLogs = (studentId: string): Promise<PracticeLog[]> =>
  respond(practiceLogs.filter((l) => l.studentId === studentId));

export async function addPractice(input: Omit<PracticeLog, "id">): Promise<PracticeLog> {
  const log = { ...input, id: `pl-${practiceLogs.length + 1}` };
  practiceLogs.push(log);
  return respond(log);
}
