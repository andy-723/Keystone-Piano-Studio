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
export interface Guardian { id: string; name: string; email: string; preferredLanguage: Lang }
export interface Family { id: string; displayName: string; guardians: Guardian[] }
export interface Student { id: string; familyId: string; firstName: string; lastName: string; birthYear: number }
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
  termKey?: string;
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

export type Framework = "AMEB" | "Trinity" | "ABRSM";
export type RequirementCategory = "scales" | "pieces" | "aural" | "sight-reading";
export interface Requirement { id: string; framework: Framework; grade: string; category: RequirementCategory; title: string }
export interface StudentProgress { studentId: string; requirementId: string; status: "not_started" | "learning" | "passed" }
export interface PracticeLog { id: string; studentId: string; date: string; minutes: number; loggedBy: "student" | "teacher" }
export interface RiskScore { studentId: string; score: number; band: "green" | "yellow" | "red"; reasons: string[] }

/** Prototype-only: the weekly slot that generates each student's lessons. */
export interface WeeklySlot { studentId: string; weekday: number; time: string; lessonTypeId: string; gradeGoal: string }
