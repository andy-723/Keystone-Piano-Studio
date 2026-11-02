import { riskScores, weeklySlots } from "./data";
import { addDays, dayKind, PROTOTYPE_TODAY, weekday } from "@/lib/calendar";
import type { LessonStatus } from "./types";

/** Historical demo marks are separate from today's editable attendance. */
export const studentAttendance = new Map<string, LessonStatus>();
for (let date = "2027-01-28"; date < PROTOTYPE_TODAY; date = addDays(date, 1)) {
  if (dayKind(date).kind !== "teaching") continue;
  for (const slot of weeklySlots.filter((entry) => entry.weekday === weekday(date))) {
    const band = riskScores.find((entry) => entry.studentId === slot.studentId)?.band;
    const recentDates: string[] = [];
    for (let previous = addDays(PROTOTYPE_TODAY, -1); previous >= "2027-01-28" && recentDates.length < 2; previous = addDays(previous, -1)) {
      if (dayKind(previous).kind === "teaching" && weekday(previous) === slot.weekday) recentDates.push(previous);
    }
    const status: LessonStatus = band === "red" && recentDates.includes(date) ? "absent" : date === "2027-02-17" ? "cancelled_by_studio" :
      (date === "2027-02-11" && slot.studentId === "stu-16") || (date === "2027-02-19" && slot.studentId === "stu-20") || (date === "2027-03-06" && slot.studentId === "stu-25") ? "cancelled_late" : "attended";
    studentAttendance.set(`${slot.studentId}_${date}`, status);
  }
}