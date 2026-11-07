/**
 * Australian studio agreement template (Parts 1–3) and Part 4 screen wording.
 *
 * DRAFT — source artifact https://claude.ai/artifact/DzoMKCxPqp7ogcNCAv1gnv was unreachable
 * at implementation time. Clauses follow the prompt’s structure and merge-field reference so
 * render/hash/service/UI work; replace this file after solicitor sign-off without code changes.
 */

export type TermsOptionalSwitch =
  | "online"
  | "inHome"
  | "asyncPro"
  | "exams"
  | "premises"
  | "paymentDiscount"
  | "additional";

export interface LegalClause {
  id: string;
  part: 1 | 2 | 3;
  heading: string;
  body: string;
  optional?: TermsOptionalSwitch;
  material: boolean;
}

export const LEGAL_TEMPLATE_AU: LegalClause[] = [
  // —— Part 1: Parties and lessons ——
  {
    id: "p1-parties",
    part: 1,
    heading: "Parties",
    body:
      "**Draft AU clause.** This Studio Agreement is between **{{studio.legalName}}** (ABN {{studio.abn}}) of {{studio.address}}, {{studio.state}} (“the Studio”) and the parent or legal guardian named at acceptance (or an adult student accepting for themselves).\n\nTeaching contact: {{teacher.name}}. Studio email {{studio.email}}. Phone {{studio.phone}}.",
    material: true,
  },
  {
    id: "p1-lessons",
    part: 1,
    heading: "Lessons",
    body:
      "**Draft AU clause.** The Studio provides individual piano lessons as agreed in the timetable. Lessons run during school terms unless otherwise arranged. Public holidays are treated as: {{policies.publicHolidays}}.",
    material: true,
  },
  {
    id: "p1-online",
    part: 1,
    heading: "Online lessons",
    body:
      "**Draft AU clause.** When offered, online lessons use {{policies.onlinePlatform}}. A suitable device, internet connection and quiet space are the family’s responsibility.",
    optional: "online",
    material: false,
  },
  {
    id: "p1-inhome",
    part: 1,
    heading: "In-home lessons",
    body:
      "**Draft AU clause.** In-home lessons may attract a travel fee of {{services.inHomeTravelFee}} where the Studio travels to the student. A safe teaching space and working instrument must be available.",
    optional: "inHome",
    material: true,
  },
  {
    id: "p1-async",
    part: 1,
    heading: "Video (async) lessons",
    body:
      "**Draft AU clause.** On a Pro plan, a scheduled lesson may be delivered as a guided video lesson. Studio policy: {{studio.asyncLessonPolicyLabel}}.",
    optional: "asyncPro",
    material: true,
  },
  {
    id: "p1-exams",
    part: 1,
    heading: "Exams and boards",
    body:
      "**Draft AU clause.** Exam enrolment is optional. Boards the Studio currently supports: {{curriculum.boards}}. Exam fees charged by boards are separate from lesson fees.",
    optional: "exams",
    material: false,
  },
  {
    id: "p1-premises",
    part: 1,
    heading: "Studio premises",
    body:
      "**Draft AU clause.** Lessons at the Studio’s premises require arrival on time and supervision of younger students before and after the lesson as agreed. Instruments are tuned {{policies.tuningFrequency}}.",
    optional: "premises",
    material: false,
  },
  {
    id: "p1-child-safety",
    part: 1,
    heading: "Child safety check",
    body:
      "**Draft AU clause.** The teaching adult holds a {{teacher.childSafetyState}} {{teacher.childSafetyType}} that is {{teacher.childSafetyStatus}}. The check number is kept on the Studio’s records and is not published in this agreement.",
    material: true,
  },

  // —— Part 2: Money rules ——
  {
    id: "p2-fees",
    part: 2,
    heading: "Fees and billing",
    body:
      "**Draft AU clause.** Lesson fees are billed {{billing.cycle}}. Invoices are issued about {{billing.invoiceLeadDays}} days before the period starts. Payment is due {{billing.dueRule}}. Accepted payment methods: {{billing.paymentMethods}}.{{billing.accountingLabel}}",
    material: true,
  },
  {
    id: "p2-late-fee",
    part: 2,
    heading: "Late payment",
    body:
      "**Draft AU clause.** If an invoice remains unpaid {{billing.lateFeeAfterDays}} days after the due date, a late fee of A${{billing.lateFee}} may apply once per invoice. The fee charged is the lower of that amount, A$15, and 5% of the invoice total. It is never stacked with interest. Lessons may be paused if payment is still outstanding {{billing.suspendAfterDays}} days after the due date.",
    material: true,
  },
  {
    id: "p2-discount",
    part: 2,
    heading: "Payment method discount",
    body:
      "**Draft AU clause.** A discount of A${{billing.paymentDiscount.amount}} applies when paying by {{billing.paymentDiscount.method}}. Card surcharges are not charged.",
    optional: "paymentDiscount",
    material: true,
  },
  {
    id: "p2-cancel",
    part: 2,
    heading: "Cancellations and make-ups",
    body:
      "**Draft AU clause.** Give at least {{policies.cancelNoticeHours}} hours’ notice to cancel. Make-up credits: up to {{policies.makeUpQuota}} per {{policies.makeUpPeriod}}, expiring {{policies.makeUpExpiry}}. Studio-cancelled lessons earn a make-up credit.",
    material: true,
  },
  {
    id: "p2-withdrawal",
    part: 2,
    heading: "Stopping lessons",
    body:
      "**Draft AU clause.** To stop ongoing lessons, give {{billing.withdrawalNoticeWeeks}} weeks’ notice through {{notice.channel}}. Fee changes need at least {{billing.feeNoticeDays}} days’ notice through the same channel.",
    material: true,
  },
  {
    id: "p2-records",
    part: 2,
    heading: "Financial records",
    body:
      "**Draft AU clause.** The Studio keeps financial records for {{privacy.financialRetentionYears}} years as required for its {{studio.entityTypeLabel}}.",
    material: false,
  },

  // —— Part 3: Privacy, liability, additional ——
  {
    id: "p3-privacy",
    part: 3,
    heading: "Privacy",
    body:
      "**Draft AU clause.** The Studio collects personal and health information needed to teach and contact your family. Privacy questions: {{studio.privacyEmail}}. Inactive family records are reviewed after {{policies.inactiveRetentionMonths}} months. Keystone Music HQ storage: {{privacy.keystoneStorageStatement}} Overseas support access may involve: {{privacy.overseasCountriesLabel}}.",
    material: true,
  },
  {
    id: "p3-disclaimer",
    part: 3,
    heading: "Disclaimer",
    body:
      "**Draft AU clause.** Music lessons involve ordinary physical activity at an instrument. The Studio takes reasonable care but does not guarantee exam results or progress. Australian Consumer Law rights that cannot be excluded still apply.",
    material: true,
  },
  {
    id: "p3-additional",
    part: 3,
    heading: "Added by the Studio",
    body:
      "**Added by the Studio, not part of Keystone's template.**\n\n{{studio.additionalTerms}}",
    optional: "additional",
    material: true,
  },
];

/** Part 4 enrolment screen copy (collection notice + consent prompts). Draft AU wording. */
export const PART4_COLLECTION_NOTICE = {
  title: "Before we collect your details",
  body:
    "Your studio and Keystone Music HQ collect enrolment, contact, schedule and (if you choose to share them) health or learning notes so we can teach safely and run your account. Overseas countries that may have limited support access: {{privacy.overseasCountriesLabel}}. You can read the studio privacy policy in the terms step.",
  privacyLinkLabel: "Studio privacy policy",
};

export const PART4_EMERGENCY_MEDICAL = {
  title: "Emergency medical authority",
  prompt:
    "If there is a medical emergency during a lesson, do you authorise the Studio to seek urgent help and share relevant health information with emergency services? Costs of care remain the family’s responsibility, except where caused by the Studio’s negligence.",
  yes: "Yes, I authorise emergency help and sharing of relevant health information",
  no: "No, I do not authorise this",
};

export const PART4_HEALTH_NOTES = {
  title: "Health and learning notes",
  prompt:
    "You entered medical or learning notes. May the Studio keep these notes on the student record and share them with the teaching adult for lesson planning?",
  yes: "Yes, keep and share these notes with the teacher",
  no: "No, remove these notes from the enrolment",
};

export const PART4_PUBLIC_MEDIA = {
  title: "Public media consent",
  prompt:
    "May the Studio use photos or short videos of the student in studio newsletters, noticeboards or public social media? Private lesson recordings for assignments are a separate choice.",
  yes: "Yes, public media is OK",
  no: "No public media",
  talkFirst: "Please talk with {{student.firstName}} about this first.",
};

export const PART4_TERMS_ACCEPT = {
  moneyRulesTitle: "Money rules at a glance",
  studioTick:
    "I agree to {{studio.name}}'s Terms and Conditions and Disclaimer, version {{terms.versionNo}}, effective {{terms.effectiveAt}}, and I have read its Privacy Policy.",
  guardianTick:
    "I am the parent or legal guardian of each student under 18 in this enrolment, and I accept these terms on their behalf.",
  keystoneBoxTitle: "Keystone Music HQ, the app your studio uses",
  keystoneTick:
    "I agree to Keystone Music HQ's App terms of use and I have read its Privacy notice",
  typedNameLabel: "Type your full name",
  relationshipLabel: "Your relationship",
  relationshipParent: "Parent",
  relationshipGuardian: "Legal guardian",
};

/** Words that trigger a non-blocking warning on studio.additionalTerms. */
export const ADDITIONAL_TERMS_WARNING_WORDS = [
  "surcharge",
  "card fee",
  "admin fee",
  "no refund",
  "non-refundable",
] as const;
