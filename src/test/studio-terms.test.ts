import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/services/_delay", () => ({ respond: async <T,>(value: T) => structuredClone(value) }));

import { addDays, PROTOTYPE_TODAY } from "@/lib/calendar";
import { applyLateFeeCents, hashTerms, renderTerms } from "@/lib/terms-render";
import { LEGAL_TEMPLATE_AU } from "@/mocks/legal-template-au";
import { families, studio, students, teacher } from "@/mocks/data";
import { creditLedger } from "@/mocks/scheduling";
import { resetTermsStateForTests, termsState } from "@/mocks/terms";
import { enrolmentDrafts } from "@/mocks/onboarding";
import { startEnrolment, submitParentIntake, submitNewStudioIntake } from "@/services/onboarding";
import { getParentSession } from "@/services/parent";
import {
  acceptStudioTerms,
  classifyChange,
  getPublishedStudioTerms,
  lateFeeForInvoice,
  publishStudioTerms,
  recordConsent,
  saveStudioTermsDraft,
} from "@/services/terms";
import { extendExpiredMakeUpCredits } from "@/services/schedule";
import { newStudioRoster } from "@/mocks/roster-import";

const intake = {
  experience: "beginner" as const,
  previousGrades: "",
  theoryExams: "",
  instrument: "digital" as const,
  goal: "Enjoy playing",
  daysPerWeek: 5,
  minutesPerDay: 15,
};

async function acceptForStudents(studentIds: string[], opts: { capacity?: "self" | "guardian"; relationship?: "self" | "parent" | "legal_guardian"; guardianDeclaration?: boolean; typedName?: string; appTermsVersionId?: string | null } = {}) {
  await resetTermsStateForTests();
  const published = await getPublishedStudioTerms("demo");
  const version = published.pending ?? published.current;
  const state = termsState!;
  const appVersion = state.versions.find((entry) => entry.id === "tv-app-1")!;
  return acceptStudioTerms({
    versionId: version!.id,
    appTermsVersionId: opts.appTermsVersionId === null ? "" : opts.appTermsVersionId ?? appVersion.id,
    typedName: opts.typedName ?? "Wei Chen",
    capacity: opts.capacity ?? "guardian",
    relationship: opts.relationship ?? "parent",
    guardianDeclaration: opts.guardianDeclaration ?? true,
    studentIds,
    consents: studentIds.map((studentId) => ({ type: "lesson_recordings" as const, granted: true, studentId })),
  });
}

describe("studio terms render and classify", () => {
  it("renderTerms fills tags, reports missing required fields, and drops switched-off clauses", () => {
    const values = {
      studio: { legalName: "Demo Studio", tradingName: "Demo", abn: "11 111 111 111", address: "1 Street", state: "VIC", email: "a@b.c", phone: "00", privacyEmail: "p@b.c", entityTypeLabel: "sole trader", asyncLessonPolicyLabel: "A video lesson earns a make-up credit", additionalTerms: "", name: "Demo" },
      teacher: { name: "Ms Clarke", childSafetyState: "VIC", childSafetyType: "Working with Children Check", childSafetyStatus: "current", childSafetyChecks: "VIC Working with Children Check (current)" },
      billing: { cycle: "each school term", invoiceLeadDays: 14, dueRule: "14 days after issue", lateFeeAfterDays: 7, lateFee: 15, lateFeeLabel: "A$15", suspendAfterDays: 14, feeNoticeDays: 30, withdrawalNoticeWeeks: 4, noticePeriod: "4 weeks", paymentMethods: "card", accountingLabel: " ", paymentDiscount: { method: "", amount: "", amountLabel: "" } },
      policies: { cancelNoticeHours: 24, makeUpQuota: 1, makeUpPeriod: "term", makeUpExpiry: "same term", onlinePlatform: "Zoom", publicHolidays: "skip", publicHolidayRule: "are skipped with no charge", tuningFrequency: "once a year", inactiveRetentionMonths: 24 },
      services: { inHomeTravelFee: "A$10" },
      curriculum: { boards: "AMEB" },
      notice: { channel: "the Keystone Music HQ app or email" },
      privacy: { keystoneStorageStatement: "stored in AU", overseasCountriesLabel: "AU/NZ/US", financialRetentionYears: 5, paymentProvider: "Stripe", accountingSoftware: "Xero", keystonePrivacyEmail: "privacy@keystone.example" },
    };
    const full = renderTerms(LEGAL_TEMPLATE_AU, values, { online: true, premises: true, exams: true, asyncPro: true });
    expect(full.missingRequired).toEqual([]);
    expect(full.markdown).toContain("Demo Studio");
    expect(full.markdown).toContain("Zoom");
    expect(full.markdown).not.toContain("WWC-");
    expect(full.markdown).not.toMatch(/\{\{[^}]+\}\}/);
    expect(LEGAL_TEMPLATE_AU.some((clause) => /surcharge/i.test(clause.body) && clause.id.includes("surcharge"))).toBe(false);
    const dropped = renderTerms(LEGAL_TEMPLATE_AU, values, { online: false });
    expect(dropped.markdown).not.toContain("4.1 Online lessons");
    const missing = renderTerms(LEGAL_TEMPLATE_AU, { ...values, studio: { ...values.studio, abn: "" } }, { premises: true });
    expect(missing.missingRequired).toContain("studio.abn");
    expect(missing.markdown).toContain("{{studio.abn}}");
  });

  it("classifyChange: late fee material, phone minor, material clause edit material", () => {
    const base = {
      mergeValues: { billing: { lateFee: 15 }, studio: { phone: "1" } },
      renderedMarkdown: "## Late payment\n\nfee 15\n\n## Parties\n\nhello",
      editedClauseIds: [] as string[],
    };
    expect(classifyChange(base, { ...base, mergeValues: { billing: { lateFee: 12 }, studio: { phone: "1" } }, renderedMarkdown: base.renderedMarkdown })).toBe("material");
    expect(classifyChange(base, { ...base, mergeValues: { billing: { lateFee: 15 }, studio: { phone: "2" } }, renderedMarkdown: base.renderedMarkdown })).toBe("minor");
    expect(
      classifyChange(base, {
        mergeValues: base.mergeValues,
        renderedMarkdown: "## Late payment\n\nedited material clause\n\n## Parties\n\nhello",
        editedClauseIds: ["p1-late-fee"],
        editedMaterialClause: true,
      }),
    ).toBe("material");
  });

  it("hashTerms returns sha-256 hex", async () => {
    const hash = await hashTerms("hello");
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });
});

describe("studio terms service", () => {
  beforeEach(async () => {
    await resetTermsStateForTests();
    delete studio.pendingBilling;
    if (studio.billing) studio.billing.lateFee = 15;
  });

  it("publishStudioTerms rejects a material effective date earlier than feeNoticeDays", async () => {
    await expect(
      publishStudioTerms("demo", { changeSummary: "Late fee change", effectiveAt: addDays(PROTOTYPE_TODAY, 7), forceMaterial: true }),
    ).rejects.toThrow(/30 days/);
  });

  it("acceptStudioTerms rejects capacity self for under-18 and accepts adult self", async () => {
    const minor = students.find((student) => !((2027 - student.birthYear) >= 18))!;
    await expect(acceptForStudents([minor.id], { capacity: "self", relationship: "self", guardianDeclaration: false })).rejects.toThrow(/guardian/i);
    await expect(acceptForStudents([minor.id], { capacity: "guardian", relationship: "self", guardianDeclaration: true })).rejects.toThrow(/Parent or Legal guardian/);
    await expect(acceptForStudents([minor.id], { capacity: "guardian", relationship: "parent", guardianDeclaration: false })).rejects.toThrow(/parent or legal guardian/);

    const adult = students.find((student) => 2027 - student.birthYear >= 18) ?? {
      id: "stu-adult-test",
      familyId: "fam-1",
      firstName: "Adult",
      lastName: "Chen",
      birthYear: 2000,
    };
    if (!students.includes(adult as (typeof students)[number])) students.push(adult as (typeof students)[number]);
    await expect(acceptForStudents([adult.id], { capacity: "self", relationship: "self", typedName: "Adult Chen", guardianDeclaration: false })).resolves.toBeTruthy();
  });

  it("acceptStudioTerms records family_app_terms and fails without appTermsVersionId", async () => {
    const child = students.find((student) => student.familyId === "fam-1")!;
    await expect(acceptForStudents([child.id], { appTermsVersionId: null })).rejects.toThrow(/app terms/i);
    const result = await acceptForStudents([child.id]);
    expect(result.appAcceptance.documentKind).toBe("family_app_terms");
    expect(result.studioAcceptance.documentKind).toBe("studio_agreement");
  });

  it("published versions and acceptances cannot be mutated through returned objects", async () => {
    const published = await getPublishedStudioTerms("demo");
    const version = published.current!;
    version.changeSummary = "hacked";
    const again = await getPublishedStudioTerms("demo");
    expect(again.current?.changeSummary).not.toBe("hacked");
  });

  it("media_public never changes family.mediaConsent; lesson_recordings does", async () => {
    const family = families.find((entry) => entry.id === "fam-1")!;
    family.mediaConsent = false;
    const child = students.find((student) => student.familyId === "fam-1")!;
    await recordConsent({ scope: "demo", studentId: child.id, type: "media_public", granted: true, givenBy: "Wei Chen" });
    expect(family.mediaConsent).toBe(false);
    await recordConsent({ scope: "demo", studentId: child.id, type: "lesson_recordings", granted: true, givenBy: "Wei Chen" });
    expect(family.mediaConsent).toBe(true);
  });

  it("pending late fee is not used by billing before its effective date", async () => {
    studio.billing!.lateFee = 15;
    studio.pendingBilling = { lateFee: 12, effectiveAt: addDays(PROTOTYPE_TODAY, 30) };
    expect(lateFeeForInvoice(12000)).toBe(applyLateFeeCents(15, 12000));
    studio.pendingBilling = { lateFee: 12, effectiveAt: PROTOTYPE_TODAY };
    expect(lateFeeForInvoice(12000)).toBe(applyLateFeeCents(12, 12000));
  });

  it("late fee caps at 5% and A$15", () => {
    expect(applyLateFeeCents(15, 12000)).toBe(600);
    expect(applyLateFeeCents(15, 60000)).toBe(1500);
  });

  it("receipts and outbox never contain health-note text", async () => {
    const child = students.find((student) => student.familyId === "fam-1")!;
    await acceptStudioTerms({
      versionId: (await getPublishedStudioTerms("demo")).pending!.id,
      appTermsVersionId: "tv-app-1",
      typedName: "Wei Chen",
      capacity: "guardian",
      relationship: "parent",
      guardianDeclaration: true,
      studentIds: [child.id],
      consents: [{ type: "health_notes", granted: true, studentId: child.id }],
    });
    const state = termsState!;
    const blob = JSON.stringify({ receipts: state.receipts, outbox: state.outbox });
    expect(blob).not.toMatch(/asthma|allergy|diagnosis|secret-health/i);
    expect(blob).toContain("health_notes=yes");
  });

  it("receipts and outbox include the full accepted text of both documents", async () => {
    const child = students.find((student) => student.familyId === "fam-1")!;
    const published = await getPublishedStudioTerms("demo");
    const version = published.pending!;
    await acceptStudioTerms({
      versionId: version.id,
      appTermsVersionId: "tv-app-1",
      typedName: "Wei Chen",
      capacity: "guardian",
      relationship: "parent",
      guardianDeclaration: true,
      studentIds: [child.id],
      consents: [],
    });
    const receipt = termsState!.receipts.at(-1)!;
    const outbox = termsState!.outbox.at(-1)!;
    for (const body of [receipt.renderedText, outbox.body]) {
      expect(body).toContain("===== STUDIO AGREEMENT (FULL ACCEPTED TEXT) =====");
      expect(body).toContain(version.renderedMarkdown.slice(0, 80));
      expect(body).toContain("===== KEYSTONE FAMILY APP TERMS PARTS A–D (FULL ACCEPTED TEXT) =====");
      expect(body).toMatch(/## Part A/);
      expect(body).toMatch(/## Part D/);
      expect(body).toContain("===== KEYSTONE PRIVACY NOTICE / PART C (FULL ACCEPTED TEXT) =====");
      expect(body).toContain("Synoratech Pty Ltd");
      expect(body).not.toMatch(/asthma|allergy|diagnosis|secret-health/i);
    }
  });

  it("renderTerms never outputs a teacher check number", () => {
    teacher.childSafety = { state: "VIC", type: "WWCC", number: "SECRET-999", expiry: "2028-01-01" };
    const markdown = renderTerms(
      LEGAL_TEMPLATE_AU,
      {
        teacher: { name: teacher.name, childSafetyState: "VIC", childSafetyType: "WWCC", childSafetyStatus: "current", childSafetyChecks: "VIC WWCC (current)" },
        studio: { legalName: "X", tradingName: "X", abn: "1", address: "a", state: "VIC", email: "e", phone: "p", privacyEmail: "p", entityTypeLabel: "sole trader", asyncLessonPolicyLabel: "x", additionalTerms: "", name: "X" },
        billing: { cycle: "c", invoiceLeadDays: 14, dueRule: "d", lateFeeAfterDays: 7, lateFee: 15, lateFeeLabel: "A$15", suspendAfterDays: 14, feeNoticeDays: 30, withdrawalNoticeWeeks: 4, noticePeriod: "4 weeks", paymentMethods: "m", accountingLabel: "", paymentDiscount: { method: "", amount: "", amountLabel: "" } },
        policies: { cancelNoticeHours: 24, makeUpQuota: 1, makeUpPeriod: "term", makeUpExpiry: "same term", onlinePlatform: "Zoom", publicHolidays: "skip", publicHolidayRule: "are skipped with no charge", tuningFrequency: "once a year", inactiveRetentionMonths: 24 },
        services: { inHomeTravelFee: "A$0" },
        curriculum: { boards: "AMEB" },
        notice: { channel: "the Keystone Music HQ app or email" },
        privacy: { keystoneStorageStatement: "s", overseasCountriesLabel: "o", financialRetentionYears: 5, paymentProvider: "Stripe", accountingSoftware: "Xero", keystonePrivacyEmail: "privacy@keystone.example" },
      },
      { premises: true },
    ).markdown;
    expect(markdown).not.toContain("SECRET-999");
  });
});

describe("intake requires terms acceptance", () => {
  beforeEach(async () => {
    await resetTermsStateForTests();
  });

  it("fails without acceptance and succeeds with it", async () => {
    const session = await getParentSession();
    const draft = await startEnrolment({
      firstName: "New",
      lastName: "Chen",
      birthYear: 2018,
      guardianName: "Wei Chen",
      guardianEmail: session.guardian.email,
      guardianMobile: "0400000000",
      language: "en",
    });
    await expect(submitParentIntake(draft.id, intake)).rejects.toThrow("Accept the studio terms to finish enrolment.");
    await acceptForStudents([draft.studentId]);
    await expect(submitParentIntake(draft.id, intake)).resolves.toBeTruthy();
    expect(enrolmentDrafts.find((entry) => entry.id === draft.id)?.status).toBe("intake_done");
  });

  it("keeps empty studio activation isolated with terms acceptance", async () => {
    const before = students.length;
    await resetTermsStateForTests();
    const state = termsState!;
    const doc = state.documents.find((entry) => entry.scope === "new-studio" && entry.kind === "studio_agreement")!;
    const demoVersion = state.versions.find((entry) => entry.id === "tv-demo-1")!;
    state.versions.push({ ...structuredClone(demoVersion), id: "tv-new-1", documentId: doc.id, effectiveAt: "2027-01-01", changeType: "initial" });
    state.versions.push({ ...structuredClone(state.versions.find((entry) => entry.id === "tv-app-1")!), id: "tv-app-new-1", documentId: "doc-app-new" });
    const published = await getPublishedStudioTerms("new-studio");
    expect(published.current?.id).toBe("tv-new-1");
    const draft = await startEnrolment(
      {
        firstName: "New",
        lastName: "Chen",
        birthYear: 2018,
        guardianName: "Wei Chen",
        guardianEmail: "new-studio-terms@example.com",
        guardianMobile: "0400000000",
        language: "en",
      },
      "new-studio",
    );
    await acceptStudioTerms({
      versionId: published.current!.id,
      appTermsVersionId: "tv-app-new-1",
      typedName: "Wei Chen",
      capacity: "guardian",
      relationship: "parent",
      guardianDeclaration: true,
      studentIds: [draft.studentId],
      consents: [],
      scope: "new-studio",
    });
    const done = await submitNewStudioIntake(draft.id, intake);
    expect(done.status).toBe("intake_done");
    expect(students.length).toBe(before);
    expect(newStudioRoster.students.some((entry) => entry.id === draft.studentId)).toBe(true);
  });
});

describe("make-up credit extension", () => {
  it("extends an expiring make-up credit with no offered slot by a new ledger entry", () => {
    const studentId = "stu-1";
    creditLedger.push({
      id: "credit-expire-1",
      studentId,
      occurrenceId: "occ-expire-1",
      amount: 1,
      date: "2027-01-01",
      reason: "Cancelled by studio",
      expiresAt: "2027-03-01",
      slotOffered: false,
    });
    const extensions = extendExpiredMakeUpCredits(studentId, PROTOTYPE_TODAY);
    expect(extensions).toHaveLength(1);
    expect(extensions[0]?.reason).toBe("Extended: no make-up time was available");
    expect(creditLedger.some((entry) => entry.reason === "Extended: no make-up time was available")).toBe(true);
  });
});

describe("additional terms warnings and save", () => {
  it("saveStudioTermsDraft keeps surcharge warnings non-blocking", async () => {
    await resetTermsStateForTests();
    const draft = await saveStudioTermsDraft("demo", { studio: { additionalTerms: "A card fee surcharge applies; no refund." } });
    expect(draft.warnings).toEqual(expect.arrayContaining(["surcharge", "card fee", "no refund"]));
  });
});
