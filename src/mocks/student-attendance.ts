import { riskScores, weeklySlots } from "./data";
import { addDays, dayKind, PROTOTYPE_TODAY, weekday } from "@/lib/calendar";
import type { LessonStatus } from "./types";

/** Historical demo marks are separate from today's editable attendance. */
export const studentAttendance = new Map<string, LessonStatus>();
for (let date = addDays(PROTOTYPE_TODAY, -28); date < PROTOTYPE_TODAY; date = addDays(date, 1)) {
  if (dayKind(date).kind !== "teaching") continue;
  for (const slot of weeklySlots.filter((entry) => entry.weekday === weekday(date))) {
    const band = riskScores.find((entry) => entry.studentId === slot.studentId)?.band;
    studentAttendance.set(`${slot.studentId}_${date}`, band === "red" ? "absent" : "attended");
  }
}