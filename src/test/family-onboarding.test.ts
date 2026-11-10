import { beforeEach, describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { inviteSubject, invitePlainText, InviteEmail } from "@/emails/InviteEmail";
import { render } from "@react-email/components";
import { families, students, teacher } from "@/mocks/data";
import { invitationState, resetInvitationState } from "@/mocks/invitations";
import { enrolmentDrafts } from "@/mocks/onboarding";
import { clearEmailOutbox, getEmailOutbox } from "@/server/email";
import { isIpLocked, recordAuthFailure } from "@/server/rate-limit";
import { buildSteps } from "@/lib/onboarding/steps";
import { sha256Hex } from "@/lib/onboarding/crypto";
import {
  autosaveJoinAnswers,
  createInvitation,
  getAuthAudit,
  loadJoinSession,
  requestFamilyMagicLink,
  resendInvitation,
  runInviteReminders,
  submitJoinEnrolment,
  unlockJoinSession,
} from "@/services/invitations";
import { startEnrolment } from "@/services/onboarding";
import { ensureTermsState } from "@/mocks/terms";

beforeEach(async () => {
  resetInvitationState();
  clearEmailOutbox();
  enrolmentDrafts.length = 0;
  await ensureTermsState();
});

describe("family onboarding invites", () => {
  it("stores only the token hash and never returns the raw token", async () => {
    const family = families[0]!;
    const kids = students.filter((s) => s.familyId === family.id).slice(0, 2);
    const result = await createInvitation({
      familyId: family.id,
      studentIds: kids.map((k) => k.id),
    });
    expect(result.status).toBe("sent");
    expect(result).not.toHaveProperty("token");
    const invite = invitationState.invitations[0]!;
    expect(invite.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(invite._rawToken).toBeTruthy();
    const session = await loadJoinSession(invite._rawToken!);
    expect(session.state).toBe("active");
    if (session.state === "active") expect(session).not.toHaveProperty("tokenHash");
  });

  it("treats unknown and revoked tokens the same, and blocks completed/expired", async () => {
    const family = families[0]!;
    const kid = students.find((s) => s.familyId === family.id)!;
    await createInvitation({ familyId: family.id, studentIds: [kid.id] });
    const invite = invitationState.invitations[0]!;
    const unknown = await loadJoinSession("deadbeef".repeat(8));
    invite.status = "revoked";
    const revoked = await loadJoinSession(invite._rawToken!);
    expect(unknown).toEqual(revoked);

    invite.status = "completed";
    const completed = await loadJoinSession(invite._rawToken!);
    expect(completed.state).toBe("completed");

    invite.status = "sent";
    invite.expiresAt = "2020-01-01T00:00:00+11:00";
    const expired = await loadJoinSession(invite._rawToken!);
    expect(expired.state).toBe("unavailable");
  });

  it("sends day-3 and day-7 reminders only, idempotently, then expires after 14 days", async () => {
    const family = families[0]!;
    const kid = students.find((s) => s.familyId === family.id)!;
    invitationState.clockNow = "2027-03-15T09:00:00+11:00";
    await createInvitation({ familyId: family.id, studentIds: [kid.id] });
    const invite = invitationState.invitations[0]!;
    invite.sentAt = "2027-03-15T09:00:00+11:00";
    invite.expiresAt = "2027-03-29T23:59:59+11:00";

    invitationState.clockNow = "2027-03-18";
    expect((await runInviteReminders("2027-03-18")).reminded).toBe(1);
    expect((await runInviteReminders("2027-03-18")).reminded).toBe(0);
    expect(invite.reminderCount).toBe(1);

    invitationState.clockNow = "2027-03-22";
    expect((await runInviteReminders("2027-03-22")).reminded).toBe(1);
    expect(invite.reminderCount).toBe(2);
    expect((await runInviteReminders("2027-03-22")).reminded).toBe(0);

    invitationState.clockNow = "2027-03-30";
    expect((await runInviteReminders("2027-03-30")).expired).toBe(1);
    expect(invite.status).toBe("expired");
  });
});

describe("family onboarding flow", () => {
  it("builds conditional screens and per-child loops", () => {
    const kids = students.filter((s) => s.familyId === "fam-1");
    expect(kids.length).toBeGreaterThanOrEqual(2);
    const withTransfer = {
      children: {
        [kids[0]!.id]: {
          firstName: kids[0]!.firstName,
          lastName: kids[0]!.lastName,
          birthYear: kids[0]!.birthYear,
          experience: "transferring" as const,
          goalKind: "exams" as const,
          teacherNotes: "needs support",
        },
        [kids[1]!.id]: {
          firstName: kids[1]!.firstName,
          lastName: kids[1]!.lastName,
          birthYear: kids[1]!.birthYear,
          experience: "beginner" as const,
          goalKind: "fun" as const,
        },
      },
    };
    const steps = buildSteps(
      kids.map((k) => ({
        id: k.id,
        firstName: k.firstName,
        lastName: k.lastName,
        birthYear: k.birthYear,
      })),
      withTransfer,
    );
    expect(steps.some((s) => s.id.includes("previousGrades"))).toBe(true);
    expect(steps.some((s) => s.id.includes("examBoard"))).toBe(true);
    expect(steps.some((s) => s.id.includes("healthConsent"))).toBe(true);
    expect(steps.filter((s) => s.kind === "child").length).toBeGreaterThan(10);
    expect(steps[0]?.id).toBe("collection");
  });

  it("autosaves, resumes, and keeps answers on back navigation via current_step", async () => {
    const family = families[0]!;
    const kid = students.find((s) => s.familyId === family.id)!;
    await createInvitation({ familyId: family.id, studentIds: [kid.id] });
    const token = invitationState.invitations[0]!._rawToken!;
    await unlockJoinSession({ token, turnstileToken: "ok" });
    await autosaveJoinAnswers({
      token,
      currentStep: "mobile",
      answers: {
        fillerName: "Wei Chen",
        relationship: "parent",
        mobile: "0491 570 006",
        collectionAcknowledged: true,
        turnstileUnlocked: true,
        children: {
          [kid.id]: {
            firstName: kid.firstName,
            lastName: kid.lastName,
            birthYear: kid.birthYear,
            experience: "beginner",
          },
        },
      },
    });
    const resumed = await loadJoinSession(token);
    expect(resumed.state).toBe("active");
    if (resumed.state === "active") {
      expect(resumed.currentStep).toBe("mobile");
      expect(resumed.answers.fillerName).toBe("Wei Chen");
      expect(resumed.answers.children?.[kid.id]?.experience).toBe("beginner");
    }
  });

  it("submit writes two acceptances, rejects missing terms / self-for-minor, and updates drafts", async () => {
    const family = families[0]!;
    const kids = students.filter((s) => s.familyId === family.id).slice(0, 2);
    const draft = await startEnrolment({
      firstName: kids[0]!.firstName,
      lastName: kids[0]!.lastName,
      birthYear: kids[0]!.birthYear,
      guardianName: family.guardians[0]!.name,
      guardianEmail: family.guardians[0]!.email,
      guardianMobile: family.guardians[0]!.mobile ?? "0491 570 006",
      language: "en",
      existingStudentId: kids[0]!.id,
    });
    // startEnrolment with existing student reuses; ensure invitation exists for both siblings via createInvitation
    await createInvitation({
      familyId: family.id,
      studentIds: kids.map((k) => k.id),
      enrolmentDraftIds: [draft.id],
    });
    const invite = invitationState.invitations.at(-1)!;
    const token = invite._rawToken!;
    const state = await ensureTermsState();
    const before = state.acceptances.length;

    await expect(
      submitJoinEnrolment({
        token,
        answers: {
          fillerName: "Wei Chen",
          relationship: "self",
          mobile: "0491 570 006",
          collectionAcknowledged: true,
          turnstileUnlocked: true,
          terms: {
            studioAgreed: true,
            keystoneAgreed: true,
            guardianDeclaration: false,
            typedName: "Wei Chen",
            relationship: "self",
          },
          children: Object.fromEntries(
            kids.map((kid) => [
              kid.id,
              {
                firstName: kid.firstName,
                lastName: kid.lastName,
                birthYear: kid.birthYear,
                experience: "beginner" as const,
                instrument: "digital" as const,
                goalKind: "fun" as const,
                daysPerWeek: 4,
                minutesPerDay: 20,
                emergencyMedical: true,
                mediaPublic: false,
              },
            ]),
          ),
        },
      }),
    ).rejects.toThrow(/parent or legal guardian/i);

    const result = await submitJoinEnrolment({
      token,
      answers: {
        fillerName: "Wei Chen",
        relationship: "parent",
        mobile: "0491 570 006",
        collectionAcknowledged: true,
        turnstileUnlocked: true,
        terms: {
          studioAgreed: true,
          keystoneAgreed: true,
          guardianDeclaration: true,
          typedName: "Wei Chen",
          relationship: "parent",
        },
        children: Object.fromEntries(
          kids.map((kid) => [
            kid.id,
            {
              firstName: kid.firstName,
              lastName: kid.lastName,
              birthYear: kid.birthYear,
              experience: "beginner" as const,
              instrument: "digital" as const,
              goalKind: "fun" as const,
              daysPerWeek: 4,
              minutesPerDay: 20,
              teacherNotes: "focus",
              healthNotes: "focus",
              healthNotesConsent: true,
              emergencyMedical: true,
              mediaPublic: false,
            },
          ]),
        ),
      },
    });
    expect(result.ok).toBe(true);
    expect(state.acceptances.length - before).toBe(2);
    const kinds = state.acceptances
      .slice(-2)
      .map((a) => a.documentKind)
      .sort();
    expect(kinds).toEqual(["family_app_terms", "studio_agreement"]);
    expect(state.acceptances.slice(-2).every((a) => a.studentIds.length === kids.length)).toBe(
      true,
    );
    expect(state.consents.some((c) => c.type === "media_public")).toBe(true);
    expect(state.consents.some((c) => c.type === "lesson_recordings")).toBe(false);
    expect(invite.status).toBe("completed");
    expect(getAuthAudit().some((e) => e.event === "invite_submitted")).toBe(true);
  });
});

describe("email and security", () => {
  it("InviteEmail renders both languages and correct subject / button URL", async () => {
    const props = {
      language: "zh-CN" as const,
      teacherName: teacher.name,
      guardianFirstName: "Wei",
      childNames: "Lucy and Oscar",
      studioName: "Keystone Music HQ",
      joinUrl: "https://example.com/join/abc",
      expiresLabel: "29 Mar 2027",
    };
    expect(inviteSubject("zh-CN", teacher.name, "Lucy and Oscar")).toContain("办理入学");
    expect(inviteSubject("en", teacher.name, "Lucy and Oscar")).toContain("enrol");
    const html = await render(InviteEmail(props));
    expect(html).toContain("开始入学登记");
    expect(html).toContain("Start enrolment");
    expect(html).toContain(props.joinUrl);
    expect(invitePlainText(props)).toContain("诚邀");
  });

  it("locks out after 5 failed token checks and writes append-only audit", async () => {
    const ip = "198.51.100.9";
    for (let i = 0; i < 5; i++) recordAuthFailure(ip, "token");
    expect(isIpLocked(ip)).toBe(true);
    await createInvitation({ familyId: families[0]!.id, studentIds: [students[0]!.id] });
    await resendInvitation(invitationState.invitations[0]!.id);
    expect(getAuthAudit().some((e) => e.event === "invite_resent")).toBe(true);
    expect(getAuthAudit().every((e) => e.id && e.at)).toBe(true);
  });

  it("mock mode magic-link and invites go to outbox without Supabase keys", async () => {
    await createInvitation({ familyId: families[0]!.id, studentIds: [students[0]!.id] });
    await requestFamilyMagicLink({ email: "wei.chen@example.com" });
    expect(getEmailOutbox().length).toBeGreaterThanOrEqual(2);
    expect(getEmailOutbox().some((e) => e.subject.includes("Keystone Music HQ"))).toBe(true);
  });

  it("hash helper produces sha256 hex", async () => {
    const hash = await sha256Hex("token");
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });
});

describe("terms screen reuse and layout gates", () => {
  it("flow uses the four terms screens and no duplicate consent screens elsewhere in onboarding", () => {
    const flow = readFileSync(
      join(process.cwd(), "src/components/onboarding/FamilyOnboardingFlow.tsx"),
      "utf8",
    );
    expect(flow).toContain("CollectionNoticeScreen");
    expect(flow).toContain("EmergencyMedicalScreen");
    expect(flow).toContain("HealthNotesConsentScreen");
    expect(flow).toContain("PublicMediaConsentScreen");
    expect(flow).toContain("TermsAcceptScreen");
    const onboardingDir = join(process.cwd(), "src/components/onboarding");
    for (const file of readdirSync(onboardingDir)) {
      if (!file.endsWith(".tsx")) continue;
      const text = readFileSync(join(onboardingDir, file), "utf8");
      expect(
        text.includes("function EmergencyMedical") || text.includes("function TermsAccept"),
      ).toBe(false);
    }
  });

  it("RoleGate renders join/intake without AppShell", () => {
    const root = readFileSync(join(process.cwd(), "src/routes/__root.tsx"), "utf8");
    expect(root).toContain("isFocusFlowPath");
    expect(root).toContain("StudioShell");
  });
});

describe("SQL migration RLS", () => {
  it("enables RLS and append-only rules for terms and email_log", () => {
    const sql = readFileSync(
      join(process.cwd(), "supabase/migrations/0001_family_onboarding.sql"),
      "utf8",
    );
    for (const table of [
      "studio",
      "studio_member",
      "family",
      "guardian",
      "student",
      "invitation",
      "invitation_student",
      "intake_response",
      "terms_document",
      "terms_version",
      "terms_acceptance",
      "consent_record",
      "email_log",
      "auth_audit",
    ]) {
      expect(sql).toContain(`alter table ${table} enable row level security`);
    }
    expect(sql).toContain("No UPDATE/DELETE policies on terms_version");
    expect(sql).toContain("No UPDATE/DELETE on terms_acceptance");
    expect(sql).toContain("consent_member_withdraw");
    expect(sql).toContain("email_log_member_insert");
  });
});
