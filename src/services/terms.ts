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
  type TermsAcceptance,
  type TermsChangeType,
  type TermsScope,
  type TermsVersion,
} from "@/mocks/terms";
import { newStudioRoster } from "@/mocks/roster-import";
import { respond } from "./_delay";
import { getOrCreateFamilyConversation, sendMessage } from "./chat";
import { getParentSession } from "./parent";

function store(scope: TermsScope) {
  return scope === "demo" ? { families, students, studio, teacher } : {
    families: newStudioRoster.families,
    students: newStudioRoster.students,
    studio: {
      name: setupSession.studio.name,
      abn: setupSession.tax.abn || undefined,
      legalName: setupSession.studio.name,
      address: setupSession.studio.suburb,
      state: setupSession.studio.state,
      email: "",
      phone: "",
      privacyEmail: "",
      entityType: "sole_trader" as const,
      billing: studio.billing,
      policies: {
        cancelNoticeHours: setupSession.policies.lateCancellationHours,
        makeUpQuota: 1,
        makeUpPeriod: "term" as const,
        makeUpExpiry: "same term" as const,
        onlinePlatform: "Zoom",
        publicHolidays: "skip" as const,
        tuningFrequency: "once a year",
        inactiveRetentionMonths: 24,
      },
      services: { online: false, inHome: false, exams: false, premises: true },
      additionalTerms: "",
      plan: "base" as const,
      asyncLessonPolicy: "makeup_credit" as const,
      gstRegistered: setupSession.tax.registration === "yes",
    },
    teacher: { name: setupSession.studio.teacherName, childSafety: undefined as undefined },
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
  const data = store(scope);
  const setting = data.studio.billing?.lateFee ?? 15;
  // Pending billing only applies on/after effectiveAt
  const pending = scope === "demo" ? studio.pendingBilling : undefined;
  const effectiveLate = pending?.effectiveAt && pending.effectiveAt <= PROTOTYPE_TODAY && pending.lateFee !== undefined
    ? pending.lateFee
    : setting;
  return applyLateFeeCents(effectiveLate, invoiceTotalCents);
}

function liveMergeValues(scope: TermsScope) {
  const data = store(scope);
  const integrations = integrationState[scope];
  const methods = integrations.stripe.status === "connected"
    ? "PayTo, BECS direct debit and card"
    : "bank transfer";
  const accountingLabel = integrations.xero.status === "connected"
    ? ` · Accounting: ${integrations.xero.organisationName ?? "Xero"}`
    : "";
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
    boards: "AMEB, Trinity, ABRSM",
    ...(accountingLabel ? { accountingLabel } : {}),
  });
}

function applyClauseEdits(template: LegalClause[], edits: Record<string, string>): LegalClause[] {
  return template.map((clause) => (edits[clause.id] ? { ...clause, body: edits[clause.id]! } : clause));
}

function missingPublishMessages(scope: TermsScope, missingRequired: string[]): string[] {
  const data = store(scope);
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
        if (!["studio.abn", "studio.legalName", "teacher.childSafetyState", "teacher.childSafetyType", "teacher.childSafetyStatus"].includes(path)) {
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
  const mergeValues = liveMergeValues(scope);
  draft.mergeValues = mergeValues;
  const template = applyClauseEdits(LEGAL_TEMPLATE_AU, draft.clauseEdits);
  const switches = { ...defaultStudioSwitches(store(scope).studio.services, store(scope).studio.plan), ...draft.switches };
  const rendered = renderTerms(template, mergeValues, switches);
  const warnings = additionalTermsWarnings(String(store(scope).studio.additionalTerms ?? ""));
  return respond(freeze({
    ...draft,
    switches,
    mergeValues,
    rendered,
    warnings,
    reviewed,
    keystoneEntity: KEYSTONE_ENTITY,
    template: LEGAL_TEMPLATE_AU.map((clause) => ({
      ...clause,
      body: draft.clauseEdits[clause.id] ?? clause.body,
      edited: Boolean(draft.clauseEdits[clause.id]),
    })),
    studio: freeze(store(scope).studio),
      teacher: freeze({
      name: store(scope).teacher.name,
      childSafety: (() => {
        const safety = store(scope).teacher.childSafety;
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
    financialRetentionYears: financialRetentionYears(store(scope).studio.entityType),
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
    studio?: Partial<{
      legalName: string;
      address: string;
      state: string;
      email: string;
      phone: string;
      privacyEmail: string;
      entityType: typeof studio.entityType;
      additionalTerms: string;
      billing: NonNullable<typeof studio.billing>;
      policies: NonNullable<typeof studio.policies>;
      services: NonNullable<typeof studio.services>;
    }>;
  },
) {
  const state = await ensureTermsState();
  const draft = state.drafts[scope];
  if (input.switches) draft.switches = { ...draft.switches, ...input.switches };
  if (input.clauseEdits) draft.clauseEdits = { ...draft.clauseEdits, ...input.clauseEdits };
  if (scope === "demo" && input.studio) {
    const published = state.versions.filter((version) => version.documentId === "doc-studio-demo");
    const hasPublished = published.length > 0;
    if (input.studio.billing && hasPublished) {
      // Terms-linked billing after first publish becomes pending until next version effectiveAt
      const pending: NonNullable<typeof studio.pendingBilling> = {
        ...studio.pendingBilling,
        ...input.studio.billing,
      };
      if (studio.pendingBilling?.effectiveAt) pending.effectiveAt = studio.pendingBilling.effectiveAt;
      studio.pendingBilling = pending;
    } else if (input.studio.billing) {
      studio.billing = { ...studio.billing!, ...input.studio.billing };
    }
    if (input.studio.legalName !== undefined) studio.legalName = input.studio.legalName;
    if (input.studio.address !== undefined) studio.address = input.studio.address;
    if (input.studio.state !== undefined) studio.state = input.studio.state;
    if (input.studio.email !== undefined) studio.email = input.studio.email;
    if (input.studio.phone !== undefined) studio.phone = input.studio.phone;
    if (input.studio.privacyEmail !== undefined) studio.privacyEmail = input.studio.privacyEmail;
    if (input.studio.entityType !== undefined) studio.entityType = input.studio.entityType;
    if (input.studio.additionalTerms !== undefined) studio.additionalTerms = input.studio.additionalTerms;
    if (input.studio.policies) studio.policies = { ...studio.policies!, ...input.studio.policies };
    if (input.studio.services) studio.services = { ...studio.services!, ...input.studio.services };
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
    throw new Error(missingPublishMessages(scope, draft.rendered.missingRequired).join(". ") || "Complete required fields before publishing.");
  }
  const doc = state.documents.find((entry) => entry.scope === scope && entry.kind === "studio_agreement");
  if (!doc) throw new Error("Studio agreement document missing.");
  const previous = [...state.versions].filter((version) => version.documentId === doc.id).sort((a, b) => b.versionNo - a.versionNo)[0];
  const template = applyClauseEdits(LEGAL_TEMPLATE_AU, state.drafts[scope].clauseEdits);
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
    const noticeDays = store(scope).studio.billing?.feeNoticeDays ?? 30;
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
    publishedBy: store(scope).teacher.name || "Teacher",
    editedClauseIds: Object.keys(state.drafts[scope].clauseEdits),
  };
  state.versions.push(version);
  if (scope === "demo" && studio.pendingBilling) {
    studio.pendingBilling.effectiveAt = input.effectiveAt;
  }
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
  return respond(freeze({
    version: version ? freeze(version) : null,
    appTermsMarkdown: FAMILY_APP_TERMS_MARKDOWN,
    privacyNoticeMarkdown: PRIVACY_NOTICE_MARKDOWN.replaceAll("{{privacy.overseasCountriesLabel}}", String((liveMergeValues("demo")["privacy"] as Record<string, unknown>)["overseasCountriesLabel"] ?? "")).replaceAll("{{privacy.keystoneStorageStatement}}", String((liveMergeValues("demo")["privacy"] as Record<string, unknown>)["keystoneStorageStatement"] ?? "")),
    keystoneEntity: KEYSTONE_ENTITY,
    reviewed,
  }));
}

export async function getAcceptanceTracker(scope: TermsScope = "demo") {
  const state = await ensureTermsState();
  const published = await getPublishedStudioTerms(scope);
  const target = published.pending ?? published.current;
  const data = store(scope);
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
  const data = store(scope);
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
  const data = store(scope);
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
  const data = store(scope);
  const studentIds = new Set(data.students.map((student) => student.id));
  const acceptances = state.acceptances.filter((entry) => entry.studentIds.some((id) => studentIds.has(id)));
  const consents = state.consents.filter((entry) => entry.scope === scope);
  return respond(freeze({ exportedAt: `${PROTOTYPE_TODAY}T12:00:00+11:00`, acceptances, consents, paperFiles: state.paperFiles }));
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
  const data = store(scope);
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
  // Never include health note text in receipts
  const receiptBody = [
    `Accepted studio agreement version ${studioVersion.versionNo} (${studioVersion.sha256.slice(0, 8)}…)`,
    `Accepted Keystone app terms version ${appVersion.versionNo}`,
    `Typed name: ${input.typedName.trim()}`,
    `Capacity: ${input.capacity}; relationship: ${input.relationship}`,
    `Students: ${selected.map((student) => student.firstName).join(", ")}`,
    `Consents: ${consentChoices.map((choice) => `${choice.type}=${choice.granted ? "yes" : "no"}`).join(", ")}`,
    `Time: ${acceptedAt}`,
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
    subject: `${store(scope).studio.name || "Studio"} terms acceptance receipt`,
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
  const data = store(input.scope);
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
