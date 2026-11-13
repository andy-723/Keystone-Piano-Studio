import { addDays, weekday } from "@/lib/calendar";
import { studioToday } from "@/lib/studio-clock";

/** Snapshot reporting timezone (civil dates; matches AU studio clocks). */
export const SNAPSHOT_TIMEZONE = "Australia/Sydney" as const;

export type SnapshotRangeKey = "week" | "month";

export type SnapshotBounds = {
  key: SnapshotRangeKey;
  start: string;
  end: string;
  timezone: typeof SNAPSHOT_TIMEZONE;
};

/** Monday of the week that contains `date` (Mon–Sun week). */
export function weekStartMonday(date: string): string {
  return addDays(date, -((weekday(date) + 6) % 7));
}

function lastDayOfMonth(date: string): string {
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  const firstNext = `${String(nextYear).padStart(4, "0")}-${String(nextMonth).padStart(2, "0")}-01`;
  return addDays(firstNext, -1);
}

/** This week (Mon–Sun) or this calendar month containing `today`, labeled Australia/Sydney. */
export function snapshotBounds(
  key: SnapshotRangeKey,
  today: string = studioToday(),
): SnapshotBounds {
  if (key === "week") {
    const start = weekStartMonday(today);
    return { key, start, end: addDays(start, 6), timezone: SNAPSHOT_TIMEZONE };
  }
  const start = `${today.slice(0, 7)}-01`;
  return { key, start, end: lastDayOfMonth(today), timezone: SNAPSHOT_TIMEZONE };
}

export function eachDateInclusive(start: string, end: string): string[] {
  const dates: string[] = [];
  for (let cursor = start; cursor <= end; cursor = addDays(cursor, 1)) dates.push(cursor);
  return dates;
}

export function inRange(dateValue: string, start: string, end: string): boolean {
  const day = dateValue.slice(0, 10);
  return day >= start && day <= end;
}
