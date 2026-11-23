import { createServerFn } from "@tanstack/react-start";
import {
  actorFrom,
  addLesson,
  assertOnSeries,
  authorizeCalendar,
  deleteLessons,
  loadSeries,
  pushSeries,
  type CalendarActor,
} from "./calendar";
import { getCalendarStore } from "./calendar-store";
import { getAttendanceStore } from "./attendance-store";
import { commitMark, isUuid, planMark, type MarkTarget } from "./attendance-ledger";
import { ProblemError } from "./problem";
import {
  addDays,
  expandLessons,
  isDate,
  todayIn,
  type LessonOccurrence,
} from "@/lib/lesson-calendar";
import {
  CREDIT_DAYS,
  creditBalance,
  creditLots,
  creditsEarnedSince,
  extendedExpiry,
  isAttendanceStatus,
  isCancellation,
  nextCreditToUse,
  type AttendanceMark,
  type AttendanceStatus,
  type CreditLot,
  type StudioLessonRules,
} from "@/lib/makeup-credits";

/**
 * Attendance and make-up credits for real studios (0025). Every function checks the staff role
 * (authorizeCalendar) before it touches the service-key stores, and scopes every query by the
 * studio id it checked. Rules: src/lib/makeup-credits.ts. Marking never changes an invoice, and
 * late fees are never added here.
 */

async function studioToday(studioId: string) {
  return todayIn(await getCalendarStore().studioTimezone(studioId));
}

// ---------------------------------------------------------------------------
// Marking
// ---------------------------------------------------------------------------
export type MarkLessonInput = {
  seriesId: string;
  originalDate: string;
  /** null clears the mark. */
  status: AttendanceStatus | null;
  /** The teacher's credit choice (D2). Left out: the default for the status. */
  giveCredit?: boolean | null;
};

/**
 * Marks one lesson. A cancellation also cancels the lesson on the calendar (and Google); marking a
 * cancelled lesson as attended or absent, or clearing its mark, puts it back.
 */
export async function markLesson(actor: CalendarActor, studioId: string, input: MarkLessonInput) {
  await authorizeCalendar(actor, studioId, "write");
  if (input.status !== null && !isAttendanceStatus(input.status))
    throw new ProblemError(400, "Choose what happened");
  const { series, exceptions } = await loadSeries(studioId, input.seriesId);
  assertOnSeries(series, input.originalDate);
  const store = getCalendarStore();
  const today = await studioToday(studioId);
  const exception = exceptions.find((e) => e.originalDate === input.originalDate) ?? null;
  const lessonDate =
    exception?.action === "move" && exception.newDate ? exception.newDate : input.originalDate;
  if (input.status && !isCancellation(input.status) && lessonDate > today)
    throw new ProblemError(
      400,
      "This lesson hasn't happened yet",
      "A future lesson can only be marked as cancelled.",
    );
  const target: MarkTarget = {
    occurrenceKey: `${series.id}_${input.originalDate}`,
    seriesId: series.id,
    studentId: series.studentId,
    lessonDate: exception?.action === "cancel" ? input.originalDate : lessonDate,
  };
  const plan = await planMark(studioId, target, input.status, input.giveCredit, today);

  const cancel = input.status !== null && isCancellation(input.status);
  let calendarChanged = false;
  let removedMoves: string[] = [];
  if (cancel && exception?.action !== "cancel") {
    await store.upsertException({
      studioId,
      seriesId: series.id,
      originalDate: input.originalDate,
      action: "cancel",
      newDate: null,
      newStartTime: null,
      createdBy: actor.userId,
    });
    removedMoves = exception?.action === "move" ? [exception.id] : [];
    calendarChanged = true;
    // A moved lesson that is cancelled is recorded on its usual day.
    target.lessonDate = input.originalDate;
  } else if (!cancel && exception?.action === "cancel") {
    await store.deleteException(studioId, exception.id);
    calendarChanged = true;
  }
  const mark = await commitMark(plan, actor.userId, today);
  if (calendarChanged) await pushSeries(studioId, series.id, removedMoves);
  return { mark, creditChange: plan.change };
}

/** "Mark all attended": every lesson on the day that isn't cancelled or marked yet. */
export async function markDayAttended(actor: CalendarActor, studioId: string, date: string) {
  await authorizeCalendar(actor, studioId, "write");
  if (!isDate(date)) throw new ProblemError(400, "Choose a date");
  const today = await studioToday(studioId);
  if (date > today)
    throw new ProblemError(
      400,
      "This day hasn't happened yet",
      "Mark lessons on or after the day.",
    );
  const { series, exceptions } = await getCalendarStore().listLessons(studioId, date, date);
  const lessons = expandLessons(series, exceptions, date, date).filter(
    (o) => o.date === date && o.status !== "cancelled",
  );
  const marks = await getAttendanceStore().listMarks(studioId, date, date);
  const marked = new Set(marks.map((m) => m.occurrenceKey));
  let count = 0;
  for (const lesson of lessons) {
    if (marked.has(lesson.key)) continue;
    const target = targetFor(lesson);
    const plan = await planMark(studioId, target, "attended", null, today);
    await commitMark(plan, actor.userId, today);
    count += 1;
  }
  return { marked: count };
}

const targetFor = (o: LessonOccurrence): MarkTarget => ({
  occurrenceKey: o.key,
  seriesId: o.seriesId,
  studentId: o.studentId,
  lessonDate: o.date,
});

// ---------------------------------------------------------------------------
// Lesson record (Snapshot and the student profile)
// ---------------------------------------------------------------------------
export type LessonRecordStatus = AttendanceStatus | "not_marked" | "cancelled";

export type LessonRecordRow = {
  key: string;
  studentId: string;
  studentName: string;
  date: string;
  startTime: string | null;
  /** not_marked: a past lesson with no mark. cancelled: cancelled on the calendar before marks. */
  status: LessonRecordStatus;
  credit: boolean;
};

async function lessonRecord(
  studioId: string,
  from: string,
  to: string,
  today: string,
  studentId?: string,
): Promise<LessonRecordRow[]> {
  const through = to < today ? to : today;
  if (through < from) return [];
  const calendar = getCalendarStore();
  const [{ series, exceptions }, students, marks] = await Promise.all([
    calendar.listLessons(studioId, from, through),
    calendar.listStudents(studioId),
    getAttendanceStore().listMarks(studioId, from, through, studentId),
  ]);
  const names = new Map(students.map((s) => [s.id, `${s.firstName} ${s.lastName}`.trim()]));
  const occurrences = expandLessons(series, exceptions, from, through).filter(
    (o) => (!studentId || o.studentId === studentId) && o.date >= from && o.date <= through,
  );
  const byKey = new Map(marks.map((m) => [m.occurrenceKey, m]));
  const rows: LessonRecordRow[] = occurrences.map((o) => {
    const mark = byKey.get(o.key);
    byKey.delete(o.key);
    return {
      key: o.key,
      studentId: o.studentId,
      studentName: names.get(o.studentId) ?? "Student removed",
      date: mark?.lessonDate ?? o.date,
      startTime: o.startTime,
      status: mark ? mark.status : o.status === "cancelled" ? "cancelled" : "not_marked",
      credit: mark?.credit ?? false,
    };
  });
  // Marks whose lesson has since been deleted from the calendar stay in the record.
  for (const mark of byKey.values()) {
    rows.push({
      key: mark.occurrenceKey,
      studentId: mark.studentId,
      studentName: names.get(mark.studentId) ?? "Student removed",
      date: mark.lessonDate,
      startTime: null,
      status: mark.status,
      credit: mark.credit,
    });
  }
  return rows.sort(
    (a, b) => b.date.localeCompare(a.date) || (a.startTime ?? "").localeCompare(b.startTime ?? ""),
  );
}

export async function getLessonRecord(
  actor: CalendarActor,
  studioId: string,
  input: { from: string; to: string },
) {
  await authorizeCalendar(actor, studioId, "read");
  if (!isDate(input.from) || !isDate(input.to) || input.to < input.from)
    throw new ProblemError(400, "Choose a date range");
  if (input.to > addDays(input.from, 400)) throw new ProblemError(400, "Choose a shorter range");
  const today = await studioToday(studioId);
  return { today, rows: await lessonRecord(studioId, input.from, input.to, today) };
}

// ---------------------------------------------------------------------------
// Make-up credits for one student
// ---------------------------------------------------------------------------
export type StudentMakeUps = {
  today: string;
  balance: number;
  earnedRecently: number;
  credits: CreditLot[];
  /** Make-up lessons booked with a credit: date and time from the calendar. */
  bookings: Array<{ seriesId: string; creditId: string; date: string; startTime: string }>;
  /** The last 12 weeks of lessons with their marks. */
  history: LessonRecordRow[];
  defaultDurationMin: number;
  lessonRules: StudioLessonRules;
};

/** Weeks of lessons the student profile lists. */
export const PROFILE_HISTORY_DAYS = 84;

export async function getStudentMakeUps(
  actor: CalendarActor,
  studioId: string,
  studentId: string,
): Promise<StudentMakeUps> {
  await authorizeCalendar(actor, studioId, "read");
  const calendar = getCalendarStore();
  const students = await calendar.listStudents(studioId);
  if (!students.some((s) => s.id === studentId))
    throw new ProblemError(404, "Student not found", "That student is not in this studio.");
  const today = await studioToday(studioId);
  const attendance = getAttendanceStore();
  const [ledger, history, lessonRules, upcoming] = await Promise.all([
    attendance.listCredits(studioId, [studentId]),
    lessonRecord(studioId, addDays(today, -(PROFILE_HISTORY_DAYS - 1)), today, today, studentId),
    attendance.lessonRules(studioId),
    calendar.listLessons(studioId, addDays(today, -365), addDays(today, 365)),
  ]);
  const credits = creditLots(ledger, today);
  const own = upcoming.series.filter((s) => s.studentId === studentId);
  const weekly = own
    .filter((s) => s.repeat === "weekly")
    .sort((a, b) => b.firstDate.localeCompare(a.firstDate))
    .at(0);
  const bookings = credits.flatMap((lot) => {
    const s = lot.state === "booked" ? own.find((x) => x.id === lot.makeupSeriesId) : undefined;
    return s
      ? [{ seriesId: s.id, creditId: lot.id, date: s.firstDate, startTime: s.startTime }]
      : [];
  });
  return {
    today,
    balance: creditBalance(credits),
    earnedRecently: creditsEarnedSince(credits, addDays(today, -CREDIT_DAYS)),
    credits: credits.sort((a, b) => b.earnedAt.localeCompare(a.earnedAt)),
    bookings,
    history,
    defaultDurationMin: weekly?.durationMin ?? own.at(-1)?.durationMin ?? 30,
    lessonRules,
  };
}

/** Books a one-off make-up lesson with the student's credit that runs out first. */
export async function bookMakeUp(
  actor: CalendarActor,
  studioId: string,
  input: {
    studentId: string;
    date: string;
    startTime: string;
    durationMin: number;
    allowClash?: boolean;
  },
) {
  await authorizeCalendar(actor, studioId, "write");
  const today = await studioToday(studioId);
  if (!isDate(input.date) || input.date < today)
    throw new ProblemError(400, "Choose a day from today on");
  const attendance = getAttendanceStore();
  const lot = nextCreditToUse(
    creditLots(await attendance.listCredits(studioId, [input.studentId]), today),
  );
  if (!lot)
    throw new ProblemError(400, "No make-up credit", "This student has no make-up credit to use.");
  const series = await addLesson(actor, studioId, {
    studentId: input.studentId,
    date: input.date,
    startTime: input.startTime,
    durationMin: input.durationMin,
    repeat: "once",
    note: "Make-up lesson",
    ...(input.allowClash ? { allowClash: true } : {}),
  });
  try {
    await attendance.addCredit(studioId, {
      studioId,
      studentId: input.studentId,
      amount: -1,
      reason: "makeup_booked",
      occurrenceKey: null,
      appliesTo: lot.id,
      makeupSeriesId: series.id,
      expiresOn: null,
      createdBy: isUuid(actor.userId) ? actor.userId : null,
    });
  } catch (error) {
    // Without the credit row it isn't a make-up: take the lesson off the calendar again.
    await deleteLessons(actor, studioId, { seriesId: series.id }).catch(() => undefined);
    throw error;
  }
  return { seriesId: series.id, creditId: lot.id };
}

/** Moves a credit's expiry 30 days on (D4). Works on an expired credit too. */
export async function extendCredit(
  actor: CalendarActor,
  studioId: string,
  input: { studentId: string; creditId: string },
) {
  await authorizeCalendar(actor, studioId, "write");
  const today = await studioToday(studioId);
  const attendance = getAttendanceStore();
  const lot = creditLots(await attendance.listCredits(studioId, [input.studentId]), today).find(
    (entry) => entry.id === input.creditId,
  );
  if (!lot || lot.state === "undone" || lot.state === "booked")
    throw new ProblemError(400, "This credit can't be extended", "Refresh the page.");
  const expiresOn = extendedExpiry(today, lot.expiresOn);
  await attendance.addCredit(studioId, {
    studioId,
    studentId: input.studentId,
    amount: 0,
    reason: "extended",
    occurrenceKey: null,
    appliesTo: lot.id,
    makeupSeriesId: null,
    expiresOn,
    createdBy: isUuid(actor.userId) ? actor.userId : null,
  });
  return { expiresOn };
}

// ---------------------------------------------------------------------------
// Server functions (browser entry points)
// ---------------------------------------------------------------------------
type Auth = { accessToken: string; studioId: string };

export const markLessonFn = createServerFn({ method: "POST" })
  .validator((data: Auth & MarkLessonInput) => data)
  .handler(async ({ data }): Promise<{ mark: AttendanceMark | null; creditChange: string }> => {
    const { accessToken, studioId, ...input } = data;
    return markLesson(await actorFrom(accessToken), studioId, input);
  });

export const markDayAttendedFn = createServerFn({ method: "POST" })
  .validator((data: Auth & { date: string }) => data)
  .handler(async ({ data }) =>
    markDayAttended(await actorFrom(data.accessToken), data.studioId, data.date),
  );

export const lessonRecordFn = createServerFn({ method: "POST" })
  .validator((data: Auth & { from: string; to: string }) => data)
  .handler(async ({ data }) =>
    getLessonRecord(await actorFrom(data.accessToken), data.studioId, {
      from: data.from,
      to: data.to,
    }),
  );

export const studentMakeUpsFn = createServerFn({ method: "POST" })
  .validator((data: Auth & { studentId: string }) => data)
  .handler(async ({ data }) =>
    getStudentMakeUps(await actorFrom(data.accessToken), data.studioId, data.studentId),
  );

export const bookMakeUpFn = createServerFn({ method: "POST" })
  .validator(
    (
      data: Auth & {
        studentId: string;
        date: string;
        startTime: string;
        durationMin: number;
        allowClash?: boolean;
      },
    ) => data,
  )
  .handler(async ({ data }) => {
    const { accessToken, studioId, ...input } = data;
    return bookMakeUp(await actorFrom(accessToken), studioId, input);
  });

export const extendCreditFn = createServerFn({ method: "POST" })
  .validator((data: Auth & { studentId: string; creditId: string }) => data)
  .handler(async ({ data }) =>
    extendCredit(await actorFrom(data.accessToken), data.studioId, {
      studentId: data.studentId,
      creditId: data.creditId,
    }),
  );
