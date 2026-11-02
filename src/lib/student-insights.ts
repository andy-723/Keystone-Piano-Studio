import { addDays } from "@/lib/calendar";
import type { PracticeLog } from "@/mocks/types";
import type { StudentSummary } from "@/services/roster";

export function filterStudents(students: StudentSummary[], search: string, attention: boolean) {
  const term = search.trim().toLocaleLowerCase("en-AU");
  const rank = { red: 0, yellow: 1, green: 2 };
  return students.filter((student) => (!attention || student.risk.band !== "green") &&
    `${student.firstName} ${student.lastName} ${student.familyName} ${student.gradeGoal}`.toLocaleLowerCase("en-AU").includes(term))
    .sort((a, b) => (attention ? rank[a.risk.band] - rank[b.risk.band] : 0) || a.firstName.localeCompare(b.firstName) || a.lastName.localeCompare(b.lastName));
}

/** Four complete seven-day periods ending yesterday, oldest first. */
export function fourWeekPractice(logs: PracticeLog[], today: string) {
  return Array.from({ length: 4 }, (_, index) => {
    const start = addDays(today, -28 + index * 7);
    const end = addDays(start, 6);
    const week = logs.filter((log) => log.date >= start && log.date <= end);
    return { start, end, studentMinutes: week.filter((log) => log.loggedBy === "student").reduce((sum, log) => sum + log.minutes, 0),
      teacherMinutes: week.filter((log) => log.loggedBy === "teacher").reduce((sum, log) => sum + log.minutes, 0) };
  });
}