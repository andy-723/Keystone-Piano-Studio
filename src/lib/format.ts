// en-AU formatting helpers. All display times are Melbourne time.
const TZ = "Australia/Melbourne";

export function formatAUD(cents: number): string {
  return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(cents / 100);
}

export function formatTime(iso: string): string {
  return new Intl.DateTimeFormat("en-AU", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: TZ })
    .format(new Date(iso))
    .replace(/\s?(am|pm)$/i, (m) => ` ${m.trim().toLowerCase()}`);
}

/** "Monday 8 February 2027" for a YYYY-MM-DD date. */
export function formatLongDate(date: string): string {
  return new Intl.DateTimeFormat("en-AU", {
    weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC",
  }).format(new Date(`${date}T12:00:00Z`));
}

/** "Mon 8 Feb" */
export function formatShortDate(date: string): string {
  const d = new Date(`${date}T12:00:00Z`);
  const wd = new Intl.DateTimeFormat("en-AU", { weekday: "short", timeZone: "UTC" }).format(d);
  const dm = new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "short", timeZone: "UTC" }).format(d);
  return `${wd} ${dm}`;
}

/** DD/MM/YYYY */
export function formatNumericDate(date: string): string {
  const [y, m, d] = date.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}
