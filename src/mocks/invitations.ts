import type { AcceptanceRelationship } from "./terms";
import type { Lang } from "./types";

export type InvitationStatus = "sent" | "opened" | "completed" | "expired" | "revoked";

export type InviteInstrument = "acoustic" | "digital" | "keyboard" | "not_yet";
export type InviteExperience = "beginner" | "transferring";
export type InviteGoalKind = "exams" | "fun" | "school" | "other";
export type ExamBoard = "AMEB" | "Trinity" | "ABRSM" | "unsure";

export type ChildAnswers = {
  firstName: string;
  lastName: string;
  birthYear: number;
  dateOfBirth?: string;
  experience?: InviteExperience;
  previousGrades?: string;
  theoryExams?: string;
  instrument?: InviteInstrument;
  goalKind?: InviteGoalKind;
  examBoard?: ExamBoard;
  goalOther?: string;
  daysPerWeek?: number;
  minutesPerDay?: number;
  minutesOther?: string;
  teacherNotes?: string;
  healthNotes?: string;
  emergencyMedical?: boolean | null;
  healthNotesConsent?: boolean | null;
  mediaPublic?: boolean | null;
};

export type FamilyAnswers = {
  fillerName?: string;
  relationship?: AcceptanceRelationship | "";
  mobile?: string;
  collectionAcknowledged?: boolean;
  turnstileUnlocked?: boolean;
  terms?: {
    studioAgreed?: boolean;
    keystoneAgreed?: boolean;
    guardianDeclaration?: boolean;
    typedName?: string;
    relationship?: AcceptanceRelationship | "";
  };
};

export type IntakeResponseRecord = {
  id: string;
  invitationId: string;
  studentId: string | null;
  answers: FamilyAnswers & { children?: Record<string, ChildAnswers> };
  currentStep: string;
  submittedAt: string | null;
  updatedAt: string;
  createdAt: string;
};

export type InvitationRecord = {
  id: string;
  studioId: string;
  familyId: string;
  email: string;
  language: Lang;
  tokenHash: string;
  /** Raw token retained only for the most recently issued mock invite so demos can open /join/{token}. Never returned from APIs. */
  _rawToken?: string;
  status: InvitationStatus;
  expiresAt: string;
  sentAt: string;
  openedAt: string | null;
  completedAt: string | null;
  reminderCount: number;
  lastReminderAt: string | null;
  createdBy: string;
  studentIds: string[];
  enrolmentDraftIds: string[];
  createdAt: string;
};

export type EmailLogRecord = {
  id: string;
  studioId: string;
  invitationId: string;
  kind: "invite" | "reminder" | "login_link";
  toEmail: string;
  resendId: string | null;
  status: string;
  error: string | null;
  sentAt: string;
};

export type AuthAuditEvent =
  | "invite_opened"
  | "invite_submitted"
  | "invite_resent"
  | "magic_link_requested"
  | "sign_in"
  | "mfa_enrolled"
  | "mfa_removed"
  | "token_rejected";

export type AuthAuditRecord = {
  id: string;
  studioId: string;
  actorUserId: string | null;
  guardianId: string | null;
  event: AuthAuditEvent;
  ip: string | null;
  userAgent: string | null;
  at: string;
};

export type RateBucket = { ip: string; at: number; kind: "token" | "captcha" | "admin" };
export type Lockout = { ip: string; until: number };

export type InvitationState = {
  invitations: InvitationRecord[];
  intakes: IntakeResponseRecord[];
  emailLogs: EmailLogRecord[];
  authAudit: AuthAuditRecord[];
  rateBuckets: RateBucket[];
  lockouts: Lockout[];
  /** Fixture clock override for reminder tests (ISO date YYYY-MM-DD or full ISO). */
  clockNow: string | null;
};

export const invitationState: InvitationState = {
  invitations: [],
  intakes: [],
  emailLogs: [],
  authAudit: [],
  rateBuckets: [],
  lockouts: [],
  clockNow: null,
};

export function resetInvitationState() {
  invitationState.invitations = [];
  invitationState.intakes = [];
  invitationState.emailLogs = [];
  invitationState.authAudit = [];
  invitationState.rateBuckets = [];
  invitationState.lockouts = [];
  invitationState.clockNow = null;
}
