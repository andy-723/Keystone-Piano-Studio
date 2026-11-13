import { SNAPSHOT_TIMEZONE } from "@/lib/snapshot-range";
import { studioToday } from "@/lib/studio-clock";

/** Australian financial year bounds (1 July – 30 June), civil dates. */
export type TaxLiteFyKey = "ytd" | "fy";

export type TaxLiteFyBounds = {
  key: TaxLiteFyKey;
  /** Short label e.g. 2026-27 */
  fyLabel: string;
  start: string;
  end: string;
  timezone: typeof SNAPSHOT_TIMEZONE;
};

/** FY containing `today`: if month ≥ July, start this year; else previous year. */
export function australianFyStartYear(today: string = studioToday()): number {
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));
  return month >= 7 ? year : year - 1;
}

export function australianFyLabel(startYear: number): string {
  const endYY = String(startYear + 1).slice(2);
  return `${startYear}-${endYY}`;
}

/**
 * YTD = 1 Jul of current FY through today.
 * FY = full 1 Jul – 30 Jun of the current AU financial year.
 */
export function taxLiteFyBounds(
  key: TaxLiteFyKey,
  today: string = studioToday(),
): TaxLiteFyBounds {
  const startYear = australianFyStartYear(today);
  const start = `${startYear}-07-01`;
  const fyEnd = `${startYear + 1}-06-30`;
  return {
    key,
    fyLabel: australianFyLabel(startYear),
    start,
    end: key === "ytd" ? today : fyEnd,
    timezone: SNAPSHOT_TIMEZONE,
  };
}
