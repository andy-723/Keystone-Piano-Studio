import { addDays, PROTOTYPE_TODAY } from "@/lib/calendar";
import { bytesToHex, randomTokenBytes, sha256Hex } from "@/lib/onboarding/crypto";
import { allStudentsAdult, buildSteps, goalLabel } from "@/lib/onboarding/steps";
import { families, students, studio, teacher } from "@/mocks/data";
import {
  invitationState,
  type AuthAuditEvent,
  type ChildAnswers,
  type FamilyAnswers,
  type InvitationRecord,
  type InvitationStatus,
} from "@/mocks/invitations";
import { enrolmentDrafts } from "@/mocks/onboarding";
import type { Intake, Lang } from "@/mocks/types";
import { emailProvider, loadInviteEmails } from "./_lazy";
import { getServerEnv, isMockOnboarding } from "@/server/env";
import { checkTokenLookupRate, isIpLocked, recordAuthFailure } from "@/server/rate-limit";
import { verifyTurnstile } from "@/server/turnstile";
import { acceptStudioTerms, getFamilyAppTerms, getPublishedStudioTerms } from "@/services/terms";
import { getOrCreateFamilyConversation, sendMessage } from "@/services/chat";
import { respond } from "./_delay";
import { z } from "zod";
import { isAdultStudent } from "@/lib/enrolment";
import { isAuMobile } from "@/lib/onboarding/au-mobile";

const DEMO_STUDIO_ID = "studio-1";

function nowIso() {
  if (invitationState.clockNow) {
    return invitationState.clockNow.includes("T")
      ? invitationState.clockNow
      : `${invitationState.clockNow}T09:00:00+11:00`;
  }
  return `${PROTOTYPE_TODAY}T12:00:00+11:00`;
}

function nowDate() {
  return nowIso().slice(0, 10);
}

function guardianFirstName(name: string) {
  return name.trim().split(/\s+/)[0] ?? name;
}

function childNamesLabel(studentIds: string[]) {
  const names = studentIds
    .map((id) => students.find((s) => s.id === id)?.firstName)
    .filter(Boolean);
  if (names.length <= 1) return names[0] ?? "your child";
  return `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

async function writeAudit(input: {
  studioId: string;
  event: AuthAuditEvent;
  ip?: string | null;
  userAgent?: string | null;
  guardianId?: string | null;
  actorUserId?: string | null;
}) {
  invitationState.authAudit.push({
    id: crypto.randomUUID(),
    studioId: input.studioId,
    actorUserId: input.actorUserId ?? null,
    guardianId: input.guardianId ?? null,
    event: input.event,
    ip: input.ip ?? null,
    userAgent: input.userAgent ?? null,
    at: nowIso(),
  });
}

function publicInvitationStatus(invite: InvitationRecord) {
  return {
    id: invite.id,
    familyId: invite.familyId,
    email: invite.email,
    language: invite.language,
    status: invite.status as InvitationStatus,
    sentAt: invite.sentAt,
    openedAt: invite.openedAt,
    completedAt: invite.completedAt,
    expiresAt: invite.expiresAt,
    reminderCount: invite.reminderCount,
    studentIds: [...invite.studentIds],
    enrolmentDraftIds: [...invite.enrolmentDraftIds],
  };
}

async function hashToken(token: string) {
  return sha256Hex(token);
}

async function sendInviteEmail(
  invite: InvitationRecord,
  token: string,
  kind: "invite" | "reminder",
  day?: 3 | 7,
) {
  const family = families.find((entry) => entry.id === invite.familyId);
  const guardian =
    family?.guardians.find((g) => g.email.toLowerCase() === invite.email.toLowerCase()) ??
    family?.guardians[0];
  const env = getServerEnv();
  const joinUrl = `${env.appUrl}/join/${token}`;
  const expiresLabel = new Intl.DateTimeFormat("en-AU", {
    dateStyle: "medium",
    timeZone: "Australia/Melbourne",
  }).format(new Date(invite.expiresAt));
  const props = {
    language: invite.language,
    teacherName: teacher.name,
    guardianFirstName: guardianFirstName(guardian?.name ?? "there"),
    childNames: childNamesLabel(invite.studentIds),
    studioName: studio.name,
    joinUrl,
    expiresLabel,
    logoUrl: null as string | null,
  };
  const {
    InviteEmail,
    invitePlainText,
    inviteSubject,
    ReminderEmail,
    reminderPlainText,
    reminderSubject,
    renderEmailHtml,
  } = await loadInviteEmails();
  const html =
    kind === "invite"
      ? await renderEmailHtml(InviteEmail(props))
      : await renderEmailHtml(ReminderEmail({ ...props, day: day ?? 3 }));
  const text =
    kind === "invite" ? invitePlainText(props) : reminderPlainText({ ...props, day: day ?? 3 });
  const subject =
    kind === "invite"
      ? inviteSubject(invite.language, teacher.name, props.childNames)
      : reminderSubject(invite.language, teacher.name, props.childNames);
  const from = `${teacher.name} via Keystone Music HQ <${env.emailFrom.includes("<") ? env.emailFrom.replace(/^.*<([^>]+)>.*$/, "$1") : "invites@mail.example.com"}>`;
  const provider = await emailProvider();
  const result = await provider.send({
    to: invite.email,
    from,
    replyTo: studio.email ?? "studio@keystone.example",
    subject,
    html,
    text,
    tags: [{ name: "kind", value: kind }],
  });
  invitationState.emailLogs.push({
    id: crypto.randomUUID(),
    studioId: invite.studioId,
    invitationId: invite.id,
    kind,
    toEmail: invite.email,
    resendId: result.id,
    status: "sent",
    error: null,
    sentAt: nowIso(),
  });
  return result;
}

/** Teacher-only: create invitation, email via provider, post family chat. Never returns the token. */
export async function createInvitation(input: {
  familyId: string;
  studentIds: string[];
  enrolmentDraftIds?: string[];
  language?: Lang;
}) {
  const family = families.find((entry) => entry.id === input.familyId);
  if (!family) throw new Error("Family not found.");
  if (family.isExample) throw new Error("This is the example family, so no invite is sent. Enrol a real family to invite them.");
  const selected = students.filter(
    (student) => input.studentIds.includes(student.id) && student.familyId === family.id,
  );
  if (!selected.length || selected.length !== input.studentIds.length)
    throw new Error("Choose students from this family.");
  const guardian = family.guardians[0];
  if (!guardian?.email) throw new Error("Family needs a guardian email.");

  const raw = bytesToHex(randomTokenBytes(32));
  const tokenHash = await hashToken(raw);
  const sentAt = nowIso();
  const invite: InvitationRecord = {
    id: crypto.randomUUID(),
    studioId: DEMO_STUDIO_ID,
    familyId: family.id,
    email: guardian.email.toLowerCase(),
    language: input.language ?? guardian.preferredLanguage,
    tokenHash,
    _rawToken: raw,
    status: "sent",
    expiresAt: `${addDays(sentAt.slice(0, 10), 14)}T23:59:59+11:00`,
    sentAt,
    openedAt: null,
    completedAt: null,
    reminderCount: 0,
    lastReminderAt: null,
    createdBy: teacher.id,
    studentIds: selected.map((s) => s.id),
    enrolmentDraftIds: input.enrolmentDraftIds ?? [],
    createdAt: sentAt,
  };
  invitationState.invitations.push(invite);
  invitationState.intakes.push({
    id: crypto.randomUUID(),
    invitationId: invite.id,
    studentId: null,
    answers: {
      fillerName: guardian.name,
      mobile: guardian.mobile ?? "",
      children: Object.fromEntries(
        selected.map((student) => [
          student.id,
          {
            firstName: student.firstName,
            lastName: student.lastName,
            birthYear: student.birthYear,
          } satisfies ChildAnswers,
        ]),
      ),
    },
    currentStep: "collection",
    submittedAt: null,
    updatedAt: sentAt,
    createdAt: sentAt,
  });

  await sendInviteEmail(invite, raw, "invite");
  const conv = await getOrCreateFamilyConversation(family.id);
  await sendMessage({
    conversationId: conv.id,
    authorRole: "teacher",
    authorName: teacher.name,
    kind: "text",
    body: `Please complete enrolment for ${childNamesLabel(invite.studentIds)}. / 请完成入学登记。\n/join/${raw}`,
  });

  return respond({ status: "sent" as const, invitationId: invite.id });
}

export async function resendInvitation(invitationId: string) {
  const invite = invitationState.invitations.find((entry) => entry.id === invitationId);
  if (!invite) throw new Error("Invitation not found.");
  if (invite.status === "completed") throw new Error("This enrolment is already completed.");
  invite.status = "revoked";
  const raw = bytesToHex(randomTokenBytes(32));
  const tokenHash = await hashToken(raw);
  const sentAt = nowIso();
  const next: InvitationRecord = {
    ...invite,
    id: crypto.randomUUID(),
    tokenHash,
    _rawToken: raw,
    status: "sent",
    expiresAt: `${addDays(sentAt.slice(0, 10), 14)}T23:59:59+11:00`,
    sentAt,
    openedAt: null,
    completedAt: null,
    reminderCount: 0,
    lastReminderAt: null,
    createdAt: sentAt,
  };
  invitationState.invitations.push(next);
  const priorIntake = invitationState.intakes.find((entry) => entry.invitationId === invite.id);
  invitationState.intakes.push({
    id: crypto.randomUUID(),
    invitationId: next.id,
    studentId: null,
    answers: structuredClone(priorIntake?.answers ?? {}),
    currentStep: priorIntake?.currentStep ?? "collection",
    submittedAt: null,
    updatedAt: sentAt,
    createdAt: sentAt,
  });
  await sendInviteEmail(next, raw, "invite");
  await writeAudit({ studioId: next.studioId, event: "invite_resent", actorUserId: teacher.id });
  return respond({ status: "sent" as const, invitationId: next.id });
}

export async function getFamilyInvitationStatus(familyId: string) {
  const invites = invitationState.invitations
    .filter((entry) => entry.familyId === familyId && entry.status !== "revoked")
    .sort((a, b) => b.sentAt.localeCompare(a.sentAt));
  return respond(invites[0] ? publicInvitationStatus(invites[0]) : null);
}

export async function getInvitationStatusForStudent(studentId: string) {
  const invites = invitationState.invitations
    .filter((entry) => entry.studentIds.includes(studentId) && entry.status !== "revoked")
    .sort((a, b) => b.sentAt.localeCompare(a.sentAt));
  return respond(invites[0] ? publicInvitationStatus(invites[0]) : null);
}

export async function listInvitationsForFamily(familyId: string) {
  return respond(
    invitationState.invitations
      .filter((entry) => entry.familyId === familyId)
      .map(publicInvitationStatus)
      .sort((a, b) => b.sentAt.localeCompare(a.sentAt)),
  );
}

const opaqueError = {
  state: "unavailable" as const,
  message: "This link has expired. Ask your teacher to send a new one.",
};

export type JoinSession =
  | {
      state: "active";
      invitationId: string;
      token: string;
      language: Lang;
      teacherName: string;
      studioName: string;
      replyToEmail: string;
      students: { id: string; firstName: string; lastName: string; birthYear: number }[];
      guardian: { name: string; email: string; mobile?: string };
      answers: FamilyAnswers & { children?: Record<string, ChildAnswers> };
      currentStep: string;
      steps: ReturnType<typeof buildSteps>;
      turnstileSiteKey: string;
      mockCaptcha: boolean;
    }
  | { state: "completed"; teacherName: string; loginEmail: string }
  | { state: "unavailable"; message: string; teacherName?: string; replyToEmail?: string };

export async function loadJoinSession(
  token: string,
  meta: { ip?: string; userAgent?: string } = {},
): Promise<JoinSession> {
  const ip = meta.ip ?? "127.0.0.1";
  if (isIpLocked(ip))
    return { ...opaqueError, message: "Too many attempts. Try again in 15 minutes." };
  if (!checkTokenLookupRate(ip)) return opaqueError;

  const hash = await hashToken(token);
  const invite = invitationState.invitations.find((entry) => entry.tokenHash === hash);
  if (!invite || invite.status === "revoked") {
    recordAuthFailure(ip, "token");
    await writeAudit({
      studioId: DEMO_STUDIO_ID,
      event: "token_rejected",
      ip,
      userAgent: meta.userAgent ?? null,
    });
    return opaqueError;
  }
  if (invite.status === "expired" || nowDate() > invite.expiresAt.slice(0, 10)) {
    invite.status = "expired";
    return {
      state: "unavailable",
      message: `This link has expired. Ask ${teacher.name} to send a new one.`,
      teacherName: teacher.name,
      replyToEmail: studio.email ?? "studio@keystone.example",
    };
  }
  if (invite.status === "completed") {
    return { state: "completed", teacherName: teacher.name, loginEmail: invite.email };
  }

  if (invite.status === "sent") {
    invite.status = "opened";
    invite.openedAt = nowIso();
    await writeAudit({
      studioId: invite.studioId,
      event: "invite_opened",
      ip,
      userAgent: meta.userAgent ?? null,
      guardianId: families.find((f) => f.id === invite.familyId)?.guardians[0]?.id ?? null,
    });
  }

  const family = families.find((entry) => entry.id === invite.familyId)!;
  const guardian =
    family.guardians.find((g) => g.email.toLowerCase() === invite.email) ?? family.guardians[0]!;
  const selected = invite.studentIds
    .map((id) => students.find((s) => s.id === id)!)
    .filter(Boolean);
  const intake = invitationState.intakes.find((entry) => entry.invitationId === invite.id)!;
  const answers = intake.answers;
  return {
    state: "active",
    invitationId: invite.id,
    token,
    language: invite.language,
    teacherName: teacher.name,
    studioName: studio.name,
    replyToEmail: studio.email ?? "studio@keystone.example",
    students: selected.map((s) => ({
      id: s.id,
      firstName: s.firstName,
      lastName: s.lastName,
      birthYear: s.birthYear,
    })),
    guardian: {
      name: guardian.name,
      email: guardian.email,
      ...(guardian.mobile ? { mobile: guardian.mobile } : {}),
    },
    answers,
    currentStep: intake.currentStep,
    steps: buildSteps(selected, answers),
    turnstileSiteKey: getServerEnv().turnstileSiteKey,
    mockCaptcha: isMockOnboarding(),
  };
}

/** Demo helper: load join flow by enrolment draft id (mock /intake/$recordId). */
export async function loadJoinSessionByDraft(recordId: string): Promise<JoinSession> {
  const draft = enrolmentDrafts.find((entry) => entry.id === recordId);
  if (!draft) return opaqueError;
  const student = students.find((entry) => entry.id === draft.studentId);
  if (!student) return opaqueError;
  let invite = invitationState.invitations.find(
    (entry) =>
      entry.enrolmentDraftIds.includes(recordId) &&
      entry.status !== "revoked" &&
      entry.status !== "expired",
  );
  if (!invite) {
    await createInvitation({
      familyId: student.familyId,
      studentIds: [student.id],
      enrolmentDraftIds: [draft.id],
    });
    invite = invitationState.invitations.find(
      (entry) => entry.enrolmentDraftIds.includes(recordId) && entry.status === "sent",
    );
  }
  if (!invite?._rawToken) return opaqueError;
  return loadJoinSession(invite._rawToken);
}

export async function unlockJoinSession(input: {
  token: string;
  turnstileToken?: string;
  ip?: string;
  userAgent?: string;
}) {
  const ip = input.ip ?? "127.0.0.1";
  if (isIpLocked(ip)) throw new Error("Too many attempts. Try again in 15 minutes.");
  const ok = await verifyTurnstile(input.turnstileToken, ip);
  if (!ok) {
    recordAuthFailure(ip, "captcha");
    throw new Error("Security check failed.");
  }
  const session = await loadJoinSession(input.token, {
    ip,
    ...(input.userAgent ? { userAgent: input.userAgent } : {}),
  });
  if (session.state !== "active") {
    throw new Error(session.state === "unavailable" ? session.message : "Unavailable");
  }
  const intake = invitationState.intakes.find(
    (entry) => entry.invitationId === session.invitationId,
  )!;
  intake.answers = { ...intake.answers, collectionAcknowledged: true, turnstileUnlocked: true };
  intake.updatedAt = nowIso();
  return respond({ ok: true as const });
}

export async function autosaveJoinAnswers(input: {
  token: string;
  currentStep: string;
  answers: FamilyAnswers & { children?: Record<string, ChildAnswers> };
  ip?: string;
}) {
  const session = await loadJoinSession(input.token, {
    ...(input.ip ? { ip: input.ip } : {}),
  });
  if (session.state !== "active") throw new Error("This link is no longer active.");
  const intake = invitationState.intakes.find(
    (entry) => entry.invitationId === session.invitationId,
  )!;
  if (!intake.answers.turnstileUnlocked && !isMockOnboarding())
    throw new Error("Complete the security check first.");
  intake.answers = structuredClone(input.answers);
  intake.currentStep = input.currentStep;
  intake.updatedAt = nowIso();
  return respond({ savedAt: intake.updatedAt });
}

const submitSchema = z.object({
  token: z.string().min(10),
  turnstileToken: z.string().optional(),
  answers: z.object({
    fillerName: z.string().min(2),
    relationship: z.enum(["parent", "legal_guardian", "self"]),
    mobile: z.string().min(8),
    collectionAcknowledged: z.literal(true),
    terms: z.object({
      studioAgreed: z.literal(true),
      keystoneAgreed: z.literal(true),
      guardianDeclaration: z.boolean(),
      typedName: z.string().min(3),
      relationship: z.enum(["parent", "legal_guardian", "self"]),
    }),
    children: z.record(z.any()),
  }),
});

export async function submitJoinEnrolment(input: {
  token: string;
  answers: FamilyAnswers & { children?: Record<string, ChildAnswers> };
  turnstileToken?: string;
  ip?: string;
  userAgent?: string;
}) {
  const ip = input.ip ?? "203.0.113.10";
  if (isIpLocked(ip)) throw new Error("Too many attempts. Try again in 15 minutes.");
  if (!isMockOnboarding()) {
    const ok = await verifyTurnstile(input.turnstileToken, ip);
    if (!ok) {
      recordAuthFailure(ip, "captcha");
      throw new Error("Security check failed.");
    }
  }

  const parsed = submitSchema.safeParse({
    token: input.token,
    turnstileToken: input.turnstileToken,
    answers: {
      ...input.answers,
      collectionAcknowledged: true,
      terms: {
        studioAgreed: true,
        keystoneAgreed: true,
        guardianDeclaration: Boolean(input.answers.terms?.guardianDeclaration),
        typedName: input.answers.terms?.typedName ?? "",
        relationship: input.answers.terms?.relationship || input.answers.relationship || "parent",
      },
    },
  });
  if (!parsed.success) throw new Error("Complete every required question.");
  if (!isAuMobile(parsed.data.answers.mobile))
    throw new Error("Enter an Australian mobile number.");

  const hash = await hashToken(input.token);
  const invite = invitationState.invitations.find((entry) => entry.tokenHash === hash);
  if (
    !invite ||
    invite.status === "revoked" ||
    invite.status === "expired" ||
    invite.status === "completed"
  ) {
    recordAuthFailure(ip, "token");
    await writeAudit({
      studioId: DEMO_STUDIO_ID,
      event: "token_rejected",
      ip,
      userAgent: input.userAgent ?? null,
    });
    throw new Error("This link is no longer active.");
  }

  const selected = invite.studentIds
    .map((id) => students.find((s) => s.id === id)!)
    .filter(Boolean);
  const hasMinor = selected.some((student) => !isAdultStudent(student.birthYear));
  const relationship = parsed.data.answers.relationship;
  if (hasMinor) {
    if (relationship === "self")
      throw new Error("A parent or legal guardian must enrol students under 18.");
    if (!parsed.data.answers.terms.guardianDeclaration)
      throw new Error("Confirm you are the parent or legal guardian.");
  }
  if (!hasMinor && relationship === "self" && !allStudentsAdult(selected)) {
    throw new Error("Self enrolment is only for adult students.");
  }

  for (const student of selected) {
    const child = input.answers.children?.[student.id] as ChildAnswers | undefined;
    if (
      !child?.experience ||
      !child.instrument ||
      !child.goalKind ||
      !child.daysPerWeek ||
      !child.minutesPerDay
    ) {
      throw new Error(`Complete ${student.firstName}'s enrolment questions.`);
    }
    if (child.emergencyMedical == null || child.mediaPublic == null)
      throw new Error("Answer every consent question.");
    const notes = `${child.healthNotes ?? ""}${child.teacherNotes ?? ""}`.trim();
    if (notes && child.healthNotesConsent == null)
      throw new Error("Answer the health notes consent.");
  }

  const published = await getPublishedStudioTerms("demo");
  const app = await getFamilyAppTerms();
  const version = published.pending ?? published.current;
  if (!version || !app.version) throw new Error("Studio terms are not available.");

  const capacity = hasMinor ? "guardian" : relationship === "self" ? "self" : "guardian";
  const consents = selected.flatMap((student) => {
    const child = input.answers.children![student.id]!;
    const rows: {
      type: "emergency_medical" | "health_notes" | "media_public";
      granted: boolean;
      studentId: string;
    }[] = [
      {
        type: "emergency_medical",
        granted: Boolean(child.emergencyMedical),
        studentId: student.id,
      },
      { type: "media_public", granted: Boolean(child.mediaPublic), studentId: student.id },
    ];
    const notes = `${child.healthNotes ?? ""}${child.teacherNotes ?? ""}`.trim();
    if (notes)
      rows.push({
        type: "health_notes",
        granted: Boolean(child.healthNotesConsent),
        studentId: student.id,
      });
    return rows;
  });

  await acceptStudioTerms({
    versionId: version.id,
    appTermsVersionId: app.version.id,
    typedName: parsed.data.answers.terms.typedName,
    capacity,
    relationship,
    guardianDeclaration: parsed.data.answers.terms.guardianDeclaration,
    studentIds: selected.map((s) => s.id),
    consents,
    method: "invite",
    scope: "demo",
  });

  for (const student of selected) {
    const child = input.answers.children![student.id]!;
    const minutes = child.minutesPerDay ?? (child.minutesOther ? Number(child.minutesOther) : 0);
    const intake: Intake = {
      experience: child.experience === "transferring" ? "transferring" : "beginner",
      previousGrades: child.previousGrades ?? "",
      theoryExams: child.theoryExams ?? "",
      instrument: child.instrument === "not_yet" ? "keyboard" : child.instrument!,
      goal: goalLabel(child),
      daysPerWeek: child.daysPerWeek!,
      minutesPerDay: minutes,
      ...(child.healthNotesConsent === false
        ? {}
        : child.healthNotes || child.teacherNotes
          ? { healthNotes: [child.healthNotes, child.teacherNotes].filter(Boolean).join("\n") }
          : {}),
    };
    let draft = enrolmentDrafts.find(
      (entry) => invite.enrolmentDraftIds.includes(entry.id) && entry.studentId === student.id,
    );
    if (!draft)
      draft = enrolmentDrafts.find(
        (entry) => entry.studentId === student.id && entry.status === "intake_sent",
      );
    if (draft && draft.status === "intake_sent") {
      draft.intake = structuredClone(intake);
      draft.status = "intake_done";
      draft.practiceGoal = intake.daysPerWeek * intake.minutesPerDay;
    }
  }

  const intake = invitationState.intakes.find((entry) => entry.invitationId === invite.id)!;
  intake.answers = structuredClone(input.answers);
  intake.currentStep = "done";
  intake.submittedAt = nowIso();
  intake.updatedAt = nowIso();
  invite.status = "completed";
  invite.completedAt = nowIso();
  delete invite._rawToken;

  const conv = await getOrCreateFamilyConversation(invite.familyId);
  await sendMessage({
    conversationId: conv.id,
    authorRole: "guardian",
    authorName: parsed.data.answers.fillerName,
    kind: "text",
    body: "Enrolment form completed. / 入学表已填写。",
  });
  await writeAudit({
    studioId: invite.studioId,
    event: "invite_submitted",
    ip,
    userAgent: input.userAgent ?? null,
    guardianId: families.find((f) => f.id === invite.familyId)?.guardians[0]?.id ?? null,
  });

  return respond({
    ok: true as const,
    teacherName: teacher.name,
    guardianName: parsed.data.answers.fillerName,
    email: invite.email,
  });
}

export async function requestFamilyMagicLink(input: {
  email: string;
  turnstileToken?: string;
  ip?: string;
}) {
  const ip = input.ip ?? "127.0.0.1";
  if (!isMockOnboarding()) {
    const ok = await verifyTurnstile(input.turnstileToken, ip);
    if (!ok) {
      recordAuthFailure(ip, "captcha");
      throw new Error("Security check failed.");
    }
  }
  const provider = await emailProvider();
  const env = getServerEnv();
  await provider.send({
    to: input.email,
    from: env.emailFrom,
    subject: "Your Keystone Music HQ family login",
    html: `<p>Sign in: ${env.appUrl}/auth/callback</p>`,
    text: `Sign in: ${env.appUrl}/auth/callback`,
    tags: [{ name: "kind", value: "login_link" }],
  });
  await writeAudit({ studioId: DEMO_STUDIO_ID, event: "magic_link_requested", ip });
  return respond({ ok: true as const });
}

/** Reminder cron: day 3 and day 7 only; expire after 14 days; idempotent same-day. */
export async function runInviteReminders(now = nowDate()) {
  const results = { reminded: 0, expired: 0 };
  for (const invite of invitationState.invitations) {
    if (invite.status === "completed" || invite.status === "revoked") continue;
    if (now > invite.expiresAt.slice(0, 10)) {
      if (invite.status !== "expired") {
        invite.status = "expired";
        results.expired += 1;
      }
      continue;
    }
    if (invite.status !== "sent" && invite.status !== "opened") continue;
    const sentDay = invite.sentAt.slice(0, 10);
    const day3 = addDays(sentDay, 3);
    const day7 = addDays(sentDay, 7);
    const alreadyToday = invite.lastReminderAt?.slice(0, 10) === now;
    if (alreadyToday) continue;
    let day: 3 | 7 | null = null;
    if (now === day3 && invite.reminderCount < 1) day = 3;
    else if (now === day7 && invite.reminderCount < 2) day = 7;
    if (!day) continue;
    const token = invite._rawToken ?? "revoked-placeholder";
    if (!invite._rawToken) continue;
    await sendInviteEmail(invite, token, "reminder", day);
    invite.reminderCount += 1;
    invite.lastReminderAt = `${now}T09:00:00+11:00`;
    results.reminded += 1;
  }
  return results;
}

export function getAuthAudit() {
  return structuredClone(invitationState.authAudit);
}

export function assertAuthAuditAppendOnly() {
  // Mock stand-in for RLS: no update/delete APIs exist.
  return true;
}
