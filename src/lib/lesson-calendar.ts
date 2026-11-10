// Pure lesson calendar rules (0010). No I/O: used by the server, the calendar screen and tests.
// Dates are "YYYY-MM-DD" and times "HH:MM" in the studio's own timezone.

export type LessonRepeat = "weekly" | "once";

export interface LessonSeries {
  id: string;
  studioId: string;
  studentId: string;
  teacherUserId: string;
  repeat: LessonRepeat;
  firstDate: string;
  /** Last date a lesson can fall on. null = keeps going. Always equals firstDate for "once". */
  untilDate: string | null;
  startTime: string;
  durationMin: number;
  location: string | null;
  note: string | null;
  googleSyncStatus: "off" | "pending" | "synced" | "error";
  googleSyncError: string | null;
}

export interface LessonException {
  id: string;
  studioId: string;
  seriesId: string;
  originalDate: string;
  action: "cancel" | "move";
  newDate: string | null;
  newStartTime: string | null;
}

export type OccurrenceStatus = "scheduled" | "moved" | "cancelled";

export interface LessonOccurrence {
  /** Stable key: series id + the date the lesson was originally on. */
  key: string;
  seriesId: string;
  studentId: string;
  teacherUserId: string;
  repeat: LessonRepeat;
  originalDate: string;
  date: string;
  startTime: string;
  durationMin: number;
  status: OccurrenceStatus;
  exceptionId: string | null;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export function isDate(value: unknown): value is string {
  if (typeof value !== "string" || !DATE.test(value)) return false;
  const d = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

export function isTime(value: unknown): value is string {
  return typeof value === "string" && TIME.test(value);
}

export function addDays(date: string, n: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** 0 = Sunday … 6 = Saturday */
export function weekday(date: string): number {
  return new Date(`${date}T12:00:00Z`).getUTCDay();
}

export function mondayOf(date: string): string {
  return addDays(date, -((weekday(date) + 6) % 7));
}

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86400000);
}

export function toMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

export function fromMinutes(total: number): string {
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** "4:30 pm" */
export function formatClock(time: string): string {
  const mins = toMinutes(time);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${h < 12 ? "am" : "pm"}`;
}

export function endsBeforeMidnight(startTime: string, durationMin: number): boolean {
  return toMinutes(startTime) + durationMin <= 23 * 60 + 59;
}

/** Dates (inclusive range) a series falls on, before exceptions. */
export function seriesDates(series: LessonSeries, from: string, to: string): string[] {
  const last = series.repeat === "once" ? series.firstDate : series.untilDate;
  const end = last && last < to ? last : to;
  if (series.firstDate > end) return [];
  let date = series.firstDate;
  if (date < from) {
    const weeks = Math.ceil(daysBetween(series.firstDate, from) / 7);
    date = addDays(series.firstDate, weeks * 7);
  }
  const dates: string[] = [];
  for (; date <= end; date = addDays(date, series.repeat === "once" ? 10000 : 7)) dates.push(date);
  return dates;
}

/** True when the series has a lesson planned on this date (ignoring exceptions). */
export function seriesHasDate(series: LessonSeries, date: string): boolean {
  return seriesDates(series, date, date).length === 1;
}

/**
 * All lessons between from and to (inclusive), including cancelled ones (shown greyed) and lessons
 * moved into the range from outside it. Sorted by date then time.
 */
export function expandLessons(
  allSeries: LessonSeries[],
  exceptions: LessonException[],
  from: string,
  to: string,
): LessonOccurrence[] {
  const bySeries = new Map(allSeries.map((s) => [s.id, s]));
  const exceptionFor = new Map(exceptions.map((e) => [`${e.seriesId}_${e.originalDate}`, e]));
  const out: LessonOccurrence[] = [];
  const base = (s: LessonSeries, originalDate: string): LessonOccurrence => ({
    key: `${s.id}_${originalDate}`,
    seriesId: s.id,
    studentId: s.studentId,
    teacherUserId: s.teacherUserId,
    repeat: s.repeat,
    originalDate,
    date: originalDate,
    startTime: s.startTime,
    durationMin: s.durationMin,
    status: "scheduled",
    exceptionId: null,
  });

  for (const s of allSeries) {
    for (const date of seriesDates(s, from, to)) {
      const ex = exceptionFor.get(`${s.id}_${date}`);
      if (!ex) out.push(base(s, date));
      else if (ex.action === "cancel")
        out.push({ ...base(s, date), status: "cancelled", exceptionId: ex.id });
      // Moved lessons are added below at their new date.
    }
  }
  for (const ex of exceptions) {
    if (ex.action !== "move" || !ex.newDate || !ex.newStartTime) continue;
    if (ex.newDate < from || ex.newDate > to) continue;
    const s = bySeries.get(ex.seriesId);
    if (!s || !seriesHasDate(s, ex.originalDate)) continue;
    out.push({
      ...base(s, ex.originalDate),
      date: ex.newDate,
      startTime: ex.newStartTime,
      status: "moved",
      exceptionId: ex.id,
    });
  }
  return out.sort(
    (a, b) => a.date.localeCompare(b.date) || toMinutes(a.startTime) - toMinutes(b.startTime),
  );
}

export interface ProposedLesson {
  teacherUserId: string;
  date: string;
  startTime: string;
  durationMin: number;
}

/** Lessons for the same teacher that overlap the proposed time (cancelled lessons don't count). */
export function findClashes(
  occurrences: LessonOccurrence[],
  proposed: ProposedLesson,
  ignore: (o: LessonOccurrence) => boolean = () => false,
): LessonOccurrence[] {
  const start = toMinutes(proposed.startTime);
  const end = start + proposed.durationMin;
  return occurrences.filter((o) => {
    if (o.status === "cancelled" || ignore(o)) return false;
    if (o.teacherUserId !== proposed.teacherUserId || o.date !== proposed.date) return false;
    const oStart = toMinutes(o.startTime);
    return oStart < end && start < oStart + o.durationMin;
  });
}

/** How far ahead weekly lessons are checked for clashes. */
export const CLASH_CHECK_WEEKS = 26;

/** Every date a new or changed weekly series would occupy in the clash window. */
export function proposedDates(
  firstDate: string,
  repeat: LessonRepeat,
  untilDate: string | null,
): string[] {
  if (repeat === "once") return [firstDate];
  const end = addDays(firstDate, CLASH_CHECK_WEEKS * 7);
  const last = untilDate && untilDate < end ? untilDate : end;
  const dates: string[] = [];
  for (let d = firstDate; d <= last; d = addDays(d, 7)) dates.push(d);
  return dates;
}

// ---------------------------------------------------------------------------
// Time zones
// ---------------------------------------------------------------------------

function offsetMinutes(utcMs: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(utcMs));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second"),
  );
  return Math.round((asUtc - utcMs) / 60000);
}

/** The UTC instant of a local date + time in a timezone (handles DST). */
export function zonedToUtc(date: string, time: string, timeZone: string): Date {
  const [y, mo, d] = date.split("-").map(Number);
  const [h, mi] = time.split(":").map(Number);
  const guess = Date.UTC(y ?? 0, (mo ?? 1) - 1, d ?? 1, h ?? 0, mi ?? 0);
  let result = guess - offsetMinutes(guess, timeZone) * 60000;
  result = guess - offsetMinutes(result, timeZone) * 60000;
  return new Date(result);
}

/** Today's date in the studio's timezone. */
export function todayIn(timeZone: string, now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

// ---------------------------------------------------------------------------
// Google Calendar event shapes (one-way push)
// ---------------------------------------------------------------------------

/** Google event ids allow base32hex (0-9, a-v). A uuid's hex digits are a subset. */
export function googleSeriesEventId(seriesId: string): string {
  return `ks${seriesId.replace(/-/g, "").toLowerCase()}`;
}

export function googleMovedEventId(exceptionId: string): string {
  return `km${exceptionId.replace(/-/g, "").toLowerCase()}`;
}

/** "Edison P." — first name and last initial only, to limit what leaves Keystone. */
export function googleLessonTitle(student: { firstName: string; lastName: string }): string {
  const initial = student.lastName.trim().charAt(0);
  return `Piano lesson: ${student.firstName.trim()}${initial ? ` ${initial.toUpperCase()}.` : ""}`;
}

const compact = (date: string) => date.replace(/-/g, "");
const compactTime = (time: string) => `${time.replace(":", "")}00`;

export interface GoogleEvent {
  id: string;
  summary: string;
  description: string;
  location?: string;
  start: { dateTime: string; timeZone: string };
  end: { dateTime: string; timeZone: string };
  recurrence?: string[];
  status?: "confirmed" | "cancelled";
  extendedProperties: { private: Record<string, string> };
  reminders: { useDefault: boolean };
}

function eventTimes(date: string, startTime: string, durationMin: number, timeZone: string) {
  const end = fromMinutes(toMinutes(startTime) + durationMin);
  return {
    start: { dateTime: `${date}T${startTime}:00`, timeZone },
    end: { dateTime: `${date}T${end}:00`, timeZone },
  };
}

export function googleSeriesEvent(input: {
  series: LessonSeries;
  exceptions: LessonException[];
  student: { firstName: string; lastName: string };
  timeZone: string;
  appUrl: string;
}): GoogleEvent {
  const { series, exceptions, timeZone } = input;
  const own = exceptions.filter(
    (e) => e.seriesId === series.id && seriesHasDate(series, e.originalDate),
  );
  const event: GoogleEvent = {
    id: googleSeriesEventId(series.id),
    summary: googleLessonTitle(input.student),
    description: `Managed by Keystone Music HQ. Change this lesson in Keystone: ${input.appUrl}/calendar?date=${series.firstDate}`,
    ...eventTimes(series.firstDate, series.startTime, series.durationMin, timeZone),
    status: "confirmed",
    extendedProperties: { private: { keystone: "lesson", keystoneSeriesId: series.id } },
    reminders: { useDefault: true },
  };
  if (series.location) event.location = series.location;
  if (series.repeat === "weekly") {
    let rule = "RRULE:FREQ=WEEKLY";
    if (series.untilDate) {
      // UNTIL must be UTC when the start has a timezone; use the last lesson's start instant.
      const until = zonedToUtc(series.untilDate, series.startTime, timeZone).toISOString();
      rule += `;UNTIL=${until.replace(/[-:]/g, "").replace(/\.\d{3}/, "")}`;
    }
    event.recurrence = [rule];
    if (own.length) {
      const dates = own
        .map((e) => `${compact(e.originalDate)}T${compactTime(series.startTime)}`)
        .sort();
      event.recurrence.push(`EXDATE;TZID=${timeZone}:${dates.join(",")}`);
    }
  } else if (own.length) {
    // A one-off lesson that was cancelled or moved: the original event is cancelled.
    event.status = "cancelled";
  }
  return event;
}

export function googleMovedEvent(input: {
  series: LessonSeries;
  exception: LessonException;
  student: { firstName: string; lastName: string };
  timeZone: string;
  appUrl: string;
}): GoogleEvent | null {
  const { series, exception, timeZone } = input;
  if (exception.action !== "move" || !exception.newDate || !exception.newStartTime) return null;
  const event: GoogleEvent = {
    id: googleMovedEventId(exception.id),
    summary: googleLessonTitle(input.student),
    description: `Moved from ${exception.originalDate}. Managed by Keystone Music HQ: ${input.appUrl}/calendar?date=${exception.newDate}`,
    ...eventTimes(exception.newDate, exception.newStartTime, series.durationMin, timeZone),
    status: "confirmed",
    extendedProperties: {
      private: {
        keystone: "lesson",
        keystoneSeriesId: series.id,
        keystoneExceptionId: exception.id,
      },
    },
    reminders: { useDefault: true },
  };
  if (series.location) event.location = series.location;
  return event;
}
