// Victorian 2027 school terms and public holidays (prototype data).
// Dates are plain "YYYY-MM-DD" strings in Melbourne local time.

export const TERMS_2027 = [
  { name: "Term 1", start: "2027-01-28", end: "2027-03-25" },
  { name: "Term 2", start: "2027-04-12", end: "2027-06-25" },
  { name: "Term 3", start: "2027-07-12", end: "2027-09-17" },
  { name: "Term 4", start: "2027-10-04", end: "2027-12-17" },
] as const;

export const PUBLIC_HOLIDAYS_2027: Record<string, string> = {
  "2027-01-26": "Australia Day",
  "2027-03-08": "Labour Day",
  "2027-03-26": "Good Friday",
  "2027-03-27": "Easter Saturday",
  "2027-03-29": "Easter Monday",
  "2027-04-26": "ANZAC Day (observed)",
  "2027-06-14": "King's Birthday",
  "2027-09-24": "AFL Grand Final Friday",
  "2027-11-02": "Melbourne Cup Day",
  "2027-12-27": "Christmas Day (observed)",
  "2027-12-28": "Boxing Day (observed)",
};

/** The prototype pretends today is this date so the mock week is always full. */
export const PROTOTYPE_TODAY = "2027-02-08";

export function addDays(date: string, n: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function weekday(date: string): number {
  return new Date(`${date}T12:00:00Z`).getUTCDay();
}

export type DayKind =
  | { kind: "teaching"; term: string }
  | { kind: "holiday"; name: string }
  | { kind: "break" };

export function dayKind(date: string): DayKind {
  if (PUBLIC_HOLIDAYS_2027[date]) return { kind: "holiday", name: PUBLIC_HOLIDAYS_2027[date] };
  const term = TERMS_2027.find((t) => date >= t.start && date <= t.end);
  return term ? { kind: "teaching", term: term.name } : { kind: "break" };
}

/** UTC offset ("+11:00" or "+10:00") in force in Melbourne at a local date and time. */
export function melbourneOffset(date: string, time: string): string {
  // Probe the instant assuming standard time (+10); DST changes happen at 2–3 am, far from lesson hours.
  const probe = new Date(`${date}T${time}:00+10:00`);
  const name = new Intl.DateTimeFormat("en-AU", { timeZone: "Australia/Melbourne", timeZoneName: "longOffset" })
    .formatToParts(probe)
    .find((p) => p.type === "timeZoneName")?.value ?? "GMT+10:00";
  const m = name.match(/GMT([+-]\d{2}):?(\d{2})?/);
  return m ? `${m[1]}:${m[2] ?? "00"}` : "+10:00";
}

/** ISO timestamp for a Melbourne local date and time, with the correct offset for that date. */
export function melbourneIso(date: string, time: string): string {
  return `${date}T${time}:00${melbourneOffset(date, time)}`;
}
