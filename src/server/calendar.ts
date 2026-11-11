import { createServerFn } from "@tanstack/react-start";
import { getServerEnv, isMockOnboarding } from "./env";
import { requireStudioRole, type StudioRole } from "./authz";
import { verifyAccessToken } from "./session";
import { forbidden, ProblemError } from "./problem";
import {
  DEMO_CALENDAR_STUDIO,
  DEMO_CALENDAR_TEACHER,
  getCalendarStore,
  type CalendarConnection,
  type CalendarStudent,
} from "./calendar-store";
import {
  accessTokenFor,
  calendarExists,
  createKeystoneCalendar,
  createOAuthState,
  deleteEvent,
  exchangeCode,
  forgetAccessToken,
  GoogleAuthRevoked,
  googleAuthUrl,
  googleConfig,
  putEvent,
  readOAuthState,
  rememberAccessToken,
  revokeToken,
} from "./google-calendar";
import {
  addDays,
  endsBeforeMidnight,
  expandLessons,
  findClashes,
  formatClock,
  googleMovedEvent,
  googleMovedEventId,
  googleSeriesEvent,
  googleSeriesEventId,
  isDate,
  isTime,
  mondayOf,
  proposedDates,
  todayIn,
  type LessonException,
  type LessonOccurrence,
  type LessonRepeat,
  type LessonSeries,
} from "@/lib/lesson-calendar";

/**
 * Lesson calendar (0010). Every function checks requireStudioRole before it touches the
 * service-key store, and every store query is scoped by the studio id that was checked.
 * Google Calendar is a one-way push: a failed push never fails the lesson change; the series is
 * marked "error" and "Sync now" retries.
 */
export type CalendarActor = {
  userId: string;
  aal: string | null;
  email?: string | null;
  demo?: boolean;
};

/** The demo studio's teacher. Only ever paired with the demo studio id (see authorize). */
export const DEMO_CALENDAR_ACTOR: CalendarActor = {
  userId: DEMO_CALENDAR_TEACHER,
  aal: "aal2",
  demo: true,
};

const STAFF: StudioRole[] = ["owner", "admin", "teacher"];

async function authorize(actor: CalendarActor, studioId: string, access: "read" | "write") {
  if (actor.demo) {
    if (studioId !== DEMO_CALENDAR_STUDIO) throw forbidden();
    return "owner" as StudioRole;
  }
  return requireStudioRole(actor.userId, studioId, STAFF, { aal: actor.aal, access });
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------
export type CalendarLesson = LessonOccurrence & {
  studentName: string;
  location: string | null;
  note: string | null;
  untilDate: string | null;
  firstDate: string;
  googleSyncStatus: LessonSeries["googleSyncStatus"];
  googleSyncError: string | null;
};

export type GoogleStatus = {
  /** Demo studio: Google sync is never offered. */
  demo?: boolean;
  configured: boolean;
  connected: boolean;
  needsReconnect: boolean;
  email: string | null;
  lastSyncedAt: string | null;
  lastError: string | null;
};

export type CalendarWeek = {
  studioId: string;
  weekStart: string;
  today: string;
  timeZone: string;
  lessons: CalendarLesson[];
  students: CalendarStudent[];
  google: GoogleStatus;
};

function googleStatus(connection: CalendarConnection | null): GoogleStatus {
  return {
    configured: googleConfig().configured,
    connected: connection?.status === "connected",
    needsReconnect: connection?.status === "needs_reconnect",
    email: connection?.accountEmail ?? null,
    lastSyncedAt: connection?.lastSyncedAt ?? null,
    lastError: connection?.lastError ?? null,
  };
}

const fullName = (s: CalendarStudent | undefined) =>
  s ? `${s.firstName} ${s.lastName}`.trim() : "Student removed";

export async function getCalendarWeek(
  actor: CalendarActor,
  studioId: string,
  date: string,
): Promise<CalendarWeek> {
  await authorize(actor, studioId, "read");
  const store = getCalendarStore();
  const timeZone = await store.studioTimezone(studioId);
  const today = todayIn(timeZone);
  const weekStart = mondayOf(isDate(date) ? date : today);
  const weekEnd = addDays(weekStart, 6);
  const [{ series, exceptions }, students, connection] = await Promise.all([
    store.listLessons(studioId, weekStart, weekEnd),
    store.listStudents(studioId),
    actor.demo ? Promise.resolve(null) : store.getConnection(studioId, actor.userId),
  ]);
  const byId = new Map(series.map((s) => [s.id, s]));
  const studentById = new Map(students.map((s) => [s.id, s]));
  const lessons = expandLessons(series, exceptions, weekStart, weekEnd).map((o): CalendarLesson => {
    const s = byId.get(o.seriesId);
    return {
      ...o,
      studentName: fullName(studentById.get(o.studentId)),
      location: s?.location ?? null,
      note: s?.note ?? null,
      untilDate: s?.untilDate ?? null,
      firstDate: s?.firstDate ?? o.originalDate,
      googleSyncStatus: s?.googleSyncStatus ?? "off",
      googleSyncError: s?.googleSyncError ?? null,
    };
  });
  return {
    studioId,
    weekStart,
    today,
    timeZone,
    lessons,
    students,
    google: actor.demo
      ? { ...googleStatus(null), configured: false, demo: true }
      : googleStatus(connection),
  };
}

// ---------------------------------------------------------------------------
// Validation and clash checks
// ---------------------------------------------------------------------------
export class LessonClash extends ProblemError {
  constructor(clashes: Array<{ date: string; startTime: string; studentName: string }>) {
    const first = clashes[0];
    super(
      409,
      "Time clash",
      first
        ? `This clashes with ${first.studentName} at ${formatClock(first.startTime)} on ${first.date}${clashes.length > 1 ? ` and ${clashes.length - 1} more` : ""}. Save anyway to double-book.`
        : "This time clashes with another lesson.",
      "https://keystone.music/problems/lesson-clash",
      "lesson_clash",
    );
  }
}

function checkTime(date: unknown, startTime: unknown, durationMin: unknown) {
  if (!isDate(date)) throw new ProblemError(400, "Choose a date");
  if (!isTime(startTime)) throw new ProblemError(400, "Choose a start time");
  if (
    typeof durationMin !== "number" ||
    !Number.isInteger(durationMin) ||
    durationMin < 10 ||
    durationMin > 240
  ) {
    throw new ProblemError(400, "Choose a lesson length", "Lessons are 10 to 240 minutes.");
  }
  if (!endsBeforeMidnight(startTime, durationMin))
    throw new ProblemError(400, "Lesson runs past midnight", "Choose an earlier start time.");
}

async function assertNoClash(input: {
  studioId: string;
  teacherUserId: string;
  dates: string[];
  startTime: string;
  durationMin: number;
  ignore: (o: LessonOccurrence) => boolean;
}) {
  if (!input.dates.length) return;
  const store = getCalendarStore();
  const from = input.dates[0] as string;
  const to = input.dates[input.dates.length - 1] as string;
  const [{ series, exceptions }, students] = await Promise.all([
    store.listLessons(input.studioId, from, to),
    store.listStudents(input.studioId),
  ]);
  const occurrences = expandLessons(series, exceptions, from, to);
  const names = new Map(students.map((s) => [s.id, fullName(s)]));
  const clashes = input.dates.flatMap((date) =>
    findClashes(
      occurrences,
      {
        teacherUserId: input.teacherUserId,
        date,
        startTime: input.startTime,
        durationMin: input.durationMin,
      },
      input.ignore,
    ),
  );
  if (clashes.length) {
    throw new LessonClash(
      clashes.map((c) => ({
        date: c.date,
        startTime: c.startTime,
        studentName: names.get(c.studentId) ?? "another student",
      })),
    );
  }
}

const cleanText = (value: unknown, max: number) => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
};

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------
export type AddLessonInput = {
  studentId: string;
  date: string;
  startTime: string;
  durationMin: number;
  repeat: LessonRepeat;
  untilDate?: string | null;
  location?: string | null;
  note?: string | null;
  allowClash?: boolean;
};

/**
 * Adds a weekly or one-off lesson for a student. Also the entry point for other server code
 * (e.g. roster import) that wants to save a student's weekly time.
 */
export async function addLesson(
  actor: CalendarActor,
  studioId: string,
  input: AddLessonInput,
): Promise<LessonSeries> {
  await authorize(actor, studioId, "write");
  checkTime(input.date, input.startTime, input.durationMin);
  if (input.repeat !== "weekly" && input.repeat !== "once")
    throw new ProblemError(400, "Choose how often");
  const untilDate = input.repeat === "once" ? input.date : input.untilDate || null;
  if (untilDate && (!isDate(untilDate) || untilDate < input.date))
    throw new ProblemError(400, "Check the end date", "The last lesson can't be before the first.");
  const store = getCalendarStore();
  const students = await store.listStudents(studioId);
  if (!students.some((s) => s.id === input.studentId))
    throw new ProblemError(400, "Choose a student", "That student is not in this studio.");
  if (!input.allowClash) {
    await assertNoClash({
      studioId,
      teacherUserId: actor.userId,
      dates: proposedDates(input.date, input.repeat, untilDate),
      startTime: input.startTime,
      durationMin: input.durationMin,
      ignore: () => false,
    });
  }
  const series = await store.insertSeries({
    studioId,
    studentId: input.studentId,
    teacherUserId: actor.userId,
    repeat: input.repeat,
    firstDate: input.date,
    untilDate,
    startTime: input.startTime,
    durationMin: input.durationMin,
    location: cleanText(input.location, 120),
    note: cleanText(input.note, 500),
    createdBy: actor.userId,
  });
  await pushSeries(studioId, series.id);
  return series;
}

async function loadSeries(studioId: string, seriesId: string) {
  const found = await getCalendarStore().getSeries(studioId, seriesId);
  if (!found)
    throw new ProblemError(
      404,
      "Lesson not found",
      "This lesson was changed or removed. Refresh the calendar.",
    );
  return found;
}

function assertOnSeries(series: LessonSeries, originalDate: string) {
  if (!isDate(originalDate) || !expandLessons([series], [], originalDate, originalDate).length) {
    throw new ProblemError(400, "Lesson not found", "There is no lesson on that day.");
  }
}

export async function moveOneLesson(
  actor: CalendarActor,
  studioId: string,
  input: {
    seriesId: string;
    originalDate: string;
    newDate: string;
    newStartTime: string;
    allowClash?: boolean;
  },
): Promise<LessonException> {
  await authorize(actor, studioId, "write");
  const { series } = await loadSeries(studioId, input.seriesId);
  assertOnSeries(series, input.originalDate);
  checkTime(input.newDate, input.newStartTime, series.durationMin);
  if (!input.allowClash) {
    await assertNoClash({
      studioId,
      teacherUserId: series.teacherUserId,
      dates: [input.newDate],
      startTime: input.newStartTime,
      durationMin: series.durationMin,
      ignore: (o) => o.seriesId === series.id && o.originalDate === input.originalDate,
    });
  }
  const exception = await getCalendarStore().upsertException({
    studioId,
    seriesId: series.id,
    originalDate: input.originalDate,
    action: "move",
    newDate: input.newDate,
    newStartTime: input.newStartTime,
    createdBy: actor.userId,
  });
  await pushSeries(studioId, series.id);
  return exception;
}

export async function cancelOneLesson(
  actor: CalendarActor,
  studioId: string,
  input: { seriesId: string; originalDate: string },
) {
  await authorize(actor, studioId, "write");
  const { series, exceptions } = await loadSeries(studioId, input.seriesId);
  assertOnSeries(series, input.originalDate);
  const previous = exceptions.find((e) => e.originalDate === input.originalDate);
  const exception = await getCalendarStore().upsertException({
    studioId,
    seriesId: series.id,
    originalDate: input.originalDate,
    action: "cancel",
    newDate: null,
    newStartTime: null,
    createdBy: actor.userId,
  });
  await pushSeries(studioId, series.id, previous?.action === "move" ? [previous.id] : []);
  return exception;
}

/** Undo a move or cancellation: the lesson goes back to its usual time. */
export async function restoreOneLesson(
  actor: CalendarActor,
  studioId: string,
  input: { exceptionId: string },
) {
  await authorize(actor, studioId, "write");
  const removed = await getCalendarStore().deleteException(studioId, input.exceptionId);
  if (!removed) throw new ProblemError(404, "Already restored", "Refresh the calendar.");
  await pushSeries(studioId, removed.seriesId, removed.action === "move" ? [removed.id] : []);
  return removed;
}

/**
 * "Change the day or time from this week on": the old series ends the day before `fromDate` and a
 * new weekly series starts on `newDate` (same week as fromDate) at the new time.
 */
export async function changeFromWeek(
  actor: CalendarActor,
  studioId: string,
  input: {
    seriesId: string;
    fromDate: string;
    newDate: string;
    startTime: string;
    durationMin: number;
    allowClash?: boolean;
  },
): Promise<LessonSeries> {
  await authorize(actor, studioId, "write");
  const { series, exceptions } = await loadSeries(studioId, input.seriesId);
  if (series.repeat !== "weekly")
    throw new ProblemError(400, "Not a weekly lesson", "Use Move for a single lesson.");
  assertOnSeries(series, input.fromDate);
  checkTime(input.newDate, input.startTime, input.durationMin);
  if (mondayOf(input.newDate) !== mondayOf(input.fromDate)) {
    throw new ProblemError(
      400,
      "Pick a day in the same week",
      "The new weekly time starts in the week you are changing.",
    );
  }
  if (series.untilDate && input.newDate > addDays(series.untilDate, 6))
    throw new ProblemError(400, "Check the date");
  const until = series.untilDate && series.untilDate >= input.newDate ? series.untilDate : null;
  if (!input.allowClash) {
    await assertNoClash({
      studioId,
      teacherUserId: series.teacherUserId,
      dates: proposedDates(input.newDate, "weekly", until),
      startTime: input.startTime,
      durationMin: input.durationMin,
      ignore: (o) => o.seriesId === series.id && o.originalDate >= input.fromDate,
    });
  }
  const store = getCalendarStore();
  const next = await store.insertSeries({
    studioId,
    studentId: series.studentId,
    teacherUserId: series.teacherUserId,
    repeat: "weekly",
    firstDate: input.newDate,
    untilDate: until,
    startTime: input.startTime,
    durationMin: input.durationMin,
    location: series.location,
    note: series.note,
    createdBy: actor.userId,
  });
  const dropped = exceptions.filter((e) => e.originalDate >= input.fromDate);
  for (const e of dropped) await store.deleteException(studioId, e.id);
  const droppedMoves = dropped.filter((e) => e.action === "move").map((e) => e.id);
  if (input.fromDate <= series.firstDate) {
    await removeSeries(studioId, series, exceptions);
  } else {
    await store.updateSeries(studioId, series.id, { untilDate: addDays(input.fromDate, -1) });
    await pushSeries(studioId, series.id, droppedMoves);
  }
  await pushSeries(studioId, next.id);
  return next;
}

/** Stop a weekly lesson: `lastDate` is the final lesson. Earlier than the first lesson deletes it. */
export async function endWeeklyLessons(
  actor: CalendarActor,
  studioId: string,
  input: { seriesId: string; lastDate: string },
) {
  await authorize(actor, studioId, "write");
  if (!isDate(input.lastDate)) throw new ProblemError(400, "Choose a date");
  const { series, exceptions } = await loadSeries(studioId, input.seriesId);
  if (input.lastDate < series.firstDate) {
    await removeSeries(studioId, series, exceptions);
    return { deleted: true };
  }
  const store = getCalendarStore();
  const dropped = exceptions.filter((e) => e.originalDate > input.lastDate);
  for (const e of dropped) await store.deleteException(studioId, e.id);
  await store.updateSeries(studioId, series.id, { untilDate: input.lastDate });
  await pushSeries(
    studioId,
    series.id,
    dropped.filter((e) => e.action === "move").map((e) => e.id),
  );
  return { deleted: false };
}

export async function deleteLessons(
  actor: CalendarActor,
  studioId: string,
  input: { seriesId: string },
) {
  await authorize(actor, studioId, "write");
  const { series, exceptions } = await loadSeries(studioId, input.seriesId);
  await removeSeries(studioId, series, exceptions);
  return { deleted: true };
}

async function removeSeries(studioId: string, series: LessonSeries, exceptions: LessonException[]) {
  const store = getCalendarStore();
  // Remove from Google first while we still know the event ids; a failure is logged, not fatal.
  await withGoogle(studioId, series.teacherUserId, async (token, calendarId) => {
    await deleteEvent(token, calendarId, googleSeriesEventId(series.id));
    for (const e of exceptions)
      if (e.action === "move") await deleteEvent(token, calendarId, googleMovedEventId(e.id));
  }).catch(() => undefined);
  await store.deleteSeries(studioId, series.id);
}

// ---------------------------------------------------------------------------
// Google push
// ---------------------------------------------------------------------------
async function withGoogle<T>(
  studioId: string,
  teacherUserId: string,
  work: (token: string, calendarId: string, connection: CalendarConnection) => Promise<T>,
): Promise<T | null> {
  if (!googleConfig().configured) return null;
  const store = getCalendarStore();
  const connection = await store.getConnection(studioId, teacherUserId);
  if (!connection || connection.status !== "connected" || !connection.calendarId) return null;
  try {
    const token = await accessTokenFor(connection.id, () => store.getRefreshToken(connection.id));
    const result = await work(token, connection.calendarId, connection);
    await store.markConnection(connection.id, {
      lastSyncedAt: new Date().toISOString(),
      lastError: null,
    });
    return result;
  } catch (error) {
    if (error instanceof GoogleAuthRevoked) {
      forgetAccessToken(connection.id);
      await store.markConnection(connection.id, {
        status: "needs_reconnect",
        lastError: "Google access was removed. Connect again.",
      });
    }
    throw error;
  }
}

/** Push one series (and its moved lessons) to its teacher's Google calendar. Never throws. */
export async function pushSeries(
  studioId: string,
  seriesId: string,
  removedMoveIds: string[] = [],
): Promise<"synced" | "off" | "error"> {
  const store = getCalendarStore();
  const found = await store.getSeries(studioId, seriesId);
  if (!found) return "off";
  const { series, exceptions } = found;
  try {
    const result = await withGoogle(studioId, series.teacherUserId, async (token, calendarId) => {
      const [students, timeZone] = await Promise.all([
        store.listStudents(studioId),
        store.studioTimezone(studioId),
      ]);
      const student = students.find((s) => s.id === series.studentId) ?? {
        firstName: "Student",
        lastName: "",
      };
      const appUrl = getServerEnv().appUrl;
      await putEvent(
        token,
        calendarId,
        googleSeriesEvent({ series, exceptions, student, timeZone, appUrl }),
      );
      for (const exception of exceptions) {
        const moved = googleMovedEvent({ series, exception, student, timeZone, appUrl });
        if (moved) await putEvent(token, calendarId, moved);
      }
      for (const id of removedMoveIds) await deleteEvent(token, calendarId, googleMovedEventId(id));
      return "synced" as const;
    });
    if (!result) {
      if (series.googleSyncStatus !== "off")
        await store.setSyncState(studioId, [seriesId], "off", null);
      return "off";
    }
    await store.setSyncState(studioId, [seriesId], "synced", null);
    return "synced";
  } catch (error) {
    const message =
      error instanceof GoogleAuthRevoked
        ? "Reconnect Google Calendar to sync."
        : error instanceof Error
          ? error.message
          : "Google sync failed.";
    await store.setSyncState(studioId, [seriesId], "error", message).catch(() => undefined);
    return "error";
  }
}

/** Push every current lesson for this teacher. Used after connecting and by "Sync now". */
export async function syncTeacherLessons(studioId: string, teacherUserId: string) {
  const store = getCalendarStore();
  const timeZone = await store.studioTimezone(studioId);
  const from = addDays(todayIn(timeZone), -28);
  const { series } = await store.listTeacherSeries(studioId, teacherUserId, from);
  const counts = { synced: 0, error: 0, off: 0 };
  for (const s of series) counts[await pushSeries(studioId, s.id)] += 1;
  return counts;
}

export async function syncNow(actor: CalendarActor, studioId: string) {
  await authorize(actor, studioId, "write");
  return syncTeacherLessons(studioId, actor.userId);
}

export async function startGoogleConnect(actor: CalendarActor, studioId: string) {
  await authorize(actor, studioId, "write");
  if (actor.demo)
    throw new ProblemError(400, "Demo mode", "Google Calendar needs a signed-in studio.");
  return {
    url: googleAuthUrl(await createOAuthState({ userId: actor.userId, studioId }), actor.email),
  };
}

export async function finishGoogleConnect(
  actor: CalendarActor,
  input: { code: string; state: string },
) {
  if (actor.demo)
    throw new ProblemError(400, "Demo mode", "Google Calendar needs a signed-in studio.");
  const state = await readOAuthState(input.state);
  if (state.userId !== actor.userId) {
    throw new ProblemError(
      403,
      "Different account",
      "This Google link was started by another Keystone sign-in. Start again from the Calendar.",
    );
  }
  await authorize(actor, state.studioId, "write");
  if (typeof input.code !== "string" || !input.code)
    throw new ProblemError(400, "Missing code", "Start the Google connection again.");
  const store = getCalendarStore();
  const tokens = await exchangeCode(input.code);
  const timeZone = await store.studioTimezone(state.studioId);
  const existing = await store.getConnection(state.studioId, actor.userId);
  let calendarId = existing?.calendarId ?? null;
  if (calendarId && !(await calendarExists(tokens.accessToken, calendarId))) calendarId = null;
  calendarId ??= await createKeystoneCalendar(tokens.accessToken, timeZone);
  const connection = await store.saveConnection({
    studioId: state.studioId,
    userId: actor.userId,
    accountEmail: tokens.email,
    calendarId,
    refreshToken: tokens.refreshToken,
  });
  rememberAccessToken(connection.id, tokens.accessToken, tokens.expiresIn);
  const counts = await syncTeacherLessons(state.studioId, actor.userId);
  return { studioId: state.studioId, email: tokens.email, ...counts };
}

/**
 * Stops syncing and removes Keystone's access at Google. The "Keystone lessons" calendar stays in
 * the teacher's Google account until they delete it there.
 */
export async function disconnectGoogle(actor: CalendarActor, studioId: string) {
  await authorize(actor, studioId, "write");
  const store = getCalendarStore();
  const connection = await store.getConnection(studioId, actor.userId);
  if (!connection) return { disconnected: true };
  const refreshToken = await store.getRefreshToken(connection.id).catch(() => null);
  if (refreshToken) await revokeToken(refreshToken);
  forgetAccessToken(connection.id);
  await store.forgetConnection(connection.id);
  const timeZone = await store.studioTimezone(studioId);
  const { series } = await store.listTeacherSeries(
    studioId,
    actor.userId,
    addDays(todayIn(timeZone), -365),
  );
  await store.setSyncState(
    studioId,
    series.map((s) => s.id),
    "off",
    null,
  );
  return { disconnected: true };
}

// ---------------------------------------------------------------------------
// Server functions (browser entry points)
// ---------------------------------------------------------------------------
async function actorFrom(accessToken: string): Promise<CalendarActor> {
  if (isMockOnboarding() && !accessToken) return DEMO_CALENDAR_ACTOR;
  const session = await verifyAccessToken(accessToken);
  return { userId: session.userId, aal: session.aal, email: session.email };
}

type Auth = { accessToken: string; studioId: string };

export const getCalendarWeekFn = createServerFn({ method: "POST" })
  .validator((data: Auth & { date: string }) => data)
  .handler(async ({ data }) =>
    getCalendarWeek(await actorFrom(data.accessToken), data.studioId, data.date),
  );

export const addLessonFn = createServerFn({ method: "POST" })
  .validator((data: Auth & { lesson: AddLessonInput }) => data)
  .handler(async ({ data }) => {
    const series = await addLesson(await actorFrom(data.accessToken), data.studioId, data.lesson);
    return { id: series.id };
  });

export const moveLessonFn = createServerFn({ method: "POST" })
  .validator(
    (
      data: Auth & {
        seriesId: string;
        originalDate: string;
        newDate: string;
        newStartTime: string;
        allowClash?: boolean;
      },
    ) => data,
  )
  .handler(async ({ data }) => {
    const { accessToken, studioId, ...input } = data;
    const exception = await moveOneLesson(await actorFrom(accessToken), studioId, input);
    return { id: exception.id };
  });

export const cancelLessonFn = createServerFn({ method: "POST" })
  .validator((data: Auth & { seriesId: string; originalDate: string }) => data)
  .handler(async ({ data }) => {
    const { accessToken, studioId, ...input } = data;
    const exception = await cancelOneLesson(await actorFrom(accessToken), studioId, input);
    return { id: exception.id };
  });

export const restoreLessonFn = createServerFn({ method: "POST" })
  .validator((data: Auth & { exceptionId: string }) => data)
  .handler(async ({ data }) => {
    await restoreOneLesson(await actorFrom(data.accessToken), data.studioId, {
      exceptionId: data.exceptionId,
    });
    return { ok: true };
  });

export const changeFromWeekFn = createServerFn({ method: "POST" })
  .validator(
    (
      data: Auth & {
        seriesId: string;
        fromDate: string;
        newDate: string;
        startTime: string;
        durationMin: number;
        allowClash?: boolean;
      },
    ) => data,
  )
  .handler(async ({ data }) => {
    const { accessToken, studioId, ...input } = data;
    const series = await changeFromWeek(await actorFrom(accessToken), studioId, input);
    return { id: series.id };
  });

export const endWeeklyLessonsFn = createServerFn({ method: "POST" })
  .validator((data: Auth & { seriesId: string; lastDate: string }) => data)
  .handler(async ({ data }) =>
    endWeeklyLessons(await actorFrom(data.accessToken), data.studioId, {
      seriesId: data.seriesId,
      lastDate: data.lastDate,
    }),
  );

export const deleteLessonsFn = createServerFn({ method: "POST" })
  .validator((data: Auth & { seriesId: string }) => data)
  .handler(async ({ data }) =>
    deleteLessons(await actorFrom(data.accessToken), data.studioId, { seriesId: data.seriesId }),
  );

export const syncGoogleNowFn = createServerFn({ method: "POST" })
  .validator((data: Auth) => data)
  .handler(async ({ data }) => syncNow(await actorFrom(data.accessToken), data.studioId));

export const startGoogleConnectFn = createServerFn({ method: "POST" })
  .validator((data: Auth) => data)
  .handler(async ({ data }) =>
    startGoogleConnect(await actorFrom(data.accessToken), data.studioId),
  );

export const finishGoogleConnectFn = createServerFn({ method: "POST" })
  .validator((data: { accessToken: string; code: string; state: string }) => data)
  .handler(async ({ data }) =>
    finishGoogleConnect(await actorFrom(data.accessToken), { code: data.code, state: data.state }),
  );

export const disconnectGoogleFn = createServerFn({ method: "POST" })
  .validator((data: Auth) => data)
  .handler(async ({ data }) => disconnectGoogle(await actorFrom(data.accessToken), data.studioId));
