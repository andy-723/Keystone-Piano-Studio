import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader, getRequestIP } from "@tanstack/react-start/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sha256Hex } from "@/lib/onboarding/crypto";
import { moneyRulesFrom } from "@/lib/onboarding/money-rules";
import { buildSteps, type FlowStudent } from "@/lib/onboarding/steps";
import { checkJoinStudents, parseJoinAnswers, type JoinAnswers } from "@/lib/onboarding/submission";
import { PUBLIC_PRIVACY_MARKDOWN, PUBLIC_TERMS_MARKDOWN } from "@/lib/public-legal";
import { studioReplyTo } from "@/lib/studio-mail";
import { hashTerms } from "@/lib/terms-render";
import {
  FAMILY_APP_TERMS_EFFECTIVE_AT,
  FAMILY_APP_TERMS_VERSION,
} from "@/mocks/keystone-app-terms";
import type { Lang } from "@/mocks/types";
import type { JoinSession, JoinTermsBundle } from "@/services/invitations";
import { fromLine } from "./billing-email";
import { getEmailProvider } from "./email";
import { familyWelcomeEmail } from "./email/templates/family-welcome";
import { getServerEnv } from "./env";
import { ProblemError } from "./problem";
import { checkTokenLookupRate, isIpLocked, recordAuthFailure } from "./rate-limit";
import { getStudioAccess } from "./subscription-store";
import { createServiceSupabase } from "./supabase";
import { verifyTurnstile } from "./turnstile";

/**
 * The family enrolment form (/join/{token}) for real studios, backed by the database.
 *
 * The invite link's token is the only identity: we hash it and look up `invitation.token_hash`.
 * The studio always comes from that invitation row, never from the browser.
 * The demo studio keeps the in-memory flow in src/services/invitations.ts.
 */

const OPAQUE: Extract<JoinSession, { state: "unavailable" }> = {
  state: "unavailable",
  message: "This link isn't valid. Ask your teacher to send a new one.",
};
const MAX_ANSWERS_CHARS = 50_000;
const COMPLETED_MESSAGE = "Enrolment form completed. / 入学表已填写。";

type Meta = { ip?: string | undefined; userAgent?: string | undefined };

type InviteRow = {
  id: string;
  studio_id: string;
  family_id: string;
  email: string;
  language: Lang;
  status: "sent" | "opened" | "completed" | "expired" | "revoked";
  expires_at: string;
};

type StudioRow = {
  name: string;
  reply_to_email: string | null;
  profile: { teacher?: { name?: string } } | null;
};

type IntakeRow = { id: string; answers: JoinAnswers; current_step: string };

function db(): SupabaseClient {
  return createServiceSupabase();
}

function fail(message: string): never {
  throw new ProblemError(400, "Enrolment form", message);
}

async function findInvite(supabase: SupabaseClient, token: string): Promise<InviteRow | null> {
  if (!/^[0-9a-f]{64}$/i.test(token)) return null;
  const { data, error } = await supabase
    .from("invitation")
    .select("id, studio_id, family_id, email, language, status, expires_at")
    .eq("token_hash", await sha256Hex(token))
    .maybeSingle();
  if (error) throw new ProblemError(500, "Invitation lookup failed", error.message);
  return (data as InviteRow | null) ?? null;
}

function isExpired(invite: InviteRow, now = new Date()) {
  return invite.status === "expired" || new Date(invite.expires_at).getTime() < now.getTime();
}

async function loadStudio(supabase: SupabaseClient, studioId: string) {
  const { data } = await supabase
    .from("studio")
    .select("name, reply_to_email, profile")
    .eq("id", studioId)
    .maybeSingle();
  const row = data as StudioRow | null;
  const studioName = row?.name?.trim() || "Your studio";
  return {
    studioName,
    teacherName: row?.profile?.teacher?.name?.trim() || studioName,
    replyToEmail: studioReplyTo(row?.reply_to_email),
  };
}

async function loadStudents(
  supabase: SupabaseClient,
  invitationId: string,
): Promise<FlowStudent[]> {
  const { data: links, error } = await supabase
    .from("invitation_student")
    .select("student_id")
    .eq("invitation_id", invitationId);
  if (error) throw new ProblemError(500, "Invitation lookup failed", error.message);
  const ids = (links ?? []).map((row) => row.student_id as string);
  if (!ids.length) return [];
  const { data: rows, error: studentError } = await supabase
    .from("student")
    .select("id, first_name, last_name, birth_year")
    .in("id", ids);
  if (studentError) throw new ProblemError(500, "Student lookup failed", studentError.message);
  const byId = new Map((rows ?? []).map((row) => [row.id as string, row]));
  return ids
    .map((id) => byId.get(id))
    .filter((row): row is NonNullable<typeof row> => Boolean(row))
    .map((row) => ({
      id: row.id as string,
      firstName: row.first_name as string,
      lastName: row.last_name as string,
      birthYear: row.birth_year as number,
    }));
}

/** The family-level answers row (student_id null) for this invitation; created if missing. */
async function loadFamilyIntake(
  supabase: SupabaseClient,
  invite: InviteRow,
  students: FlowStudent[],
): Promise<IntakeRow> {
  const { data, error } = await supabase
    .from("intake_response")
    .select("id, answers, current_step")
    .eq("invitation_id", invite.id)
    .is("student_id", null)
    .order("created_at", { ascending: true })
    .limit(1);
  if (error) throw new ProblemError(500, "Form lookup failed", error.message);
  const existing = (data ?? [])[0] as IntakeRow | undefined;
  if (existing) return { ...existing, answers: existing.answers ?? {} };
  const answers: JoinAnswers = {
    children: Object.fromEntries(
      students.map((s) => [
        s.id,
        { firstName: s.firstName, lastName: s.lastName, birthYear: s.birthYear },
      ]),
    ),
  };
  const { data: created, error: insertError } = await supabase
    .from("intake_response")
    .insert({
      invitation_id: invite.id,
      studio_id: invite.studio_id,
      answers,
      current_step: "collection",
    })
    .select("id, answers, current_step")
    .single();
  if (insertError || !created)
    throw new ProblemError(500, "Form create failed", insertError?.message ?? "No row");
  return created as IntakeRow;
}

type StudioTermsRow = {
  id: string;
  version_no: number;
  rendered_markdown: string;
  merge_values: Record<string, unknown> | null;
  sha256: string;
  change_type: string | null;
  effective_at: string;
};

/** The studio agreement a new family accepts: a pending material change, else the current one. */
async function targetStudioTerms(
  supabase: SupabaseClient,
  studioId: string,
  now = new Date(),
): Promise<StudioTermsRow | null> {
  const { data, error } = await supabase
    .from("terms_version")
    .select(
      "id, version_no, rendered_markdown, merge_values, sha256, change_type, effective_at, terms_document!inner(kind)",
    )
    .eq("studio_id", studioId)
    .eq("terms_document.kind", "studio_agreement")
    .order("version_no", { ascending: false });
  if (error) throw new ProblemError(500, "Terms lookup failed", error.message);
  const rows = (data ?? []) as StudioTermsRow[];
  const at = now.getTime();
  const current =
    rows.find((row) => new Date(row.effective_at).getTime() <= at) ?? rows.at(-1) ?? null;
  const pending =
    rows.find(
      (row) => new Date(row.effective_at).getTime() > at && row.change_type === "material",
    ) ?? null;
  return pending ?? current;
}

/** Full text of the Keystone family app terms and privacy notice, as accepted. */
function appTermsText() {
  return `${PUBLIC_TERMS_MARKDOWN}\n\n${PUBLIC_PRIVACY_MARKDOWN}`;
}

function termsBundle(version: StudioTermsRow): JoinTermsBundle {
  return {
    versionId: version.id,
    versionNo: version.version_no,
    effectiveAt: version.effective_at.slice(0, 10),
    markdown: version.rendered_markdown,
    moneyRules: moneyRulesFrom(version.merge_values),
    appId: `keystone-app-terms-v${FAMILY_APP_TERMS_VERSION}`,
    appVersionNo: FAMILY_APP_TERMS_VERSION,
    appTermsMarkdown: PUBLIC_TERMS_MARKDOWN,
    privacyNoticeMarkdown: PUBLIC_PRIVACY_MARKDOWN,
  };
}

/**
 * terms_acceptance rows point at a terms_version of the same studio, so each studio keeps a
 * copy of the Keystone app terms it was accepted under. Reuses the copy with the same text.
 */
async function ensureAppTermsVersion(supabase: SupabaseClient, studioId: string) {
  const text = appTermsText();
  const sha = await hashTerms(text);
  const { data: docs, error } = await supabase
    .from("terms_document")
    .select("id")
    .eq("studio_id", studioId)
    .eq("kind", "family_app_terms")
    .limit(1);
  if (error) throw new ProblemError(500, "Terms lookup failed", error.message);
  let documentId = (docs ?? [])[0]?.id as string | undefined;
  if (!documentId) {
    const created = await supabase
      .from("terms_document")
      .insert({ studio_id: studioId, kind: "family_app_terms" })
      .select("id")
      .single();
    if (created.error || !created.data)
      throw new ProblemError(500, "Terms save failed", created.error?.message ?? "No row");
    documentId = created.data.id as string;
  }
  const { data: versions, error: versionError } = await supabase
    .from("terms_version")
    .select("id, version_no, sha256")
    .eq("document_id", documentId)
    .order("version_no", { ascending: false });
  if (versionError) throw new ProblemError(500, "Terms lookup failed", versionError.message);
  const same = (versions ?? []).find((row) => row.sha256 === sha);
  if (same) return { id: same.id as string, sha256: sha };
  const highest = (versions ?? [])[0]?.version_no as number | undefined;
  const versionNo = highest
    ? Math.max(highest + 1, FAMILY_APP_TERMS_VERSION)
    : FAMILY_APP_TERMS_VERSION;
  const inserted = await supabase
    .from("terms_version")
    .insert({
      document_id: documentId,
      studio_id: studioId,
      version_no: versionNo,
      rendered_markdown: text,
      merge_values: {},
      switches: {},
      sha256: sha,
      change_type: "initial",
      change_summary: "Keystone Music HQ family app terms and privacy notice",
      effective_at: FAMILY_APP_TERMS_EFFECTIVE_AT,
      published_at: new Date().toISOString(),
      edited_clause_ids: [],
    })
    .select("id")
    .single();
  if (inserted.error || !inserted.data)
    throw new ProblemError(500, "Terms save failed", inserted.error?.message ?? "No row");
  return { id: inserted.data.id as string, sha256: sha };
}

async function audit(
  supabase: SupabaseClient,
  input: {
    studioId: string;
    event: "invite_opened" | "invite_submitted" | "token_rejected" | "magic_link_requested";
    guardianId?: string | null;
    actorUserId?: string | null;
    meta: Meta;
  },
) {
  await supabase.from("auth_audit").insert({
    studio_id: input.studioId,
    event: input.event,
    guardian_id: input.guardianId ?? null,
    actor_user_id: input.actorUserId ?? null,
    ip: input.meta.ip ?? null,
    user_agent: input.meta.userAgent?.slice(0, 500) ?? null,
  });
}

type ActiveInvite = { invite: InviteRow; students: FlowStudent[]; intake: IntakeRow };

/** For unlock, autosave and submit: the invitation must still be open. */
async function requireOpenInvite(
  supabase: SupabaseClient,
  token: string,
  meta: Meta,
): Promise<ActiveInvite> {
  const ip = meta.ip ?? "unknown";
  if (isIpLocked(ip)) fail("Too many attempts. Try again in 15 minutes.");
  const invite = await findInvite(supabase, token);
  if (!invite || invite.status === "revoked") {
    recordAuthFailure(ip, "token");
    fail("This link is no longer active.");
  }
  if (invite.status === "completed") fail("This enrolment form has already been completed.");
  if (isExpired(invite)) fail("This link has expired. Ask your teacher to send a new one.");
  const { level } = await getStudioAccess(invite.studio_id);
  if (level !== "full")
    fail("This studio isn't accepting new families right now. Please contact your teacher.");
  const students = await loadStudents(supabase, invite.id);
  if (!students.length) fail("This link is no longer active.");
  const intake = await loadFamilyIntake(supabase, invite, students);
  return { invite, students, intake };
}

export async function loadLiveJoin(token: string, meta: Meta = {}): Promise<JoinSession> {
  const ip = meta.ip ?? "unknown";
  if (isIpLocked(ip)) return { ...OPAQUE, message: "Too many attempts. Try again in 15 minutes." };
  if (!checkTokenLookupRate(ip)) return OPAQUE;
  const supabase = db();
  const invite = await findInvite(supabase, token);
  if (!invite || invite.status === "revoked") {
    recordAuthFailure(ip, "token");
    if (invite)
      await audit(supabase, { studioId: invite.studio_id, event: "token_rejected", meta });
    return OPAQUE;
  }
  const studio = await loadStudio(supabase, invite.studio_id);
  if (invite.status === "completed") {
    return { state: "completed", teacherName: studio.teacherName, loginEmail: invite.email };
  }
  if (isExpired(invite)) {
    if (invite.status !== "expired") {
      await supabase.from("invitation").update({ status: "expired" }).eq("id", invite.id);
    }
    return {
      state: "unavailable",
      message: `This link has expired. Ask ${studio.teacherName} to send a new one.`,
      teacherName: studio.teacherName,
      replyToEmail: studio.replyToEmail,
    };
  }
  const { level } = await getStudioAccess(invite.studio_id);
  if (level !== "full") {
    return {
      state: "unavailable",
      message: "This studio isn't accepting new families right now. Please contact your teacher.",
      teacherName: studio.teacherName,
      replyToEmail: studio.replyToEmail,
    };
  }
  const terms = await targetStudioTerms(supabase, invite.studio_id);
  if (!terms) {
    return {
      state: "unavailable",
      message: `${studio.studioName} hasn't published its studio terms yet, so the enrolment form can't open. Please let ${studio.teacherName} know.`,
      teacherName: studio.teacherName,
      replyToEmail: studio.replyToEmail,
    };
  }
  const students = await loadStudents(supabase, invite.id);
  if (!students.length) return OPAQUE;

  const { data: guardians } = await supabase
    .from("guardian")
    .select("id, full_name, email, mobile")
    .eq("family_id", invite.family_id);
  const guardian =
    (guardians ?? []).find((g) => String(g.email).toLowerCase() === invite.email.toLowerCase()) ??
    (guardians ?? [])[0];

  if (invite.status === "sent") {
    await supabase
      .from("invitation")
      .update({ status: "opened", opened_at: new Date().toISOString() })
      .eq("id", invite.id)
      .eq("status", "sent");
    await audit(supabase, {
      studioId: invite.studio_id,
      event: "invite_opened",
      guardianId: (guardian?.id as string | undefined) ?? null,
      meta,
    });
  }

  const intake = await loadFamilyIntake(supabase, invite, students);
  const env = getServerEnv();
  return {
    state: "active",
    live: true,
    invitationId: invite.id,
    token,
    language: invite.language,
    teacherName: studio.teacherName,
    studioName: studio.studioName,
    replyToEmail: studio.replyToEmail,
    students,
    guardian: {
      name: (guardian?.full_name as string | undefined) ?? "",
      email: invite.email,
      ...(guardian?.mobile ? { mobile: guardian.mobile as string } : {}),
    },
    answers: intake.answers,
    currentStep: intake.current_step,
    steps: buildSteps(students, intake.answers),
    turnstileSiteKey: env.turnstileSiteKey,
    mockCaptcha: false,
    terms: termsBundle(terms),
  };
}

export async function unlockLiveJoin(
  input: { token: string; turnstileToken?: string | undefined },
  meta: Meta = {},
) {
  const ip = meta.ip ?? "unknown";
  if (isIpLocked(ip)) fail("Too many attempts. Try again in 15 minutes.");
  if (!(await verifyTurnstile(input.turnstileToken, meta.ip))) {
    recordAuthFailure(ip, "captcha");
    fail("Security check failed. Please try it again.");
  }
  const supabase = db();
  const { intake } = await requireOpenInvite(supabase, input.token, meta);
  const answers = { ...intake.answers, collectionAcknowledged: true, turnstileUnlocked: true };
  const { error } = await supabase
    .from("intake_response")
    .update({ answers, updated_at: new Date().toISOString() })
    .eq("id", intake.id);
  if (error) throw new ProblemError(500, "Form save failed", error.message);
  return { ok: true as const };
}

function checkAnswersShape(answers: unknown): JoinAnswers {
  if (!answers || typeof answers !== "object" || Array.isArray(answers))
    fail("Answers are missing.");
  if (JSON.stringify(answers).length > MAX_ANSWERS_CHARS)
    fail("Your answers are too long to save.");
  return answers as JoinAnswers;
}

export async function autosaveLiveJoin(
  input: { token: string; currentStep: string; answers: JoinAnswers },
  meta: Meta = {},
) {
  const answers = checkAnswersShape(input.answers);
  const step = String(input.currentStep ?? "").slice(0, 120);
  const supabase = db();
  const { intake } = await requireOpenInvite(supabase, input.token, meta);
  if (!intake.answers.turnstileUnlocked) fail("Complete the security check first.");
  // The security-check flag only ever comes from unlock, never from the browser.
  const saved = { ...answers, collectionAcknowledged: true, turnstileUnlocked: true };
  const savedAt = new Date().toISOString();
  const { error } = await supabase
    .from("intake_response")
    .update({ answers: saved, current_step: step || "collection", updated_at: savedAt })
    .eq("id", intake.id);
  if (error) throw new ProblemError(500, "Form save failed", error.message);
  return { savedAt };
}

/**
 * Makes sure the parent has a Keystone sign-in account for the invite email and returns its id.
 * Holding the invite link (sent to that address) proves they own the email.
 */
async function ensureFamilyAccount(supabase: SupabaseClient, email: string, name: string) {
  const created = await supabase.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { full_name: name },
  });
  if (created.data?.user?.id) return created.data.user.id;
  // Already registered (another studio, or staff): look the account up through a sign-in link.
  const link = await supabase.auth.admin.generateLink({ type: "magiclink", email });
  if (link.data?.user?.id) return link.data.user.id;
  throw new ProblemError(
    500,
    "Account setup failed",
    created.error?.message ?? link.error?.message ?? "Could not create the family account.",
  );
}

async function sendSignInEmail(
  supabase: SupabaseClient,
  input: { email: string; guardianName: string; studioName: string },
) {
  const env = getServerEnv();
  const link = await supabase.auth.admin.generateLink({ type: "magiclink", email: input.email });
  const tokenHash = link.data?.properties?.hashed_token;
  if (!tokenHash) throw new Error(link.error?.message ?? "No sign-in link");
  const mail = familyWelcomeEmail({
    studioName: input.studioName,
    guardianName: input.guardianName,
    signInUrl: `${env.appUrl}/auth/callback?token_hash=${encodeURIComponent(tokenHash)}&type=magiclink`,
    loginUrl: `${env.appUrl}/login`,
  });
  await getEmailProvider().send({
    to: input.email,
    from: fromLine(input.studioName, env.emailFrom),
    subject: mail.subject,
    html: mail.html,
    text: mail.text,
    tags: [{ name: "kind", value: "family_welcome" }],
  });
}

async function postCompletedToChat(
  supabase: SupabaseClient,
  input: { studioId: string; familyId: string; userId: string; authorName: string },
) {
  const now = new Date().toISOString();
  const { data: conv, error } = await supabase
    .from("conversation")
    .upsert(
      { studio_id: input.studioId, family_id: input.familyId, last_message_at: now },
      { onConflict: "studio_id,family_id" },
    )
    .select("id")
    .single();
  if (error || !conv) throw new Error(error?.message ?? "No conversation");
  const { error: messageError } = await supabase.from("message").insert({
    studio_id: input.studioId,
    conversation_id: conv.id,
    author_user_id: input.userId,
    author_role: "guardian",
    author_name: input.authorName.slice(0, 200),
    kind: "text",
    body: COMPLETED_MESSAGE,
  });
  if (messageError) throw new Error(messageError.message);
}

export async function submitLiveJoin(
  input: { token: string; answers: JoinAnswers; termsVersionId?: string | undefined },
  meta: Meta = {},
) {
  const answers = checkAnswersShape(input.answers);
  const parsed = parseJoinAnswers(answers);
  const supabase = db();
  const { invite, students, intake } = await requireOpenInvite(supabase, input.token, meta);
  if (!intake.answers.turnstileUnlocked) fail("Complete the security check first.");
  const { capacity, consents, intakes } = checkJoinStudents(parsed, answers, students);
  const typedName = parsed.terms.typedName.trim();
  if (typedName.split(/\s+/).filter(Boolean).length < 2)
    fail("Type your full name (at least two words).");

  const studioTerms = await targetStudioTerms(supabase, invite.studio_id);
  if (!studioTerms)
    fail("Your studio hasn't published its terms yet. Please contact your teacher.");
  if (input.termsVersionId && input.termsVersionId !== studioTerms.id) {
    fail(
      "Your teacher has just updated the studio terms. Reload this page to read the new version.",
    );
  }
  const appTerms = await ensureAppTermsVersion(supabase, invite.studio_id);
  const studio = await loadStudio(supabase, invite.studio_id);
  const now = new Date().toISOString();
  const email = invite.email.trim().toLowerCase();

  // Guardian row for the invite email (the teacher created it; add it if it went missing).
  const { data: guardianRows, error: guardianError } = await supabase
    .from("guardian")
    .select("id, user_id, email")
    .eq("family_id", invite.family_id);
  if (guardianError) throw new ProblemError(500, "Guardian lookup failed", guardianError.message);
  let guardian = (guardianRows ?? []).find((g) => String(g.email).toLowerCase() === email) as
    { id: string; user_id: string | null } | undefined;
  if (!guardian) {
    const inserted = await supabase
      .from("guardian")
      .insert({
        family_id: invite.family_id,
        studio_id: invite.studio_id,
        full_name: parsed.fillerName.trim(),
        email,
        mobile: parsed.mobile,
        preferred_language: invite.language,
      })
      .select("id, user_id")
      .single();
    if (inserted.error || !inserted.data)
      throw new ProblemError(500, "Guardian save failed", inserted.error?.message ?? "No row");
    guardian = inserted.data as { id: string; user_id: string | null };
  }

  const userId = await ensureFamilyAccount(supabase, email, parsed.fillerName.trim());
  const guardianUpdate: Record<string, unknown> = { mobile: parsed.mobile };
  if (!guardian.user_id) guardianUpdate["user_id"] = userId;
  const { error: linkError } = await supabase
    .from("guardian")
    .update(guardianUpdate)
    .eq("id", guardian.id);
  if (linkError) throw new ProblemError(500, "Account link failed", linkError.message);

  // Terms acceptance and consents: written once per invitation (a retried submit skips them).
  const { data: priorAcceptance } = await supabase
    .from("terms_acceptance")
    .select("id")
    .eq("invitation_id", invite.id)
    .limit(1);
  if (!(priorAcceptance ?? []).length) {
    const shared = {
      studio_id: invite.studio_id,
      user_id: userId,
      guardian_id: guardian.id,
      typed_name: typedName,
      account_email: email,
      capacity,
      relationship: parsed.relationship,
      guardian_declaration: parsed.terms.guardianDeclaration,
      student_ids: students.map((s) => s.id),
      invitation_id: invite.id,
      method: "invite",
      accepted_at: now,
      ip: meta.ip ?? null,
      user_agent: meta.userAgent?.slice(0, 500) ?? null,
    };
    const { error: acceptError } = await supabase.from("terms_acceptance").insert([
      {
        ...shared,
        version_id: studioTerms.id,
        sha256: studioTerms.sha256,
        document_kind: "studio_agreement",
        receipt_id: crypto.randomUUID(),
      },
      {
        ...shared,
        version_id: appTerms.id,
        sha256: appTerms.sha256,
        document_kind: "family_app_terms",
        receipt_id: crypto.randomUUID(),
      },
    ]);
    if (acceptError) throw new ProblemError(500, "Terms acceptance failed", acceptError.message);

    const { error: consentError } = await supabase.from("consent_record").insert(
      consents.map((consent) => ({
        studio_id: invite.studio_id,
        student_id: consent.studentId,
        type: consent.type,
        granted: consent.granted,
        wording_version: "v2",
        given_by: typedName,
        given_at: now,
        ...(consent.granted ? {} : { withdrawn_at: now }),
      })),
    );
    if (consentError) throw new ProblemError(500, "Consent save failed", consentError.message);
  }

  // One teacher-facing intake per student (student_id set), next to the family answers row.
  const { data: priorIntakes } = await supabase
    .from("intake_response")
    .select("student_id")
    .eq("invitation_id", invite.id)
    .not("student_id", "is", null);
  const done = new Set((priorIntakes ?? []).map((row) => row.student_id as string));
  const studentIntakes = intakes.filter((entry) => !done.has(entry.studentId));
  if (studentIntakes.length) {
    const { error: intakeError } = await supabase.from("intake_response").insert(
      studentIntakes.map((entry) => ({
        invitation_id: invite.id,
        studio_id: invite.studio_id,
        student_id: entry.studentId,
        answers: entry.intake,
        current_step: "done",
        submitted_at: now,
      })),
    );
    if (intakeError) throw new ProblemError(500, "Form save failed", intakeError.message);
  }

  const { error: familyIntakeError } = await supabase
    .from("intake_response")
    .update({
      answers: { ...answers, collectionAcknowledged: true, turnstileUnlocked: true },
      current_step: "done",
      submitted_at: now,
      updated_at: now,
    })
    .eq("id", intake.id);
  if (familyIntakeError) throw new ProblemError(500, "Form save failed", familyIntakeError.message);

  const { error: inviteError } = await supabase
    .from("invitation")
    .update({ status: "completed", completed_at: now })
    .eq("id", invite.id);
  if (inviteError) throw new ProblemError(500, "Invitation update failed", inviteError.message);

  await audit(supabase, {
    studioId: invite.studio_id,
    event: "invite_submitted",
    guardianId: guardian.id,
    actorUserId: userId,
    meta,
  });

  // Nice-to-haves: the form is saved even if these fail.
  try {
    await postCompletedToChat(supabase, {
      studioId: invite.studio_id,
      familyId: invite.family_id,
      userId,
      authorName: parsed.fillerName.trim(),
    });
  } catch (error) {
    console.error("[family-join] chat note failed", error instanceof Error ? error.message : error);
  }
  let loginLinkSent = false;
  try {
    await sendSignInEmail(supabase, {
      email,
      guardianName: parsed.fillerName,
      studioName: studio.studioName,
    });
    loginLinkSent = true;
    await audit(supabase, {
      studioId: invite.studio_id,
      event: "magic_link_requested",
      guardianId: guardian.id,
      actorUserId: userId,
      meta,
    });
  } catch (error) {
    console.error(
      "[family-join] sign-in email failed",
      error instanceof Error ? error.message : error,
    );
  }

  return {
    ok: true as const,
    teacherName: studio.teacherName,
    guardianName: parsed.fillerName.trim(),
    email,
    loginLinkSent,
  };
}

function requestMeta(): Meta {
  try {
    return {
      ip: getRequestIP({ xForwardedFor: true }) ?? undefined,
      userAgent: getRequestHeader("user-agent") ?? undefined,
    };
  } catch {
    return {};
  }
}

export const loadLiveJoinFn = createServerFn({ method: "POST" })
  .validator((data: { token: string }) => ({ token: String(data?.token ?? "") }))
  .handler(({ data }) => loadLiveJoin(data.token, requestMeta()));

export const unlockLiveJoinFn = createServerFn({ method: "POST" })
  .validator((data: { token: string; turnstileToken?: string }) => data)
  .handler(({ data }) => unlockLiveJoin(data, requestMeta()));

export const autosaveLiveJoinFn = createServerFn({ method: "POST" })
  .validator((data: { token: string; currentStep: string; answers: JoinAnswers }) => data)
  .handler(({ data }) => autosaveLiveJoin(data, requestMeta()));

export const submitLiveJoinFn = createServerFn({ method: "POST" })
  .validator((data: { token: string; answers: JoinAnswers; termsVersionId?: string }) => data)
  .handler(({ data }) => submitLiveJoin(data, requestMeta()));
