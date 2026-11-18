import { getMergeValue, type TermsMergeValues } from "@/lib/terms-render";

/**
 * Plain-English names for the merge fields in the studio agreement template, so the clause
 * editor shows "[Public holiday rule]" instead of "{{policies.publicHolidayRule}}".
 * Labels must stay unique: they are turned back into {{tokens}} when a clause is saved.
 */
export const MERGE_FIELD_LABELS: Record<string, string> = {
  "billing.cycle": "Billing cycle",
  "billing.dueRule": "Payment due rule",
  "billing.feeNoticeDays": "Fee change notice days",
  "billing.invoiceLeadDays": "Invoice lead days",
  "billing.lateFeeAfterDays": "Days before late fee",
  "billing.lateFeeLabel": "Late fee",
  "billing.noticePeriod": "Notice period to stop lessons",
  "billing.paymentDiscount.amountLabel": "Payment discount amount",
  "billing.paymentDiscount.method": "Payment discount method",
  "billing.paymentMethods": "Payment methods",
  "billing.suspendAfterDays": "Days before lessons pause",
  "curriculum.boards": "Exam boards",
  "policies.cancelNoticeHours": "Cancel notice hours",
  "policies.inactiveRetentionMonths": "Months to keep records",
  "policies.makeUpExpiry": "Make-up expiry",
  "policies.makeUpPeriod": "Make-up period",
  "policies.makeUpQuota": "Make-up lessons allowed",
  "policies.onlinePlatform": "Online lesson platform",
  "policies.publicHolidayRule": "Public holiday rule",
  "policies.tuningFrequency": "Piano tuning frequency",
  "privacy.accountingSoftware": "Accounting software",
  "privacy.financialRetentionYears": "Years to keep financial records",
  "privacy.keystonePrivacyEmail": "Keystone privacy email",
  "privacy.keystoneStorageStatement": "Keystone storage statement",
  "privacy.overseasCountriesLabel": "Overseas countries",
  "privacy.paymentProvider": "Payment provider",
  "services.inHomeTravelFee": "In-home travel fee",
  "student.firstNames": "Student first names",
  "student.firstName": "Student first name",
  "studio.abn": "Studio ABN",
  "studio.additionalTerms": "Your additional terms",
  "studio.address": "Studio address",
  "studio.asyncLessonPolicyLabel": "Video lesson rule",
  "studio.email": "Studio email",
  "studio.legalName": "Studio legal name",
  "studio.phone": "Studio phone",
  "studio.privacyEmail": "Privacy contact email",
  "studio.state": "Studio state",
  "studio.tradingName": "Studio trading name",
  "teacher.childSafetyChecks": "Teacher child safety checks",
  "terms.appVersion": "App terms version",
  "terms.effectiveAt": "Terms effective date",
  "terms.versionNo": "Terms version",
};

const TOKEN = /\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g;

function labelFor(path: string): string {
  return MERGE_FIELD_LABELS[path] ?? path;
}

/** "{{policies.tuningFrequency}}" -> "[Piano tuning frequency]" */
export function toFriendlyClause(body: string): string {
  return body.replace(TOKEN, (_match, path: string) => `[${labelFor(path)}]`);
}

/** "[Piano tuning frequency]" -> "{{policies.tuningFrequency}}". Raw {{tokens}} typed by hand stay as they are. */
export function fromFriendlyClause(text: string): string {
  const byLabel = new Map(
    Object.entries(MERGE_FIELD_LABELS).map(([path, label]) => [label.toLowerCase(), path]),
  );
  return text.replace(/\[([^\][\n]{1,60})\]/g, (match, label: string) => {
    const path = byLabel.get(label.trim().toLowerCase());
    return path ? `{{${path}}}` : match;
  });
}

/** The merge fields a clause uses, with the studio's current answer (or "" if not answered). */
export function clauseFields(
  body: string,
  values: TermsMergeValues,
): { path: string; label: string; value: string }[] {
  const seen = new Set<string>();
  const fields: { path: string; label: string; value: string }[] = [];
  for (const match of body.matchAll(TOKEN)) {
    const path = match[1]!;
    if (seen.has(path)) continue;
    seen.add(path);
    const raw = getMergeValue(values, path);
    fields.push({
      path,
      label: labelFor(path),
      value: raw === undefined || raw === null ? "" : String(raw).trim(),
    });
  }
  return fields;
}

/** The clause as families will read it, with answers filled in. Unanswered fields show as [Label]. */
export function previewClause(body: string, values: TermsMergeValues): string {
  return body.replace(TOKEN, (_match, path: string) => {
    const raw = getMergeValue(values, path);
    const text = raw === undefined || raw === null ? "" : String(raw).trim();
    return text || `[${labelFor(path)}]`;
  });
}
