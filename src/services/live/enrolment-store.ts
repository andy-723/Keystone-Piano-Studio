/**
 * Family enrolment forms for a real studio, read at sign-in so the teacher can see them.
 *
 * Families fill in /join/{token} (src/server/family-join.ts), which saves one intake per
 * student in intake_response (student_id set), the terms acceptance and the consents.
 * Here each invited student without a course becomes a saved enrolment in Students > Enrol:
 * "intake_sent" while the family is still filling in, "intake_done" with their answers after.
 */
import { libraryState } from "@/mocks/library";
import { studentCourses } from "@/mocks/curriculum";
import { enrolmentDrafts, type EnrolmentDraft } from "@/mocks/onboarding";
import type { ConsentRecord, TermsAcceptance, TermsState } from "@/mocks/terms";
import type { Intake } from "@/mocks/types";
import type { StudioWorkspace } from "@/lib/studio-workspace";
import type { Client } from "./client";

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
export function draftForInvitedStudent(studentId: string, intake: Intake | null): EnrolmentDraft {
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
    targetTerm: "2027-T3",
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

/** Fills saved enrolments, terms acceptances and consents. Failures are logged, not fatal. */
export async function loadLiveEnrolments(
  workspace: Extract<StudioWorkspace, { mode: "live" }>,
  c: Client,
  terms: TermsState,
) {
  if (workspace.role === "guardian") return;
  const studioId = workspace.studioId;
  const [inviteRes, linkRes, intakeRes, acceptRes, consentRes] = await Promise.all([
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
  const seen = new Set(enrolmentDrafts.map((draft) => draft.studentId));
  for (const link of (linkRes.data ?? []) as LinkRow[]) {
    if (!liveInvites.has(link.invitation_id)) continue;
    if (seen.has(link.student_id) || withCourse.has(link.student_id)) continue;
    seen.add(link.student_id);
    enrolmentDrafts.push(
      draftForInvitedStudent(link.student_id, intakeByStudent.get(link.student_id) ?? null),
    );
  }
}
