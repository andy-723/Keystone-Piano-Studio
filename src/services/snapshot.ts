import { addDays } from "@/lib/calendar";
import { studioToday } from "@/lib/studio-clock";
import {
  eachDateInclusive,
  inRange,
  snapshotBounds,
  type SnapshotBounds,
  type SnapshotRangeKey,
} from "@/lib/snapshot-range";
import { families, payments, practiceLogs, students } from "@/mocks/data";
import type { Invoice, LessonStatus, PracticeLog } from "@/mocks/types";
import { enrichInvoice, getInvoices } from "@/services/billing";
import {
  ensureDemoIncompleteInvites,
  listIncompleteInvitations,
  resendInvitation,
  type PublicInvitationStatus,
} from "@/services/invitations";
import { getStudents, type StudentSummary } from "@/services/roster";
import { listDayLessonsSync } from "@/services/schedule";
import { respond } from "./_delay";

/** Expected student practice minutes in the selected range before counting as "at risk". */
const PRACTICE_THRESHOLD_MINUTES: Record<SnapshotRangeKey, number> = {
  week: 60,
  month: 240,
};

export type SnapshotTileId =
  | "revenue"
  | "overdue"
  | "students"
  | "invites"
  | "practice"
  | "lessons";

export type SnapshotPaidInvoiceRow = {
  invoiceId: string;
  number: string;
  familyId: string;
  familyName: string;
  paidInRangeCents: number;
  totalCents: number;
  receivedOn: string;
  status: Invoice["status"];
};

export type SnapshotOverdueRow = {
  invoiceId: string;
  number: string;
  familyId: string;
  familyName: string;
  balanceCents: number;
  dueDate: string;
  daysOverdue: number;
};

export type SnapshotStudentRow = {
  studentId: string;
  name: string;
  familyName: string;
  gradeGoal: string;
  riskBand: StudentSummary["risk"]["band"];
};

export type SnapshotInviteRow = PublicInvitationStatus & {
  familyName: string;
  studentNames: string;
};

export type SnapshotPracticeRow = {
  studentId: string;
  name: string;
  familyName: string;
  minutesInRange: number;
  lastPracticeDate: string | null;
  reason: string;
};

export type SnapshotLessonRow = {
  occurrenceId: string;
  date: string;
  studentId: string;
  studentName: string;
  status: LessonStatus;
  startsAt: string;
};

export type StudioSnapshot = {
  bounds: SnapshotBounds;
  asOf: string;
  revenueCollectedCents: number;
  paidInvoices: SnapshotPaidInvoiceRow[];
  overdueCents: number;
  overdueInvoices: SnapshotOverdueRow[];
  activeStudents: SnapshotStudentRow[];
  incompleteInvites: SnapshotInviteRow[];
  practiceAtRisk: SnapshotPracticeRow[];
  lessons: {
    taught: number;
    cancelled: number;
    noShow: number;
    scheduled: number;
    rows: SnapshotLessonRow[];
  };
};

function familyName(familyId: string) {
  return families.find((family) => family.id === familyId)?.displayName ?? "Family";
}

function studentName(studentId: string) {
  const student = students.find((entry) => entry.id === studentId);
  return student ? `${student.firstName} ${student.lastName}` : "Student";
}

function minutesInRange(logs: PracticeLog[], studentId: string, start: string, end: string) {
  return logs
    .filter(
      (log) =>
        log.studentId === studentId && log.loggedBy === "student" && inRange(log.date, start, end),
    )
    .reduce((sum, log) => sum + log.minutes, 0);
}

function lastPracticeDate(logs: PracticeLog[], studentId: string, end: string) {
  const dates = logs
    .filter((log) => log.studentId === studentId && log.loggedBy === "student" && log.date <= end)
    .map((log) => log.date)
    .sort();
  return dates.at(-1) ?? null;
}

function buildRevenue(invoices: Invoice[], start: string, end: string): {
  revenueCollectedCents: number;
  paidInvoices: SnapshotPaidInvoiceRow[];
} {
  const byInvoice = new Map<string, SnapshotPaidInvoiceRow>();
  let revenueCollectedCents = 0;
  for (const payment of payments) {
    if (payment.amountCents <= 0 || !inRange(payment.receivedOn ?? payment.date ?? "", start, end)) {
      continue;
    }
    revenueCollectedCents += payment.amountCents;
    const invoice = invoices.find((entry) => entry.id === payment.invoiceId);
    if (!invoice) continue;
    const existing = byInvoice.get(invoice.id);
    if (existing) {
      existing.paidInRangeCents += payment.amountCents;
      if (payment.receivedOn && payment.receivedOn > existing.receivedOn) {
        existing.receivedOn = payment.receivedOn;
      }
      continue;
    }
    byInvoice.set(invoice.id, {
      invoiceId: invoice.id,
      number: invoice.number ?? "Draft",
      familyId: invoice.familyId,
      familyName: familyName(invoice.familyId),
      paidInRangeCents: payment.amountCents,
      totalCents: invoice.totalCents,
      receivedOn: payment.receivedOn ?? payment.date ?? "",
      status: invoice.status,
    });
  }
  return {
    revenueCollectedCents,
    paidInvoices: [...byInvoice.values()].sort((a, b) => b.receivedOn.localeCompare(a.receivedOn)),
  };
}

function buildOverdue(invoices: Invoice[], today: string): {
  overdueCents: number;
  overdueInvoices: SnapshotOverdueRow[];
} {
  const overdueInvoices = invoices
    .map((invoice) => enrichInvoice(invoice, today))
    .filter((invoice) => invoice.isOverdue)
    .map((invoice) => ({
      invoiceId: invoice.id,
      number: invoice.number ?? "—",
      familyId: invoice.familyId,
      familyName: familyName(invoice.familyId),
      balanceCents: invoice.balanceCents ?? invoice.totalCents,
      dueDate: invoice.dueDate,
      daysOverdue: invoice.daysOverdue ?? 0,
    }))
    .sort((a, b) => b.daysOverdue - a.daysOverdue || a.dueDate.localeCompare(b.dueDate));
  return {
    overdueCents: overdueInvoices.reduce((sum, row) => sum + row.balanceCents, 0),
    overdueInvoices,
  };
}

function practiceWindow(
  range: SnapshotRangeKey,
  boundsStart: string,
  today: string,
): { start: string; end: string; quietDays: number } {
  // Week uses a rolling 7 days ending today so Monday's snapshot still has practice history.
  if (range === "week") {
    return { start: addDays(today, -6), end: today, quietDays: 7 };
  }
  return { start: boundsStart, end: today, quietDays: 14 };
}

function buildPracticeAtRisk(
  roster: StudentSummary[],
  boundsStart: string,
  today: string,
  range: SnapshotRangeKey,
): SnapshotPracticeRow[] {
  const threshold = PRACTICE_THRESHOLD_MINUTES[range];
  const { start, end, quietDays } = practiceWindow(range, boundsStart, today);
  const quietSince = addDays(end, -quietDays + 1);
  return roster
    .map((student) => {
      const minutes = minutesInRange(practiceLogs, student.id, start, end);
      const last = lastPracticeDate(practiceLogs, student.id, end);
      const quiet = !last || last < quietSince;
      const below = minutes < threshold;
      if (!quiet && !below) return null;
      const reasons: string[] = [];
      if (quiet) reasons.push(`No practice logged in ${quietDays} days`);
      if (below) reasons.push(`Below ${threshold} min (${minutes} min)`);
      return {
        studentId: student.id,
        name: `${student.firstName} ${student.lastName}`,
        familyName: student.familyName,
        minutesInRange: minutes,
        lastPracticeDate: last,
        reason: reasons.join(" · "),
      } satisfies SnapshotPracticeRow;
    })
    .filter((row): row is SnapshotPracticeRow => row !== null)
    .sort((a, b) => a.minutesInRange - b.minutesInRange || a.name.localeCompare(b.name));
}

function buildLessons(start: string, end: string, today: string) {
  const through = end < today ? end : today;
  const rows: SnapshotLessonRow[] = [];
  for (const date of eachDateInclusive(start, through)) {
    const day = listDayLessonsSync(date);
    for (const lesson of day.lessons) {
      rows.push({
        occurrenceId: lesson.id,
        date,
        studentId: lesson.studentId,
        studentName: `${lesson.student.firstName} ${lesson.student.lastName}`,
        status: lesson.status,
        startsAt: lesson.startsAt,
      });
    }
  }
  const taught = rows.filter((row) => row.status === "attended").length;
  const cancelled = rows.filter(
    (row) => row.status === "cancelled_by_studio" || row.status === "cancelled_late",
  ).length;
  const noShow = rows.filter((row) => row.status === "absent").length;
  const scheduled = rows.filter((row) => row.status === "scheduled").length;
  return {
    taught,
    cancelled,
    noShow,
    scheduled,
    rows: rows.sort((a, b) => b.date.localeCompare(a.date) || a.startsAt.localeCompare(b.startsAt)),
  };
}

export async function getStudioSnapshot(
  range: SnapshotRangeKey = "week",
  today: string = studioToday(),
): Promise<StudioSnapshot> {
  ensureDemoIncompleteInvites();
  const bounds = snapshotBounds(range, today);
  const [invoices, roster, invites] = await Promise.all([
    getInvoices(),
    getStudents(),
    listIncompleteInvitations(),
  ]);
  const revenue = buildRevenue(invoices, bounds.start, bounds.end);
  const overdue = buildOverdue(invoices, today);
  const activeStudents: SnapshotStudentRow[] = roster.map((student) => ({
    studentId: student.id,
    name: `${student.firstName} ${student.lastName}`,
    familyName: student.familyName,
    gradeGoal: student.gradeGoal,
    riskBand: student.risk.band,
  }));
  const incompleteInvites: SnapshotInviteRow[] = invites.map((invite) => ({
    ...invite,
    familyName: familyName(invite.familyId),
    studentNames: invite.studentIds.map(studentName).join(", "),
  }));
  const practiceAtRisk = buildPracticeAtRisk(roster, bounds.start, today, range);
  const lessons = buildLessons(bounds.start, bounds.end, today);
  return respond({
    bounds,
    asOf: today,
    ...revenue,
    ...overdue,
    activeStudents,
    incompleteInvites,
    practiceAtRisk,
    lessons,
  });
}

export async function resendSnapshotInvitation(invitationId: string) {
  return resendInvitation(invitationId);
}

function csvEscape(cell: string | number | boolean) {
  return `"${String(cell).replaceAll('"', '""')}"`;
}

/** Build a CSV string for the currently open drill list. */
export function snapshotDrillCsv(
  tile: SnapshotTileId,
  snapshot: StudioSnapshot,
): { filename: string; csv: string } {
  const range = snapshot.bounds.key;
  switch (tile) {
    case "revenue":
      return {
        filename: `studio-revenue-${range}.csv`,
        csv: [
          ["number", "family", "paidInRangeCents", "totalCents", "receivedOn", "status"].join(","),
          ...snapshot.paidInvoices.map((row) =>
            [
              row.number,
              row.familyName,
              row.paidInRangeCents,
              row.totalCents,
              row.receivedOn,
              row.status,
            ]
              .map(csvEscape)
              .join(","),
          ),
        ].join("\n"),
      };
    case "overdue":
      return {
        filename: `studio-overdue-${range}.csv`,
        csv: [
          ["number", "family", "balanceCents", "dueDate", "daysOverdue"].join(","),
          ...snapshot.overdueInvoices.map((row) =>
            [row.number, row.familyName, row.balanceCents, row.dueDate, row.daysOverdue]
              .map(csvEscape)
              .join(","),
          ),
        ].join("\n"),
      };
    case "students":
      return {
        filename: `studio-students-${range}.csv`,
        csv: [
          ["student", "family", "gradeGoal", "riskBand"].join(","),
          ...snapshot.activeStudents.map((row) =>
            [row.name, row.familyName, row.gradeGoal, row.riskBand].map(csvEscape).join(","),
          ),
        ].join("\n"),
      };
    case "invites":
      return {
        filename: `studio-incomplete-invites-${range}.csv`,
        csv: [
          ["family", "email", "students", "status", "sentAt"].join(","),
          ...snapshot.incompleteInvites.map((row) =>
            [row.familyName, row.email, row.studentNames, row.status, row.sentAt]
              .map(csvEscape)
              .join(","),
          ),
        ].join("\n"),
      };
    case "practice":
      return {
        filename: `studio-practice-at-risk-${range}.csv`,
        csv: [
          ["student", "family", "minutesInRange", "lastPracticeDate", "reason"].join(","),
          ...snapshot.practiceAtRisk.map((row) =>
            [
              row.name,
              row.familyName,
              row.minutesInRange,
              row.lastPracticeDate ?? "",
              row.reason,
            ]
              .map(csvEscape)
              .join(","),
          ),
        ].join("\n"),
      };
    case "lessons":
      return {
        filename: `studio-lessons-${range}.csv`,
        csv: [
          ["date", "student", "status", "startsAt"].join(","),
          ...snapshot.lessons.rows.map((row) =>
            [row.date, row.studentName, row.status, row.startsAt].map(csvEscape).join(","),
          ),
        ].join("\n"),
      };
  }
}
