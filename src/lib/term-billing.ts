// Bill next term for real studios (23 Nov 2026). Pure rules: no I/O, used by the live billing
// store, the Bill next term screen and the tests. Dates are "YYYY-MM-DD" in the studio's own
// timezone.
import { STATE_CALENDARS } from "@/mocks/state-calendars";
import { STUDIO_STATES, type StudioState } from "@/mocks/setup";
import type { LessonType, PublicHolidayPolicy } from "@/mocks/types";
import {
  addDays,
  expandLessons,
  isDate,
  type LessonException,
  type LessonSeries,
} from "./lesson-calendar";

export type Holiday = { date: string; name: string; regional?: true };

/**
 * 2027 public holidays by state, from the Fair Work Ombudsman's 2027 list (checked 23 Nov 2026,
 * https://www.fairwork.gov.au/employment-conditions/public-holidays/2027-public-holidays).
 * Weekday holidays only: lessons on a weekend holiday are rare and the teacher can still tick
 * a closure. Part-day holidays (Christmas Eve and New Year's Eve evenings) fall outside term.
 * `regional` days only apply to part of the state, so they start unticked.
 * Victoria's Friday before the AFL Grand Final has no date yet: the teacher adds it as a closure.
 */
export const PUBLIC_HOLIDAYS_BY_STATE: Record<StudioState, Holiday[]> = {
  ACT: [
    { date: "2027-01-01", name: "New Year's Day" },
    { date: "2027-01-26", name: "Australia Day" },
    { date: "2027-03-08", name: "Canberra Day" },
    { date: "2027-03-26", name: "Good Friday" },
    { date: "2027-03-29", name: "Easter Monday" },
    { date: "2027-04-26", name: "Anzac Day (additional day)" },
    { date: "2027-05-31", name: "Reconciliation Day" },
    { date: "2027-06-14", name: "King's Birthday" },
    { date: "2027-10-04", name: "Labour Day" },
    { date: "2027-12-27", name: "Christmas Day (additional day)" },
    { date: "2027-12-28", name: "Boxing Day (additional day)" },
  ],
  NSW: [
    { date: "2027-01-01", name: "New Year's Day" },
    { date: "2027-01-26", name: "Australia Day" },
    { date: "2027-03-26", name: "Good Friday" },
    { date: "2027-03-29", name: "Easter Monday" },
    { date: "2027-04-26", name: "Anzac Day (additional day)" },
    { date: "2027-06-14", name: "King's Birthday" },
    { date: "2027-10-04", name: "Labour Day" },
    { date: "2027-12-27", name: "Christmas Day (additional day)" },
    { date: "2027-12-28", name: "Boxing Day (additional day)" },
  ],
  NT: [
    { date: "2027-01-01", name: "New Year's Day" },
    { date: "2027-01-26", name: "Australia Day" },
    { date: "2027-03-26", name: "Good Friday" },
    { date: "2027-03-29", name: "Easter Monday" },
    { date: "2027-04-26", name: "Anzac Day" },
    { date: "2027-05-03", name: "May Day" },
    { date: "2027-06-14", name: "King's Birthday" },
    { date: "2027-08-02", name: "Picnic Day" },
    { date: "2027-12-27", name: "Christmas Day (additional day)" },
    { date: "2027-12-28", name: "Boxing Day (additional day)" },
  ],
  QLD: [
    { date: "2027-01-01", name: "New Year's Day" },
    { date: "2027-01-26", name: "Australia Day" },
    { date: "2027-03-26", name: "Good Friday" },
    { date: "2027-03-29", name: "Easter Monday" },
    { date: "2027-04-26", name: "Anzac Day" },
    { date: "2027-05-03", name: "Labour Day" },
    { date: "2027-08-11", name: "Royal Queensland Show (Brisbane area)", regional: true },
    { date: "2027-10-04", name: "King's Birthday" },
    { date: "2027-12-27", name: "Christmas Day (additional day)" },
    { date: "2027-12-28", name: "Boxing Day (additional day)" },
  ],
  SA: [
    { date: "2027-01-01", name: "New Year's Day" },
    { date: "2027-01-26", name: "Australia Day" },
    { date: "2027-03-08", name: "Adelaide Cup Day" },
    { date: "2027-03-26", name: "Good Friday" },
    { date: "2027-03-29", name: "Easter Monday" },
    { date: "2027-06-14", name: "King's Birthday" },
    { date: "2027-10-04", name: "Labour Day" },
    { date: "2027-12-27", name: "Christmas Day (additional day)" },
    { date: "2027-12-28", name: "Proclamation Day (additional day)" },
  ],
  TAS: [
    { date: "2027-01-01", name: "New Year's Day" },
    { date: "2027-01-26", name: "Australia Day" },
    { date: "2027-02-08", name: "Royal Hobart Regatta (some areas)", regional: true },
    { date: "2027-03-08", name: "Eight Hours Day" },
    { date: "2027-03-26", name: "Good Friday" },
    { date: "2027-03-29", name: "Easter Monday" },
    { date: "2027-06-14", name: "King's Birthday" },
    { date: "2027-10-21", name: "Royal Hobart Show (some areas)", regional: true },
    { date: "2027-11-01", name: "Recreation Day (some areas)", regional: true },
    { date: "2027-12-27", name: "Christmas Day (additional day)" },
    { date: "2027-12-28", name: "Boxing Day" },
  ],
  VIC: [
    { date: "2027-01-01", name: "New Year's Day" },
    { date: "2027-01-26", name: "Australia Day" },
    { date: "2027-03-08", name: "Labour Day" },
    { date: "2027-03-26", name: "Good Friday" },
    { date: "2027-03-29", name: "Easter Monday" },
    { date: "2027-06-14", name: "King's Birthday" },
    { date: "2027-11-02", name: "Melbourne Cup (some regional areas differ)" },
    { date: "2027-12-27", name: "Christmas Day (additional day)" },
    { date: "2027-12-28", name: "Boxing Day (additional day)" },
  ],
  WA: [
    { date: "2027-01-01", name: "New Year's Day" },
    { date: "2027-01-26", name: "Australia Day" },
    { date: "2027-03-01", name: "Labour Day" },
    { date: "2027-03-26", name: "Good Friday" },
    { date: "2027-03-29", name: "Easter Monday" },
    { date: "2027-04-26", name: "Anzac Day (additional day)" },
    { date: "2027-06-07", name: "Western Australia Day" },
    { date: "2027-09-27", name: "King's Birthday (some regional areas differ)" },
    { date: "2027-12-27", name: "Christmas Day (additional day)" },
    { date: "2027-12-28", name: "Boxing Day (additional day)" },
  ],
};

const TZ_STATE: Record<string, StudioState> = {
  "Australia/Sydney": "NSW",
  "Australia/Melbourne": "VIC",
  "Australia/Brisbane": "QLD",
  "Australia/Adelaide": "SA",
  "Australia/Perth": "WA",
  "Australia/Hobart": "TAS",
  "Australia/Darwin": "NT",
};

export const isStudioState = (value: unknown): value is StudioState =>
  typeof value === "string" && (STUDIO_STATES as readonly string[]).includes(value);

/** The studio's state: the one saved in its details, else a guess from its timezone. */
export function studioStateFor(state: unknown, timeZone?: string): StudioState {
  if (isStudioState(state)) return state;
  return (timeZone && TZ_STATE[timeZone]) || "NSW";
}

export type BillingTerm = { key: string; name: string; start: string; end: string };

/** "2027-T1" */
export const termKeyFor = (year: number, number: number) => `${year}-T${number}`;

/**
 * The terms a studio can bill from today: any term that hasn't ended yet, from the state's
 * school calendar (2027 only for now). Empty when no dates are loaded; the teacher types them.
 */
export function upcomingTerms(state: StudioState, today: string): BillingTerm[] {
  return STATE_CALENDARS[state].terms
    .map((term, index) => ({
      key: termKeyFor(Number(term.start.slice(0, 4)), index + 1),
      name: `${term.name} ${term.start.slice(0, 4)}`,
      start: term.start,
      end: term.end,
    }))
    .filter((term) => term.end >= today);
}

/** The term to bill by default: the first one that hasn't started yet, else the current one. */
export function defaultBillingTerm(terms: BillingTerm[], today: string): BillingTerm | null {
  return terms.find((term) => term.start > today) ?? terms[0] ?? null;
}

export function termDatesProblem(start: string, end: string): string | null {
  if (!isDate(start) || !isDate(end)) return "Enter the term's first and last day.";
  if (end < start) return "The term must end after it starts.";
  if (end > addDays(start, 26 * 7)) return "A term can be at most 26 weeks long.";
  return null;
}

/** Public holidays inside the term. */
export function holidaysInTerm(state: StudioState, start: string, end: string): Holiday[] {
  return PUBLIC_HOLIDAYS_BY_STATE[state].filter((h) => h.date >= start && h.date <= end);
}

/** The holidays that start ticked: statewide ones. */
export function defaultClosedDates(holidays: Holiday[]): string[] {
  return holidays.filter((h) => !h.regional).map((h) => h.date);
}

export type StudentTermLessons = {
  studentId: string;
  /** Lessons charged. */
  dates: string[];
  /** Lessons on a closed day that aren't charged (holiday rule "skip", or a studio closure). */
  skipped: string[];
  /** Lessons on a closed day that are charged and offered as a make-up ("make_up"). */
  makeUpDates: string[];
  /** Lessons already cancelled in the calendar. */
  cancelled: number;
  durationMin: number | null;
};

/**
 * Counts each student's weekly lessons in the term. One-off lessons don't count (they're usually
 * make-ups). A moved lesson counts once, where it was moved to if that is still in the term.
 * Days the studio adds as its own closures are never charged. Lessons on a ticked public
 * holiday follow the studio's holiday rule:
 *   skip    no lesson, no charge.
 *   make_up charged, and a make-up is offered (the date is listed on the invoice).
 *   charge  lessons go ahead, charged as normal.
 */
export function termLessons(
  series: LessonSeries[],
  exceptions: LessonException[],
  term: { start: string; end: string },
  holidayDates: string[],
  rule: PublicHolidayPolicy,
  studioClosures: string[] = [],
): Map<string, StudentTermLessons> {
  const weekly = series.filter((s) => s.repeat === "weekly");
  const closed = new Set(holidayDates);
  const shut = new Set(studioClosures);
  const out = new Map<string, StudentTermLessons>();
  for (const lesson of expandLessons(weekly, exceptions, term.start, term.end)) {
    const row = out.get(lesson.studentId) ?? {
      studentId: lesson.studentId,
      dates: [],
      skipped: [],
      makeUpDates: [],
      cancelled: 0,
      durationMin: null,
    };
    out.set(lesson.studentId, row);
    if (lesson.status === "cancelled") {
      row.cancelled++;
      continue;
    }
    // A lesson moved out of the term isn't billed in this one.
    if (lesson.date < term.start || lesson.date > term.end) continue;
    row.durationMin = row.durationMin ?? lesson.durationMin;
    if (shut.has(lesson.date) || (closed.has(lesson.date) && rule === "skip"))
      row.skipped.push(lesson.date);
    else {
      row.dates.push(lesson.date);
      if (closed.has(lesson.date) && rule === "make_up") row.makeUpDates.push(lesson.date);
    }
  }
  for (const row of out.values()) {
    row.dates.sort();
    row.skipped.sort();
    row.makeUpDates.sort();
  }
  return out;
}

/** The studio's price for a lesson of this length, or null when it has none. */
export function priceFor(lessonTypes: LessonType[], durationMin: number | null): LessonType | null {
  if (!durationMin) return null;
  const match = lessonTypes.find((type) => type.durationMin === durationMin);
  return match && match.priceCents > 0 ? match : null;
}

const shortDate = (date: string) =>
  new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "short", timeZone: "UTC" }).format(
    new Date(`${date}T12:00:00Z`),
  );

/** "Mia Chen – 30 min lesson, Term 1 2027 (incl. 26 Jan public holiday, make-up offered)" */
export function termLineDescription(
  studentName: string,
  lessonName: string,
  termName: string,
  makeUpDates: string[],
): string {
  const base = `${studentName} – ${lessonName}, ${termName}`;
  if (!makeUpDates.length) return base;
  const days = makeUpDates.map(shortDate).join(", ");
  return `${base} (incl. ${days} public holiday${makeUpDates.length > 1 ? "s" : ""}, make-up offered)`;
}

/** Due on the first day of term, or 7 days after sending if that is later. */
export function termDueDate(termStart: string, today: string): string {
  const soonest = addDays(today, 7);
  return termStart > soonest ? termStart : soonest;
}

export type RenewalStatus = "awaiting" | "confirmed" | "change_requested" | "declined";

export const RENEWAL_LABELS: Record<RenewalStatus | "not_invited", string> = {
  not_invited: "Not invited",
  awaiting: "Awaiting reply",
  confirmed: "Continuing",
  change_requested: "Asked for a change",
  declined: "Not continuing",
};

export const isRenewalStatus = (value: unknown): value is RenewalStatus =>
  value === "awaiting" ||
  value === "confirmed" ||
  value === "change_requested" ||
  value === "declined";

/** Reply-by date must be from today and no later than the term's last day. */
export function renewalDeadlineProblem(deadline: string, today: string, termEnd: string) {
  if (!isDate(deadline)) return "Choose a reply-by date.";
  if (deadline < today) return "The reply-by date can't be in the past.";
  if (deadline > termEnd) return "The reply-by date must be before the term ends.";
  return null;
}

/** A family's answer: a note is needed to ask for a change; notes are at most 1000 characters. */
export function renewalAnswerProblem(status: unknown, note: string): string | null {
  if (status !== "confirmed" && status !== "change_requested" && status !== "declined")
    return "Choose an answer.";
  if (note.length > 1000) return "Keep the note under 1000 characters.";
  if (status === "change_requested" && !note.trim())
    return "Tell your teacher what you'd like to change.";
  return null;
}

export function renewalChatBody(
  kind: "invite" | "reminder",
  termName: string,
  deadline: string,
): string {
  const by = shortDate(deadline);
  return kind === "invite"
    ? `${termName} lessons: please let me know by ${by} if you'd like to continue. Open Home in the family app to answer: continue at your current lesson time, ask for a change, or let me know you won't continue. Thank you!`
    : `Reminder: please let me know by ${by} if you'd like to continue lessons in ${termName}. You can answer on Home in the family app. Thank you!`;
}

export function renewalAnswerChatBody(status: RenewalStatus, termName: string, note: string) {
  const head =
    status === "confirmed"
      ? `We'd like to continue in ${termName} at our current lesson time.`
      : status === "declined"
        ? `We won't continue lessons in ${termName}. Thank you.`
        : `We'd like to talk about a change for ${termName}.`;
  return note.trim() ? `${head}\n\n${note.trim()}` : head;
}
