import { lessonTypes, students, weeklySlots } from "@/mocks/data";
import type { LessonOccurrence, LessonStatus, LessonType, Student } from "@/mocks/types";
import { dayKind, melbourneIso, weekday, type DayKind } from "@/lib/calendar";
import { respond } from "./_delay";

// In-memory status changes for this session, keyed by occurrence id.
const statusOverrides = new Map<string, LessonStatus>();

export type LessonWithDetails = LessonOccurrence & { student: Student; lessonType: LessonType; gradeGoal: string };
export type DayPlan = { date: string; day: DayKind; lessons: LessonWithDetails[] };

function buildDay(date: string): DayPlan {
  const day = dayKind(date);
  if (day.kind !== "teaching") return { date, day, lessons: [] };
  const wd = weekday(date);
  const lessons = weeklySlots
    .filter((s) => s.weekday === wd)
    .map((slot) => {
      const lessonType = lessonTypes.find((l) => l.id === slot.lessonTypeId)!;
      const startsAt = melbourneIso(date, slot.time);
      const endsAt = new Date(new Date(startsAt).getTime() + lessonType.durationMin * 60000).toISOString();
      const id = `${slot.studentId}_${date}`;
      return {
        id, studentId: slot.studentId, lessonTypeId: lessonType.id, startsAt, endsAt,
        status: statusOverrides.get(id) ?? "scheduled",
        student: students.find((s) => s.id === slot.studentId)!,
        lessonType, gradeGoal: slot.gradeGoal,
      } satisfies LessonWithDetails;
    })
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  return { date, day, lessons };
}

export const getDayLessons = (date: string): Promise<DayPlan> => respond(buildDay(date));

export async function markAttendance(occurrenceId: string, status: LessonStatus): Promise<LessonStatus> {
  if (status === "scheduled") statusOverrides.delete(occurrenceId);
  else statusOverrides.set(occurrenceId, status);
  return respond(status, 60);
}
