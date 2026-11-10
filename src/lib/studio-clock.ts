/**
 * "Today" for money and dates. The demo studio lives on the fixture date (PROTOTYPE_TODAY) so its
 * story stays the same; a real studio uses the real date in the studio's time zone.
 */
import { melbourneIso, PROTOTYPE_TODAY } from "@/lib/calendar";
import { isLiveStudio } from "@/lib/studio-workspace";

const STUDIO_TIME_ZONE = "Australia/Melbourne";

/** yyyy-mm-dd in the studio's time zone. */
export function studioToday(now: Date = new Date()): string {
  if (!isLiveStudio()) return PROTOTYPE_TODAY;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: STUDIO_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** A timestamp for records. Demo: the fixture day at `demoTime`; real studios: now. */
export function studioNow(demoTime = "12:00"): string {
  return isLiveStudio() ? new Date().toISOString() : melbourneIso(PROTOTYPE_TODAY, demoTime);
}
