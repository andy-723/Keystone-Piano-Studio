import type { StudioTermsStudioPatch } from "@/mocks/terms";
import type { TermsOptionalSwitch } from "@/mocks/legal-template-au";

export type OnboardingFieldKind =
  | "text"
  | "select"
  | "number"
  | "switch"
  | "textarea"
  | "childSafety";

export interface StudioTermsOnboardingStep {
  id: string;
  title: string;
  help?: string;
  kind: OnboardingFieldKind;
  /** Path into studio patch / switches */
  field:
    | keyof StudioTermsStudioPatch
    | `billing.${string}`
    | `policies.${string}`
    | `services.${string}`
    | `switch.${TermsOptionalSwitch}`
    | "childSafety";
  options?: { value: string; label: string }[];
  required?: boolean;
  /** Only show when a switch is on or plan is pro */
  when?: { switch?: TermsOptionalSwitch; pro?: boolean };
}

export const STUDIO_TERMS_ONBOARDING_STEPS: StudioTermsOnboardingStep[] = [
  { id: "legalName", title: "What is your studio's legal name?", help: "The name on your ABN registration.", kind: "text", field: "legalName", required: true },
  { id: "tradingName", title: "What trading name do families see?", help: "Often the same as your studio name.", kind: "text", field: "name", required: true },
  { id: "abn", title: "What is your ABN?", kind: "text", field: "abn", required: true },
  { id: "address", title: "What is your studio address?", kind: "text", field: "address", required: true },
  {
    id: "state",
    title: "Which Australian state or territory?",
    kind: "select",
    field: "state",
    required: true,
    options: ["VIC", "NSW", "QLD", "SA", "WA", "TAS", "ACT", "NT"].map((value) => ({ value, label: value })),
  },
  { id: "email", title: "Studio email for families?", kind: "text", field: "email", required: true },
  { id: "phone", title: "Studio phone number?", kind: "text", field: "phone", required: true },
  { id: "privacyEmail", title: "Privacy contact email?", help: "Where families send privacy requests.", kind: "text", field: "privacyEmail", required: true },
  {
    id: "entityType",
    title: "How is the studio structured?",
    kind: "select",
    field: "entityType",
    required: true,
    options: [
      { value: "sole_trader", label: "Sole trader" },
      { value: "partnership", label: "Partnership" },
      { value: "company", label: "Company" },
      { value: "trust", label: "Trust" },
    ],
  },
  {
    id: "billingCycle",
    title: "How do you bill tuition?",
    kind: "select",
    field: "billing.cycle",
    required: true,
    options: [
      { value: "per_term", label: "Each school term" },
      { value: "monthly", label: "Monthly" },
      { value: "per_lesson", label: "Per lesson" },
    ],
  },
  { id: "invoiceLeadDays", title: "How many days before the period do you send invoices?", kind: "number", field: "billing.invoiceLeadDays", required: true },
  {
    id: "dueRule",
    title: "When is payment due?",
    kind: "select",
    field: "billing.dueRule",
    required: true,
    options: [
      { value: "on_issue", label: "On issue" },
      { value: "days_after_issue", label: "14 days after issue" },
      { value: "before_term_start", label: "Before term start" },
    ],
  },
  { id: "lateFee", title: "Late fee amount (A$)?", kind: "number", field: "billing.lateFee", required: true },
  { id: "lateFeeAfterDays", title: "Days after due date before the late fee applies?", kind: "number", field: "billing.lateFeeAfterDays", required: true },
  { id: "suspendAfterDays", title: "Days after due date before pausing lessons?", kind: "number", field: "billing.suspendAfterDays", required: true },
  { id: "feeNoticeDays", title: "Days' notice for fee changes? (min 14)", kind: "number", field: "billing.feeNoticeDays", required: true },
  { id: "withdrawalNoticeWeeks", title: "Weeks' notice to stop lessons? (max 4)", kind: "number", field: "billing.withdrawalNoticeWeeks", required: true },
  { id: "paymentMethods", title: "Which payment methods do you accept?", help: "e.g. bank transfer, PayTo, card", kind: "text", field: "paymentMethods", required: true },
  { id: "paymentDiscount", title: "Offer a payment-method discount?", kind: "switch", field: "switch.paymentDiscount" },
  { id: "discountMethod", title: "Discount applies when paying by…", kind: "text", field: "billing.paymentDiscount.method", required: true, when: { switch: "paymentDiscount" } },
  { id: "discountAmount", title: "Discount amount (A$)?", kind: "number", field: "billing.paymentDiscount.amount", required: true, when: { switch: "paymentDiscount" } },
  { id: "cancelNoticeHours", title: "Cancel notice (hours) for make-up eligibility?", kind: "number", field: "policies.cancelNoticeHours", required: true },
  { id: "makeUpQuota", title: "How many make-up lessons per period?", kind: "number", field: "policies.makeUpQuota", required: true },
  {
    id: "makeUpPeriod",
    title: "Make-up period?",
    kind: "select",
    field: "policies.makeUpPeriod",
    required: true,
    options: [
      { value: "term", label: "Per term" },
      { value: "month", label: "Per month" },
    ],
  },
  {
    id: "makeUpExpiry",
    title: "When do make-ups expire?",
    kind: "select",
    field: "policies.makeUpExpiry",
    required: true,
    options: [
      { value: "same term", label: "Same term" },
      { value: "next term", label: "Next term" },
      { value: "30 days", label: "30 days" },
    ],
  },
  { id: "onlinePlatform", title: "Online lesson platform?", help: "e.g. Zoom, Google Meet", kind: "text", field: "policies.onlinePlatform", required: true },
  {
    id: "publicHolidays",
    title: "Public holiday lesson rule?",
    kind: "select",
    field: "policies.publicHolidays",
    required: true,
    options: [
      { value: "skip", label: "Skip with no charge" },
      { value: "make_up", label: "Offer a make-up" },
      { value: "charge", label: "Still charge as scheduled" },
    ],
  },
  { id: "tuningFrequency", title: "How often should acoustic pianos be tuned?", kind: "text", field: "policies.tuningFrequency", required: true },
  { id: "inactiveRetentionMonths", title: "Months to keep personal info after lessons stop?", kind: "number", field: "policies.inactiveRetentionMonths", required: true },
  {
    id: "asyncLessonPolicy",
    title: "Pro video-lesson rule?",
    kind: "select",
    field: "asyncLessonPolicy",
    when: { pro: true },
    options: [
      { value: "makeup_credit", label: "Video lesson earns a make-up credit" },
      { value: "counts_as_lesson", label: "Counts as the scheduled lesson" },
    ],
  },
  { id: "online", title: "Offer online lessons?", kind: "switch", field: "switch.online" },
  { id: "inHome", title: "Offer in-home lessons?", kind: "switch", field: "switch.inHome" },
  { id: "travelFee", title: "In-home travel fee per visit?", kind: "text", field: "services.inHomeTravelFee", required: true, when: { switch: "inHome" } },
  { id: "exams", title: "Offer exams?", kind: "switch", field: "switch.exams" },
  { id: "boards", title: "Which exam boards?", kind: "text", field: "boards", required: true, when: { switch: "exams" } },
  { id: "premises", title: "Teach at your own premises?", kind: "switch", field: "switch.premises" },
  { id: "additional", title: "Add your own extra studio terms?", kind: "switch", field: "switch.additional" },
  { id: "additionalTerms", title: "Additional studio terms", kind: "textarea", field: "additionalTerms", required: true, when: { switch: "additional" } },
  { id: "childSafety", title: "Teacher child safety check", help: "State, check type, number and expiry. The number is never shown to families in the agreement.", kind: "childSafety", field: "childSafety", required: true },
];

export function visibleOnboardingSteps(
  switches: Partial<Record<TermsOptionalSwitch, boolean>>,
  plan?: string,
): StudioTermsOnboardingStep[] {
  const isPro = plan === "pro" || plan === "academy";
  return STUDIO_TERMS_ONBOARDING_STEPS.filter((step) => {
    if (!step.when) return true;
    if (step.when.pro && !isPro) return false;
    if (step.when.switch && !switches[step.when.switch]) return false;
    return true;
  });
}
