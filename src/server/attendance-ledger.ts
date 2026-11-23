import { getAttendanceStore } from "./attendance-store";
import { ProblemError } from "./problem";
import {
  creditChange,
  creditExpiry,
  creditLots,
  earnReason,
  earnsCredit,
  lotForOccurrence,
  type AttendanceMark,
  type AttendanceStatus,
  type CreditChange,
  type CreditLot,
} from "@/lib/makeup-credits";

/**
 * Ledger steps shared by the calendar and the attendance screens (0025). These only touch the
 * attendance store: callers have already checked the staff role for the studio.
 */
export type MarkTarget = {
  occurrenceKey: string;
  seriesId: string | null;
  studentId: string;
  /** The day the lesson falls on (after any move). */
  lessonDate: string;
};

export type MarkPlan = {
  studioId: string;
  target: MarkTarget;
  status: AttendanceStatus | null;
  wantCredit: boolean;
  change: CreditChange;
  current: CreditLot | null;
};

export class CreditInUse extends ProblemError {
  constructor() {
    super(
      409,
      "Make-up already booked",
      "This lesson's make-up credit is booked into a make-up lesson. Remove that make-up first, then change this mark.",
      "https://keystone.music/problems/credit-in-use",
      "credit_in_use",
    );
  }
}

/** Reads and checks only: throws before anything is written. */
export async function planMark(
  studioId: string,
  target: MarkTarget,
  status: AttendanceStatus | null,
  giveCredit: boolean | null | undefined,
  today: string,
): Promise<MarkPlan> {
  const ledger = await getAttendanceStore().listCredits(studioId, [target.studentId]);
  const current = lotForOccurrence(creditLots(ledger, today), target.occurrenceKey);
  const wantCredit = status ? earnsCredit(status, giveCredit) : false;
  const change = creditChange(current, wantCredit);
  if (change === "undo" && current?.state === "booked") throw new CreditInUse();
  return { studioId, target, status, wantCredit, change, current };
}

export async function commitMark(
  plan: MarkPlan,
  actorUserId: string | null,
  today: string,
): Promise<AttendanceMark | null> {
  const store = getAttendanceStore();
  const { studioId, target, status } = plan;
  const createdBy = isUuid(actorUserId) ? actorUserId : null;
  if (plan.change === "earn" && status) {
    await store.addCredit(studioId, {
      studioId,
      studentId: target.studentId,
      amount: 1,
      reason: earnReason(status),
      occurrenceKey: target.occurrenceKey,
      appliesTo: null,
      makeupSeriesId: null,
      expiresOn: creditExpiry(today, target.lessonDate),
      createdBy,
    });
  } else if (plan.change === "undo" && plan.current) {
    await store.addCredit(studioId, {
      studioId,
      studentId: target.studentId,
      amount: -1,
      reason: "undone",
      occurrenceKey: null,
      appliesTo: plan.current.id,
      makeupSeriesId: null,
      expiresOn: null,
      createdBy,
    });
  }
  if (!status) {
    await store.deleteMark(studioId, target.occurrenceKey);
    return null;
  }
  return store.saveMark(studioId, {
    ...target,
    status,
    credit: plan.wantCredit,
    markedBy: createdBy,
  });
}

/** A make-up lesson was deleted: its credit goes back to the student. Never throws. */
export async function giveBackMakeUpCredit(
  studioId: string,
  studentId: string,
  makeupSeriesId: string,
  actorUserId: string | null,
  today: string,
) {
  try {
    const store = getAttendanceStore();
    const lots = creditLots(await store.listCredits(studioId, [studentId]), today);
    for (const lot of lots.filter(
      (entry) => entry.state === "booked" && entry.makeupSeriesId === makeupSeriesId,
    )) {
      await store.addCredit(studioId, {
        studioId,
        studentId,
        amount: 1,
        reason: "makeup_removed",
        occurrenceKey: null,
        appliesTo: lot.id,
        makeupSeriesId: null,
        expiresOn: null,
        createdBy: isUuid(actorUserId) ? actorUserId : null,
      });
    }
  } catch (error) {
    console.error("[attendance] make-up credit not given back", (error as Error).message);
  }
}

/**
 * Weeks dropped from a weekly lesson (changed or stopped) lose their cancellation marks, and any
 * unused credit those marks earned. A credit already booked into a make-up stays. Never throws.
 */
export async function clearDroppedMarks(
  studioId: string,
  targets: MarkTarget[],
  actorUserId: string | null,
  today: string,
) {
  for (const target of targets) {
    try {
      const mark = await getAttendanceStore().getMark(studioId, target.occurrenceKey);
      if (!mark) continue;
      const plan = await planMark(studioId, target, null, null, today);
      await commitMark(plan, actorUserId, today);
    } catch (error) {
      if (!(error instanceof CreditInUse))
        console.error("[attendance] dropped mark not cleared", (error as Error).message);
    }
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** The demo teacher has no auth.users row; only real user ids are stored as who did it. */
export const isUuid = (value: string | null | undefined): value is string =>
  typeof value === "string" && UUID.test(value);
