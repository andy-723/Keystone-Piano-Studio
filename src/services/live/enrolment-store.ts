/**
 * Family enrolment forms for a real studio, read at sign-in so the teacher can see them.
 *
 * Families fill in /join/{token} (src/server/family-join.ts), which saves one intake per
 * student in intake_response (student_id set), the terms acceptance and the consents.
 * Here each invited student without a course becomes a saved enrolment in Students > Enrol:
 * "intake_sent" while the family is still filling in, "intake_done" with their answers after.
 * Wizard progress after the intake (steps 2-4: welcome lesson, goal and pace, summary) is saved
 * in enrolment_progress (0024) and laid over the draft here, so Resume opens where the teacher
 * left off. Staff only (RLS); families never read it.
 */
import { libraryState } from "@/mocks/library";
import { studentCourses } from "@/mocks/curriculum";
import { enrolmentDrafts, type EnrolmentDraft } from "@/mocks/onboarding";
import type { ConsentRecord, TermsAcceptance, TermsState } from "@/mocks/terms";
import type { Intake } from "@/mocks/types";
import type { StudioWorkspace } from "@/lib/studio-workspace";
import { defaultTargetTerm } from "@/lib/onboarding";
import { liveStudioId } from "@/lib/studio-workspace";
import { client, friendly, type Client } from "./client";

type InvitationRow = { id: string; status: string; created_at: string };
type LinkRow = { invitation_id: string; student_id: string };
type IntakeRow = { student_id: string | null; answers: Intake; submitted_at: string | null };
type AcceptanceRow = {
  id: string;
  version_id: string;
  document_kind: TermsAcceptance["documentKind"];
  user_id: string | null;
  account_email: string;
  typed_name: string;
  capacity: TermsAcceptance["capacity"];
  relationship: TermsAcceptance["relationship"];
  guardian_declaration: boolean;
  student_ids: string[];
  invitation_id: string | null;
  method: TermsAcceptance["method"];
  accepted_at: string;
  receipt_id: string;
};
/** The wizard answers saved per student (enrolment_progress.answers). */
export type EnrolmentAnswers = Pick<
  EnrolmentDraft,
  | "diagnostic"
  | "startingStages"
  | "welcomeChecks"
  | "practiceGoal"
  | "templateId"
  | "targetTerm"
  | "gradeHours"
  | "lessonMinutes"
  | "strengths"
  | "workOn"
>;
type ProgressRow = {
  student_id: string;
  step: number;
  status: EnrolmentDraft["status"];
  answers: Partial<EnrolmentAnswers> | null;
  completed_at: string | null;
};
type ConsentRow = {
  id: string;
  student_id: string;
  type: ConsentRecord["type"];
  granted: boolean;
  wording_version: string;
  given_by: string;
  given_at: string;
  withdrawn_at: string | null;
};

function defaultTemplateId() {
  const courses = libraryState.demo.courses;
  return (
    courses.find((course) => course.id === "opus-beginner")?.id ?? courses[0]?.id ?? "opus-beginner"
  );
}

/** Saved enrolment for one invited student, as the enrol wizard expects it. */
export function draftForInvitedStudent(
  studentId: string,
  intake: Intake | null,
  live = true,
): EnrolmentDraft {
  const draft: EnrolmentDraft = {
    id: `live-enrol-${studentId}`,
    studentId,
    scope: "demo",
    intake: intake ? structuredClone(intake) : null,
    diagnostic: {},
    startingStages: {},
    welcomeChecks: [],
    practiceGoal: intake ? intake.daysPerWeek * intake.minutesPerDay : 75,
    status: intake ? "intake_done" : "intake_sent",
    step: 1,
    templateId: defaultTemplateId(),
    targetTerm: defaultTargetTerm(live),
    gradeHours: 40,
    lessonMinutes: 30,
    strengths: "",
    workOn: "",
  };
  if (intake) {
    const welcome = libraryState.demo.lessons.find(
      (lesson) => lesson.audience === intake.experience && lesson.isWelcomeDefault,
    );
    if (welcome) draft.welcomeTemplate = structuredClone(welcome);
  }
  return draft;
}

const isStage = (value: unknown): value is 1 | 2 | 3 | 4 | 5 =>
  typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 5;
function stages(value: unknown): Record<string, 1 | 2 | 3 | 4 | 5> {
  if (!value || typeof value !== "object") return {};
  return Object.fromEntries(Object.entries(value).filter(([, stage]) => isStage(stage))) as Record<
    string,
    1 | 2 | 3 | 4 | 5
  >;
}
const num = (value: unknown, fallback: number) =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : fallback;
const text = (value: unknown, fallback: string) => (typeof value === "string" ? value : fallback);

/**
 * Lays saved wizard progress over a draft built from the family's intake. Anything malformed
 * falls back to the draft's own value, and without an intake the wizard stays on step 1.
 */
export function applySavedProgress(draft: EnrolmentDraft, row: ProgressRow): EnrolmentDraft {
  const a = row.answers ?? {};
  const next: EnrolmentDraft = {
    ...draft,
    diagnostic: stages(a.diagnostic),
    startingStages: stages(a.startingStages),
    welcomeChecks: Array.isArray(a.welcomeChecks)
      ? a.welcomeChecks.filter((id): id is string => typeof id === "string")
      : [],
    practiceGoal: Math.round(num(a.practiceGoal, draft.practiceGoal)),
    templateId: text(a.templateId, draft.templateId) || draft.templateId,
    targetTerm: /^\d{4}-T[1-4]$/.test(text(a.targetTerm, ""))
      ? (a.targetTerm as string)
      : draft.targetTerm,
    gradeHours: num(a.gradeHours, draft.gradeHours),
    lessonMinutes: Math.max(1, Math.round(num(a.lessonMinutes, draft.lessonMinutes))),
    strengths: text(a.strengths, ""),
    workOn: text(a.workOn, ""),
  };
  if (!draft.intake) return { ...next, step: 1, status: draft.status };
  const step = [1, 2, 3, 4].includes(row.step) ? row.step : 1;
  return {
    ...next,
    step,
    status: step >= 3 && row.status !== "intake_sent" ? "welcome_done" : "intake_done",
  };
}

function answersOf(draft: EnrolmentDraft): EnrolmentAnswers {
  return structuredClone({
    diagnostic: draft.diagnostic,
    startingStages: draft.startingStages,
    welcomeChecks: draft.welcomeChecks,
    practiceGoal: draft.practiceGoal,
    templateId: draft.templateId,
    targetTerm: draft.targetTerm,
    gradeHours: draft.gradeHours,
    lessonMinutes: draft.lessonMinutes,
    strengths: draft.strengths,
    workOn: draft.workOn,
  });
}

/** True when the 0024 table isn't there yet (migration not run): progress stays session-only. */
function missingTable(error: { code?: string; message?: string } | null) {
  return (
    error?.code === "42P01" ||
    error?.code === "PGRST205" ||
    (/enrolment_progress/.test(error?.message ?? "") &&
      /does not exist|schema cache/i.test(error?.message ?? ""))
  );
}

/**
 * Saves a real studio's wizard progress before the screen moves on. Returns false for the demo,
 * or when migration 0024 hasn't been run yet (logged, progress kept for this session only).
 */
export async function saveLiveEnrolmentProgress(draft: EnrolmentDraft): Promise<boolean> {
  const studioId = liveStudioId();
  if (!studioId || draft.scope !== "demo") return false;
  const { error } = await client()
    .from("enrolment_progress")
    .upsert(
      {
        studio_id: studioId,
        student_id: draft.studentId,
        step: draft.step,
        status: draft.status,
        answers: answersOf(draft),
        completed_at:
          draft.status === "active" ? (draft.completedAt ?? new Date().toISOString()) : null,
      },
      { onConflict: "studio_id,student_id" },
    );
  if (!error) return true;
  if (missingTable(error)) {
    console.warn(
      "[enrolment-store] enrolment_progress missing (run 0024); progress kept for this session only",
    );
    return false;
  }
  throw friendly(error, "Couldn't save this step. Check your connection and try again.");
}

/** Fills saved enrolments, terms acceptances and consents. Failures are logged, not fatal. */
export async function loadLiveEnrolments(
  workspace: Extract<StudioWorkspace, { mode: "live" }>,
  c: Client,
  terms: TermsState,
) {
  if (workspace.role === "guardian") return;
  const studioId = workspace.studioId;
  const [inviteRes, linkRes, intakeRes, acceptRes, consentRes, progressRes] = await Promise.all([
    c
      .from("invitation")
      .select("id, status, created_at")
      .eq("studio_id", studioId)
      .neq("status", "revoked")
      .order("created_at", { ascending: true }),
    c.from("invitation_student").select("invitation_id, student_id").eq("studio_id", studioId),
    c.from("intake_response").select("student_id, answers, submitted_at").eq("studio_id", studioId),
    c
      .from("terms_acceptance")
      .select(
        "id, version_id, document_kind, user_id, account_email, typed_name, capacity, relationship, guardian_declaration, student_ids, invitation_id, method, accepted_at, receipt_id",
      )
      .eq("studio_id", studioId),
    c
      .from("consent_record")
      .select("id, student_id, type, granted, wording_version, given_by, given_at, withdrawn_at")
      .eq("studio_id", studioId),
    c
      .from("enrolment_progress")
      .select("student_id, step, status, answers, completed_at")
      .eq("studio_id", studioId),
  ]);

  if (acceptRes.error) {
    console.error("[enrolment-store] terms acceptances not loaded", acceptRes.error.message);
  } else {
    terms.acceptances.push(
      ...((acceptRes.data ?? []) as AcceptanceRow[]).map((row): TermsAcceptance => ({
        id: row.id,
        versionId: row.version_id,
        documentKind: row.document_kind,
        userId: row.user_id ?? "",
        accountEmail: row.account_email,
        typedName: row.typed_name,
        capacity: row.capacity,
        relationship: row.relationship,
        guardianDeclaration: row.guardian_declaration,
        studentIds: row.student_ids ?? [],
        ...(row.invitation_id ? { invitationId: row.invitation_id } : {}),
        method: row.method,
        acceptedAt: row.accepted_at,
        ip: "",
        userAgent: "",
        receiptId: row.receipt_id,
      })),
    );
  }
  if (consentRes.error) {
    console.error("[enrolment-store] consents not loaded", consentRes.error.message);
  } else {
    terms.consents.push(
      ...((consentRes.data ?? []) as ConsentRow[]).map((row): ConsentRecord => ({
        id: row.id,
        scope: "demo",
        studentId: row.student_id,
        type: row.type,
        granted: row.granted,
        wordingVersion: row.wording_version,
        givenBy: row.given_by,
        givenAt: row.given_at,
        ...(row.withdrawn_at ? { withdrawnAt: row.withdrawn_at } : {}),
      })),
    );
  }

  if (inviteRes.error || linkRes.error || intakeRes.error) {
    console.error(
      "[enrolment-store] enrolments not loaded",
      (inviteRes.error ?? linkRes.error ?? intakeRes.error)?.message,
    );
    return;
  }
  const liveInvites = new Set(((inviteRes.data ?? []) as InvitationRow[]).map((row) => row.id));
  const intakeByStudent = new Map<string, Intake>();
  // The family-level row has no student_id; only submitted per-student rows count.
  for (const row of (intakeRes.data ?? []) as IntakeRow[]) {
    if (row.student_id && row.submitted_at) intakeByStudent.set(row.student_id, row.answers);
  }
  const withCourse = new Set(
    studentCourses
      .filter((course) => course.status !== "archived")
      .map((course) => course.studentId),
  );
  const progressByStudent = new Map<string, ProgressRow>();
  if (progressRes.error) {
    // A missing 0024 just means progress isn't saved yet; anything else is worth a log too.
    console.warn("[enrolment-store] wizard progress not loaded", progressRes.error.message);
  } else {
    for (const row of (progressRes.data ?? []) as ProgressRow[])
      progressByStudent.set(row.student_id, row);
  }
  const seen = new Set(enrolmentDrafts.map((draft) => draft.studentId));
  for (const link of (linkRes.data ?? []) as LinkRow[]) {
    if (!liveInvites.has(link.invitation_id)) continue;
    if (seen.has(link.student_id) || withCourse.has(link.student_id)) continue;
    const saved = progressByStudent.get(link.student_id);
    seen.add(link.student_id);
    const draft = draftForInvitedStudent(
      link.student_id,
      intakeByStudent.get(link.student_id) ?? null,
    );
    // An "active" row whose course was later archived starts afresh.
    enrolmentDrafts.push(
      saved && saved.status !== "active" ? applySavedProgress(draft, saved) : draft,
    );
  }
}
