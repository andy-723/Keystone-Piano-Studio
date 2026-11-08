import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/services/_delay", () => ({ respond: async <T,>(value: T) => structuredClone(value) }));

import { buildTermsPdf } from "@/lib/terms-pdf";
import { applyLateFeeCents, renderTerms } from "@/lib/terms-render";
import { visibleOnboardingSteps } from "@/lib/studio-terms-onboarding-steps";
import { LEGAL_TEMPLATE_AU, LEGAL_TEMPLATE_VERSION } from "@/mocks/legal-template-au";
import {
  FAMILY_APP_TERMS_MARKDOWN,
  KEYSTONE_ENTITY,
  PRIVACY_NOTICE_MARKDOWN,
  reviewed,
} from "@/mocks/keystone-app-terms";
import { buildMergeValues, resetTermsStateForTests, termsState } from "@/mocks/terms";
import { studio, teacher } from "@/mocks/data";
import {
  getFamilyAppTerms,
  getStudioTermsDraft,
  getTermsDocumentForPdf,
  saveStudioTermsDraft,
} from "@/services/terms";

describe("studio agreement AU v3", () => {
  beforeEach(async () => {
    await resetTermsStateForTests();
    if (studio.billing) studio.billing.lateFee = 15;
  });

  it("marks the template reviewed and product-final", () => {
    expect(reviewed).toBe(true);
    expect(LEGAL_TEMPLATE_VERSION).toBe("AU-v3");
    expect(LEGAL_TEMPLATE_AU.some((clause) => /Draft AU clause/i.test(clause.body))).toBe(false);
  });

  it("uses Synoratech KEYSTONE_ENTITY and family app Parts A–D only", async () => {
    expect(KEYSTONE_ENTITY).toBe("Synoratech Pty Ltd, ACN [ ], ABN [ ]");
    expect(FAMILY_APP_TERMS_MARKDOWN).toMatch(/## Part A/);
    expect(FAMILY_APP_TERMS_MARKDOWN).toMatch(/## Part B/);
    expect(FAMILY_APP_TERMS_MARKDOWN).toMatch(/## Part C/);
    expect(FAMILY_APP_TERMS_MARKDOWN).toMatch(/## Part D/);
    expect(FAMILY_APP_TERMS_MARKDOWN).not.toMatch(/## Part E|appendix E1|E1–E3|solicitor appendix/i);
    expect(PRIVACY_NOTICE_MARKDOWN).toMatch(/## Part C/);
    const app = await getFamilyAppTerms();
    expect(app.keystoneEntity).toBe(KEYSTONE_ENTITY);
    expect(app.appTermsMarkdown).toContain("Synoratech Pty Ltd");
    expect(app.privacyNoticeMarkdown).toContain("Synoratech Pty Ltd");
    expect(app.appTermsMarkdown).not.toContain("{{privacy.");
  });

  it("fills v3 merge fields and never exposes child-safety numbers", () => {
    const values = buildMergeValues({
      studioName: "Clarke Piano Studio",
      legalName: "Margaret Clarke Piano Studio",
      abn: "51 824 753 556",
      address: "12 Music Lane, Hawthorn",
      state: "VIC",
      email: "studio@keystone.example",
      phone: "03 9000 0000",
      privacyEmail: "privacy@keystone.example",
      entityType: "sole_trader",
      asyncLessonPolicy: "makeup_credit",
      billing: studio.billing!,
      policies: studio.policies!,
      services: { ...studio.services!, inHomeTravelFee: "A$25" },
      teacherName: teacher.name,
      childSafety: teacher.childSafety!,
      paymentMethods: "PayTo, BECS direct debit and card",
      boards: "AMEB, Trinity, ABRSM",
      paymentProvider: "Stripe",
      accountingSoftware: "Xero",
    });
    const full = renderTerms(LEGAL_TEMPLATE_AU, values, {
      online: true,
      premises: true,
      exams: true,
      asyncPro: true,
      inHome: true,
      paymentDiscount: false,
      onlinePayments: true,
    });
    expect(full.missingRequired).toEqual([]);
    expect(full.markdown).toContain("Margaret Clarke Piano Studio");
    expect(full.markdown).toContain("trading as **Clarke Piano Studio**");
    expect(full.markdown).toContain("Zoom");
    expect(full.markdown).toContain("VIC Working with Children Check (current)");
    expect(full.markdown).toContain("Stripe");
    expect(full.markdown).toContain("1a. Online payments");
    expect(full.markdown).not.toContain("WWC-DEMO");
    expect(full.markdown).not.toMatch(/\{\{[^}]+\}\}/);
    expect(full.markdown).toContain("4.1 Online lessons");
    const withoutOnline = renderTerms(LEGAL_TEMPLATE_AU, values, { online: false, premises: true });
    expect(withoutOnline.markdown).not.toContain("4.1 Online lessons");
    const withoutOnlinePay = renderTerms(LEGAL_TEMPLATE_AU, values, { onlinePayments: false });
    expect(withoutOnlinePay.markdown).not.toContain("1a. Online payments");
  });

  it("persists Typeform onboarding answers into the shared terms draft", async () => {
    const saved = await saveStudioTermsDraft("new-studio", {
      studio: {
        legalName: "New Keys Pty Ltd",
        name: "New Keys Studio",
        abn: "12 345 678 901",
        address: "1 Practice St",
        state: "NSW",
        email: "hello@newkeys.example",
        phone: "02 9000 1111",
        privacyEmail: "privacy@newkeys.example",
        entityType: "company",
        billing: {
          cycle: "monthly",
          invoiceLeadDays: 10,
          dueRule: "on_issue",
          lateFeeAfterDays: 5,
          lateFee: 12,
          suspendAfterDays: 10,
          feeNoticeDays: 30,
          withdrawalNoticeWeeks: 2,
          paymentDiscount: { enabled: false },
        },
        policies: {
          cancelNoticeHours: 48,
          makeUpQuota: 2,
          makeUpPeriod: "month",
          makeUpExpiry: "30 days",
          onlinePlatform: "Google Meet",
          publicHolidays: "make_up",
          tuningFrequency: "twice a year",
          inactiveRetentionMonths: 18,
        },
        services: { online: true, inHome: false, exams: true, premises: true },
        childSafety: {
          state: "NSW",
          type: "Working with Children Check",
          number: "SECRET-NSW-99",
          expiry: "2029-01-01",
        },
        paymentMethods: "bank transfer",
        boards: "AMEB",
      },
      switches: { online: true, exams: true, premises: true },
      onboardingCompleted: true,
    });
    expect(saved.studio.legalName).toBe("New Keys Pty Ltd");
    expect(saved.studio.name).toBe("New Keys Studio");
    expect(saved.studio.policies?.onlinePlatform).toBe("Google Meet");
    expect(saved.teacher.childSafety?.number).toBe("SECRET-NSW-99");
    expect(saved.onboardingCompleted).toBe(true);
    expect(saved.rendered.markdown).toContain("New Keys Pty Ltd");
    expect(saved.rendered.markdown).toContain("Google Meet");
    expect(saved.rendered.markdown).not.toContain("SECRET-NSW-99");
    expect(termsState!.drafts["new-studio"].studioPatch.legalName).toBe("New Keys Pty Ltd");

    const again = await getStudioTermsDraft("new-studio");
    expect(again.studio.email).toBe("hello@newkeys.example");
    expect(again.financialRetentionYears).toBe(7);
  });

  it("lists visible onboarding steps for required merge fields and switches", () => {
    const base = visibleOnboardingSteps({ online: false, inHome: false, exams: false, premises: false, paymentDiscount: false, additional: false, asyncPro: false });
    expect(base.some((step) => step.id === "legalName")).toBe(true);
    expect(base.some((step) => step.id === "childSafety")).toBe(true);
    expect(base.some((step) => step.id === "travelFee")).toBe(false);
    expect(base.some((step) => step.id === "discountMethod")).toBe(false);
    const withExtras = visibleOnboardingSteps({ online: true, inHome: true, exams: true, premises: true, paymentDiscount: true, additional: true, asyncPro: true }, "pro");
    expect(withExtras.some((step) => step.id === "travelFee")).toBe(true);
    expect(withExtras.some((step) => step.id === "discountMethod")).toBe(true);
    expect(withExtras.some((step) => step.id === "asyncLessonPolicy")).toBe(true);
    expect(withExtras.some((step) => step.id === "boards")).toBe(true);
  });

  it("builds a real PDF for agreement, privacy, app terms and receipts", async () => {
    const agreement = await getTermsDocumentForPdf("studio_agreement", "demo");
    const privacy = await getTermsDocumentForPdf("privacy", "demo");
    const app = await getTermsDocumentForPdf("family_app_terms", "demo");
    const pdf = await buildTermsPdf({ title: agreement.title, body: agreement.body });
    expect(pdf.byteLength).toBeGreaterThan(500);
    expect(String.fromCharCode(pdf[0]!, pdf[1]!, pdf[2]!, pdf[3]!)).toBe("%PDF");
    const privacyPdf = await buildTermsPdf({ title: privacy.title, body: privacy.body });
    expect(privacyPdf.byteLength).toBeGreaterThan(500);
    const appPdf = await buildTermsPdf({ title: app.title, body: app.body });
    expect(appPdf.byteLength).toBeGreaterThan(500);
    const receiptPdf = await buildTermsPdf({
      title: "Acceptance receipt",
      body: "Accepted studio agreement version 1\nTyped name: Wei Chen",
    });
    expect(receiptPdf.byteLength).toBeGreaterThan(400);
  });

  it("keeps late-fee billing cap independent of agreement wording", () => {
    expect(applyLateFeeCents(15, 12000)).toBe(600);
  });
});
