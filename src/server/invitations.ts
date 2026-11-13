import { createServerFn } from "@tanstack/react-start";
import {
  autosaveJoinAnswers,
  createInvitation,
  deliverInviteEmail,
  loadJoinSession,
  requestFamilyMagicLink,
  resendInvitation,
  runInviteReminders,
  submitJoinEnrolment,
  unlockJoinSession,
} from "@/services/invitations";
import { startEnrolment } from "@/services/onboarding";
import { requireStudioRole, forbidden, ProblemError } from "./authz";
import { getStudioAccess } from "./subscription-store";
import { createServiceSupabase } from "./supabase";
import { getServerEnv, isMockOnboarding } from "./env";
import { bytesToHex, randomTokenBytes, sha256Hex } from "@/lib/onboarding/crypto";
import { enrolmentYear, isAdultStudent } from "@/lib/enrolment";
import { verifyAccessToken } from "./session";
import type { Lang } from "@/mocks/types";
import type { EnrolmentDraft } from "@/mocks/onboarding";

const DEMO_STUDIO_ID = "studio-1";

function guardianFirstName(name: string) {
  return name.trim().split(/\s+/)[0] ?? name;
}

function childNamesLabel(names: string[]) {
  if (names.length <= 1) return names[0] ?? "your child";
  return `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

function emailFromAddress(emailFrom: string) {
  return emailFrom.includes("<")
    ? emailFrom.replace(/^.*<([^>]+)>.*$/, "$1")
    : "invites@mail.example.com";
}

async function resolveStaffStudioId(
  actorUserId: string,
  requestedStudioId: string | undefined,
  aal: string | null,
) {
  if (isMockOnboarding()) {
    const derived = DEMO_STUDIO_ID;
    if (requestedStudioId && requestedStudioId !== derived) {
      throw forbidden("studio_id from the client does not match the family's studio.");
    }
    await requireStudioRole(actorUserId, derived, ["owner", "admin", "teacher"]);
    return derived;
  }

  const supabase = createServiceSupabase();
  const { data: memberships, error } = await supabase
    .from("studio_member")
    .select("studio_id, role")
    .eq("user_id", actorUserId);
  if (error) throw new ProblemError(500, "Membership lookup failed", error.message);
  const rows = memberships ?? [];
  if (!rows.length) throw forbidden("Not a studio staff member.");

  const derived =
    (requestedStudioId &&
      rows.find((row) => row.studio_id === requestedStudioId)?.studio_id) ||
    (rows[0]?.studio_id as string);
  if (requestedStudioId && requestedStudioId !== derived) {
    throw forbidden("studio_id from the client does not match the family's studio.");
  }
  await requireStudioRole(actorUserId, derived, ["owner", "admin", "teacher"], { aal });
  return derived;
}

/**
 * Staff create-invitation path. Studio is derived from membership / demo scope —
 * any studioId in the body is refused if it does not match.
 */
export async function createInvitationPrivileged(input: {
  actorUserId: string;
  familyId: string;
  studentIds: string[];
  enrolmentDraftIds?: string[] | undefined;
  /** Forged client studio — ignored unless it mismatches the derived studio (then refused). */
  studioId?: string | undefined;
  aal?: string | null;
}) {
  const derivedStudioId = await resolveStaffStudioId(
    input.actorUserId,
    input.studioId,
    input.aal ?? null,
  );
  if (isMockOnboarding()) {
    return createInvitation({
      familyId: input.familyId,
      studentIds: input.studentIds,
      enrolmentDraftIds: input.enrolmentDraftIds,
    });
  }
  // Live resend/create-from-ids is handled by enrolAndInvite / resendLiveInvitation.
  void derivedStudioId;
  throw new ProblemError(
    400,
    "Use enrol invite",
    "Create family invitations through enrolAndInviteFn in live mode.",
  );
}

export async function resendInvitationPrivileged(input: {
  actorUserId: string;
  invitationId: string;
  studioId?: string;
  aal?: string | null;
  teacherName?: string;
}) {
  const derivedStudioId = await resolveStaffStudioId(
    input.actorUserId,
    input.studioId,
    input.aal ?? null,
  );
  if (isMockOnboarding()) {
    return resendInvitation(input.invitationId);
  }
  return resendLiveInvitation({
    actorUserId: input.actorUserId,
    invitationId: input.invitationId,
    studioId: derivedStudioId,
    teacherName: input.teacherName?.trim() || "Your teacher",
  });
}

async function logEmail(input: {
  studioId: string;
  invitationId: string;
  kind: "invite" | "reminder";
  toEmail: string;
  resendId: string | null;
  status: string;
  error: string | null;
}) {
  const supabase = createServiceSupabase();
  await supabase.from("email_log").insert({
    studio_id: input.studioId,
    invitation_id: input.invitationId,
    kind: input.kind,
    to_email: input.toEmail,
    resend_id: input.resendId,
    status: input.status,
    error: input.error,
  });
}

export async function resendLiveInvitation(input: {
  actorUserId: string;
  invitationId: string;
  studioId: string;
  teacherName: string;
}) {
  const supabase = createServiceSupabase();
  const { data: existing, error } = await supabase
    .from("invitation")
    .select(
      "id, studio_id, family_id, email, language, status, expires_at",
    )
    .eq("id", input.invitationId)
    .maybeSingle();
  if (error) throw new ProblemError(500, "Invitation lookup failed", error.message);
  if (!existing || existing.studio_id !== input.studioId) {
    throw new ProblemError(404, "Invitation not found", "Invitation not found.");
  }
  if (existing.status === "completed") {
    throw new Error("This enrolment is already completed.");
  }

  const { data: studentRows } = await supabase
    .from("invitation_student")
    .select("student_id")
    .eq("invitation_id", existing.id);
  const studentIds = (studentRows ?? []).map((row) => row.student_id as string);

  const { data: students } = await supabase
    .from("student")
    .select("id, first_name, last_name, birth_year")
    .in("id", studentIds.length ? studentIds : ["00000000-0000-0000-0000-000000000000"]);

  const { data: guardians } = await supabase
    .from("guardian")
    .select("full_name, email")
    .eq("family_id", existing.family_id);

  const { data: studioRow } = await supabase
    .from("studio")
    .select("name, reply_to_email, logo_url")
    .eq("id", existing.studio_id)
    .maybeSingle();

  await supabase.from("invitation").update({ status: "revoked" }).eq("id", existing.id);

  const raw = bytesToHex(randomTokenBytes(32));
  const tokenHash = await sha256Hex(raw);
  const sentAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
  const invitationId = crypto.randomUUID();
  const env = getServerEnv();

  const { error: insertError } = await supabase.from("invitation").insert({
    id: invitationId,
    studio_id: existing.studio_id,
    family_id: existing.family_id,
    email: existing.email,
    language: existing.language,
    token_hash: tokenHash,
    status: "sent",
    expires_at: expiresAt,
    sent_at: sentAt,
    reminder_count: 0,
    created_by: input.actorUserId,
  });
  if (insertError) throw new ProblemError(500, "Invitation create failed", insertError.message);

  if (studentIds.length) {
    const { error: linkError } = await supabase.from("invitation_student").insert(
      studentIds.map((studentId) => ({
        invitation_id: invitationId,
        student_id: studentId,
        studio_id: existing.studio_id,
      })),
    );
    if (linkError) throw new ProblemError(500, "Invitation students failed", linkError.message);
  }

  const guardian =
    guardians?.find((g) => g.email.toLowerCase() === String(existing.email).toLowerCase()) ??
    guardians?.[0];
  const childNames = childNamesLabel((students ?? []).map((s) => s.first_name as string));

  try {
    const result = await deliverInviteEmail({
      to: existing.email as string,
      kind: "invite",
      context: {
        language: existing.language as Lang,
        teacherName: input.teacherName,
        guardianFirstName: guardianFirstName(guardian?.full_name ?? "there"),
        childNames,
        studioName: (studioRow?.name as string) || "Your studio",
        replyTo: (studioRow?.reply_to_email as string) || emailFromAddress(env.emailFrom),
        joinUrl: `${env.appUrl}/join/${raw}`,
        expiresAt,
        logoUrl: (studioRow?.logo_url as string | null) ?? null,
      },
    });
    await logEmail({
      studioId: existing.studio_id as string,
      invitationId,
      kind: "invite",
      toEmail: existing.email as string,
      resendId: result.id,
      status: "sent",
      error: null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Email provider failed";
    await logEmail({
      studioId: existing.studio_id as string,
      invitationId,
      kind: "invite",
      toEmail: existing.email as string,
      resendId: null,
      status: "failed",
      error: message,
    });
    await supabase.from("invitation").update({ status: "revoked" }).eq("id", invitationId);
    throw error;
  }

  await supabase.from("auth_audit").insert({
    studio_id: existing.studio_id,
    actor_user_id: input.actorUserId,
    event: "invite_resent",
  });

  return {
    status: "sent" as const,
    invitationId,
    sentAt,
    email: existing.email as string,
  };
}

export type EnrolAndInviteInput = {
  accessToken: string;
  firstName: string;
  lastName: string;
  birthYear: number;
  guardianName: string;
  guardianEmail: string;
  guardianMobile: string;
  studentEmail?: string;
  studentMobile?: string;
  language: "en" | "zh-CN";
  studioId?: string;
  teacherName?: string;
};

/**
 * Live (and mock-via-server) enrol + invite. Always runs on the server so Resend
 * receives the invite when live keys are present. Email failures are returned to the UI.
 */
export async function enrolAndInviteStudent(input: EnrolAndInviteInput): Promise<{
  draft: EnrolmentDraft;
  invitationId: string;
  familyId: string;
  inviteStatus: "sent";
  sentAt: string;
  email: string;
}> {
  if (isMockOnboarding()) {
    // Server-side mock: still goes through createInvitation → EmailProvider (outbox).
    const draft = await startEnrolment(
      {
        firstName: input.firstName,
        lastName: input.lastName,
        birthYear: input.birthYear,
        guardianName: input.guardianName,
        guardianEmail: input.guardianEmail,
        guardianMobile: input.guardianMobile,
        ...(input.studentEmail ? { studentEmail: input.studentEmail } : {}),
        ...(input.studentMobile ? { studentMobile: input.studentMobile } : {}),
        language: input.language,
      },
      "demo",
    );
    const { students: roster } = await import("@/mocks/data");
    const { invitationState } = await import("@/mocks/invitations");
    const student = roster.find((entry) => entry.id === draft.studentId);
    const invite = invitationState.invitations
      .filter((entry) => entry.studentIds.includes(draft.studentId) && entry.status !== "revoked")
      .sort((a, b) => b.sentAt.localeCompare(a.sentAt))[0];
    return {
      draft,
      invitationId: invite?.id ?? "",
      familyId: student?.familyId ?? "",
      inviteStatus: "sent",
      sentAt: invite?.sentAt ?? new Date().toISOString(),
      email:
        invite?.email ??
        (input.guardianEmail.trim().toLowerCase() ||
          (input.studentEmail ?? "").trim().toLowerCase()),
    };
  }

  const session = await verifyAccessToken(input.accessToken);
  const studioId = await resolveStaffStudioId(session.userId, input.studioId, session.aal);
  const supabase = createServiceSupabase();
  const env = getServerEnv();

  const adult = isAdultStudent(input.birthYear);
  const hasGuardian = Boolean(input.guardianName.trim() || input.guardianEmail.trim());
  const selfContact = adult && !hasGuardian;
  const contactName = selfContact
    ? `${input.firstName.trim()} ${input.lastName.trim()}`
    : input.guardianName.trim();
  const email = (
    selfContact ? (input.studentEmail ?? "") : input.guardianEmail
  )
    .trim()
    .toLowerCase();
  const mobile = selfContact ? input.studentMobile ?? "" : input.guardianMobile;

  if (
    !input.firstName.trim() ||
    !input.lastName.trim() ||
    !Number.isInteger(input.birthYear) ||
    input.birthYear < 1900 ||
    input.birthYear > enrolmentYear
  ) {
    throw new Error("Enter the student’s name and a valid birth year.");
  }
  if (!contactName || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error(selfContact ? "Enter a valid student email." : "Enter a guardian name and valid email.");
  }

  const { data: studioRow, error: studioError } = await supabase
    .from("studio")
    .select("name, reply_to_email, logo_url")
    .eq("id", studioId)
    .maybeSingle();
  if (studioError || !studioRow) {
    throw new ProblemError(500, "Studio lookup failed", studioError?.message ?? "Studio not found.");
  }

  const teacherName = input.teacherName?.trim() || "Your teacher";

  // Find existing guardian email in this studio, else create family + guardian.
  const { data: existingGuardians } = await supabase
    .from("guardian")
    .select("id, family_id, full_name, email, studio_id")
    .eq("studio_id", studioId)
    .ilike("email", email);

  let familyId = existingGuardians?.[0]?.family_id as string | undefined;
  let guardianName = existingGuardians?.[0]?.full_name as string | undefined;

  if (!familyId) {
    familyId = crypto.randomUUID();
    const { error: familyError } = await supabase.from("family").insert({
      id: familyId,
      studio_id: studioId,
      display_name: selfContact ? contactName : `${input.lastName.trim()} family`,
    });
    if (familyError) throw new ProblemError(500, "Family create failed", familyError.message);

    const { error: guardianError } = await supabase.from("guardian").insert({
      id: crypto.randomUUID(),
      family_id: familyId,
      studio_id: studioId,
      full_name: contactName,
      email,
      mobile: mobile || null,
      preferred_language: input.language,
    });
    if (guardianError) throw new ProblemError(500, "Guardian create failed", guardianError.message);
    guardianName = contactName;
  }

  const studentId = crypto.randomUUID();
  const { error: studentError } = await supabase.from("student").insert({
    id: studentId,
    family_id: familyId,
    studio_id: studioId,
    first_name: input.firstName.trim(),
    last_name: input.lastName.trim(),
    birth_year: input.birthYear,
  });
  if (studentError) throw new ProblemError(500, "Student create failed", studentError.message);

  const raw = bytesToHex(randomTokenBytes(32));
  const tokenHash = await sha256Hex(raw);
  const sentAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
  const invitationId = crypto.randomUUID();

  const { error: inviteError } = await supabase.from("invitation").insert({
    id: invitationId,
    studio_id: studioId,
    family_id: familyId,
    email,
    language: input.language,
    token_hash: tokenHash,
    status: "sent",
    expires_at: expiresAt,
    sent_at: sentAt,
    reminder_count: 0,
    created_by: session.userId,
  });
  if (inviteError) throw new ProblemError(500, "Invitation create failed", inviteError.message);

  const { error: linkError } = await supabase.from("invitation_student").insert({
    invitation_id: invitationId,
    student_id: studentId,
    studio_id: studioId,
  });
  if (linkError) throw new ProblemError(500, "Invitation students failed", linkError.message);

  const { error: intakeError } = await supabase.from("intake_response").insert({
    invitation_id: invitationId,
    studio_id: studioId,
    student_id: null,
    answers: {
      fillerName: guardianName ?? contactName,
      mobile: mobile || "",
      children: {
        [studentId]: {
          firstName: input.firstName.trim(),
          lastName: input.lastName.trim(),
          birthYear: input.birthYear,
        },
      },
    },
    current_step: "collection",
  });
  if (intakeError) throw new ProblemError(500, "Intake create failed", intakeError.message);

  try {
    const result = await deliverInviteEmail({
      to: email,
      kind: "invite",
      context: {
        language: input.language,
        teacherName,
        guardianFirstName: guardianFirstName(guardianName ?? contactName),
        childNames: input.firstName.trim(),
        studioName: studioRow.name as string,
        replyTo: (studioRow.reply_to_email as string) || emailFromAddress(env.emailFrom),
        joinUrl: `${env.appUrl}/join/${raw}`,
        expiresAt,
        logoUrl: (studioRow.logo_url as string | null) ?? null,
      },
    });
    await logEmail({
      studioId,
      invitationId,
      kind: "invite",
      toEmail: email,
      resendId: result.id,
      status: "sent",
      error: null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Email provider failed";
    await logEmail({
      studioId,
      invitationId,
      kind: "invite",
      toEmail: email,
      resendId: null,
      status: "failed",
      error: message,
    });
    await supabase.from("invitation").update({ status: "revoked" }).eq("id", invitationId);
    throw error;
  }

  // Local teacher UI draft (mock store on this server request is unused by the client).
  // Return a draft-shaped object the client seeds into its own enrolment store.
  const draft: EnrolmentDraft = {
    id: crypto.randomUUID(),
    studentId,
    scope: "demo",
    intake: null,
    diagnostic: {},
    startingStages: {},
    welcomeChecks: [],
    practiceGoal: 75,
    status: "intake_sent",
    step: 1,
    templateId: "opus-beginner",
    targetTerm: "2027-T3",
    gradeHours: 40,
    lessonMinutes: 30,
    strengths: "",
    workOn: "",
  };

  return {
    draft,
    invitationId,
    familyId,
    inviteStatus: "sent",
    sentAt,
    email,
  };
}

/**
 * Public invitation-token lookup. Never trusts a studio_id from the request.
 * Live path: service-key read after hashing the token; studio comes from the invitation row.
 */
export async function loadJoinSessionPrivileged(input: { token: string; studioId?: string }) {
  if (isMockOnboarding()) {
    // Mock: hashed token verified inside loadJoinSession; forged studioId is ignored.
    void input.studioId;
    return loadJoinSession(input.token);
  }

  const hash = await sha256Hex(input.token);
  // Service-key invitation lookup by token_hash — public route; identity is the hashed token, not requireStudioRole.
  const supabase = createServiceSupabase();
  const { data, error } = await supabase
    .from("invitation")
    .select("id, studio_id, status")
    .eq("token_hash", hash)
    .maybeSingle();
  if (error || !data || data.status === "revoked") {
    return {
      state: "unavailable" as const,
      message: "This link has expired. Ask your teacher to send a new one.",
    };
  }
  // studio_id from the invitation row only; request body studioId is never used.
  // 0006: a paused or unpaid studio cannot take on new families.
  const { level } = await getStudioAccess(data.studio_id as string);
  if (level !== "full") {
    return {
      state: "unavailable" as const,
      message: "This studio isn't accepting new families right now. Please contact your teacher.",
    };
  }
  void input.studioId;
  return loadJoinSession(input.token);
}

export const createInvitationFn = createServerFn({ method: "POST" })
  .validator(
    (data: {
      familyId: string;
      studentIds: string[];
      enrolmentDraftIds?: string[];
      actorUserId?: string;
      studioId?: string;
      aal?: string | null;
    }) => data,
  )
  .handler(({ data }) => {
    if (data.actorUserId) {
      return createInvitationPrivileged({
        actorUserId: data.actorUserId,
        familyId: data.familyId,
        studentIds: data.studentIds,
        enrolmentDraftIds: data.enrolmentDraftIds,
        studioId: data.studioId,
        aal: data.aal,
      });
    }
    return createInvitation(data);
  });

export const resendInvitationFn = createServerFn({ method: "POST" })
  .validator(
    (data: {
      invitationId: string;
      actorUserId?: string;
      studioId?: string;
      accessToken?: string;
      teacherName?: string;
    }) => data,
  )
  .handler(async ({ data }) => {
    if (data.accessToken) {
      const session = await verifyAccessToken(data.accessToken);
      return resendInvitationPrivileged({
        actorUserId: session.userId,
        invitationId: data.invitationId,
        studioId: data.studioId,
        aal: session.aal,
        teacherName: data.teacherName,
      });
    }
    if (data.actorUserId) {
      return resendInvitationPrivileged({
        actorUserId: data.actorUserId,
        invitationId: data.invitationId,
        studioId: data.studioId,
      });
    }
    return resendInvitation(data.invitationId);
  });

export const enrolAndInviteFn = createServerFn({ method: "POST" })
  .validator((data: EnrolAndInviteInput) => data)
  .handler(({ data }) => enrolAndInviteStudent(data));

export const loadJoinSessionFn = createServerFn({ method: "GET" })
  .validator((data: { token: string; studioId?: string }) => data)
  .handler(({ data }) => loadJoinSessionPrivileged(data));

export const unlockJoinSessionFn = createServerFn({ method: "POST" })
  .validator((data: { token: string; turnstileToken?: string; studioId?: string }) => data)
  .handler(({ data }) => {
    // Public token route — studioId from body is ignored; unlock derives studio from the invite.
    void data.studioId;
    return unlockJoinSession(data);
  });

export const autosaveJoinAnswersFn = createServerFn({ method: "POST" })
  .validator((data: Parameters<typeof autosaveJoinAnswers>[0] & { studioId?: string }) => data)
  .handler(({ data }) => {
    void data.studioId;
    return autosaveJoinAnswers(data);
  });

export const submitJoinEnrolmentFn = createServerFn({ method: "POST" })
  .validator((data: Parameters<typeof submitJoinEnrolment>[0] & { studioId?: string }) => data)
  .handler(({ data }) => {
    void data.studioId;
    return submitJoinEnrolment(data);
  });

export const requestFamilyMagicLinkFn = createServerFn({ method: "POST" })
  .validator((data: { email: string; turnstileToken?: string; studioId?: string }) => data)
  .handler(({ data }) => {
    void data.studioId;
    return requestFamilyMagicLink(data);
  });

export const runInviteRemindersFn = createServerFn({ method: "POST" }).handler(() =>
  runInviteReminders(),
);
