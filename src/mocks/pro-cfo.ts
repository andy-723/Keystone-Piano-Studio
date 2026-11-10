/**
 * Pro CFO session fixtures — contractor payouts + Xero reconciliation queue.
 * Mock-only; not a live Xero API or general ledger.
 */

import { PROTOTYPE_TODAY, melbourneIso } from "@/lib/calendar";

export type ProCfoTeacherKind = "owner" | "contractor";

export type ProCfoTeacher = {
  id: string;
  name: string;
  kind: ProCfoTeacherKind;
  /** Lessons taught in the CFO reporting window (rolling 12 months ending prototype today). */
  lessonsTaught: number;
  /** Contractor rate per lesson; owners keep studio margin instead. */
  rateCentsPerLesson: number;
  abn?: string;
};

export type ProCfoXeroQueueStatus = "pending" | "failed" | "synced";

export type ProCfoXeroQueueItem = {
  id: string;
  invoiceId: string;
  status: ProCfoXeroQueueStatus;
  lastError?: string;
  attemptedAt?: string;
};

/** ATO GST registration turnover threshold (informational radar). */
export const GST_TURNOVER_THRESHOLD_CENTS = 7_500_000;

export const proCfoTeachers: ProCfoTeacher[] = [
  {
    id: "teacher-1",
    name: "Ms Margaret Clarke",
    kind: "owner",
    lessonsTaught: 186,
    rateCentsPerLesson: 0,
  },
  {
    id: "teacher-2",
    name: "Alex Chen",
    kind: "contractor",
    lessonsTaught: 42,
    rateCentsPerLesson: 3500,
    abn: "53 004 085 616",
  },
  {
    id: "teacher-3",
    name: "Priya Nair",
    kind: "contractor",
    lessonsTaught: 28,
    rateCentsPerLesson: 3200,
    abn: "98 765 432 109",
  },
];

/** Forced fail / pending rows for the Xero ops queue (merged with live invoice sync stamps). */
export const proCfoXeroQueue: ProCfoXeroQueueItem[] = [
  {
    id: "xero-q-fail-1",
    invoiceId: "inv-1",
    status: "failed",
    lastError: "Xero validation: contact tax number missing (mock)",
    attemptedAt: melbourneIso(PROTOTYPE_TODAY, "09:12"),
  },
  {
    id: "xero-q-fail-2",
    invoiceId: "inv-2",
    status: "failed",
    lastError: "Transient 503 from Xero (mock)",
    attemptedAt: melbourneIso(PROTOTYPE_TODAY, "09:14"),
  },
];

/** Ids that should keep failing until cleared — simulates sticky fail then success on second retry. */
export const proCfoXeroStickyFails = new Set<string>(["inv-2"]);

export function resetProCfoState(): void {
  proCfoTeachers.splice(
    0,
    proCfoTeachers.length,
    {
      id: "teacher-1",
      name: "Ms Margaret Clarke",
      kind: "owner",
      lessonsTaught: 186,
      rateCentsPerLesson: 0,
    },
    {
      id: "teacher-2",
      name: "Alex Chen",
      kind: "contractor",
      lessonsTaught: 42,
      rateCentsPerLesson: 3500,
      abn: "53 004 085 616",
    },
    {
      id: "teacher-3",
      name: "Priya Nair",
      kind: "contractor",
      lessonsTaught: 28,
      rateCentsPerLesson: 3200,
      abn: "98 765 432 109",
    },
  );
  proCfoXeroQueue.splice(
    0,
    proCfoXeroQueue.length,
    {
      id: "xero-q-fail-1",
      invoiceId: "inv-1",
      status: "failed",
      lastError: "Xero validation: contact tax number missing (mock)",
      attemptedAt: melbourneIso(PROTOTYPE_TODAY, "09:12"),
    },
    {
      id: "xero-q-fail-2",
      invoiceId: "inv-2",
      status: "failed",
      lastError: "Transient 503 from Xero (mock)",
      attemptedAt: melbourneIso(PROTOTYPE_TODAY, "09:14"),
    },
  );
  proCfoXeroStickyFails.clear();
  proCfoXeroStickyFails.add("inv-2");
}
