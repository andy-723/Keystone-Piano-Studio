import { addDays, PROTOTYPE_TODAY } from "@/lib/calendar";
import { hashTerms, renderTerms } from "@/lib/terms-render";
import { LEGAL_TEMPLATE_AU, type TermsOptionalSwitch } from "@/mocks/legal-template-au";
import { FAMILY_APP_TERMS_EFFECTIVE_AT, FAMILY_APP_TERMS_MARKDOWN, FAMILY_APP_TERMS_VERSION, KEYSTONE_ENTITY, KEYSTONE_PRIVACY_EMAIL } from "@/mocks/keystone-app-terms";
import { KEYSTONE_STORAGE_STATEMENT, OVERSEAS_COUNTRIES_LABEL } from "@/mocks/keystone-suppliers";
import { families, studio, students, teacher } from "@/mocks/data";
import type { ImportScope } from "@/mocks/roster-import";
import type { ChildSafetyCheck, StudioBillingSettings, StudioEntityType, StudioLessonPolicies, StudioServiceSwitches } from "@/mocks/types";

export type TermsScope = ImportScope;
export type TermsDocumentKind = "studio_agreement" | "platform_terms" | "family_app_terms";
export type TermsChangeType = "initial" | "minor" | "material";
export type AcceptanceCapacity = "self" | "guardian";
export type AcceptanceRelationship = "parent" | "legal_guardian" | "self";
export type AcceptanceMethod = "invite" | "reaccept" | "offline_upload";
export type ConsentType = "emergency_medical" | "health_notes" | "media_public" | "lesson_recordings";

export interface TermsDocument {
  id: string;
  scope: TermsScope;
  kind: TermsDocumentKind;
}

export interface TermsVersion {
  id: string;
  documentId: string;
  versionNo: number;
  renderedMarkdown: string;
  mergeValues: Record<string, unknown>;
  switches: Partial<Record<TermsOptionalSwitch, boolean>>;
  sha256: string;
  changeType: TermsChangeType;
  changeSummary: string;
  effectiveAt: string;
  publishedAt: string;
  publishedBy: string;
  editedClauseIds: string[];
}

export interface TermsAcceptance {
  id: string;
  versionId: string;
  documentKind: TermsDocumentKind;
  userId: string;
  accountEmail: string;
  typedName: string;
  capacity: AcceptanceCapacity;
  relationship: AcceptanceRelationship;
  guardianDeclaration: boolean;
  studentIds: string[];
  invitationId?: string;
  method: AcceptanceMethod;
  acceptedAt: string;
  ip: string;
  userAgent: string;
  receiptId: string;
}

export interface ConsentRecord {
  id: string;
  scope: TermsScope;
  studentId: string;
  type: ConsentType;
  granted: boolean;
  wordingVersion: string;
  givenBy: string;
  givenAt: string;
  withdrawnAt?: string;
}

export interface TermsReceipt {
  id: string;
  acceptanceId: string;
  email: string;
  renderedText: string;
  versionNo: number;
  acceptedAt: string;
  typedName: string;
  consentChoices: { type: ConsentType; granted: boolean }[];
}

export interface TermsOutboxEntry {
  id: string;
  to: string;
  subject: string;
  body: string;
  createdAt: string;
  receiptId: string;
}

/** Mutable fill-ins for a scope (especially new-studio) that Settings and Typeform onboarding share. */
export interface StudioTermsStudioPatch {
  name?: string;
  legalName?: string;
  abn?: string;
  address?: string;
  state?: string;
  email?: string;
  phone?: string;
  privacyEmail?: string;
  entityType?: StudioEntityType;
  additionalTerms?: string;
  asyncLessonPolicy?: "makeup_credit" | "counts_as_lesson";
  billing?: StudioBillingSettings;
  policies?: StudioLessonPolicies;
  services?: StudioServiceSwitches;
  paymentMethods?: string;
  boards?: string;
  teacherName?: string;
  childSafety?: ChildSafetyCheck;
  onboardingStep?: string;
  onboardingCompleted?: boolean;
}

export interface StudioTermsDraft {
  scope: TermsScope;
  switches: Partial<Record<TermsOptionalSwitch, boolean>>;
  clauseEdits: Record<string, string>;
  mergeValues: Record<string, unknown>;
  studioPatch: StudioTermsStudioPatch;
}

export interface TermsState {
  documents: TermsDocument[];
  versions: TermsVersion[];
  acceptances: TermsAcceptance[];
  consents: ConsentRecord[];
  receipts: TermsReceipt[];
  outbox: TermsOutboxEntry[];
  drafts: Record<TermsScope, StudioTermsDraft>;
  minorNoticesDismissed: Set<string>;
  paperFiles: { acceptanceId: string; fileName: string }[];
}

export function defaultStudioSwitches(services?: StudioServiceSwitches, plan?: string): Partial<Record<TermsOptionalSwitch, boolean>> {
  return {
    online: services?.online ?? false,
    inHome: services?.inHome ?? false,
    asyncPro: plan === "pro" || plan === "academy",
    exams: services?.exams ?? false,
    premises: services?.premises ?? false,
    paymentDiscount: studio.billing?.paymentDiscount.enabled ?? false,
    additional: Boolean(studio.additionalTerms?.trim()),
  };
}

export function financialRetentionYears(entityType: string | undefined): number {
  return entityType === "company" ? 7 : 5;
}

export function childSafetyStatus(expiry: string | undefined, today = PROTOTYPE_TODAY): "current" | "expired" | "missing" {
  if (!expiry) return "missing";
  return expiry >= today ? "current" : "expired";
}

function publicHolidayRule(policy: string | undefined): string {
  switch (policy) {
    case "make_up":
      return "are offered as a make-up lesson";
    case "charge":
      return "are still charged as scheduled lessons";
    case "skip":
    default:
      return "are skipped with no charge";
  }
}

export function buildMergeValues(input: {
  studioName: string;
  legalName?: string;
  abn?: string;
  address?: string;
  state?: string;
  email?: string;
  phone?: string;
  privacyEmail?: string;
  entityType?: string;
  asyncLessonPolicy?: string;
  additionalTerms?: string;
  billing?: StudioBillingSettings;
  policies?: StudioLessonPolicies;
  services?: StudioServiceSwitches;
  teacherName: string;
  childSafety?: { state: string; type: string; expiry: string; number?: string };
  paymentMethods?: string;
  boards?: string;
  accountingLabel?: string;
  paymentProvider?: string;
  accountingSoftware?: string;
}): Record<string, unknown> {
  const billing = input.billing;
  const policies = input.policies;
  const safety = input.childSafety;
  const status = childSafetyStatus(safety?.expiry);
  const weeks = billing?.withdrawalNoticeWeeks ?? "";
  const lateFee = billing?.lateFee;
  const discountAmount = billing?.paymentDiscount.amount;
  const childSafetyChecks =
    safety?.state && safety.type && status !== "missing"
      ? `${safety.state} ${safety.type} (${status})`
      : "";
  return {
    studio: {
      name: input.studioName,
      tradingName: input.studioName,
      legalName: input.legalName ?? "",
      abn: input.abn ?? "",
      address: input.address ?? "",
      state: input.state ?? "",
      email: input.email ?? "",
      phone: input.phone ?? "",
      privacyEmail: input.privacyEmail ?? "",
      entityTypeLabel: (input.entityType ?? "sole_trader").replaceAll("_", " "),
      asyncLessonPolicyLabel:
        input.asyncLessonPolicy === "counts_as_lesson"
          ? "A video lesson counts as the scheduled lesson (no make-up credit)"
          : "A video lesson earns a make-up credit",
      additionalTerms: input.additionalTerms ?? "",
    },
    teacher: {
      name: input.teacherName,
      childSafetyState: safety?.state ?? "",
      childSafetyType: safety?.type ?? "",
      childSafetyStatus: status === "missing" ? "" : status,
      childSafetyChecks,
      // number intentionally omitted from merge values so it can never render
    },
    billing: {
      cycle: billing?.cycle === "per_term" ? "each school term" : billing?.cycle === "monthly" ? "monthly" : billing?.cycle === "per_lesson" ? "per lesson" : "",
      invoiceLeadDays: billing?.invoiceLeadDays ?? "",
      dueRule: billing?.dueRule === "on_issue" ? "on issue" : billing?.dueRule === "before_term_start" ? "before term start" : billing?.dueRule === "days_after_issue" ? "14 days after issue" : "",
      lateFeeAfterDays: billing?.lateFeeAfterDays ?? "",
      lateFee: lateFee ?? "",
      lateFeeLabel: lateFee !== undefined && lateFee !== null && String(lateFee) !== "" ? `A$${lateFee}` : "",
      suspendAfterDays: billing?.suspendAfterDays ?? "",
      feeNoticeDays: billing?.feeNoticeDays ?? "",
      withdrawalNoticeWeeks: weeks,
      noticePeriod: weeks !== "" ? `${weeks} week${weeks === 1 ? "" : "s"}` : "",
      paymentMethods: input.paymentMethods ?? "bank transfer",
      // Space when Xero is disconnected so the optional suffix tag is not "missing".
      accountingLabel: input.accountingLabel?.trim() ? ` ${input.accountingLabel.trim()}` : " ",
      paymentDiscount: {
        method: billing?.paymentDiscount.method ?? "",
        amount: discountAmount ?? "",
        amountLabel: discountAmount !== undefined && discountAmount !== null && String(discountAmount) !== "" ? `A$${discountAmount}` : "",
      },
    },
    policies: {
      cancelNoticeHours: policies?.cancelNoticeHours ?? "",
      makeUpQuota: policies?.makeUpQuota ?? "",
      makeUpPeriod: policies?.makeUpPeriod ?? "",
      makeUpExpiry: policies?.makeUpExpiry ?? "",
      onlinePlatform: policies?.onlinePlatform ?? "",
      publicHolidays: policies?.publicHolidays ?? "",
      publicHolidayRule: publicHolidayRule(policies?.publicHolidays),
      tuningFrequency: policies?.tuningFrequency ?? "",
      inactiveRetentionMonths: policies?.inactiveRetentionMonths ?? "",
    },
    services: {
      inHomeTravelFee: input.services?.inHomeTravelFee ?? "A$0",
    },
    curriculum: { boards: input.boards ?? "AMEB" },
    notice: { channel: "the Keystone Music HQ app or email" },
    privacy: {
      keystoneStorageStatement: KEYSTONE_STORAGE_STATEMENT.replace("[Keystone legal entity]", KEYSTONE_ENTITY),
      overseasCountriesLabel: OVERSEAS_COUNTRIES_LABEL,
      financialRetentionYears: financialRetentionYears(input.entityType),
      paymentProvider: input.paymentProvider ?? "the studio's payment provider",
      accountingSoftware: input.accountingSoftware ?? "the studio's accounting software",
      keystonePrivacyEmail: KEYSTONE_PRIVACY_EMAIL,
    },
  };
}

function demoMergeValues() {
  return buildMergeValues({
    studioName: studio.name,
    ...(studio.legalName ? { legalName: studio.legalName } : {}),
    ...(studio.abn ? { abn: studio.abn } : {}),
    ...(studio.address ? { address: studio.address } : {}),
    ...(studio.state ? { state: studio.state } : {}),
    ...(studio.email ? { email: studio.email } : {}),
    ...(studio.phone ? { phone: studio.phone } : {}),
    ...(studio.privacyEmail ? { privacyEmail: studio.privacyEmail } : {}),
    ...(studio.entityType ? { entityType: studio.entityType } : {}),
    asyncLessonPolicy: studio.asyncLessonPolicy ?? "makeup_credit",
    ...(studio.additionalTerms ? { additionalTerms: studio.additionalTerms } : {}),
    ...(studio.billing ? { billing: studio.billing } : {}),
    ...(studio.policies ? { policies: studio.policies } : {}),
    ...(studio.services ? { services: studio.services } : {}),
    teacherName: teacher.name,
    ...(teacher.childSafety ? { childSafety: teacher.childSafety } : {}),
    paymentMethods: "PayTo, BECS direct debit and card",
    boards: "AMEB, Trinity, ABRSM",
    accountingLabel: " · Invoices sync to Xero when connected",
  });
}

async function makeVersion(input: {
  id: string;
  documentId: string;
  versionNo: number;
  changeType: TermsChangeType;
  changeSummary: string;
  effectiveAt: string;
  publishedAt: string;
  lateFee?: number;
  editedClauseIds?: string[];
}): Promise<TermsVersion> {
  const mergeValues = demoMergeValues();
  if (input.lateFee !== undefined && mergeValues["billing"] && typeof mergeValues["billing"] === "object") {
    (mergeValues["billing"] as Record<string, unknown>)["lateFee"] = input.lateFee;
  }
  const switches = defaultStudioSwitches(studio.services, studio.plan);
  const { markdown } = renderTerms(LEGAL_TEMPLATE_AU, mergeValues, switches);
  return {
    id: input.id,
    documentId: input.documentId,
    versionNo: input.versionNo,
    renderedMarkdown: markdown,
    mergeValues,
    switches,
    sha256: await hashTerms(markdown),
    changeType: input.changeType,
    changeSummary: input.changeSummary,
    effectiveAt: input.effectiveAt,
    publishedAt: input.publishedAt,
    publishedBy: teacher.name,
    editedClauseIds: input.editedClauseIds ?? [],
  };
}

function emptyDraft(scope: TermsScope): StudioTermsDraft {
  return {
    scope,
    switches: scope === "demo" ? defaultStudioSwitches(studio.services, studio.plan) : {},
    clauseEdits: {},
    mergeValues: scope === "demo" ? demoMergeValues() : buildMergeValues({
      studioName: "",
      teacherName: "",
    }),
    studioPatch: scope === "demo" ? { onboardingCompleted: true } : {},
  };
}
export async function createInitialTermsState(): Promise<TermsState> {
  const studioDoc: TermsDocument = { id: "doc-studio-demo", scope: "demo", kind: "studio_agreement" };
  const appDoc: TermsDocument = { id: "doc-app-demo", scope: "demo", kind: "family_app_terms" };
  const v1 = await makeVersion({
    id: "tv-demo-1",
    documentId: studioDoc.id,
    versionNo: 1,
    changeType: "initial",
    changeSummary: "Initial published studio agreement",
    effectiveAt: "2027-01-01",
    publishedAt: "2026-12-01T10:00:00+11:00",
    lateFee: 15,
  });
  const v2Effective = addDays(PROTOTYPE_TODAY, 30);
  const v2 = await makeVersion({
    id: "tv-demo-2",
    documentId: studioDoc.id,
    versionNo: 2,
    changeType: "material",
    changeSummary: "Late fee reduced from A$15 to A$12",
    effectiveAt: v2Effective,
    publishedAt: `${PROTOTYPE_TODAY}T09:00:00+11:00`,
    lateFee: 12,
  });
  const appMarkdown = FAMILY_APP_TERMS_MARKDOWN;
  const appVersion: TermsVersion = {
    id: "tv-app-1",
    documentId: appDoc.id,
    versionNo: FAMILY_APP_TERMS_VERSION,
    renderedMarkdown: appMarkdown,
    mergeValues: { entity: KEYSTONE_ENTITY },
    switches: {},
    sha256: await hashTerms(appMarkdown),
    changeType: "initial",
    changeSummary: "Keystone family app terms",
    effectiveAt: FAMILY_APP_TERMS_EFFECTIVE_AT,
    publishedAt: "2026-12-01T10:00:00+11:00",
    publishedBy: KEYSTONE_ENTITY,
    editedClauseIds: [],
  };

  // Most families accepted v1; fam-1 (Chen) and fam-2 (Nguyen) await re-acceptance of v2.
  const awaiting = new Set(["fam-1", "fam-2"]);
  const acceptances: TermsAcceptance[] = [];
  for (const family of families) {
    if (awaiting.has(family.id)) continue;
    const guardian = family.guardians[0];
    if (!guardian) continue;
    const kids = students.filter((student) => student.familyId === family.id).map((student) => student.id);
    const id = `acc-${family.id}-v1`;
    acceptances.push({
      id,
      versionId: v1.id,
      documentKind: "studio_agreement",
      userId: guardian.id,
      accountEmail: guardian.email,
      typedName: guardian.name,
      capacity: "guardian",
      relationship: "parent",
      guardianDeclaration: true,
      studentIds: kids,
      method: "invite",
      acceptedAt: "2027-01-05T12:00:00+11:00",
      ip: "203.0.113.10",
      userAgent: "KeystoneMusicHQ/prototype",
      receiptId: `rcpt-${family.id}-v1`,
    });
    acceptances.push({
      id: `acc-app-${family.id}`,
      versionId: appVersion.id,
      documentKind: "family_app_terms",
      userId: guardian.id,
      accountEmail: guardian.email,
      typedName: guardian.name,
      capacity: "guardian",
      relationship: "parent",
      guardianDeclaration: true,
      studentIds: kids,
      method: "invite",
      acceptedAt: "2027-01-05T12:00:00+11:00",
      ip: "203.0.113.10",
      userAgent: "KeystoneMusicHQ/prototype",
      receiptId: `rcpt-app-${family.id}`,
    });
  }

  return {
    documents: [
      studioDoc,
      appDoc,
      { id: "doc-studio-new", scope: "new-studio", kind: "studio_agreement" },
      { id: "doc-app-new", scope: "new-studio", kind: "family_app_terms" },
    ],
    versions: [v1, v2, appVersion],
    acceptances,
    consents: [],
    receipts: [],
    outbox: [],
    drafts: {
      demo: emptyDraft("demo"),
      "new-studio": emptyDraft("new-studio"),
    },
    minorNoticesDismissed: new Set(),
    paperFiles: [],
  };
}

/** Mutable session store — created lazily so hashTerms can be async at boot. */
export let termsState: TermsState | null = null;
let termsReady: Promise<TermsState> | null = null;

export function ensureTermsState(): Promise<TermsState> {
  if (termsState) return Promise.resolve(termsState);
  if (!termsReady) {
    termsReady = createInitialTermsState().then((state) => {
      termsState = state;
      return state;
    });
  }
  return termsReady;
}

export async function resetTermsStateForTests(): Promise<TermsState> {
  termsState = null;
  termsReady = null;
  return ensureTermsState();
}
