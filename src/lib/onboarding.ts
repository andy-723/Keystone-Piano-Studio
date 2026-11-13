import { studioToday } from "@/lib/studio-clock";
export function practicePace(gradeHours: number, weeks: number, lessonMinutes: number) {
  if (![gradeHours, weeks, lessonMinutes].every(Number.isFinite) || gradeHours < 0 || weeks <= 0 || lessonMinutes < 0) throw new Error("Enter a valid estimate, positive weeks and lesson length.");
  return Math.max(0, (gradeHours * 60 - weeks * lessonMinutes) / weeks);
}
// Future term endpoints are labelled estimates, not official school calendar dates.
export function targetWeeks(term: string) {
  const match = term.match(/^(\d{4})-T([1-4])$/);
  if (!match) throw new Error("Choose a target term.");
  const month = [3, 6, 9, 12][Number(match[2]) - 1] ?? 3;
  const end = Date.UTC(Number(match[1]), month - 1, 20);
  return Math.max(1, Math.ceil((end - Date.parse(`${studioToday()}T00:00:00Z`)) / 604800000));
}
export const onboardingTerms = ["2027-T2", "2027-T3", "2027-T4", "2028-T1"];
export const termName = (key: string) => `Term ${key.slice(-1)} ${key.slice(0, 4)}`;