// Data shapes match the future REST API names. Money is always integer cents.
export type Lang = "en" | "zh-CN";
export type StudioPlan = "base" | "pro" | "academy";
export type StudioEntityType = "sole_trader" | "partnership" | "company" | "trust";
export type MakeUpPeriod = "term" | "month";
export type MakeUpExpiry = "same term" | "next term" | "30 days";
export type PublicHolidayPolicy = "skip" | "make_up" | "charge";
export type BillingCycle = "per_term" | "monthly" | "per_lesson";
export type DueRule = "on_issue" | "days_after_issue" | "before_term_start";

export interface StudioBillingSettings {
  cycle: BillingCycle;
  invoiceLeadDays: number;
  dueRule: DueRule;
  lateFeeAfterDays: number;
  /** Dollars; applied fee is min(setting, 15, 5% of invoice). */
  lateFee: number;
  suspendAfterDays: number;
  feeNoticeDays: number;
  withdrawalNoticeWeeks: number;
  paymentDiscount: { enabled: boolean; method?: string; amount?: number };
}

export interface StudioLessonPolicies {
  cancelNoticeHours: number;
  makeUpQuota: number;
  makeUpPeriod: MakeUpPeriod;
  makeUpExpiry: MakeUpExpiry;
  onlinePlatform: string;
  publicHolidays: PublicHolidayPolicy;
  tuningFrequency: string;
  inactiveRetentionMonths: number;
}

export interface StudioServiceSwitches {
  online: boolean;
  inHome: boolean;
  inHomeTravelFee?: string;
  exams: boolean;
  premises: boolean;
}

export interface ChildSafetyCheck {
  state: string;
  type: string;
  number: string;
  expiry: string;
}

export interface Studio {
  id: string;
  name: string;
  abn?: string;
  gstRegistered: boolean;
  timezone: "Australia/Melbourne";
  plan?: StudioPlan;
  asyncLessonPolicy?: "makeup_credit" | "counts_as_lesson";
  legalName?: string;
  address?: string;
  state?: string;
  email?: string;
  phone?: string;
  privacyEmail?: string;
  entityType?: StudioEntityType;
  billing?: StudioBillingSettings;
  policies?: StudioLessonPolicies;
  services?: StudioServiceSwitches;
  additionalTerms?: string;
  /** Pending billing values applied on next material version effectiveAt. */
  pendingBilling?: Partial<StudioBillingSettings> & { effectiveAt?: string };
}
export interface Teacher {
  id: string;
  name: string;
  childSafety?: ChildSafetyCheck;
}
export interface Guardian { id: string; name: string; email: string; preferredLanguage: Lang; mobile?: string }
export interface Family { id: string; displayName: string; guardians: Guardian[]; mediaConsent?: boolean; newsPhotoConsent?: boolean; /** Example row a new studio starts with; it can be deleted and is never invited. */ isExample?: boolean }
export interface Student { id: string; familyId: string; firstName: string; lastName: string; birthYear: number; examDate?: string; targetTerm?: string; /** Grade goal saved on the student when there is no weekly lesson slot yet. */ gradeGoal?: string; isExample?: boolean }
export interface LessonType { id: string; name: string; durationMin: number; priceCents: number }

export type LessonStatus = "scheduled" | "attended" | "absent" | "cancelled_by_studio" | "cancelled_late";
export interface LessonOccurrence {
  deliveryMode?: "in_person" | "online" | "async";
  id: string;
  studentId: string;
  lessonTypeId: string;
  startsAt: string;
  endsAt: string;
  status: LessonStatus;
}

export type InvoiceStatus = "draft" | "sent" | "partially_paid" | "paid" | "void";
export type InvoiceKind = "standard" | "late_fee";
export type InvoiceTaxCode = "taxable" | "gst_free";
export type PaymentMethod =
  | "bank_transfer"
  | "payid"
  | "cash"
  | "card_in_person"
  | "stripe_card"
  | "stripe_becs"
  | "stripe_payto"
  | "credit";
/** @deprecated Map legacy fixtures to stripe_* methods. */
export type LegacyPaymentMethod = "payto" | "becs" | "card";

export interface InvoiceLine {
  description: string;
  qty: number;
  unitCents: number;
  taxCents: number;
  lineTotalCents: number;
  studentId?: string;
  lessonTypeId?: string;
  taxCode?: InvoiceTaxCode;
  creditNoteId?: string;
}

export interface InvoiceSnapshot {
  seller: {
    legalName: string;
    tradingName: string;
    abn?: string;
    address?: string;
    email?: string;
  };
  buyer: { name: string; email: string };
  payTo: StudioPayTo;
  lines: InvoiceLine[];
  totals: { subtotalCents: number; taxCents: number; totalCents: number };
  title: "Tax invoice" | "Invoice";
  gstRegistered: boolean;
}

export interface Invoice {
  id: string;
  /** Null while draft. */
  number: string | null;
  familyId: string;
  status: InvoiceStatus;
  kind?: InvoiceKind;
  relatedInvoiceId?: string;
  billToGuardianId?: string;
  ccGuardianIds?: string[];
  billingPeriod?: { start: string; end: string };
  termsVersionId?: string;
  snapshot?: InvoiceSnapshot;
  pdf?: { path: string; sha256: string };
  collection?: "manual" | "stripe";
  queriedAt?: string;
  queryResolvedAt?: string;
  voidedAt?: string;
  voidReason?: string;
  sentAt?: string;
  issueDate: string;
  dueDate: string;
  lines: InvoiceLine[];
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  isTaxInvoice: boolean;
  gstRegistered?: boolean;
  title?: "Tax invoice" | "Invoice";
  termKey?: string;
  paidCents?: number;
  balanceCents?: number;
  /** Derived on every read — not stored. */
  isOverdue?: boolean;
  /** Derived on every read — not stored. */
  daysOverdue?: number;
  payments?: Payment[];
  xeroSyncedAt?: string;
  reviewedAt?: string;
}

export interface Payment {
  id: string;
  invoiceId: string;
  familyId: string;
  /** Negative = refund or reversal. */
  amountCents: number;
  method: PaymentMethod;
  receivedOn: string;
  reference?: string;
  recordedBy: string;
  reversesPaymentId?: string;
  stripePaymentIntentId?: string;
  xeroSyncedAt?: string;
  /** @deprecated Prefer receivedOn. Kept for older call sites during migration. */
  date?: string;
}

export type CreditNoteStatus = "open" | "applied" | "refunded";
export interface CreditNote {
  id: string;
  number: string;
  familyId: string;
  invoiceId?: string;
  reason: string;
  amountCents: number;
  taxCents: number;
  status: CreditNoteStatus;
  issuedOn: string;
  pdf?: { path: string; sha256: string };
}

export type InvoiceEventKind =
  | "created"
  | "sent"
  | "emailed"
  | "email_bounced"
  | "reminder_pre_due"
  | "reminder_overdue"
  | "late_fee_proposed"
  | "late_fee_applied"
  | "late_fee_waived"
  | "pause_notice_proposed"
  | "pause_notice_sent"
  | "queried"
  | "query_resolved"
  | "due_date_changed"
  | "payment_recorded"
  | "payment_reversed"
  | "voided"
  | "credit_note_issued"
  | "xero_pushed"
  | "scheduled_send";

export interface InvoiceEvent {
  id: string;
  invoiceId: string;
  kind: InvoiceEventKind;
  actor: "system" | string;
  at: string;
  data?: Record<string, unknown>;
}

export interface StudioPayTo {
  accountName?: string;
  bsb?: string;
  accountNumber?: string;
  payId?: string;
  payIdType?: "email" | "mobile" | "abn";
  cashNote?: string;
}

export interface StudioBillingProfile {
  legalName: string;
  tradingName: string;
  abn?: string;
  gstRegistered: boolean;
  gstRegisteredFrom?: string;
  invoicePrefix: string;
  nextInvoiceNumber: number;
  creditNotePrefix: string;
  nextCreditNoteNumber: number;
  numberingLockedAt?: string;
  payTo: StudioPayTo;
  attachPdf: boolean;
  /** Days before due for pre-due reminder; null = off. */
  preDueReminderDays: number | null;
  receiptEmails: boolean;
  /** Pro: send reviewed term drafts on lead date. */
  autoSendTermInvoices?: boolean;
  tailoredPreDueDays?: number;
  tailoredPreDueNote?: string;
}
export interface ClientNote {
  id: string;
  subjectType: "student" | "family";
  subjectId: string;
  authorName: string;
  body: string;
  category: "lesson" | "general" | "billing" | "pastoral";
  visibility: "private" | "shared";
  pinned: boolean;
  createdAt: string;
  lessonOccurrenceId?: string;
}

export interface Conversation { id: string; familyId: string; lastMessageAt: string; unreadCount: number }
export interface Message {
  id: string;
  conversationId: string;
  authorName: string;
  authorRole: "teacher" | "guardian" | "student";
  body: string;
  kind: "text" | "voice" | "video" | "image";
  sentAt: string;
  readAt?: string;
  media?: { url?: string; thumbnailUrl?: string; durationSeconds?: number; fileName?: string };
  lessonSummary?: { lessonId: string; studentName: string; gradeGoal: string; readiness: number; date: string; passedCount?: number; requirementCount?: number; studentMinutes?: number; teacherMinutes?: number; notes?: string; voiceSeconds?: number };
  intakeRecordId?: string;
  welcomeSummary?: { studentName: string; practiceGoal: number };
  assignmentCard?: { assignmentId: string; label: "This week’s assignment" | "Video lesson" | "Feedback ready" };
}

export type Framework = "AMEB" | "Trinity" | "ABRSM" | "Custom";
export type CourseStage = 1 | 2 | 3 | 4 | 5;
export interface FrameworkSection { id: string; framework: Framework; grade: string; name: string; weightPct: number }
export interface FrameworkSlot { id: string; sectionId: string; label: string }
export interface StudentCourse { id: string; studentId: string; framework: Framework; grade: string; stream?: string; targetTerm: string; weeklyPracticeGoalMin: number; gradeHoursEstimate: number; status: "draft" | "active" | "archived"; templateId?: string; name?: string; archivedAt?: string }
export interface CourseItem { id: string; studentCourseId: string; sectionId: string; slotId?: string | undefined; title: string; composer?: string | undefined; stage: CourseStage; targetBpm?: number | undefined; currentBpm?: number | undefined; barsDone?: number | undefined; barsTotal?: number | undefined; updatedAt: string }
export interface TermMilestone { id: string; studentCourseId: string; termKey: string; courseItemId: string; targetStage: CourseStage }
export interface Feedback { id: string; courseItemId: string; occurrenceId?: string | undefined; submissionId?: string | undefined; outcome: "pass" | "stage_move" | "carry_over" | "needs_work"; newStage?: CourseStage | undefined; comment?: string | undefined; createdAt: string; shared?: boolean | undefined }
export type RequirementCategory = "scales" | "pieces" | "aural" | "sight-reading";
export interface Requirement { id: string; framework: Framework; grade: string; category: RequirementCategory; title: string }
export interface StudentProgress { studentId: string; requirementId: string; status: "not_started" | "learning" | "passed" }
export interface PracticeLog { id: string; studentId: string; date: string; minutes: number; loggedBy: "student" | "teacher"; assignmentTaskId?: string }
export interface RiskScore { studentId: string; score: number; band: "green" | "yellow" | "red"; reasons: string[] }

/** Prototype-only: the weekly slot that generates each student's lessons. */
export interface WeeklySlot { studentId: string; weekday: number; time: string; lessonTypeId: string; gradeGoal: string }

export interface Intake {
  experience: "beginner" | "transferring";
  previousGrades: string;
  theoryExams: string;
  instrument: "acoustic" | "digital" | "keyboard";
  goal: string;
  daysPerWeek: number;
  minutesPerDay: number;
  /** Optional medical / learning notes collected before health-notes consent. */
  healthNotes?: string;
}
export interface OnboardingRecord { id: string; studentId: string; intake: Intake | null; diagnostic: Record<string, CourseStage>; practiceGoal: number; status: "intake_sent" | "intake_done" | "welcome_done" | "active"; completedAt?: string }
export interface ContentItem { id: string; kind: "text" | "link" | "file" | "video" | "video_link" | "audio" | "checklist"; title: string; body?: string; url?: string; mediaPlaceholder?: string; supplied?: boolean }
export interface LessonTemplate { id: string; name: string; isWelcomeDefault: boolean; steps: { contentItemId: string; note?: string }[]; supplied?: boolean; audience: "beginner" | "transferring" }
export interface CourseTemplate { id: string; name: string; framework: Framework; grade: string; sections: { name: string; weightPct: number; items: string[] }[]; defaultMilestones: { termOffset: number; targetStage: CourseStage }[]; supplied?: boolean }
export interface AssignmentTask { id: string; courseItemId?: string; contentItemId?: string | undefined; text: string; minutesPerDay: number; daysPerWeek: number; submissionRequested: "none" | "audio" | "video"; done: boolean }
export interface Assignment { id: string; studentId: string; occurrenceId: string; dueDate: string; tasks: AssignmentTask[]; demoClip?: boolean }
export interface Submission {
  id: string;
  assignmentTaskId: string;
  kind: "audio" | "video";
  durationSec: number;
  submittedBy: "student" | "guardian";
  guardianApproved: boolean;
  status: "waiting_review" | "reviewed";
  createdAt: string;
  comment?: string;
  replyKind?: "voice" | "video";
  outcome?: Feedback["outcome"];
  /** Optional phone gallery upload (HEIC/MOV/MP4 etc. kept as session object URL in the prototype). */
  fileName?: string;
  mediaUrl?: string;
  mimeType?: string;
}
