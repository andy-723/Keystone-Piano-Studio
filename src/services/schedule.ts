import { attendanceMarks, lessonTypes, students, weeklySlots } from "@/mocks/data";
import type { LessonOccurrence, LessonStatus, LessonType, Student } from "@/mocks/types";
import { PROTOTYPE_TODAY, dayKind, melbourneIso, weekday, type DayKind } from "@/lib/calendar";
import { respond } from "./_delay";

export type LessonWithDetails = LessonOccurrence & { student: Student; lessonType: LessonType; gradeGoal: string };
export type DayPlan = { date: string; day: DayKind; lessons: LessonWithDetails[] };

function buildDay(date: string): DayPlan {
  const day = dayKind(date);
  if (day.kind !== "teaching") return { date, day, lessons: [] };
  const wd = weekday(date);
  const lessons = weeklySlots
    .filter((s) => s.weekday === wd)
    .map((slot) => {
      const lessonType = lessonTypes.find((l) => l.id === slot.lessonTypeId);
      const student = students.find((s) => s.id === slot.studentId);
      if (!lessonType || !student) throw new Error("Incomplete sample timetable");
      const startsAt = melbourneIso(date, slot.time);
      const endsAt = new Date(new Date(startsAt).getTime() + lessonType.durationMin * 60000).toISOString();
      const id = `${slot.studentId}_${date}`;
      return {
        id, studentId: slot.studentId, lessonTypeId: lessonType.id, startsAt, endsAt,
        status: attendanceMarks.get(id) ?? "scheduled",
        student,
        lessonType, gradeGoal: slot.gradeGoal,
      } satisfies LessonWithDetails;
    })
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  return { date, day, lessons };
}

export const getDayLessons = (date: string): Promise<DayPlan> => respond(buildDay(date));
export const getTodayLessons = (): Promise<DayPlan> => getDayLessons(PROTOTYPE_TODAY);

export async function markAttendance(occurrenceId: string, status: LessonStatus): Promise<LessonStatus> {
  if (status === "scheduled") attendanceMarks.delete(occurrenceId);
  else attendanceMarks.set(occurrenceId, status);
  return respond(status, 60);
}
