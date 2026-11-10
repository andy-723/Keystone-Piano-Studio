import { practiceLogs, requirements, studentProgress } from "@/mocks/data";
import type { PracticeLog, Requirement, StudentProgress } from "@/mocks/types";
import { respond } from "./_delay";
import { students, teacher } from "@/mocks/data";
import { libraryState } from "@/mocks/library";
import { buildCourseSnapshot } from "@/lib/course-snapshot";
import { getOrCreateFamilyConversation, sendMessage } from "./chat";
import { courseFeedback, courseItems, frameworkSections, frameworkSlots, seedStudentCourse, stageNames, studentCourses, termMilestones } from "@/mocks/curriculum";
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
  const createdAt = new Date(Math.max(Date.parse("2027-03-15T12:00:00+11:00"), ...courseFeedback.map((entry) => Date.parse(entry.createdAt) + 1000))).toISOString();
  const feedback: Feedback = { id: crypto.randomUUID(), courseItemId: item.id, occurrenceId: input.occurrenceId, submissionId: input.submissionId, outcome: input.outcome, newStage: stage, comment: input.comment?.trim() || undefined, shared: input.shared ?? false, createdAt };
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

export type CourseAssignmentOption = {
  studentId: string;
  name: string;
  currentCourse: { name: string; templateId?: string } | null;
};

function courseLabel(course: StudentCourse) {
  return course.name || `${course.framework} · ${course.grade}`;
}

function activeCourse(studentId: string) {
  return studentCourses.find((course) => course.studentId === studentId && course.status === "active") ?? null;
}

/** Students the teacher can pick in "Assign to students", with the course each is on now. */
export async function getCourseAssignmentOptions(): Promise<CourseAssignmentOption[]> {
  return respond(
    students
      .map((student) => {
        const course = activeCourse(student.id);
        return {
          studentId: student.id,
          name: `${student.firstName} ${student.lastName}`,
          currentCourse: course ? { name: courseLabel(course), ...(course.templateId ? { templateId: course.templateId } : {}) } : null,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name)),
  );
}

export type CourseAssignmentResult = {
  assigned: string[];
  skipped: { studentId: string; reason: "has_course" | "already_on_course" }[];
};

/**
 * Assigns a studio course template to existing students (demo studio). Each student gets the same
 * deep copy enrolment makes. A student already on another course is skipped unless listed in
 * `replace`; replacing archives the old course and keeps its items, feedback and history.
 * Re-assigning a student's current template does nothing, so the call is safe to repeat.
 */
export async function assignCourseTemplate(input: {
  templateId: string;
  studentIds: string[];
  targetTerm: string;
  replace?: string[];
}): Promise<CourseAssignmentResult> {
  const template = libraryState.demo.courses.find((entry) => entry.id === input.templateId);
  if (!template) throw new Error("Course template not found.");
  if (template.supplied) throw new Error("Copy this template first, then assign your studio copy.");
  if (!/^\d{4}-T[1-4]$/.test(input.targetTerm)) throw new Error("Choose a target term.");
  const ids = [...new Set(input.studentIds)];
  if (!ids.length) throw new Error("Choose at least one student.");
  const unknown = ids.find((id) => !students.some((student) => student.id === id));
  if (unknown) throw new Error("Student not found.");
  const replace = new Set(input.replace ?? []);
  const result: CourseAssignmentResult = { assigned: [], skipped: [] };
  const now = new Date().toISOString();
  for (const studentId of ids) {
    const current = activeCourse(studentId);
    if (current?.templateId === template.id) {
      result.skipped.push({ studentId, reason: "already_on_course" });
      continue;
    }
    if (current && !replace.has(studentId)) {
      result.skipped.push({ studentId, reason: "has_course" });
      continue;
    }
    const snapshot = buildCourseSnapshot(structuredClone(template), {
      studentId,
      targetTerm: input.targetTerm,
      weeklyPracticeGoalMin: current?.weeklyPracticeGoalMin ?? 75,
      gradeHoursEstimate: current?.gradeHoursEstimate ?? 40,
      updatedAt: now,
    });
    if (current) {
      current.status = "archived";
      current.archivedAt = now;
    }
    studentCourses.push(snapshot.course);
    frameworkSections.push(...snapshot.sections);
    courseItems.push(...snapshot.items);
    termMilestones.push(...snapshot.milestones);
    result.assigned.push(studentId);
    const student = students.find((entry) => entry.id === studentId);
    if (student) {
      const conversation = await getOrCreateFamilyConversation(student.familyId);
      await sendMessage({
        conversationId: conversation.id,
        authorRole: "teacher",
        authorName: teacher.name,
        kind: "text",
        body: `${student.firstName} has started ${template.name}. / ${student.firstName} 已开始学习「${template.name}」。`,
      });
    }
  }
  return respond(result);
}
