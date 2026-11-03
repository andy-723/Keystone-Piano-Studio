// Data shapes match the future REST API names. Money is always integer cents.
export type Lang = "en" | "zh-CN";
export type StudioPlan = "base" | "pro" | "academy";

export interface Studio {
  id: string;
  name: string;
  abn?: string;
  gstRegistered: boolean;
  timezone: "Australia/Melbourne";
  plan?: StudioPlan;
  asyncLessonPolicy?: "makeup_credit" | "counts_as_lesson";
}
export interface Teacher { id: string; name: string }
export interface Guardian { id: string; name: string; email: string; preferredLanguage: Lang; mobile?: string }
export interface Family { id: string; displayName: string; guardians: Guardian[]; mediaConsent?: boolean }
export interface Student { id: string; familyId: string; firstName: string; lastName: string; birthYear: number; examDate?: string; targetTerm?: string }
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

export type InvoiceStatus = "draft" | "sent" | "partially_paid" | "paid" | "overdue" | "void";
export interface InvoiceLine { description: string; qty: number; unitCents: number; taxCents: number; lineTotalCents: number }
export interface Invoice {
  id: string;
  number: string;
  familyId: string;
  status: InvoiceStatus;
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
  payments?: Payment[];
  xeroSyncedAt?: string;
}

export interface Payment { id: string; invoiceId: string; method: "payto" | "becs" | "card"; amountCents: number; date: string; xeroSyncedAt?: string }
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
export interface StudentCourse { id: string; studentId: string; framework: Framework; grade: string; stream?: string; targetTerm: string; weeklyPracticeGoalMin: number; gradeHoursEstimate: number; status: "draft" | "active" }
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

export interface Intake { experience: "beginner" | "transferring"; previousGrades: string; theoryExams: string; instrument: "acoustic" | "digital" | "keyboard"; goal: string; daysPerWeek: number; minutesPerDay: number; policiesRead: boolean }
export interface OnboardingRecord { id: string; studentId: string; intake: Intake | null; diagnostic: Record<string, CourseStage>; practiceGoal: number; status: "intake_sent" | "intake_done" | "welcome_done" | "active"; completedAt?: string }
export interface ContentItem { id: string; kind: "text" | "link" | "file" | "video" | "audio" | "checklist"; title: string; body?: string; url?: string; mediaPlaceholder?: string; supplied?: boolean }
export interface LessonTemplate { id: string; name: string; isWelcomeDefault: boolean; steps: { contentItemId: string; note?: string }[]; supplied?: boolean; audience: "beginner" | "transferring" }
export interface CourseTemplate { id: string; name: string; framework: Framework; grade: string; sections: { name: string; weightPct: number; items: string[] }[]; defaultMilestones: { termOffset: number; targetStage: CourseStage }[]; supplied?: boolean }
export interface AssignmentTask { id: string; courseItemId?: string; text: string; minutesPerDay: number; daysPerWeek: number; submissionRequested: "none" | "audio" | "video"; done: boolean }
export interface Assignment { id: string; studentId: string; occurrenceId: string; dueDate: string; tasks: AssignmentTask[]; demoClip?: boolean }
export interface Submission { id: string; assignmentTaskId: string; kind: "audio" | "video"; durationSec: number; submittedBy: "student" | "guardian"; guardianApproved: boolean; status: "waiting_review" | "reviewed"; createdAt: string; comment?: string; replyKind?: "voice" | "video"; outcome?: Feedback["outcome"] }
