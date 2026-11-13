import { practiceLogs, requirements, studentProgress } from "@/mocks/data";
import type { PracticeLog, Requirement, StudentProgress } from "@/mocks/types";
import { respond } from "./_delay";
import { students, teacher } from "@/mocks/data";
import { libraryState } from "@/mocks/library";
import { buildCourseSnapshot } from "@/lib/course-snapshot";
import { getOrCreateFamilyConversation, sendMessage } from "./chat";
import { courseFeedback, courseItems, frameworkSections, frameworkSlots, seedStudentCourse, stageNames, studentCourses, termMilestones } from "@/mocks/curriculum";
import { courseReadiness, hasNoFeedbackInThreeLessons, lastSignOff, sectionProgress, stageAfterFeedback } from "@/lib/course-progress";
import { BENCHMARK_VERSION, PATHWAYS, PILLARS, benchmarkLevel, benchmarkLevelForGrade, repertoireSlotLabels, type BenchmarkPathway } from "@/lib/benchmarks";
import type { CourseItem, Feedback, FrameworkSection, FrameworkSlot, Student, StudentCourse } from "@/mocks/types";
import { isLiveStudio } from "@/lib/studio-workspace";
import { currentTermKey, termAfterKey } from "@/lib/course-progress";
import { withLiveCourseSave } from "./live/course-store";

/**
 * Real studios get an empty starter course (not saved until the teacher edits it) instead of the
 * demo's made-up pieces. Kept per student so ids stay the same between reads.
 */
const starterCourses = new Map<string, { course: StudentCourse; sections: FrameworkSection[] }>();
/** Keystone default weights 40/20/20/20 (benchmark pillars); studios can change them per course. */
const STARTER_SECTIONS: [string, number][] = PILLARS.map((pillar) => [pillar.name, pillar.weightPct]);
function starterCourse(student: Student) {
  const saved = starterCourses.get(student.id);
  if (saved) return saved;
  const course: StudentCourse = { id: crypto.randomUUID(), studentId: student.id, framework: "Custom", grade: student.gradeGoal || "Personal repertoire", targetTerm: termAfterKey(currentTermKey(new Date()), 1), weeklyPracticeGoalMin: 75, gradeHoursEstimate: 40, status: "active" };
  const sections = STARTER_SECTIONS.map(([name, weightPct], index): FrameworkSection => ({ id: `${course.id}-section-${index}`, framework: course.framework, grade: course.grade, name, weightPct }));
  const starter = { course, sections };
  starterCourses.set(student.id, starter);
  return starter;
}
function activeOrStarter(student: Student) {
  if (!isLiveStudio()) return { course: seedStudentCourse(student), sections: null };
  const existing = studentCourses.find((course) => course.studentId === student.id && course.status !== "archived");
  if (existing) return { course: existing, sections: null };
  return starterCourse(student);
}
/** Puts an unsaved starter course into the store, so the first save keeps it. */
function adoptStarter(course: StudentCourse) {
  const starter = starterCourses.get(course.studentId);
  if (starter?.course !== course || studentCourses.includes(course)) return;
  studentCourses.push(course);
  frameworkSections.push(...starter.sections);
  starterCourses.delete(course.studentId);
}

function courseState(studentId: string) {
  const student = students.find((entry) => entry.id === studentId);
  if (!student) throw new Error("Student not found.");
  const { course, sections: starterSections } = activeOrStarter(student);
  const sections = starterSections ?? frameworkSections.filter((entry) => entry.id.startsWith(`${course.id}-`));
  const items = courseItems.filter((entry) => entry.studentCourseId === course.id);
  const slots = frameworkSlots.filter((entry) => sections.some((section) => section.id === entry.sectionId));
  const feedback = courseFeedback.filter((entry) => items.some((item) => item.id === entry.courseItemId));
  const benchmark = benchmarkLevel(course.benchmarkLevel) ?? benchmarkLevelForGrade(course.grade);
  return { course, sections, slots, items, feedback, stageNames, milestones: termMilestones.filter((entry) => entry.studentCourseId === course.id), readiness: courseReadiness(sections, items), progress: sectionProgress(sections, items), lastSignOffAt: lastSignOff(feedback), benchmark, weightLabel: "Studio default" };
}
export const getStudentCourse = (studentId: string) => respond(courseState(studentId));
export async function saveStudentCourse(studentId: string, input: Pick<StudentCourse, "targetTerm"> & { items: CourseItem[] }) {
  const state = courseState(studentId);
  if (!/^\d{4}-T[1-4]$/.test(input.targetTerm)) throw new Error("Choose a target term.");
  if (input.items.some((item) => !item.title.trim() || !state.sections.some((section) => section.id === item.sectionId) || item.slotId && !state.slots.some((slot) => slot.id === item.slotId && slot.sectionId === item.sectionId) || !Number.isInteger(item.stage) || item.stage < 1 || item.stage > 5 || item.kind !== undefined && !["piece", "technical", "checklist"].includes(item.kind) || item.score !== undefined && ![0, 50, 100].includes(item.score) || item.kind === "checklist" && item.score === 50)) throw new Error("Give every item a title and a valid section, slot and stage.");
  const ids = input.items.map((item) => item.id);
  if (new Set(ids).size !== ids.length || input.items.some((item) => courseItems.some((existing) => existing.id === item.id && existing.studentCourseId !== state.course.id))) throw new Error("Course items must have unique IDs.");
  await withLiveCourseSave(() => {
    adoptStarter(state.course);
    state.course.targetTerm = input.targetTerm;
    for (let i = courseItems.length - 1; i >= 0; i--) if (courseItems[i]?.studentCourseId === state.course.id) courseItems.splice(i, 1);
    courseItems.push(...input.items.map((item) => ({ ...item, studentCourseId: state.course.id, title: item.title.trim(), composer: item.composer?.trim(), updatedAt: new Date().toISOString() })));
    for (let i = termMilestones.length - 1; i >= 0; i--) if (termMilestones[i]?.studentCourseId === state.course.id && !ids.includes(termMilestones[i]?.courseItemId ?? "")) termMilestones.splice(i, 1);
  }, () => [state.course.id]);
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
  const createdAt = isLiveStudio() ? new Date().toISOString() : new Date(Math.max(Date.parse("2027-03-15T12:00:00+11:00"), ...courseFeedback.map((entry) => Date.parse(entry.createdAt) + 1000))).toISOString();
  const feedback: Feedback = { id: crypto.randomUUID(), courseItemId: item.id, occurrenceId: input.occurrenceId, submissionId: input.submissionId, outcome: input.outcome, newStage: stage, comment: input.comment?.trim() || undefined, shared: input.shared ?? false, createdAt };
  await withLiveCourseSave(() => {
    courseFeedback.push(feedback);
    item.stage = stage; item.updatedAt = feedback.createdAt;
  }, () => [state.course.id]);
  return getStudentCourse(input.studentId);
}
/** One-tap score for technical (0/50/100) and checklist (0/100) items, recorded as a checkpoint. */
export async function scoreCourseItem(input: { studentId: string; courseItemId: string; score: 0 | 50 | 100; occurrenceId?: string }) {
  const state = courseState(input.studentId);
  const item = state.items.find((entry) => entry.id === input.courseItemId);
  if (!item) throw new Error("Course item not found.");
  if (item.kind !== "technical" && item.kind !== "checklist") throw new Error("Pieces use stages, not scores.");
  if (![0, 50, 100].includes(input.score) || item.kind === "checklist" && input.score === 50) throw new Error("Choose a valid score.");
  if (input.occurrenceId) {
    const { getLessonOccurrence } = await import("./schedule");
    const lesson = await getLessonOccurrence(input.occurrenceId);
    if (!lesson || lesson.studentId !== input.studentId) throw new Error("Lesson does not belong to this student.");
  }
  const createdAt = isLiveStudio() ? new Date().toISOString() : new Date(Math.max(Date.parse("2027-03-15T12:00:00+11:00"), ...courseFeedback.map((entry) => Date.parse(entry.createdAt) + 1000))).toISOString();
  const feedback: Feedback = { id: crypto.randomUUID(), courseItemId: item.id, occurrenceId: input.occurrenceId, outcome: input.score > (item.score ?? 0) ? "pass" : "stage_move", score: input.score, shared: false, createdAt };
  await withLiveCourseSave(() => {
    adoptStarter(state.course);
    courseFeedback.push(feedback);
    item.score = input.score; item.updatedAt = createdAt;
  }, () => [state.course.id]);
  return getStudentCourse(input.studentId);
}

/**
 * Starts a new course from a Keystone benchmark level: the four pillars at 40/20/20/20, the
 * level's technical, theory and ear checklists, and empty repertoire slots for the teacher's
 * pieces. The current course is archived with its history, as "Assign to students" does.
 */
export async function startBenchmarkCourse(studentId: string, input: { levelId: string; pathway: BenchmarkPathway; targetTerm: string }) {
  const student = students.find((entry) => entry.id === studentId);
  if (!student) throw new Error("Student not found.");
  const level = benchmarkLevel(input.levelId);
  if (!level) throw new Error("Choose a level.");
  const pathway = PATHWAYS.find((entry) => entry.id === input.pathway);
  if (!pathway) throw new Error("Choose a pathway.");
  if (!/^\d{4}-T[1-4]$/.test(input.targetTerm)) throw new Error("Choose a target term.");
  const current = studentCourses.find((course) => course.studentId === studentId && course.status === "active");
  const now = new Date().toISOString();
  const course: StudentCourse = { id: crypto.randomUUID(), studentId, framework: pathway.framework, grade: level.label, targetTerm: input.targetTerm, weeklyPracticeGoalMin: current?.weeklyPracticeGoalMin ?? level.practiceMinPerDay[1] * 5, gradeHoursEstimate: current?.gradeHoursEstimate ?? 40, status: "active", benchmarkLevel: level.id, benchmarkVersion: BENCHMARK_VERSION, name: `${pathway.id === "recreational" ? "" : `${pathway.label} `}${level.label}` };
  const sections: FrameworkSection[] = PILLARS.map((pillar) => ({ id: `${course.id}-${pillar.id}`, framework: course.framework, grade: course.grade, name: pillar.name, weightPct: pillar.weightPct }));
  const slots: FrameworkSlot[] = repertoireSlotLabels(pathway.id, level.pieces).map((label, i) => ({ id: `${course.id}-repertoire-slot-${i}`, sectionId: `${course.id}-repertoire`, label }));
  const items: CourseItem[] = PILLARS.filter((pillar) => pillar.kind !== "piece").flatMap((pillar) => level.pillars[pillar.id].items.map((title): CourseItem => ({ id: crypto.randomUUID(), studentCourseId: course.id, sectionId: `${course.id}-${pillar.id}`, title, kind: pillar.kind, score: 0, stage: 1, updatedAt: now })));
  await withLiveCourseSave(() => {
    if (current) { current.status = "archived"; current.archivedAt = now; }
    starterCourses.delete(studentId);
    studentCourses.push(course);
    frameworkSections.push(...sections);
    frameworkSlots.push(...slots);
    courseItems.push(...items);
  }, () => [course.id, ...(current ? [current.id] : [])]);
  return getStudentCourse(studentId);
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
    await withLiveCourseSave(() => {
      if (current) {
        current.status = "archived";
        current.archivedAt = now;
      }
      studentCourses.push(snapshot.course);
      frameworkSections.push(...snapshot.sections);
      courseItems.push(...snapshot.items);
      termMilestones.push(...snapshot.milestones);
    }, () => [snapshot.course.id, ...(current ? [current.id] : [])]);
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
