import { addDays, PROTOTYPE_TODAY } from "@/lib/calendar";
import { isAdultStudent } from "@/lib/enrolment";
import { additionalTermsWarnings, applyLateFeeCents, hashTerms, renderTerms } from "@/lib/terms-render";
import { LEGAL_TEMPLATE_AU, type LegalClause, type TermsOptionalSwitch } from "@/mocks/legal-template-au";
import { FAMILY_APP_TERMS_MARKDOWN, KEYSTONE_ENTITY, PRIVACY_NOTICE_MARKDOWN, reviewed } from "@/mocks/keystone-app-terms";
import { KEYSTONE_STORAGE_STATEMENT, OVERSEAS_COUNTRIES_LABEL } from "@/mocks/keystone-suppliers";
import { families, studio, students, teacher } from "@/mocks/data";
import { integrationState } from "@/mocks/integrations";
import { setupSession } from "@/mocks/setup";
import {
  buildMergeValues,
  childSafetyStatus,
  defaultStudioSwitches,
  ensureTermsState,
  financialRetentionYears,
  type AcceptanceCapacity,
  type AcceptanceMethod,
  type AcceptanceRelationship,
  type ConsentRecord,
  type ConsentType,
  type StudioTermsStudioPatch,
  type TermsAcceptance,
  type TermsChangeType,
  type TermsScope,
  type TermsVersion,
} from "@/mocks/terms";
import { newStudioRoster } from "@/mocks/roster-import";
import type { ChildSafetyCheck, StudioBillingSettings, StudioLessonPolicies, StudioServiceSwitches } from "@/mocks/types";
import { respond } from "./_delay";
import { getOrCreateFamilyConversation, sendMessage } from "./chat";
import { getParentSession } from "./parent";
import { paymentMethodsLabel } from "./billing-profile";
import { insertLiveTermsVersion, saveLiveStudioDetails, studioSnapshot } from "./live/studio-store";
import { isLiveStudio } from "@/lib/studio-workspace";

async function draftPatch(scope: TermsScope): Promise<StudioTermsStudioPatch> {
  const state = await ensureTermsState();
  return state.drafts[scope]?.studioPatch ?? {};
}

function store(scope: TermsScope, patch: StudioTermsStudioPatch = {}) {
  if (scope === "demo") {
    return {
      families,
      students,
      studio: {
        ...studio,
        ...(patch.name ? { name: patch.name } : {}),
        ...(patch.legalName !== undefined ? { legalName: patch.legalName } : {}),
        ...(patch.abn !== undefined ? { abn: patch.abn } : {}),
        ...(patch.address !== undefined ? { address: patch.address } : {}),
        ...(patch.state !== undefined ? { state: patch.state } : {}),
        ...(patch.email !== undefined ? { email: patch.email } : {}),
        ...(patch.phone !== undefined ? { phone: patch.phone } : {}),
        ...(patch.privacyEmail !== undefined ? { privacyEmail: patch.privacyEmail } : {}),
        ...(patch.entityType !== undefined ? { entityType: patch.entityType } : {}),
        ...(patch.additionalTerms !== undefined ? { additionalTerms: patch.additionalTerms } : {}),
        ...(patch.asyncLessonPolicy !== undefined ? { asyncLessonPolicy: patch.asyncLessonPolicy } : {}),
        ...(patch.billing ? { billing: { ...studio.billing!, ...patch.billing, paymentDiscount: { ...studio.billing!.paymentDiscount, ...patch.billing.paymentDiscount } } } : {}),
        ...(patch.policies ? { policies: { ...studio.policies!, ...patch.policies } } : {}),
        ...(patch.services ? { services: { ...studio.services!, ...patch.services } } : {}),
      },
      teacher: {
        ...teacher,
        ...(patch.teacherName ? { name: patch.teacherName } : {}),
        ...(patch.childSafety ? { childSafety: patch.childSafety } : {}),
      },
    };
  }
  const defaultBilling: StudioBillingSettings = {
    cycle: "per_term",
    invoiceLeadDays: 14,
    dueRule: "days_after_issue",
    lateFeeAfterDays: 7,
    lateFee: 15,
    suspendAfterDays: 14,
    feeNoticeDays: 30,
    withdrawalNoticeWeeks: 4,
    paymentDiscount: { enabled: false },
  };
  const baseBilling: StudioBillingSettings = {
    ...defaultBilling,
    ...patch.billing,
    paymentDiscount: {
      ...defaultBilling.paymentDiscount,
      ...patch.billing?.paymentDiscount,
    },
  };
  const defaultPolicies: StudioLessonPolicies = {
    cancelNoticeHours: setupSession.policies.lateCancellationHours,
    makeUpQuota: 1,
    makeUpPeriod: "term",
    makeUpExpiry: "same term",
    onlinePlatform: "Zoom",
    publicHolidays: "skip",
    tuningFrequency: "once a year",
    inactiveRetentionMonths: 24,
  };
  const basePolicies: StudioLessonPolicies = { ...defaultPolicies, ...patch.policies };
  const defaultServices: StudioServiceSwitches = {
    online: false,
    inHome: false,
    exams: false,
    premises: true,
  };
  const baseServices: StudioServiceSwitches = { ...defaultServices, ...patch.services };
  return {
    families: newStudioRoster.families,
    students: newStudioRoster.students,
    studio: {
      name: patch.name ?? setupSession.studio.name,
      abn: patch.abn ?? (setupSession.tax.abn || undefined),
      legalName: patch.legalName ?? setupSession.studio.name,
      address: patch.address ?? setupSession.studio.suburb,
      state: patch.state ?? setupSession.studio.state,
      email: patch.email ?? "",
      phone: patch.phone ?? "",
      privacyEmail: patch.privacyEmail ?? "",
      entityType: patch.entityType ?? ("sole_trader" as const),
      billing: baseBilling,
      policies: basePolicies,
      services: baseServices,
      additionalTerms: patch.additionalTerms ?? "",
      plan: "base" as const,
      asyncLessonPolicy: patch.asyncLessonPolicy ?? ("makeup_credit" as const),
      gstRegistered: setupSession.tax.registration === "yes",
    },
    teacher: {
      name: patch.teacherName ?? setupSession.studio.teacherName,
      childSafety: patch.childSafety as ChildSafetyCheck | undefined,
    },
  };
}
function freeze<T>(value: T): T {
  return structuredClone(value);
}

function materialFieldsChanged(previous: Record<string, unknown>, next: Record<string, unknown>, paths: string[]): boolean {
  for (const path of paths) {
    const keys = path.split(".");
    const read = (obj: Record<string, unknown>) => keys.reduce<unknown>((current, key) => (current && typeof current === "object" ? (current as Record<string, unknown>)[key] : undefined), obj);
    if (String(read(previous) ?? "") !== String(read(next) ?? "")) return true;
  }
  return false;
}

const MATERIAL_MERGE_PATHS = [
  "billing.lateFee",
  "billing.lateFeeAfterDays",
  "billing.cycle",
  "billing.withdrawalNoticeWeeks",
  "billing.feeNoticeDays",
  "billing.suspendAfterDays",
  "billing.paymentDiscount.amount",
  "billing.paymentDiscount.method",
  "policies.cancelNoticeHours",
  "policies.makeUpQuota",
  "policies.makeUpPeriod",
  "policies.makeUpExpiry",
  "studio.legalName",
  "studio.abn",
  "teacher.childSafetyState",
  "teacher.childSafetyType",
  "teacher.childSafetyStatus",
];

export function classifyChange(
  previous: { mergeValues: Record<string, unknown>; renderedMarkdown: string; editedClauseIds: string[] },
  next: { mergeValues: Record<string, unknown>; renderedMarkdown: string; editedClauseIds: string[]; editedMaterialClause?: boolean },
  template: LegalClause[] = LEGAL_TEMPLATE_AU,
): TermsChangeType {
  if (materialFieldsChanged(previous.mergeValues, next.mergeValues, MATERIAL_MERGE_PATHS)) return "material";
  const materialIds = new Set(template.filter((clause) => clause.material).map((clause) => clause.id));
  // Wording edits to material clauses (owner "Edit wording") are material; merge-only contact tweaks like phone stay minor.
  if (next.editedClauseIds.some((id) => materialIds.has(id))) return "material";
  if (next.editedMaterialClause) return "material";
  return "minor";
}

export function lateFeeForInvoice(invoiceTotalCents: number, scope: TermsScope = "demo"): number {
  const setting = studio.billing?.lateFee ?? 15;
  // Pending billing only applies on/after effectiveAt
  const pending = scope === "demo" ? studio.pendingBilling : undefined;
  const effectiveLate = pending?.effectiveAt && pending.effectiveAt <= PROTOTYPE_TODAY && pending.lateFee !== undefined
    ? pending.lateFee
    : setting;
  return applyLateFeeCents(effectiveLate, invoiceTotalCents);
}

async function liveMergeValues(scope: TermsScope) {
  const patch = await draftPatch(scope);
  const data = store(scope, patch);
  const integrations = integrationState[scope];
  const billingScope = scope === "new-studio" ? "new-studio" : "demo";
  const methods = patch.paymentMethods ?? paymentMethodsLabel(billingScope);
  const accountingLabel = integrations.xero.status === "connected"
    ? ` · Accounting: ${integrations.xero.organisationName ?? "Xero"}`
    : "";
  const paymentProvider = integrations.stripe.status === "connected" ? "Stripe" : "the studio's payment provider";
  const accountingSoftware = integrations.xero.status === "connected"
    ? (integrations.xero.organisationName ?? "Xero")
    : "the studio's accounting software";
  return buildMergeValues({
    studioName: data.studio.name,
    ...(data.studio.legalName ? { legalName: data.studio.legalName } : {}),
    ...(data.studio.abn ? { abn: data.studio.abn } : {}),
    ...("address" in data.studio && data.studio.address ? { address: data.studio.address } : {}),
    ...("state" in data.studio && data.studio.state ? { state: data.studio.state } : {}),
    ...("email" in data.studio && data.studio.email ? { email: data.studio.email } : {}),
    ...("phone" in data.studio && data.studio.phone ? { phone: data.studio.phone } : {}),
    ...("privacyEmail" in data.studio && data.studio.privacyEmail ? { privacyEmail: data.studio.privacyEmail } : {}),
    ...(data.studio.entityType ? { entityType: data.studio.entityType } : {}),
    ...(data.studio.asyncLessonPolicy ? { asyncLessonPolicy: data.studio.asyncLessonPolicy } : {}),
    ...(data.studio.additionalTerms ? { additionalTerms: data.studio.additionalTerms } : {}),
    ...(data.studio.billing ? { billing: data.studio.billing } : {}),
    ...(data.studio.policies ? { policies: data.studio.policies } : {}),
    ...(data.studio.services ? { services: data.studio.services } : {}),
    teacherName: data.teacher.name,
    ...(data.teacher.childSafety ? { childSafety: data.teacher.childSafety } : {}),
    paymentMethods: methods,
    boards: patch.boards ?? "AMEB, Trinity, ABRSM",
    ...(accountingLabel ? { accountingLabel } : {}),
    paymentProvider,
    accountingSoftware,
  });
}
function applyClauseEdits(template: LegalClause[], edits: Record<string, string>): LegalClause[] {
  return template.map((clause) => (edits[clause.id] ? { ...clause, body: edits[clause.id]! } : clause));
}

async function missingPublishMessages(scope: TermsScope, missingRequired: string[]): Promise<string[]> {
  const patch = await draftPatch(scope);
  const data = store(scope, patch);
  const messages: string[] = [];
  if (!data.studio.abn?.trim() || missingRequired.includes("studio.abn")) messages.push("Add your ABN");
  if (!data.studio.legalName?.trim() || missingRequired.includes("studio.legalName")) messages.push("Add your legal name");
  const safety = data.teacher.childSafety;
  if (!safety || childSafetyStatus(safety.expiry) === "missing" || missingRequired.some((path) => path.startsWith("teacher.childSafety"))) {
    const short = data.teacher.name.replace(/^Ms\s+/, "").split(" ")[0] ?? "teacher";
    messages.push(`Add a child safety check for ${data.teacher.name.includes("Clarke") ? "Ms Clarke" : short}`);
  }
  for (const path of missingRequired) {
    if (path.startsWith("studio.") || path.startsWith("teacher.childSafety") || path.startsWith("billing.") || path.startsWith("policies.")) {
      const label = `Complete ${path}`;
      if (!messages.includes(label) && !messages.some((entry) => entry.toLowerCase().includes(path.split(".").at(-1) ?? ""))) {
        // Prefer human messages above; skip generic duplicates for covered fields
        if (!["studio.abn", "studio.legalName", "teacher.childSafetyState", "teacher.childSafetyType", "teacher.childSafetyStatus", "teacher.childSafetyChecks"].includes(path)) {
          messages.push(label);
        }
      }
    }
  }
  return [...new Set(messages)];
}

export async function getStudioTermsDraft(scope: TermsScope = "demo") {
  const state = await ensureTermsState();
  const draft = state.drafts[scope];
  const patch = draft.studioPatch ?? {};
  const data = store(scope, patch);
  const mergeValues = await liveMergeValues(scope);
  draft.mergeValues = mergeValues;
  const template = applyClauseEdits(LEGAL_TEMPLATE_AU, draft.clauseEdits);
  const switches = { ...defaultStudioSwitches(data.studio.services, data.studio.plan), ...draft.switches };
  const rendered = renderTerms(template, mergeValues, switches);
  const warnings = additionalTermsWarnings(String(data.studio.additionalTerms ?? ""));
  const published = state.versions.some((version) => {
    const doc = state.documents.find((entry) => entry.id === version.documentId);
    return doc?.scope === scope && doc.kind === "studio_agreement";
  });
  return respond(freeze({
    ...draft,
    switches,
    mergeValues,
    rendered,
    warnings,
    reviewed,
    keystoneEntity: KEYSTONE_ENTITY,
    needsOnboarding: (!published && rendered.missingRequired.length > 0) || (scope === "new-studio" && !patch.onboardingCompleted),
    onboardingCompleted: Boolean(patch.onboardingCompleted) || (scope === "demo" && published),
    template: LEGAL_TEMPLATE_AU.map((clause) => ({
      ...clause,
      body: draft.clauseEdits[clause.id] ?? clause.body,
      edited: Boolean(draft.clauseEdits[clause.id]),
    })),
    studio: freeze(data.studio),
    teacher: freeze({
      name: data.teacher.name,
      childSafety: (() => {
        const safety = data.teacher.childSafety;
        if (!safety) return null;
        return {
          state: safety.state,
          type: safety.type,
          expiry: safety.expiry,
          status: childSafetyStatus(safety.expiry),
          number: safety.number,
        };
      })(),
    }),
    noticeChannel: "the Keystone Music HQ app or email",
    financialRetentionYears: financialRetentionYears(data.studio.entityType),
    privacy: {
      keystoneStorageStatement: KEYSTONE_STORAGE_STATEMENT.replace("[Keystone legal entity]", KEYSTONE_ENTITY),
      overseasCountriesLabel: OVERSEAS_COUNTRIES_LABEL,
    },
  }));
}

export async function saveStudioTermsDraft(
  scope: TermsScope,
  input: {
    switches?: Partial<Record<TermsOptionalSwitch, boolean>>;
    clauseEdits?: Record<string, string>;
    studio?: StudioTermsStudioPatch;
    onboardingStep?: string;
    onboardingCompleted?: boolean;
  },
) {
  const state = await ensureTermsState();
  // Live studio: undo this save in memory if Supabase refuses it.
  const before = scope === "demo" && isLiveStudio() ? { ...studioSnapshot(), draft: structuredClone(state.drafts.demo) } : null;
  const draft = state.drafts[scope];
  if (input.switches) draft.switches = { ...draft.switches, ...input.switches };
  if (input.clauseEdits) draft.clauseEdits = { ...draft.clauseEdits, ...input.clauseEdits };
  if (input.studio || input.onboardingStep !== undefined || input.onboardingCompleted !== undefined) {
    const nextPatch: StudioTermsStudioPatch = { ...draft.studioPatch };
    if (input.studio) {
      if (input.studio.name !== undefined) nextPatch.name = input.studio.name;
      if (input.studio.legalName !== undefined) nextPatch.legalName = input.studio.legalName;
      if (input.studio.abn !== undefined) nextPatch.abn = input.studio.abn;
      if (input.studio.address !== undefined) nextPatch.address = input.studio.address;
      if (input.studio.state !== undefined) nextPatch.state = input.studio.state;
      if (input.studio.email !== undefined) nextPatch.email = input.studio.email;
      if (input.studio.phone !== undefined) nextPatch.phone = input.studio.phone;
      if (input.studio.privacyEmail !== undefined) nextPatch.privacyEmail = input.studio.privacyEmail;
      if (input.studio.entityType !== undefined) nextPatch.entityType = input.studio.entityType;
      if (input.studio.additionalTerms !== undefined) nextPatch.additionalTerms = input.studio.additionalTerms;
      if (input.studio.asyncLessonPolicy !== undefined) nextPatch.asyncLessonPolicy = input.studio.asyncLessonPolicy;
      if (input.studio.paymentMethods !== undefined) nextPatch.paymentMethods = input.studio.paymentMethods;
      if (input.studio.boards !== undefined) nextPatch.boards = input.studio.boards;
      if (input.studio.teacherName !== undefined) nextPatch.teacherName = input.studio.teacherName;
      if (input.studio.childSafety !== undefined) nextPatch.childSafety = input.studio.childSafety;
      if (input.studio.billing) {
        nextPatch.billing = {
          ...(nextPatch.billing ?? (scope === "demo" ? studio.billing! : {
            cycle: "per_term",
            invoiceLeadDays: 14,
            dueRule: "days_after_issue",
            lateFeeAfterDays: 7,
            lateFee: 15,
            suspendAfterDays: 14,
            feeNoticeDays: 30,
            withdrawalNoticeWeeks: 4,
            paymentDiscount: { enabled: false },
          })),
          ...input.studio.billing,
          paymentDiscount: {
            ...(nextPatch.billing?.paymentDiscount ?? { enabled: false }),
            ...input.studio.billing.paymentDiscount,
          },
        };
      }
      if (input.studio.policies) {
        nextPatch.policies = { ...(nextPatch.policies ?? {}), ...input.studio.policies } as StudioLessonPolicies;
      }
      if (input.studio.services) {
        nextPatch.services = { ...(nextPatch.services ?? {}), ...input.studio.services } as StudioServiceSwitches;
      }
    }
    if (input.onboardingStep !== undefined) nextPatch.onboardingStep = input.onboardingStep;
    if (input.onboardingCompleted !== undefined) nextPatch.onboardingCompleted = input.onboardingCompleted;
    draft.studioPatch = nextPatch;

    if (scope === "demo" && input.studio) {
      const published = state.versions.filter((version) => version.documentId === "doc-studio-demo");
      const hasPublished = published.length > 0;
      if (input.studio.billing && hasPublished) {
        const pending: NonNullable<typeof studio.pendingBilling> = {
          ...studio.pendingBilling,
          ...input.studio.billing,
        };
        if (studio.pendingBilling?.effectiveAt) pending.effectiveAt = studio.pendingBilling.effectiveAt;
        studio.pendingBilling = pending;
      } else if (input.studio.billing) {
        studio.billing = { ...studio.billing!, ...input.studio.billing, paymentDiscount: { ...studio.billing!.paymentDiscount, ...input.studio.billing.paymentDiscount } };
      }
      if (input.studio.name !== undefined) studio.name = input.studio.name;
      if (input.studio.legalName !== undefined) studio.legalName = input.studio.legalName;
      if (input.studio.abn !== undefined) studio.abn = input.studio.abn;
      if (input.studio.address !== undefined) studio.address = input.studio.address;
      if (input.studio.state !== undefined) studio.state = input.studio.state;
      if (input.studio.email !== undefined) studio.email = input.studio.email;
      if (input.studio.phone !== undefined) studio.phone = input.studio.phone;
      if (input.studio.privacyEmail !== undefined) studio.privacyEmail = input.studio.privacyEmail;
      if (input.studio.entityType !== undefined) studio.entityType = input.studio.entityType;
      if (input.studio.additionalTerms !== undefined) studio.additionalTerms = input.studio.additionalTerms;
      if (input.studio.asyncLessonPolicy !== undefined) studio.asyncLessonPolicy = input.studio.asyncLessonPolicy;
      if (input.studio.policies) studio.policies = { ...studio.policies!, ...input.studio.policies };
      if (input.studio.services) studio.services = { ...studio.services!, ...input.studio.services };
      if (input.studio.teacherName !== undefined) teacher.name = input.studio.teacherName;
      if (input.studio.childSafety !== undefined) teacher.childSafety = input.studio.childSafety;
    }
  }
  if (before) {
    try {
      await saveLiveStudioDetails(before);
    } catch (error) {
      state.drafts.demo = before.draft;
      throw error;
    }
  }
  return getStudioTermsDraft(scope);
}
export async function publishStudioTerms(
  scope: TermsScope,
  input: { changeSummary: string; effectiveAt: string; forceMaterial?: boolean },
) {
  const state = await ensureTermsState();
  const draft = await getStudioTermsDraft(scope);
  if (draft.rendered.missingRequired.length) {
    throw new Error((await missingPublishMessages(scope, draft.rendered.missingRequired)).join(". ") || "Complete required fields before publishing.");
  }
  const doc = state.documents.find((entry) => entry.scope === scope && entry.kind === "studio_agreement");
  if (!doc) throw new Error("Studio agreement document missing.");
  const previous = [...state.versions].filter((version) => version.documentId === doc.id).sort((a, b) => b.versionNo - a.versionNo)[0];
  const patch = await draftPatch(scope);
  const data = store(scope, patch);
  const markdown = draft.rendered.markdown;
  let changeType = previous
    ? classifyChange(previous, {
        mergeValues: draft.mergeValues,
        renderedMarkdown: markdown,
        editedClauseIds: Object.keys(state.drafts[scope].clauseEdits),
      })
    : "initial";
  if (input.forceMaterial && changeType === "minor") changeType = "material";
  if (changeType === "material") {
    const noticeDays = data.studio.billing?.feeNoticeDays ?? 30;
    const earliest = addDays(PROTOTYPE_TODAY, noticeDays);
    if (input.effectiveAt < earliest) {
      throw new Error(`Material changes need at least ${noticeDays} days’ notice. Choose ${earliest} or later.`);
    }
  }
  const version: TermsVersion = {
    id: crypto.randomUUID(),
    documentId: doc.id,
    versionNo: (previous?.versionNo ?? 0) + 1,
    renderedMarkdown: markdown,
    mergeValues: freeze(draft.mergeValues),
    switches: freeze(draft.switches),
    sha256: await hashTerms(markdown),
    changeType,
    changeSummary: input.changeSummary.trim() || (changeType === "initial" ? "Initial version" : "Updated studio terms"),
    effectiveAt: input.effectiveAt,
    publishedAt: `${PROTOTYPE_TODAY}T12:00:00+11:00`,
    publishedBy: data.teacher.name || "Teacher",
    editedClauseIds: Object.keys(state.drafts[scope].clauseEdits),
  };
  // Live studio: the published version is a legal record, so it must be saved before it counts.
  if (scope === "demo") await insertLiveTermsVersion(version);
  state.versions.push(version);
  state.drafts[scope].studioPatch = { ...state.drafts[scope].studioPatch, onboardingCompleted: true };
  if (scope === "demo" && studio.pendingBilling) {
    studio.pendingBilling.effectiveAt = input.effectiveAt;
  }
  if (scope === "demo") await saveLiveStudioDetails();
  return respond(freeze(version));
}
export async function getPublishedStudioTerms(scope: TermsScope = "demo") {
  const state = await ensureTermsState();
  const doc = state.documents.find((entry) => entry.scope === scope && entry.kind === "studio_agreement");
  const versions = state.versions
    .filter((version) => version.documentId === doc?.id)
    .sort((a, b) => b.versionNo - a.versionNo)
    .map((version) => freeze(version));
  const current = versions.find((version) => version.effectiveAt <= PROTOTYPE_TODAY) ?? versions.at(-1) ?? null;
  const pending = versions.find((version) => version.effectiveAt > PROTOTYPE_TODAY && version.changeType === "material") ?? null;
  return respond({ current: current ? freeze(current) : null, pending: pending ? freeze(pending) : null, versions });
}

export async function getFamilyAppTerms() {
  const state = await ensureTermsState();
  const version = state.versions.find((entry) => entry.id === "tv-app-1") ?? state.versions.find((entry) => {
    const doc = state.documents.find((document) => document.id === entry.documentId);
    return doc?.kind === "family_app_terms";
  });
  const merge = await liveMergeValues("demo");
  const privacy = merge["privacy"] as Record<string, unknown>;
  const fillPrivacy = (markdown: string) =>
    markdown
      .replaceAll("{{privacy.overseasCountriesLabel}}", String(privacy["overseasCountriesLabel"] ?? ""))
      .replaceAll("{{privacy.keystoneStorageStatement}}", String(privacy["keystoneStorageStatement"] ?? ""));
  return respond(freeze({
    version: version ? freeze(version) : null,
    appTermsMarkdown: fillPrivacy(FAMILY_APP_TERMS_MARKDOWN),
    privacyNoticeMarkdown: fillPrivacy(PRIVACY_NOTICE_MARKDOWN),
    keystoneEntity: KEYSTONE_ENTITY,
    reviewed,
  }));
}
export async function getAcceptanceTracker(scope: TermsScope = "demo") {
  const state = await ensureTermsState();
  const published = await getPublishedStudioTerms(scope);
  const target = published.pending ?? published.current;
  const data = store(scope, await draftPatch(scope));
  const rows = data.families.map((family) => {
    const kids = data.students.filter((student) => student.familyId === family.id);
    const latest = state.acceptances
      .filter((entry) => entry.documentKind === "studio_agreement" && entry.studentIds.some((id) => kids.some((kid) => kid.id === id)))
      .sort((a, b) => b.acceptedAt.localeCompare(a.acceptedAt))[0];
    const acceptedCurrent = Boolean(target && latest && latest.versionId === target.id);
    return {
      familyId: family.id,
      displayName: family.displayName,
      status: acceptedCurrent ? "accepted" as const : latest ? "reaccept_needed" as const : "awaiting" as const,
      latestAcceptance: latest ? freeze(latest) : null,
    };
  });
  const accepted = rows.filter((row) => row.status === "accepted").length;
  return respond(freeze({
    total: rows.length,
    accepted,
    summary: `${accepted} of ${rows.length} families accepted`,
    targetVersion: target ? freeze(target) : null,
    families: rows,
  }));
}

export async function remindFamilyTerms(familyId: string, scope: TermsScope = "demo") {
  const data = store(scope, await draftPatch(scope));
  const family = data.families.find((entry) => entry.id === familyId);
  if (!family) throw new Error("Family not found.");
  const published = await getPublishedStudioTerms(scope);
  const target = published.pending ?? published.current;
  const body = `${data.studio.name} has updated its terms${target ? ` (version ${target.versionNo}, effective ${target.effectiveAt})` : ""}. Please review and accept in your family portal.`;
  if (scope === "demo") {
    const conversation = await getOrCreateFamilyConversation(familyId);
    await sendMessage({ conversationId: conversation.id, authorName: teacher.name, authorRole: "teacher", kind: "text", body });
  }
  return respond({ ok: true });
}

export async function recordPaperAcceptance(input: {
  familyId: string;
  fileName: string;
  typedName: string;
  scope?: TermsScope;
}) {
  const scope = input.scope ?? "demo";
  const state = await ensureTermsState();
  const published = await getPublishedStudioTerms(scope);
  const version = published.pending ?? published.current;
  if (!version) throw new Error("Publish studio terms before recording acceptance.");
  const data = store(scope, await draftPatch(scope));
  const family = data.families.find((entry) => entry.id === input.familyId);
  const guardian = family?.guardians[0];
  if (!family || !guardian) throw new Error("Family not found.");
  const studentIds = data.students.filter((student) => student.familyId === family.id).map((student) => student.id);
  const acceptance: TermsAcceptance = {
    id: crypto.randomUUID(),
    versionId: version.id,
    documentKind: "studio_agreement",
    userId: guardian.id,
    accountEmail: guardian.email,
    typedName: input.typedName.trim() || guardian.name,
    capacity: "guardian",
    relationship: "parent",
    guardianDeclaration: true,
    studentIds,
    method: "offline_upload",
    acceptedAt: `${PROTOTYPE_TODAY}T12:00:00+11:00`,
    ip: "203.0.113.10",
    userAgent: "offline-upload",
    receiptId: crypto.randomUUID(),
  };
  state.acceptances.push(acceptance);
  state.paperFiles.push({ acceptanceId: acceptance.id, fileName: input.fileName });
  return respond(freeze(acceptance));
}

export async function downloadAcceptanceRecords(scope: TermsScope = "demo") {
  const state = await ensureTermsState();
  const data = store(scope, await draftPatch(scope));
  const studentIds = new Set(data.students.map((student) => student.id));
  const acceptances = state.acceptances.filter((entry) => entry.studentIds.some((id) => studentIds.has(id)));
  const consents = state.consents.filter((entry) => entry.scope === scope);
  return respond(freeze({ exportedAt: `${PROTOTYPE_TODAY}T12:00:00+11:00`, acceptances, consents, paperFiles: state.paperFiles }));
}

export async function getTermsDocumentForPdf(
  kind: "studio_agreement" | "privacy" | "family_app_terms" | "receipt",
  scope: TermsScope = "demo",
  receiptId?: string,
) {
  const state = await ensureTermsState();
  if (kind === "family_app_terms") {
    const app = await getFamilyAppTerms();
    return respond({
      title: "Keystone Music HQ — App terms of use",
      body: app.appTermsMarkdown,
      filename: "keystone-app-terms.pdf",
    });
  }
  if (kind === "privacy") {
    const draft = await getStudioTermsDraft(scope);
    const privacyClauses = LEGAL_TEMPLATE_AU.filter((clause) => clause.part === 3);
    const rendered = renderTerms(privacyClauses, draft.mergeValues, draft.switches);
    return respond({
      title: `${draft.studio.name || "Studio"} — Privacy policy`,
      body: rendered.markdown,
      filename: "studio-privacy-policy.pdf",
    });
  }
  if (kind === "receipt") {
    const receipt = state.receipts.find((entry) => entry.id === receiptId) ?? state.receipts.at(-1);
    if (!receipt) throw new Error("Receipt not found.");
    return respond({
      title: "Terms acceptance receipt",
      body: receipt.renderedText,
      filename: `acceptance-receipt-${receipt.id.slice(0, 8)}.pdf`,
    });
  }
  const published = await getPublishedStudioTerms(scope);
  const version = published.pending ?? published.current;
  if (!version) {
    const draft = await getStudioTermsDraft(scope);
    return respond({
      title: `${draft.studio.name || "Studio"} — Studio agreement`,
      body: draft.rendered.markdown,
      filename: "studio-agreement.pdf",
    });
  }
  return respond({
    title: `Studio agreement · version ${version.versionNo}`,
    body: version.renderedMarkdown,
    filename: `studio-agreement-v${version.versionNo}.pdf`,
  });
}

export async function acceptStudioTerms(input: {
  versionId: string;
  appTermsVersionId: string;
  typedName: string;
  capacity: AcceptanceCapacity;
  relationship: AcceptanceRelationship;
  guardianDeclaration: boolean;
  studentIds: string[];
  consents: { type: ConsentType; granted: boolean; studentId: string }[];
  method?: AcceptanceMethod;
  scope?: TermsScope;
}) {
  const scope = input.scope ?? "demo";
  const state = await ensureTermsState();
  const data = store(scope, await draftPatch(scope));
  const words = input.typedName.trim().split(/\s+/).filter(Boolean);
  if (words.length < 2) throw new Error("Type your full name (at least two words).");

  const published = await getPublishedStudioTerms(scope);
  const allowedIds = [published.current?.id, published.pending?.id].filter(Boolean);
  if (!allowedIds.includes(input.versionId)) throw new Error("Accept the current or pending studio terms version.");

  const appDoc = state.documents.find((entry) => entry.kind === "family_app_terms" && entry.scope === scope)
    ?? state.documents.find((entry) => entry.kind === "family_app_terms");
  const appVersion = state.versions.filter((version) => version.documentId === appDoc?.id).sort((a, b) => b.versionNo - a.versionNo)[0];
  if (!input.appTermsVersionId) throw new Error("Accept the Keystone Music HQ app terms.");
  if (!appVersion || input.appTermsVersionId !== appVersion.id) throw new Error("Accept the current Keystone Music HQ app terms.");

  const selected = data.students.filter((student) => input.studentIds.includes(student.id));
  if (!selected.length || selected.length !== input.studentIds.length) throw new Error("Choose the students covered by this acceptance.");
  const hasMinor = selected.some((student) => !isAdultStudent(student.birthYear));
  if (hasMinor) {
    if (input.capacity !== "guardian") throw new Error("A parent or legal guardian must accept for students under 18.");
    if (input.relationship !== "parent" && input.relationship !== "legal_guardian") throw new Error("Choose Parent or Legal guardian.");
    if (!input.guardianDeclaration) throw new Error("Confirm you are the parent or legal guardian.");
  } else if (input.capacity === "self" && input.relationship !== "self") {
    throw new Error("Adult self-acceptance must use relationship “self”.");
  }

  let accountEmail = "";
  let userId = "";
  if (scope === "demo") {
    try {
      const session = await getParentSession();
      accountEmail = session.guardian.email;
      userId = session.guardian.id;
      if (selected.some((student) => student.familyId !== session.family.id)) throw new Error("Students must belong to your family.");
    } catch {
      const family = data.families.find((entry) => entry.id === selected[0]?.familyId);
      const guardian = family?.guardians[0];
      accountEmail = guardian?.email ?? "unknown@example.com";
      userId = guardian?.id ?? crypto.randomUUID();
    }
  } else {
    const family = data.families.find((entry) => entry.id === selected[0]?.familyId);
    const guardian = family?.guardians[0];
    accountEmail = guardian?.email ?? "unknown@example.com";
    userId = guardian?.id ?? crypto.randomUUID();
  }

  const acceptedAt = `${PROTOTYPE_TODAY}T12:00:00+11:00`;
  const ip = "203.0.113.10";
  const userAgent = typeof navigator !== "undefined" ? navigator.userAgent : "KeystoneMusicHQ/prototype";
  const studioVersion = state.versions.find((version) => version.id === input.versionId)!;

  const consentChoices = input.consents.map((consent) => ({ type: consent.type, granted: consent.granted }));
  const appTermsLive = await getFamilyAppTerms();
  // Full accepted text of both documents; never include health-note contents
  const receiptBody = [
    `Accepted studio agreement version ${studioVersion.versionNo} (${studioVersion.sha256.slice(0, 8)}…)`,
    `Accepted Keystone app terms version ${appVersion.versionNo}`,
    `Typed name: ${input.typedName.trim()}`,
    `Capacity: ${input.capacity}; relationship: ${input.relationship}`,
    `Students: ${selected.map((student) => student.firstName).join(", ")}`,
    `Consents: ${consentChoices.map((choice) => `${choice.type}=${choice.granted ? "yes" : "no"}`).join(", ")}`,
    `Time: ${acceptedAt}`,
    "",
    "===== STUDIO AGREEMENT (FULL ACCEPTED TEXT) =====",
    studioVersion.renderedMarkdown,
    "",
    "===== KEYSTONE FAMILY APP TERMS PARTS A–D (FULL ACCEPTED TEXT) =====",
    appTermsLive.appTermsMarkdown,
    "",
    "===== KEYSTONE PRIVACY NOTICE / PART C (FULL ACCEPTED TEXT) =====",
    appTermsLive.privacyNoticeMarkdown,
  ].join("\n");

  const studioReceiptId = crypto.randomUUID();
  const appReceiptId = crypto.randomUUID();
  const studioAcceptance: TermsAcceptance = {
    id: crypto.randomUUID(),
    versionId: input.versionId,
    documentKind: "studio_agreement",
    userId,
    accountEmail,
    typedName: input.typedName.trim(),
    capacity: input.capacity,
    relationship: input.relationship,
    guardianDeclaration: input.guardianDeclaration,
    studentIds: [...input.studentIds],
    method: input.method ?? "invite",
    acceptedAt,
    ip,
    userAgent,
    receiptId: studioReceiptId,
  };
  const appAcceptance: TermsAcceptance = {
    ...studioAcceptance,
    id: crypto.randomUUID(),
    versionId: input.appTermsVersionId,
    documentKind: "family_app_terms",
    receiptId: appReceiptId,
  };
  state.acceptances.push(studioAcceptance, appAcceptance);

  for (const consent of input.consents) {
    await recordConsent({
      scope,
      studentId: consent.studentId,
      type: consent.type,
      granted: consent.granted,
      givenBy: input.typedName.trim(),
      wordingVersion: "v2",
    });
  }

  state.receipts.push({
    id: studioReceiptId,
    acceptanceId: studioAcceptance.id,
    email: accountEmail,
    renderedText: receiptBody,
    versionNo: studioVersion.versionNo,
    acceptedAt,
    typedName: input.typedName.trim(),
    consentChoices,
  });
  state.outbox.push({
    id: crypto.randomUUID(),
    to: accountEmail,
    subject: `${data.studio.name || "Studio"} terms acceptance receipt`,
    body: receiptBody,
    createdAt: acceptedAt,
    receiptId: studioReceiptId,
  });

  return respond(freeze({ studioAcceptance, appAcceptance, receiptId: studioReceiptId }));
}

export async function recordConsent(input: {
  scope: TermsScope;
  studentId: string;
  type: ConsentType;
  granted: boolean;
  givenBy: string;
  wordingVersion?: string;
}) {
  const state = await ensureTermsState();
  const data = store(input.scope, await draftPatch(input.scope));
  if (!data.students.some((student) => student.id === input.studentId)) throw new Error("Student not found.");
  const existing = state.consents.filter((entry) => entry.scope === input.scope && entry.studentId === input.studentId && entry.type === input.type && !entry.withdrawnAt);
  if (!input.granted) {
    for (const entry of existing) entry.withdrawnAt = `${PROTOTYPE_TODAY}T12:00:00+11:00`;
  }
  const record: ConsentRecord = {
    id: crypto.randomUUID(),
    scope: input.scope,
    studentId: input.studentId,
    type: input.type,
    granted: input.granted,
    wordingVersion: input.wordingVersion ?? "v2",
    givenBy: input.givenBy,
    givenAt: `${PROTOTYPE_TODAY}T12:00:00+11:00`,
    ...(input.granted ? {} : { withdrawnAt: `${PROTOTYPE_TODAY}T12:00:00+11:00` }),
  };
  state.consents.push(record);

  // Write-through rules for family.mediaConsent (lesson recordings only)
  if (input.type === "lesson_recordings" && input.scope === "demo") {
    const student = students.find((entry) => entry.id === input.studentId);
    const family = families.find((entry) => entry.id === student?.familyId);
    if (family) family.mediaConsent = input.granted;
  }
  return respond(freeze(record));
}

export async function getFamilyConsents(scope: TermsScope = "demo") {
  const state = await ensureTermsState();
  const session = scope === "demo" ? await getParentSession() : null;
  const kids = session?.children ?? [];
  const records = state.consents.filter((entry) => entry.scope === scope && kids.some((child) => child.id === entry.studentId));
  return respond(freeze({ children: kids, consents: records }));
}

export async function getReacceptanceStatus(scope: TermsScope = "demo") {
  const state = await ensureTermsState();
  if (scope !== "demo") return respond({ needed: false as const });
  const session = await getParentSession();
  const published = await getPublishedStudioTerms(scope);
  const materialTarget = published.pending?.changeType === "material" ? published.pending : published.current?.changeType === "material" ? published.current : published.pending ?? published.current;
  if (!materialTarget) return respond({ needed: false as const });
  const kidIds = session.children.map((child) => child.id);
  const latest = state.acceptances
    .filter((entry) => entry.documentKind === "studio_agreement" && entry.studentIds.some((id) => kidIds.includes(id)))
    .sort((a, b) => b.acceptedAt.localeCompare(a.acceptedAt))[0];
  const accepted = latest?.versionId === materialTarget.id;
  if (accepted) return respond({ needed: false as const, version: freeze(materialTarget) });
  const isMaterial = materialTarget.changeType === "material" && materialTarget.versionNo > 1;
  const minorKey = `${session.family.id}:${materialTarget.id}`;
  if (!isMaterial && state.minorNoticesDismissed.has(minorKey)) return respond({ needed: false as const, version: freeze(materialTarget) });
  return respond(freeze({
    needed: true as const,
    kind: isMaterial ? "material" as const : "minor" as const,
    version: materialTarget,
    studioName: studio.name,
    teacherName: teacher.name,
    stopWithoutNoticeUntil: materialTarget.effectiveAt,
  }));
}

export async function dismissMinorTermsNotice() {
  const state = await ensureTermsState();
  const session = await getParentSession();
  const published = await getPublishedStudioTerms("demo");
  const target = published.pending ?? published.current;
  if (target) state.minorNoticesDismissed.add(`${session.family.id}:${target.id}`);
  return respond({ ok: true });
}

export { applyLateFeeCents };
