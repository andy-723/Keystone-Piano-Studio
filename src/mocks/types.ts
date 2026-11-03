// Data shapes match the future REST API names. Money is always integer cents.
export type Lang = "en" | "zh-CN";

export interface Studio {
  id: string;
  name: string;
  abn?: string;
  gstRegistered: boolean;
  timezone: "Australia/Melbourne";
}
export interface Teacher { id: string; name: string }
export interface Guardian { id: string; name: string; email: string; preferredLanguage: Lang; mobile?: string }
export interface Family { id: string; displayName: string; guardians: Guardian[] }
export interface Student { id: string; familyId: string; firstName: string; lastName: string; birthYear: number; examDate?: string; targetTerm?: string }
export interface LessonType { id: string; name: string; durationMin: number; priceCents: number }

export type LessonStatus = "scheduled" | "attended" | "absent" | "cancelled_by_studio" | "cancelled_late";
export interface LessonOccurrence {
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
}

export type Framework = "AMEB" | "Trinity" | "ABRSM" | "Custom";
export type CourseStage = 1 | 2 | 3 | 4 | 5;
export interface FrameworkSection { id: string; framework: Framework; grade: string; name: string; weightPct: number }
export interface FrameworkSlot { id: string; sectionId: string; label: string }
export interface StudentCourse { id: string; studentId: string; framework: Framework; grade: string; stream?: string; targetTerm: string; weeklyPracticeGoalMin: number; gradeHoursEstimate: number; status: "draft" | "active" }
export interface CourseItem { id: string; studentCourseId: string; sectionId: string; slotId?: string; title: string; composer?: string; stage: CourseStage; targetBpm?: number; currentBpm?: number; barsDone?: number; barsTotal?: number; updatedAt: string }
export interface TermMilestone { id: string; studentCourseId: string; termKey: string; courseItemId: string; targetStage: CourseStage }
export interface Feedback { id: string; courseItemId: string; occurrenceId?: string; submissionId?: string; outcome: "pass" | "stage_move" | "carry_over" | "needs_work"; newStage?: CourseStage; comment?: string; createdAt: string; shared?: boolean }
export type RequirementCategory = "scales" | "pieces" | "aural" | "sight-reading";
export interface Requirement { id: string; framework: Framework; grade: string; category: RequirementCategory; title: string }
export interface StudentProgress { studentId: string; requirementId: string; status: "not_started" | "learning" | "passed" }
export interface PracticeLog { id: string; studentId: string; date: string; minutes: number; loggedBy: "student" | "teacher" }
export interface RiskScore { studentId: string; score: number; band: "green" | "yellow" | "red"; reasons: string[] }

/** Prototype-only: the weekly slot that generates each student's lessons. */
export interface WeeklySlot { studentId: string; weekday: number; time: string; lessonTypeId: string; gradeGoal: string }
