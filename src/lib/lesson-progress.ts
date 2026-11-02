import { addDays, weekday } from "@/lib/calendar";
import type { PracticeLog, Requirement, StudentProgress } from "@/mocks/types";

export function readiness(requirements: Requirement[], progress: StudentProgress[]): number {
  if (!requirements.length) return 0;
  const passed = requirements.filter((requirement) => progress.some((entry) => entry.requirementId === requirement.id && entry.status === "passed")).length;
  return Math.round(passed / requirements.length * 100);
}

export function weekPractice(logs: PracticeLog[], date: string) {
  const monday = addDays(date, -((weekday(date) + 6) % 7));
  const sunday = addDays(monday, 6);
  const week = logs.filter((log) => log.date >= monday && log.date <= sunday);
  return {
    student: week.filter((log) => log.loggedBy === "student").reduce((total, log) => total + log.minutes, 0),
    teacher: week.filter((log) => log.loggedBy === "teacher").reduce((total, log) => total + log.minutes, 0),
  };
}