import { families, students, teacher } from "@/mocks/data";
import { newStudioRoster, type ImportScope } from "@/mocks/roster-import";
import { enrolmentDrafts, type EnrolmentDraft } from "@/mocks/onboarding";
import { libraryState } from "@/mocks/library";
import { studentCourses, frameworkSections, courseItems, termMilestones } from "@/mocks/curriculum";
import type { CourseStage, Intake, Message } from "@/mocks/types";
import { getOrCreateFamilyConversation, sendMessage } from "./chat";
import { getParentSession, sendParentMessage } from "./parent";
import { respond } from "./_delay";
import { PROTOTYPE_TODAY } from "@/lib/calendar";
import { targetWeeks, termName } from "@/lib/onboarding";
const store = (scope: ImportScope) => scope === "demo" ? { families, students } : newStudioRoster;
function draftFor(id: string, scope: ImportScope) { const draft = enrolmentDrafts.find((entry) => entry.id === id && entry.scope === scope); if (!draft) throw new Error("Enrolment not found in this studio."); return draft; }
export async function getEnrolments(scope: ImportScope = "demo") { const data = store(scope); return respond({ drafts: structuredClone(enrolmentDrafts.filter((entry) => entry.scope === scope)), students: structuredClone(data.students), families: structuredClone(data.families) }); }
export async function startEnrolment(input: { firstName: string; lastName: string; birthYear: number; guardianName: string; guardianEmail: string; guardianMobile: string; language: "en" | "zh-CN"; existingStudentId?: string }, scope: ImportScope = "demo") {
  const data = store(scope); let student = input.existingStudentId ? data.students.find((entry) => entry.id === input.existingStudentId) : undefined;
  if (input.existingStudentId && !student) throw new Error("Student not found in this studio.");
  if (student) { const existing = enrolmentDrafts.find((entry) => entry.studentId === student?.id && entry.scope === scope); if (existing) return respond(structuredClone(existing)); }
  if (!student) {
    if (!input.firstName.trim() || !input.lastName.trim() || !input.guardianName.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.guardianEmail) || !Number.isInteger(input.birthYear) || input.birthYear < 1900 || input.birthYear > 2027) throw new Error("Enter the student’s name, birth year and a guardian name and valid email.");
    const email = input.guardianEmail.trim().toLowerCase();
    let family = data.families.find((entry) => entry.guardians.some((guardian) => guardian.email.toLowerCase() === email));
    if (!family) { family = { id: crypto.randomUUID(), displayName: `${input.lastName.trim()} family`, guardians: [{ id: crypto.randomUUID(), name: input.guardianName.trim(), email, mobile: input.guardianMobile, preferredLanguage: input.language }] }; data.families.push(family); }
    student = { id: crypto.randomUUID(), familyId: family.id, firstName: input.firstName.trim(), lastName: input.lastName.trim(), birthYear: input.birthYear }; data.students.push(student);
  }
  const draft: EnrolmentDraft = { id: crypto.randomUUID(), studentId: student.id, scope, intake: null, diagnostic: {}, startingStages: {}, welcomeChecks: [], practiceGoal: 75, status: "intake_sent", step: 1, templateId: "opus-beginner", targetTerm: "2027-T3", gradeHours: 40, lessonMinutes: 30, strengths: "", workOn: "" };
  enrolmentDrafts.push(draft); await postFamily(draft, `Please complete ${student.firstName}’s intake form in your family portal. / 请在家庭页面填写入学表。\n/intake/${draft.id}`, { intakeRecordId: draft.id });
  return respond(structuredClone(draft));
}
async function postFamily(draft: EnrolmentDraft, body: string, metadata: Partial<Message> = {}) {
  const data = store(draft.scope); const student = data.students.find((entry) => entry.id === draft.studentId); if (!student) throw new Error("Student not found.");
  if (draft.scope === "demo") { const conv = await getOrCreateFamilyConversation(student.familyId); await sendMessage({ conversationId: conv.id, authorRole: "teacher", authorName: teacher.name, kind: "text", body, ...metadata }); }
  else { let conv = newStudioRoster.conversations.find((entry) => entry.familyId === student.familyId); const sentAt = `${PROTOTYPE_TODAY}T13:00:00+11:00`; if (!conv) { conv = { id: crypto.randomUUID(), familyId: student.familyId, lastMessageAt: sentAt, unreadCount: 0 }; newStudioRoster.conversations.push(conv); } newStudioRoster.messages.push({ id: crypto.randomUUID(), conversationId: conv.id, authorRole: "teacher", authorName: "Your teacher", kind: "text", body, sentAt, ...metadata }); conv.lastMessageAt = sentAt; }
}
export async function getParentIntakes() {
  const { children } = await getParentSession();
  return respond(enrolmentDrafts.filter((entry) => entry.scope === "demo" && children.some((child) => child.id === entry.studentId)).map((entry) => ({ id: entry.id, studentId: entry.studentId, studentName: children.find((child) => child.id === entry.studentId)?.firstName, intake: structuredClone(entry.intake), status: entry.status, practiceGoal: entry.practiceGoal, assignment: entry.assignment })));
}
function validateIntake(intake: Intake) { if (!["beginner", "transferring"].includes(intake.experience) || !["acoustic", "digital", "keyboard"].includes(intake.instrument) || !intake.goal.trim() || !Number.isInteger(intake.daysPerWeek) || intake.daysPerWeek < 1 || intake.daysPerWeek > 7 || !Number.isInteger(intake.minutesPerDay) || intake.minutesPerDay < 1 || intake.minutesPerDay > 240 || !intake.policiesRead) throw new Error("Complete the intake and acknowledge the studio policies."); }
export async function submitParentIntake(id: string, intake: Intake) {
  const { children } = await getParentSession(); const draft = draftFor(id, "demo");
  if (!children.some((child) => child.id === draft.studentId)) throw new Error("Intake does not belong to this family.");
  if (draft.status !== "intake_sent") throw new Error("This intake has already been submitted.");
  validateIntake(intake); await sendParentMessage({ kind: "text", body: "Intake form completed. / 入学表已填写。" });
  draft.intake = structuredClone(intake); draft.status = "intake_done"; draft.practiceGoal = intake.daysPerWeek * intake.minutesPerDay;
  const welcome = libraryState.demo.lessons.find((entry) => entry.audience === intake.experience && entry.isWelcomeDefault); if (welcome) draft.welcomeTemplate = structuredClone(welcome);
  return getParentIntakes();
}
// Teacher-owned family preview, explicitly restricted to the isolated empty studio.
export async function submitNewStudioIntake(id: string, intake: Intake) {
  const draft = draftFor(id, "new-studio");
  if (draft.status !== "intake_sent") throw new Error("This intake has already been submitted.");
  validateIntake(intake); draft.intake = structuredClone(intake); draft.status = "intake_done"; draft.practiceGoal = intake.daysPerWeek * intake.minutesPerDay;
  const welcome = libraryState["new-studio"].lessons.find((entry) => entry.audience === intake.experience && entry.isWelcomeDefault);
  if (welcome) draft.welcomeTemplate = structuredClone(welcome);
  return respond(structuredClone(draft));
}
export async function saveEnrolment(id: string, input: Pick<EnrolmentDraft, "step" | "diagnostic" | "startingStages" | "welcomeChecks" | "practiceGoal" | "templateId" | "targetTerm" | "gradeHours" | "lessonMinutes" | "strengths" | "workOn">, scope: ImportScope = "demo") {
  const draft = draftFor(id, scope); if (draft.status === "active") throw new Error("This student is already active.");
  if (![1, 2, 3, 4].includes(input.step) || !Number.isFinite(input.gradeHours) || input.gradeHours < 0 || !Number.isInteger(input.lessonMinutes) || input.lessonMinutes < 1 || !Number.isInteger(input.practiceGoal) || input.practiceGoal < 0 || Object.values({ ...input.diagnostic, ...input.startingStages }).some((stage) => !Number.isInteger(stage) || stage < 1 || stage > 5)) throw new Error("Enter valid practice minutes, estimate and stages.");
  targetWeeks(input.targetTerm);
  if (!libraryState[scope].courses.some((entry) => entry.id === input.templateId)) throw new Error("Choose a course template.");
  if (input.step > 1 && !draft.intake) throw new Error("Wait for the family to complete the intake.");
  if (input.step > 2) { const template = draft.welcomeTemplate; if (!template || template.steps.some((step) => draft.intake?.experience === "beginner" ? !input.welcomeChecks.includes(step.contentItemId) : !input.diagnostic[step.contentItemId])) throw new Error("Complete every welcome lesson step first."); }
  Object.assign(draft, structuredClone(input)); if (input.step >= 3) draft.status = "welcome_done";
  return respond(structuredClone(draft));
}
export async function activateEnrolment(id: string, scope: ImportScope = "demo") {
  const draft = draftFor(id, scope); if (draft.status === "active") return respond(structuredClone(draft));
  if (draft.status !== "welcome_done" || draft.step !== 4 || !draft.strengths.trim() || !draft.workOn.trim()) throw new Error("Complete the welcome lesson, goal and summary first.");
  if (scope === "demo" && studentCourses.some((course) => course.studentId === draft.studentId)) throw new Error("This student already has a course. Enrol a new student to create a first course.");
  const template = structuredClone(libraryState[scope].courses.find((entry) => entry.id === draft.templateId)); if (!template) throw new Error("Course template not found.");
  const course = { id: crypto.randomUUID(), studentId: draft.studentId, framework: template.framework, grade: template.grade, targetTerm: draft.targetTerm, weeklyPracticeGoalMin: draft.practiceGoal, gradeHoursEstimate: draft.gradeHours, status: "active" as const };
  const sections = template.sections.map((section) => ({ id: crypto.randomUUID(), framework: template.framework, grade: template.grade, name: section.name, weightPct: section.weightPct }));
  // Curriculum reads course-owned sections via this stable prefix.
  sections.forEach((section, index) => { section.id = `${course.id}-section-${index}`; });
  const items = template.sections.flatMap((section, index) => section.items.map((title) => ({ id: crypto.randomUUID(), studentCourseId: course.id, sectionId: sections[index]?.id ?? "", title, stage: draft.startingStages[section.name] ?? 1 as CourseStage, updatedAt: `${PROTOTYPE_TODAY}T13:00:00+11:00` })));
  const milestones = template.defaultMilestones.flatMap((milestone) => items.map((item) => { const serial = Number(draft.targetTerm.slice(0, 4)) * 4 + Number(draft.targetTerm.slice(-1)) - 1 + milestone.termOffset; return { id: crypto.randomUUID(), studentCourseId: course.id, courseItemId: item.id, termKey: `${Math.floor(serial / 4)}-T${serial % 4 + 1}`, targetStage: milestone.targetStage }; }));
  draft.courseSnapshot = { course, sections, items, milestones }; draft.assignment = { week: PROTOTYPE_TODAY, title: "First week’s assignment", body: `Explore ${items[0]?.title ?? "your first melody"}. Practice goal: ${draft.practiceGoal} minutes this week. Assignment placeholder.` };
  await postFamily(draft, `Strengths: ${draft.strengths}\nWhat we’ll work on: ${draft.workOn}\nTerm-by-term plan:\n${template.defaultMilestones.map((milestone) => { const term = milestones.find((entry) => entry.targetStage === milestone.targetStage)?.termKey ?? draft.targetTerm; return `${termName(term)} — stage ${milestone.targetStage}`; }).join("\n")}\nPractice goal: ${draft.practiceGoal} min/week\n${draft.assignment.body}`, { welcomeSummary: { studentName: store(scope).students.find((entry) => entry.id === draft.studentId)?.firstName ?? "Student", practiceGoal: draft.practiceGoal } });
  if (scope === "demo") { studentCourses.push(structuredClone(course)); frameworkSections.push(...structuredClone(sections)); courseItems.push(...structuredClone(items)); termMilestones.push(...structuredClone(milestones)); }
  draft.status = "active"; draft.completedAt = `${PROTOTYPE_TODAY}T13:00:00+11:00`; return respond(structuredClone(draft));
}