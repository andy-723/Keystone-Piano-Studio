// Attendance and make-up credit rules for real studios (0025). Pure: used by the server, the
// screens and the tests. Dates are "YYYY-MM-DD" in the studio's own timezone.
import { addDays } from "@/lib/lesson-calendar";

export type AttendanceStatus =
  "attended" | "absent" | "cancelled_by_studio" | "cancelled_with_notice" | "cancelled_late";

export const ATTENDANCE_STATUSES: AttendanceStatus[] = [
  "attended",
  "absent",
  "cancelled_by_studio",
  "cancelled_with_notice",
  "cancelled_late",
];

export const ATTENDANCE_LABELS: Record<AttendanceStatus, string> = {
  attended: "Attended",
  absent: "Absent (no-show)",
  cancelled_by_studio: "Cancelled by studio",
  cancelled_with_notice: "Family cancelled with notice",
  cancelled_late: "Family cancelled late",
};

export const isAttendanceStatus = (value: unknown): value is AttendanceStatus =>
  typeof value === "string" && (ATTENDANCE_STATUSES as string[]).includes(value);

export const isCancellation = (status: AttendanceStatus) => status.startsWith("cancelled_");

/** A lesson that hasn't happened yet can only be marked as cancelled. */
export const canMarkFuture = isCancellation;

/** Days a make-up credit lasts in the pilot (no term dates yet), and one "Extend" step. */
export const CREDIT_DAYS = 90;
export const EXTEND_DAYS = 30;

export type AttendanceMark = {
  occurrenceKey: string;
  seriesId: string | null;
  studentId: string;
  lessonDate: string;
  status: AttendanceStatus;
  credit: boolean;
  markedAt: string;
};

/**
 * Whether a mark earns a make-up credit (D2, accepted 23 Nov 2026).
 *  - Cancelled by studio: always.
 *  - Family cancelled with notice: yes unless the teacher unticks it.
 *  - Family cancelled late, absent: no unless the teacher ticks "Give a make-up anyway" (goodwill).
 *  - Attended: never.
 */
export function earnsCredit(status: AttendanceStatus, giveCredit?: boolean | null): boolean {
  if (status === "attended") return false;
  if (status === "cancelled_by_studio") return true;
  if (status === "cancelled_with_notice") return giveCredit ?? true;
  return giveCredit ?? false;
}

export type EarnReason = "studio_cancel" | "family_notice" | "goodwill";
export type CreditReason = EarnReason | "makeup_booked" | "makeup_removed" | "undone" | "extended";

export function earnReason(status: AttendanceStatus): EarnReason {
  if (status === "cancelled_by_studio") return "studio_cancel";
  if (status === "cancelled_with_notice") return "family_notice";
  return "goodwill";
}

export const CREDIT_REASON_LABELS: Record<CreditReason, string> = {
  studio_cancel: "Cancelled by studio",
  family_notice: "Family cancelled with notice",
  goodwill: "Goodwill make-up",
  makeup_booked: "Make-up booked",
  makeup_removed: "Make-up removed, credit given back",
  undone: "Credit undone",
  extended: "Expiry extended",
};

/** One row of the append-only ledger (makeup_credit). */
export type CreditEntry = {
  id: string;
  studioId: string;
  studentId: string;
  amount: 1 | 0 | -1;
  reason: CreditReason;
  /** The lesson that earned the credit (earning rows only). */
  occurrenceKey: string | null;
  /** The credit a booking, give-back, undo or extension is about. null on earning rows. */
  appliesTo: string | null;
  makeupSeriesId: string | null;
  expiresOn: string | null;
  createdAt: string;
};

export type CreditState = "available" | "booked" | "expired" | "undone";

/** A credit (an earning row) with everything that happened to it since. */
export type CreditLot = {
  id: string;
  studentId: string;
  reason: EarnReason;
  occurrenceKey: string | null;
  earnedAt: string;
  expiresOn: string;
  state: CreditState;
  /** The make-up lesson this credit is booked into (state "booked"). */
  makeupSeriesId: string | null;
};

const isEarning = (entry: CreditEntry) => entry.appliesTo === null && entry.amount === 1;

/** Folds the ledger into credits, oldest first. */
export function creditLots(entries: CreditEntry[], today: string): CreditLot[] {
  const ordered = [...entries].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const lots = new Map<string, CreditLot & { bookings: number }>();
  for (const entry of ordered) {
    if (isEarning(entry)) {
      lots.set(entry.id, {
        id: entry.id,
        studentId: entry.studentId,
        reason: entry.reason as EarnReason,
        occurrenceKey: entry.occurrenceKey,
        earnedAt: entry.createdAt,
        expiresOn: entry.expiresOn ?? today,
        state: "available",
        makeupSeriesId: null,
        bookings: 0,
      });
      continue;
    }
    const lot = entry.appliesTo ? lots.get(entry.appliesTo) : undefined;
    if (!lot) continue;
    if (entry.reason === "undone") lot.state = "undone";
    else if (entry.reason === "makeup_booked") {
      lot.bookings += 1;
      lot.makeupSeriesId = entry.makeupSeriesId;
    } else if (entry.reason === "makeup_removed") {
      lot.bookings = Math.max(0, lot.bookings - 1);
      if (!lot.bookings) lot.makeupSeriesId = null;
    } else if (entry.reason === "extended" && entry.expiresOn && entry.expiresOn > lot.expiresOn)
      lot.expiresOn = entry.expiresOn;
  }
  return [...lots.values()].map(({ bookings, ...lot }) => ({
    ...lot,
    state:
      lot.state === "undone"
        ? "undone"
        : bookings > 0
          ? "booked"
          : lot.expiresOn < today
            ? "expired"
            : "available",
  }));
}

export const creditBalance = (lots: CreditLot[]) =>
  lots.filter((lot) => lot.state === "available").length;

/** The credit a new make-up uses: the one that runs out first. */
export function nextCreditToUse(lots: CreditLot[]): CreditLot | null {
  return (
    lots
      .filter((lot) => lot.state === "available")
      .sort(
        (a, b) => a.expiresOn.localeCompare(b.expiresOn) || a.earnedAt.localeCompare(b.earnedAt),
      )
      .at(0) ?? null
  );
}

/** The credit a lesson earned, if it still stands (not undone). */
export function lotForOccurrence(lots: CreditLot[], occurrenceKey: string): CreditLot | null {
  return lots.find((lot) => lot.occurrenceKey === occurrenceKey && lot.state !== "undone") ?? null;
}

/** Expiry for a credit earned today for a lesson on `lessonDate` (future cancellations count from the lesson). */
export function creditExpiry(today: string, lessonDate: string): string {
  return addDays(lessonDate > today ? lessonDate : today, CREDIT_DAYS);
}

/** New expiry after one "Extend": 30 days on from the later of today and the current expiry. */
export function extendedExpiry(today: string, current: string): string {
  return addDays(current > today ? current : today, EXTEND_DAYS);
}

/** Credits a student earned in the last 90 days (shown beside the studio's make-up allowance). */
export function creditsEarnedSince(lots: CreditLot[], since: string): number {
  return lots.filter((lot) => lot.state !== "undone" && lot.earnedAt.slice(0, 10) >= since).length;
}

/** What the change from one mark to another does to the ledger. */
export type CreditChange = "earn" | "undo" | "none";

export function creditChange(current: CreditLot | null, wantCredit: boolean): CreditChange {
  if (wantCredit && !current) return "earn";
  if (!wantCredit && current) return "undo";
  return "none";
}

/** The studio's lesson rules from its published studio terms (merge values), with defaults. */
export type StudioLessonRules = {
  cancelNoticeHours: number;
  makeUpAllowance: string;
};

export function lessonRulesFrom(
  mergeValues: Record<string, unknown> | null | undefined,
): StudioLessonRules {
  const policies = (mergeValues?.["policies"] ?? {}) as {
    cancelNoticeHours?: number;
    makeUpQuota?: number;
    makeUpPeriod?: string;
  };
  const hours = Number(policies.cancelNoticeHours);
  const quota = Number(policies.makeUpQuota);
  return {
    cancelNoticeHours: Number.isFinite(hours) && hours > 0 ? hours : 24,
    makeUpAllowance: `${Number.isFinite(quota) && quota >= 0 ? quota : 1} per ${policies.makeUpPeriod || "term"}`,
  };
}

/** What a family sees of a mark: no reasons, no credit decision. */
export type FamilyOutcome = "attended" | "cancelled" | "missed";

export function familyOutcome(status: AttendanceStatus): FamilyOutcome {
  if (status === "attended") return "attended";
  if (status === "absent") return "missed";
  return "cancelled";
}
