import { studioToday } from "@/lib/studio-clock";
import { isLiveStudio } from "@/lib/studio-workspace";
import { currentTermKey, termAfterKey } from "@/lib/course-progress";
export function practicePace(gradeHours: number, weeks: number, lessonMinutes: number) {
  if (
    ![gradeHours, weeks, lessonMinutes].every(Number.isFinite) ||
    gradeHours < 0 ||
    weeks <= 0 ||
    lessonMinutes < 0
  )
    throw new Error("Enter a valid estimate, positive weeks and lesson length.");
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
/** Demo studio's fixed terms (its story is set in March 2027). */
export const onboardingTerms = ["2027-T2", "2027-T3", "2027-T4", "2028-T1"];
const DEMO_PACE_TERMS = ["2027-T3", "2027-T4", "2028-T1"];
/** The term the studio is in today ("2026-T4" in November), by calendar quarter. */
function todayTermKey(live: boolean) {
  // studioToday() follows the workspace; while a real studio is still loading, use the real date.
  const today = live && !isLiveStudio() ? new Date().toISOString().slice(0, 10) : studioToday();
  return currentTermKey(new Date(`${today}T00:00:00`));
}
/** Target-term choices: demo keeps its fixed list; a real studio gets this term and the next 4. */
export function onboardingTermOptions(live = isLiveStudio()): string[] {
  if (!live) return onboardingTerms;
  const now = todayTermKey(true);
  return [0, 1, 2, 3, 4].map((offset) => termAfterKey(now, offset));
}
/** The three terms the Enrol wizard prices a practice pace for. */
export function paceTerms(live = isLiveStudio()): string[] {
  if (!live) return DEMO_PACE_TERMS;
  const now = todayTermKey(true);
  return [1, 2, 3].map((offset) => termAfterKey(now, offset));
}
/** Starting target term for a new enrolment: two terms out on a real studio. */
export function defaultTargetTerm(live = isLiveStudio()): string {
  return live ? termAfterKey(todayTermKey(true), 2) : "2027-T3";
}
export const termName = (key: string) => `Term ${key.slice(-1)} ${key.slice(0, 4)}`;
