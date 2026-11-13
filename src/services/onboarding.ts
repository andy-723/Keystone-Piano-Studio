import { assignments } from "@/mocks/assignments";
import { addDays } from "@/lib/calendar";
import { families, students, teacher } from "@/mocks/data";
import { newStudioRoster, type ImportScope } from "@/mocks/roster-import";
import { enrolmentDrafts, type EnrolmentDraft } from "@/mocks/onboarding";
import { libraryState } from "@/mocks/library";
import { studentCourses, frameworkSections, courseItems, termMilestones } from "@/mocks/curriculum";
import type { CourseStage, Intake, Message, Lang } from "@/mocks/types";
import { getOrCreateFamilyConversation, sendMessage } from "./chat";
import { getParentSession, sendParentMessage } from "./parent";
import { respond } from "./_delay";
import { PROTOTYPE_TODAY } from "@/lib/calendar";
import { targetWeeks, termName } from "@/lib/onboarding";
import { enrolmentYear, isAdultStudent } from "@/lib/enrolment";
import { ensureTermsState, type TermsScope } from "@/mocks/terms";
import { getPublishedStudioTerms } from "./terms";
import { createInvitation } from "./invitations";
import { buildCourseSnapshot } from "@/lib/course-snapshot";
import { insertLiveFamily, insertLiveStudents } from "./live/studio-store";
import { withLiveCourseSave } from "./live/course-store";
const store = (scope: ImportScope) => scope === "demo" ? { families, students } : newStudioRoster;

/** After a live enrol+invite server call, seed the teacher UI mock store so step 1 continues. */
export async function seedLocalEnrolmentFromLiveInvite(input: {
  draft: EnrolmentDraft;
  familyId: string;
  studentId: string;
  firstName: string;
  lastName: string;
  birthYear: number;
  guardianName: string;
  guardianEmail: string;
  guardianMobile?: string;
  language: Lang;
}) {
  const data = store("demo");
  let family = data.families.find((entry) => entry.id === input.familyId);
  if (!family) {
    family = {
      id: input.familyId,
      displayName: `${input.lastName.trim()} family`,
      guardians: [
        {
          id: crypto.randomUUID(),
          name: input.guardianName,
          email: input.guardianEmail.toLowerCase(),
          mobile: input.guardianMobile ?? "",
          preferredLanguage: input.language,
        },
      ],
    };
    data.families.push(family);
  }
  if (!data.students.some((entry) => entry.id === input.studentId)) {
    data.students.push({
      id: input.studentId,
      familyId: input.familyId,
      firstName: input.firstName.trim(),
      lastName: input.lastName.trim(),
      birthYear: input.birthYear,
    });
  }
  if (!enrolmentDrafts.some((entry) => entry.id === input.draft.id)) {
    enrolmentDrafts.push(structuredClone(input.draft));
  }
  return respond(structuredClone(input.draft));
}

async function requireTermsAcceptance(studentId: string, scope: TermsScope) {
  const state = await ensureTermsState();
  const published = await getPublishedStudioTerms(scope);
  const target = published.pending ?? published.current;
  if (!target) throw new Error("Accept the studio terms to finish enrolment.");
  const accepted = state.acceptances.some(
    (entry) =>
      entry.documentKind === "studio_agreement" &&
      entry.versionId === target.id &&
      entry.studentIds.includes(studentId),
  );
  if (!accepted) throw new Error("Accept the studio terms to finish enrolment.");
}
function draftFor(id: string, scope: ImportScope) { const draft = enrolmentDrafts.find((entry) => entry.id === id && entry.scope === scope); if (!draft) throw new Error("Enrolment not found in this studio."); return draft; }
export async function getEnrolments(scope: ImportScope = "demo") { const data = store(scope); return respond({ drafts: structuredClone(enrolmentDrafts.filter((entry) => entry.scope === scope)), students: structuredClone(data.students), families: structuredClone(data.families) }); }
export async function startEnrolment(input: { firstName: string; lastName: string; birthYear: number; guardianName: string; guardianEmail: string; guardianMobile: string; studentEmail?: string; studentMobile?: string; language: "en" | "zh-CN"; existingStudentId?: string }, scope: ImportScope = "demo") {
  const data = store(scope); let student = input.existingStudentId ? data.students.find((entry) => entry.id === input.existingStudentId) : undefined;
  if (input.existingStudentId && !student) throw new Error("Student not found in this studio.");
  if (student) { const existing = enrolmentDrafts.find((entry) => entry.studentId === student?.id && entry.scope === scope); if (existing) return respond(structuredClone(existing)); }
  if (!student) {
    const adult = isAdultStudent(input.birthYear);
    const hasGuardian = Boolean(input.guardianName.trim() || input.guardianEmail.trim());
    const selfContact = adult && !hasGuardian;
    const contactName = selfContact ? `${input.firstName.trim()} ${input.lastName.trim()}` : input.guardianName.trim();
    const email = (selfContact ? input.studentEmail ?? '' : input.guardianEmail).trim().toLowerCase();
    const mobile = selfContact ? input.studentMobile ?? '' : input.guardianMobile;
    if (!input.firstName.trim() || !input.lastName.trim() || !Number.isInteger(input.birthYear) || input.birthYear < 1900 || input.birthYear > enrolmentYear()) throw new Error("Enter the student’s name and a valid birth year.");
    if (!contactName || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error(selfContact ? "Enter a valid student email." : "Enter a guardian name and valid email.");
    let family = data.families.find((entry) => entry.guardians.some((guardian) => guardian.email.toLowerCase() === email));
    // Live studio: save to Supabase first, so the roster only shows what was really saved.
    if (!family) { family = { id: crypto.randomUUID(), displayName: selfContact ? contactName : `${input.lastName.trim()} family`, guardians: [{ id: crypto.randomUUID(), name: contactName, email, mobile, preferredLanguage: input.language }] }; if (scope === "demo") await insertLiveFamily(family); data.families.push(family); }
    student = { id: crypto.randomUUID(), familyId: family.id, firstName: input.firstName.trim(), lastName: input.lastName.trim(), birthYear: input.birthYear }; if (scope === "demo") await insertLiveStudents([student]); data.students.push(student);
  }
  const draft: EnrolmentDraft = { id: crypto.randomUUID(), studentId: student.id, scope, intake: null, diagnostic: {}, startingStages: {}, welcomeChecks: [], practiceGoal: 75, status: "intake_sent", step: 1, templateId: "opus-beginner", targetTerm: "2027-T3", gradeHours: 40, lessonMinutes: 30, strengths: "", workOn: "" };
  enrolmentDrafts.push(draft);
  if (scope === "demo") {
    await createInvitation({
      familyId: student.familyId,
      studentIds: [student.id],
      enrolmentDraftIds: [draft.id],
      language: input.language,
    });
  } else {
    await postFamily(draft, `Please complete ${student.firstName}’s intake form in your family portal. / 请在家庭页面填写入学表。\n/intake/${draft.id}`, { intakeRecordId: draft.id });
  }
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
function validateIntake(intake: Intake) {
  if (
    !["beginner", "transferring"].includes(intake.experience) ||
    !["acoustic", "digital", "keyboard"].includes(intake.instrument) ||
    !intake.goal.trim() ||
    !Number.isInteger(intake.daysPerWeek) ||
    intake.daysPerWeek < 1 ||
    intake.daysPerWeek > 7 ||
    !Number.isInteger(intake.minutesPerDay) ||
    intake.minutesPerDay < 1 ||
    intake.minutesPerDay > 240
  ) {
    throw new Error("Complete the intake form.");
  }
}
export async function submitParentIntake(id: string, intake: Intake) {
  const { children } = await getParentSession(); const draft = draftFor(id, "demo");
  if (!children.some((child) => child.id === draft.studentId)) throw new Error("Intake does not belong to this family.");
  if (draft.status !== "intake_sent") throw new Error("This intake has already been submitted.");
  validateIntake(intake);
  await requireTermsAcceptance(draft.studentId, "demo");
  await sendParentMessage({ kind: "text", body: "Intake form completed. / 入学表已填写。" });
  draft.intake = structuredClone(intake); draft.status = "intake_done"; draft.practiceGoal = intake.daysPerWeek * intake.minutesPerDay;
  const welcome = libraryState.demo.lessons.find((entry) => entry.audience === intake.experience && entry.isWelcomeDefault); if (welcome) draft.welcomeTemplate = structuredClone(welcome);
  return getParentIntakes();
}
// Teacher-owned family preview, explicitly restricted to the isolated empty studio.
export async function submitNewStudioIntake(id: string, intake: Intake) {
  const draft = draftFor(id, "new-studio");
  if (draft.status !== "intake_sent") throw new Error("This intake has already been submitted.");
  validateIntake(intake);
  await requireTermsAcceptance(draft.studentId, "new-studio");
  draft.intake = structuredClone(intake); draft.status = "intake_done"; draft.practiceGoal = intake.daysPerWeek * intake.minutesPerDay;
  const welcome = libraryState["new-studio"].lessons.find((entry) => entry.audience === intake.experience && entry.isWelcomeDefault);
  if (welcome) draft.welcomeTemplate = structuredClone(welcome);
  return respond(structuredClone(draft));
}

export async function hasStudentTermsAcceptance(studentId: string, scope: ImportScope = "demo") {
  try {
    await requireTermsAcceptance(studentId, scope);
    return true;
  } catch {
    return false;
  }
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
  if (scope === "demo" && studentCourses.some((course) => course.studentId === draft.studentId && course.status !== "archived")) throw new Error("This student already has a course. Use Assign to students in the Library to change it.");
  const template = structuredClone(libraryState[scope].courses.find((entry) => entry.id === draft.templateId)); if (!template) throw new Error("Course template not found.");
  const { course, sections, items, milestones } = buildCourseSnapshot(template, { studentId: draft.studentId, targetTerm: draft.targetTerm, weeklyPracticeGoalMin: draft.practiceGoal, gradeHoursEstimate: draft.gradeHours, startingStages: draft.startingStages, updatedAt: `${PROTOTYPE_TODAY}T13:00:00+11:00` });
  draft.courseSnapshot = { course, sections, items, milestones }; draft.assignment = { week: PROTOTYPE_TODAY, title: "First week’s assignment", body: `Explore ${items[0]?.title ?? "your first melody"}. Practice goal: ${draft.practiceGoal} minutes this week. Assignment placeholder.` };
  await postFamily(draft, `Strengths: ${draft.strengths}\nWhat we’ll work on: ${draft.workOn}\nTerm-by-term plan:\n${template.defaultMilestones.map((milestone) => { const term = milestones.find((entry) => entry.targetStage === milestone.targetStage)?.termKey ?? draft.targetTerm; return `${termName(term)} — stage ${milestone.targetStage}`; }).join("\n")}\nPractice goal: ${draft.practiceGoal} min/week\n${draft.assignment.body}`, { welcomeSummary: { studentName: store(scope).students.find((entry) => entry.id === draft.studentId)?.firstName ?? "Student", practiceGoal: draft.practiceGoal } });
  if (scope === "demo") { await withLiveCourseSave(() => { studentCourses.push(structuredClone(course)); frameworkSections.push(...structuredClone(sections)); courseItems.push(...structuredClone(items)); termMilestones.push(...structuredClone(milestones)); }, () => [course.id]); assignments.push({id:crypto.randomUUID(),studentId:draft.studentId,occurrenceId:`welcome-${draft.id}`,dueDate:addDays(PROTOTYPE_TODAY,6),tasks:items.slice(0,2).map(item=>({id:crypto.randomUUID(),courseItemId:item.id,text:`Explore ${item.title}`,minutesPerDay:Math.max(1,Math.round(draft.practiceGoal/10)),daysPerWeek:5,submissionRequested:"none",done:false}))}); }
  draft.status = "active"; draft.completedAt = `${PROTOTYPE_TODAY}T13:00:00+11:00`; return respond(structuredClone(draft));
}